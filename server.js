import express from 'express'
import cors from 'cors'
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const {
  DB_HOST,
  DB_PORT = '3306',
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  API_PORT = '4000',
} = process.env

if (!DB_HOST || !DB_NAME || !DB_USER || !DB_PASSWORD) {
  console.error('Missing required MySQL environment variables: DB_HOST, DB_NAME, DB_USER, DB_PASSWORD')
  process.exit(1)
}

const pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
})

const allowedTables = new Set([
  'admins',
  'change_requests',
  'access_requests',
  'assets',
  'glpi_users',
  'issues',
])

function parseFilters(query) {
  const filters = []
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith('eq[') && key.endsWith(']')) {
      filters.push({ type: 'eq', column: key.slice(3, -1), value })
    } else if (key.startsWith('in[') && key.endsWith(']')) {
      filters.push({ type: 'in', column: key.slice(3, -1), values: String(value).split(',') })
    } else if (key.startsWith('is[') && key.endsWith(']')) {
      filters.push({ type: 'is', column: key.slice(3, -1), value: value === 'null' ? null : value })
    } else if (key.startsWith('not[') && key.endsWith(']')) {
      filters.push({ type: 'not', column: key.slice(4, -1), value })
    }
  }
  return filters
}

function sanitizeIdentifier(value) {
  if (!value || typeof value !== 'string') return null
  if (/^[A-Za-z0-9_*,\s]+$/.test(value)) return value
  return null
}

function sanitizeColumnName(value) {
  if (!value || typeof value !== 'string') return null
  return /^[A-Za-z0-9_]+$/.test(value) ? value : null
}

function buildWhere(filters, values) {
  if (!filters.length) return ''
  const parts = []
  for (const filter of filters) {
    const column = sanitizeColumnName(filter.column)
    if (!column) {
      throw new Error(`Invalid filter column: ${filter.column}`)
    }
    switch (filter.type) {
      case 'eq':
        parts.push(`\`${column}\` = ?`)
        values.push(filter.value)
        break
      case 'in':
        const placeholders = filter.values.map(() => '?').join(',')
        parts.push(`\`${column}\` IN (${placeholders})`)
        values.push(...filter.values)
        break
      case 'is':
        if (filter.value === null) {
          parts.push(`\`${column}\` IS NULL`)
        } else {
          parts.push(`\`${column}\` IS ?`)
          values.push(filter.value)
        }
        break
      case 'not':
        parts.push(`\`${column}\` != ?`)
        values.push(filter.value)
        break
      default:
        break
    }
  }
  return parts.length ? ` WHERE ${parts.join(' AND ')}` : ''
}

function validateTable(table) {
  if (!allowedTables.has(table)) {
    const error = new Error(`Table not allowed: ${table}`)
    error.status = 400
    throw error
  }
}

function getPrimaryKey(table) {
  return 'id'
}

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 + 1 AS result')
    res.json({ ok: true, db: rows[0].result })
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message })
  }
})

app.get('/api/:table', async (req, res) => {
  try {
    const table = req.params.table
    validateTable(table)

    const select = req.query.select || '*'
    const orderBy = req.query.orderBy
    const order = req.query.order === 'DESC' ? 'DESC' : 'ASC'
    const limit = req.query.limit ? Number(req.query.limit) : null
    const head = req.query.head === 'true'
    const countMode = req.query.count === 'exact'

    if (!sanitizeIdentifier(select)) {
      return res.status(400).json({ error: 'Invalid select expression' })
    }
    if (orderBy && !sanitizeColumnName(orderBy)) {
      return res.status(400).json({ error: 'Invalid orderBy field' })
    }

    const filters = parseFilters(req.query)
    const values = []
    const where = buildWhere(filters, values)

    const [dataRows] = !head
      ? await pool.query(`SELECT ${select} FROM \`${table}\`${where}${orderBy ? ` ORDER BY \`${orderBy}\` ${order}` : ''}${limit ? ` LIMIT ${limit}` : ''}`, values)
      : [[]]

    const count = countMode
      ? (await pool.query(`SELECT COUNT(*) AS count FROM \`${table}\`${where}`, values))[0][0]?.count ?? null
      : null

    return res.json({ data: head ? [] : dataRows, count })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message })
  }
})

app.post('/api/:table', async (req, res) => {
  try {
    const table = req.params.table
    validateTable(table)
    const rows = req.body.rows
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows must be a non-empty array' })
    }

    const keys = Object.keys(rows[0])
    const placeholders = keys.map(() => '?').join(',')
    const values = []
    const rowPlaceholders = rows.map((row) => {
      keys.forEach((key) => {
        values.push(row[key])
      })
      return `(${placeholders})`
    }).join(',')

    const [result] = await pool.query(
      `INSERT INTO \`${table}\` (${keys.map((key) => `\`${key}\``).join(',')}) VALUES ${rowPlaceholders}`,
      values,
    )

    return res.json({ data: { insertedId: result.insertId, affectedRows: result.affectedRows } })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
})

app.post('/api/:table/upsert', async (req, res) => {
  try {
    const table = req.params.table
    validateTable(table)
    const rows = req.body.rows
    const { upsert } = req.body
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows must be a non-empty array' })
    }
    if (!upsert || !upsert.onConflict) {
      return res.status(400).json({ error: 'upsert.onConflict is required' })
    }

    const keys = Object.keys(rows[0])
    const placeholders = keys.map(() => '?').join(',')
    const values = []
    const rowPlaceholders = rows.map((row) => {
      keys.forEach((key) => values.push(row[key]))
      return `(${placeholders})`
    }).join(',')

    const updateClause = keys.filter((key) => key !== upsert.onConflict).map((key) => `\`${key}\` = VALUES(\`${key}\`)`).join(', ')
    const [result] = await pool.query(
      `INSERT INTO \`${table}\` (${keys.map((key) => `\`${key}\``).join(',')}) VALUES ${rowPlaceholders} ON DUPLICATE KEY UPDATE ${updateClause}`,
      values,
    )

    return res.json({ data: { insertedId: result.insertId, affectedRows: result.affectedRows } })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
})

app.put('/api/:table', async (req, res) => {
  try {
    const table = req.params.table
    validateTable(table)
    const data = req.body.data
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'data object is required' })
    }

    const filters = parseFilters(req.query)
    if (!filters.length) {
      return res.status(400).json({ error: 'Update requires filter conditions' })
    }

    const values = []
    const setClause = Object.keys(data).map((key) => {
      values.push(data[key])
      return `\`${key}\` = ?`
    }).join(', ')
    const where = buildWhere(filters, values)

    const [result] = await pool.query(`UPDATE \`${table}\` SET ${setClause}${where}`, values)
    return res.json({ data: { affectedRows: result.affectedRows } })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
})

app.delete('/api/:table', async (req, res) => {
  try {
    const table = req.params.table
    validateTable(table)
    const filters = parseFilters(req.query)
    if (!filters.length) {
      return res.status(400).json({ error: 'Delete requires filter conditions' })
    }

    const values = []
    const where = buildWhere(filters, values)
    const [result] = await pool.query(`DELETE FROM \`${table}\`${where}`, values)
    return res.json({ data: { affectedRows: result.affectedRows } })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
})

app.listen(Number(API_PORT), () => {
  console.log(`MySQL API server running on port ${API_PORT}`)
})
