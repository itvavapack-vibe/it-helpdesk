import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
import XLSX from 'xlsx'

const DEFAULT_FILE = '\\\\192.168.10.9\\software\\Programs For Vava\\Basic Programs\\Logo\\Employee_Employee_Eng.xlsx'
const DEFAULT_SHEET = 'Sheet1'
const args = process.argv.slice(2)

const getArg = (name, fallback = '') => {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] || fallback
}

const hasFlag = (name) => args.includes(name)

const filePath = getArg('--file', DEFAULT_FILE)
const sheetName = getArg('--sheet', DEFAULT_SHEET)
const envPath = path.resolve(getArg('--env', '.env'))
const staffUsername = getArg('--staff-username', 'admin1')
const staffDisplayName = getArg('--staff-name', 'คุณจ๊อป')
const dryRun = hasFlag('--dry-run')

if (!fs.existsSync(filePath)) {
  console.error(`Import failed: Excel file does not exist or is not accessible: ${filePath}`)
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
  charset: 'utf8mb4',
})

const normalizeText = (value) => String(value ?? '').trim()

const normalizeEmployeeId = (value) => {
  const digits = normalizeText(value).replace(/\D/g, '')
  if (!digits) return ''
  return digits.length <= 6 ? digits.padStart(6, '0') : digits
}

const hasPermissionMark = (value) => normalizeText(value) !== ''

