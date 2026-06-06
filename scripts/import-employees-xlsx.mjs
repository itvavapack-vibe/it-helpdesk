import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
import XLSX from 'xlsx'

const args = process.argv.slice(2)

const getArg = (name, fallback = '') => {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] || fallback
}

const filePath = path.resolve(getArg('--file'))
const envPath = path.resolve(getArg('--env', '.env'))

if (!filePath || !fs.existsSync(filePath)) {
  console.error('Import failed: Excel file does not exist. Pass --file "path/to/file.xlsx"')
  process.exit(1)
}

if (!fs.existsSync(envPath)) {
  console.error(`Import failed: env file does not exist: ${envPath}`)
  process.exit(1)
}

dotenv.config({ path: envPath })

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  multipleStatements: false,
})

const normalizeText = (value) => String(value ?? '').trim()

const normalizeEmployeeId = (value) => {
  const digits = normalizeText(value).replace(/\D/g, '')
  if (!digits) return ''
  return digits.length <= 6 ? digits.padStart(6, '0') : digits
}

const toDateValue = (value) => {
  if (!value) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (!parsed) return ''
    return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
  }

  const text = normalizeText(value)
  const slashMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (slashMatch) {
    const [, firstPart, secondPart, rawYear] = slashMatch
    const first = Number(firstPart)
    const second = Number(secondPart)
    const isMonthFirst = first <= 12 && second > 12
    const rawDay = isMonthFirst ? secondPart : firstPart
    const rawMonth = isMonthFirst ? firstPart : secondPart
    const year = Number(rawYear.length === 2 ? `20${rawYear}` : rawYear)
    return `${year}-${rawMonth.padStart(2, '0')}-${rawDay.padStart(2, '0')}`
  }

  const date = new Date(text)
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10)
  return ''
}

try {
  const workbook = XLSX.readFile(filePath, { cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })

  const sourceRows = rows.slice(1)
  const employees = []
  const skipped = []
  const seenIds = new Set()

  sourceRows.forEach((row, index) => {
    const record = {
      emp_id: normalizeEmployeeId(row[0]),
      name_th: normalizeText(row[1]),
      name_en: normalizeText(row[2]),
      start_date: toDateValue(row[3]),
      position: normalizeText(row[4]),
      department: normalizeText(row[5]),
    }

    if (!record.emp_id && !record.name_th && !record.department) return

    if (!/^\d{6}$/.test(record.emp_id) || !record.name_th || !record.start_date || !record.position || !record.department) {
      skipped.push({ row: index + 2, ...record })
      return
    }

    if (seenIds.has(record.emp_id)) {
      skipped.push({ row: index + 2, reason: 'duplicate emp_id in file', ...record })
      return
    }

    seenIds.add(record.emp_id)
    employees.push(record)
  })

  if (employees.length === 0) {
    console.log('No valid employee rows to import.')
    if (skipped.length) console.log(`Skipped rows: ${skipped.length}`)
    process.exit(0)
  }

  const [existingRows] = await pool.query(
    `SELECT emp_id FROM employees WHERE emp_id IN (${employees.map(() => '?').join(',')})`,
    employees.map(employee => employee.emp_id),
  )
  const existingIds = new Set(existingRows.map(row => row.emp_id))

  const sql = `
    INSERT INTO employees
      (emp_id, name_th, name_en, department, position, start_date, status)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      name_th = VALUES(name_th),
      name_en = VALUES(name_en),
      department = VALUES(department),
      position = VALUES(position),
      start_date = VALUES(start_date)
  `

  const values = employees.map(employee => [
    employee.emp_id,
    employee.name_th,
    employee.name_en || null,
    employee.department,
    employee.position,
    employee.start_date,
    'ทำงาน',
  ])

  await pool.query(sql, [values])

  const inserted = employees.filter(employee => !existingIds.has(employee.emp_id)).length
  const updated = employees.length - inserted

  console.log(`Database: ${process.env.DB_NAME}`)
  console.log(`Imported employees: ${employees.length}`)
  console.log(`Inserted: ${inserted}`)
  console.log(`Updated: ${updated}`)
  console.log(`Skipped rows: ${skipped.length}`)

  if (skipped.length) {
    for (const item of skipped.slice(0, 10)) {
      console.log(`Skipped row ${item.row}: ${item.reason || 'missing/invalid required data'}`)
    }
    if (skipped.length > 10) console.log(`...and ${skipped.length - 10} more skipped rows`)
  }
} catch (error) {
  console.error('Import failed:', error.message)
  process.exit(1)
} finally {
  await pool.end()
}