const buildMonthlyTicket = (prefix, sequence, date = new Date()) => {
  const yy = String(date.getFullYear()).slice(-2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${prefix}${yy}${mm}-${String(sequence).padStart(3, '0')}`
}

const getCurrentMonthBounds = () => {
  const start = new Date()
  start.setDate(1)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setMonth(end.getMonth() + 1)
  end.setMilliseconds(-1)

  return {
    start,
    end,
  }
}

const getSequence = (ticketNumber) => {
  const match = String(ticketNumber || '').match(/(?:-|\/)(\d+)$/)
  return match ? Number(match[1]) : 0
}

const parseRows = () => {
  const workbook = XLSX.readFile(filePath, { cellDates: false })
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    throw new Error(`Sheet not found: ${sheetName}`)
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
  const parsed = []
  const skipped = []

  rows.slice(1).forEach((row, index) => {
    const excelRowNumber = index + 2
    const systems = {
      userComputer: hasPermissionMark(row[6]),
      email: hasPermissionMark(row[7]),
      dataAll: hasPermissionMark(row[8]),
      vpn: hasPermissionMark(row[8]),
      allWeb: hasPermissionMark(row[8]),
      wms: hasPermissionMark(row[9]),
      msDynamics365: hasPermissionMark(row[10]),
      cyberHrm: hasPermissionMark(row[11]),
      other: hasPermissionMark(row[12]),
    }

    const record = {
      excel_row: excelRowNumber,
      employee_id: normalizeEmployeeId(row[0]),
      name_th: normalizeText(row[1]),
      name_en: normalizeText(row[2]),
      position: normalizeText(row[4]),
      department: normalizeText(row[5]),
      systems,
      other_system_details: systems.other ? normalizeText(row[12]) : '',
      request_details: `นำเข้าจากไฟล์ Employee_Employee_Eng.xlsx Sheet1 แถวที่ ${excelRowNumber}`,
      action_result: 'นำเข้าข้อมูลสิทธิ์จากไฟล์ Excel',
      status: 'Completed',
    }

    if (!record.employee_id && !record.name_th && !record.department && !record.position) return

    if (!/^\d{6}$/.test(record.employee_id) || !record.name_th || !record.department || !record.position) {
      skipped.push({ ...record, reason: 'missing/invalid required data' })
      return
    }

    parsed.push(record)
  })

  return { rows, parsed, skipped }
}

const summarizeSystems = (records) => ({
  userComputer: records.filter((row) => row.systems.userComputer).length,
  email: records.filter((row) => row.systems.email).length,
  dataAll: records.filter((row) => row.systems.dataAll).length,
  vpn: records.filter((row) => row.systems.vpn).length,
  allWeb: records.filter((row) => row.systems.allWeb).length,
  wms: records.filter((row) => row.systems.wms).length,
  msDynamics365: records.filter((row) => row.systems.msDynamics365).length,
  cyberHrm: records.filter((row) => row.systems.cyberHrm).length,
  other: records.filter((row) => row.systems.other).length,
})

async function getStaffSignature() {
  const [rows] = await pool.query(
    'SELECT username, name, signature FROM admins WHERE username = ? LIMIT 1',
    [staffUsername],
  )
  const admin = rows[0]
  if (!admin) {
    throw new Error(`staff admin not found: ${staffUsername}`)
  }

  return {
    name: staffDisplayName || admin.name || admin.username,
    signature: admin.signature || null,
    hasSignature: Boolean(admin.signature),
  }
}

try {
  const { parsed, skipped } = parseRows()
  const summary = summarizeSystems(parsed)

  console.log(`File: ${filePath}`)
  console.log(`Sheet: ${sheetName}`)
  console.log(`Database: ${process.env.DB_NAME}`)
  console.log(`Valid access requests: ${parsed.length}`)
  console.log(`Skipped rows: ${skipped.length}`)
  console.log(`USER Computer: ${summary.userComputer}`)
  console.log(`E-Mail: ${summary.email}`)
  console.log(`Data All: ${summary.dataAll}`)
  console.log(`VPN: ${summary.vpn}`)
  console.log(`All Web: ${summary.allWeb}`)
  console.log(`WMS: ${summary.wms}`)
  console.log(`MS Dynamics365: ${summary.msDynamics365}`)
  console.log(`Cyber HRM: ${summary.cyberHrm}`)
  console.log(`Other: ${summary.other}`)
  console.log(`IT staff username: ${staffUsername}`)
  console.log(`IT staff display name: ${staffDisplayName}`)

  if (skipped.length) {
    for (const item of skipped.slice(0, 10)) {
      console.log(`Skipped row ${item.excel_row}: ${item.reason}`)
    }
    if (skipped.length > 10) console.log(`...and ${skipped.length - 10} more skipped rows`)
  }

  if (dryRun) {
    console.log('Dry run only. No rows inserted.')
    process.exit(0)
  }

  if (parsed.length === 0) {
    console.log('No valid access requests to import.')
    process.exit(0)
  }

  const staff = await getStaffSignature()
  console.log(`IT staff signature: ${staff.hasSignature ? 'found' : 'not found'}`)

  const { start, end } = getCurrentMonthBounds()
  const [existingRows] = await pool.query(
    `
      SELECT ticket_number
      FROM access_requests
      WHERE created_at >= ? AND created_at <= ?
    `,
    [start, end],
  )
  const nextSequence = Math.max(0, ...existingRows.map((row) => getSequence(row.ticket_number))) + 1
  const values = parsed.map((record, index) => [
    buildMonthlyTicket('ITU ', nextSequence + index),
    record.name_th,
    record.name_en || null,
    record.employee_id,
    record.department,
    record.position,
    '',
    JSON.stringify(record.systems),
    record.other_system_details,
    record.request_details,
    record.status,
    record.action_result,
    staff.name,
    staff.signature,
    new Date(),
  ])

  await pool.query(
    `
      INSERT INTO access_requests
        (
          ticket_number,
          name_th,
          name_en,
          employee_id,
          department,
          position,
          internal_phone,
          systems,
          other_system_details,
          request_details,
          status,
          action_result,
          it_staff_name,
          it_staff_sign,
          it_staff_date
        )
      VALUES ?
    `,
    [values],
  )

  console.log(`Inserted access requests: ${parsed.length}`)
  console.log(`First ticket: ${values[0][0]}`)
  console.log(`Last ticket: ${values.at(-1)[0]}`)
} catch (error) {
  console.error('Import failed:', error.message)
  process.exit(1)
} finally {
  await pool.end()
}
