import { getPool } from './db.js'
import { hashPassword, isPasswordHash, normalizeAdminRole } from './auth.js'

const allowedTables = new Set([
  'admins',
  'change_requests',
  'access_requests',
  'employees',
  'assets',
  'glpi_users',
  'issues',
])

export function parseFilters(query) {
  const filters = []

  const addFilter = (type, column, value) => {
    if (Array.isArray(value) && type !== 'in') {
      value.forEach((item) => addFilter(type, column, item))
      return
    }
    if (type === 'in') {
      const values = Array.isArray(value) ? value.flatMap((item) => String(item).split(',')) : String(value).split(',')
      filters.push({ type, column, values })
      return
    }
    if (type === 'is') {
      filters.push({ type, column, value: value === 'null' ? null : value })
      return
    }
    filters.push({ type, column, value })
  }

  for (const type of ['eq', 'in', 'is', 'not', 'gte', 'lte', 'gt', 'lt']) {
    const nested = query[type]
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      for (const [column, value] of Object.entries(nested)) {
        addFilter(type, column, value)
      }
    }
  }

  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith('eq[') && key.endsWith(']')) {
      addFilter('eq', key.slice(3, -1), value)
    } else if (key.startsWith('in[') && key.endsWith(']')) {
      addFilter('in', key.slice(3, -1), value)
    } else if (key.startsWith('is[') && key.endsWith(']')) {
      addFilter('is', key.slice(3, -1), value)
    } else if (key.startsWith('not[') && key.endsWith(']')) {
      addFilter('not', key.slice(4, -1), value)
    } else if (key.startsWith('gte[') && key.endsWith(']')) {
      addFilter('gte', key.slice(4, -1), value)
    } else if (key.startsWith('lte[') && key.endsWith(']')) {
      addFilter('lte', key.slice(4, -1), value)
    } else if (key.startsWith('gt[') && key.endsWith(']')) {
      addFilter('gt', key.slice(3, -1), value)
    } else if (key.startsWith('lt[') && key.endsWith(']')) {
      addFilter('lt', key.slice(3, -1), value)
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
      case 'in': {
        const placeholders = filter.values.map(() => '?').join(',')
        parts.push(`\`${column}\` IN (${placeholders})`)
        values.push(...filter.values)
        break
      }
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
      case 'gte':
        parts.push(`\`${column}\` >= ?`)
        values.push(filter.value)
        break
      case 'lte':
        parts.push(`\`${column}\` <= ?`)
        values.push(filter.value)
        break
      case 'gt':
        parts.push(`\`${column}\` > ?`)
        values.push(filter.value)
        break
      case 'lt':
        parts.push(`\`${column}\` < ?`)
        values.push(filter.value)
        break
      default:
        break
    }
  }
  return parts.length ? ` WHERE ${parts.join(' AND ')}` : ''
}

function validateColumnNames(keys) {
  if (!Array.isArray(keys) || keys.length === 0) {
    const error = new Error('At least one column is required')
    error.status = 400
    throw error
  }

  for (const key of keys) {
    if (!sanitizeColumnName(key)) {
      const error = new Error(`Invalid column name: ${key}`)
      error.status = 400
      throw error
    }
  }
}

function validateRowsShareColumns(rows) {
  const expectedKeys = Object.keys(rows[0] || {})
  validateColumnNames(expectedKeys)

  for (const row of rows) {
    const keys = Object.keys(row || {})
    if (keys.length !== expectedKeys.length || !expectedKeys.every((key) => keys.includes(key))) {
      const error = new Error('All rows must include the same columns')
      error.status = 400
      throw error
    }
  }

  return expectedKeys
}

function parseLimit(value) {
  if (value == null || value === '') return null
  const limit = Number(value)
  if (!Number.isInteger(limit) || limit < 1) {
    const error = new Error('limit must be a positive integer')
    error.status = 400
    throw error
  }
  return limit
}

function validateTable(table) {
  if (!allowedTables.has(table)) {
    const error = new Error(`Table not allowed: ${table}`)
    error.status = 400
    throw error
  }
}

export async function healthCheck() {
  const pool = getPool()
  const [rows] = await pool.query('SELECT 1 + 1 AS result')
  return { ok: true, db: rows[0].result }
}

export async function getTable(table, query) {
  validateTable(table)
  const pool = getPool()

  const select = query.select || '*'
  const orderBy = query.orderBy
  const order = query.order === 'DESC' ? 'DESC' : 'ASC'
  const limit = parseLimit(query.limit)
  const head = query.head === 'true'
  const countMode = query.count === 'exact'

  if (!sanitizeIdentifier(select)) {
    const error = new Error('Invalid select expression')
    error.status = 400
    throw error
  }
  if (orderBy && !sanitizeColumnName(orderBy)) {
    const error = new Error('Invalid orderBy field')
    error.status = 400
    throw error
  }

  const filters = parseFilters(query)
  const values = []
  const where = buildWhere(filters, values)

  const [rawRows] = !head
    ? await pool.query(
        `SELECT ${select} FROM \`${table}\`${where}${orderBy ? ` ORDER BY \`${orderBy}\` ${order}` : ''}${limit ? ` LIMIT ${limit}` : ''}`,
        values,
      )
    : [[]]

  const dataRows =
    table === 'admins'
      ? rawRows.map(({ password: _password, ...row }) => row)
      : rawRows

  const count = countMode
    ? (await pool.query(`SELECT COUNT(*) AS count FROM \`${table}\`${where}`, values))[0][0]?.count ?? null
    : null

  return { data: head ? [] : dataRows, count }
}

async function prepareDataForWrite(table, data) {
  if (table !== 'admins') return { ...data }

  const prepared = { ...data }
  if (prepared.role) prepared.role = normalizeAdminRole(prepared.role)
  if (prepared.password && !isPasswordHash(prepared.password)) {
    prepared.password = await hashPassword(prepared.password)
  }
  return prepared
}

async function prepareRowsForWrite(table, rows) {
  return Promise.all(rows.map((row) => prepareDataForWrite(table, row)))
}

export async function insertTable(table, rows) {
  validateTable(table)
  const pool = getPool()

  if (!Array.isArray(rows) || rows.length === 0) {
    const error = new Error('rows must be a non-empty array')
    error.status = 400
    throw error
  }

  const preparedRows = await prepareRowsForWrite(table, rows)
  const keys = validateRowsShareColumns(preparedRows)
  const placeholders = keys.map(() => '?').join(',')
  const values = []
  const rowPlaceholders = rows
    .map((_, index) => {
      keys.forEach((key) => values.push(preparedRows[index][key]))
      return `(${placeholders})`
    })
    .join(',')

  const [result] = await pool.query(
    `INSERT INTO \`${table}\` (${keys.map((key) => `\`${key}\``).join(',')}) VALUES ${rowPlaceholders}`,
    values,
  )

  return { insertedId: result.insertId, affectedRows: result.affectedRows }
}

export async function upsertTable(table, rows, upsert) {
  validateTable(table)
  const pool = getPool()

  if (!Array.isArray(rows) || rows.length === 0) {
    const error = new Error('rows must be a non-empty array')
    error.status = 400
    throw error
  }
  if (!upsert?.onConflict) {
    const error = new Error('upsert.onConflict is required')
    error.status = 400
    throw error
  }

  const preparedRows = await prepareRowsForWrite(table, rows)
  const keys = validateRowsShareColumns(preparedRows)
  validateColumnNames([upsert.onConflict])
  const placeholders = keys.map(() => '?').join(',')
  const values = []
  const rowPlaceholders = rows
    .map((_, index) => {
      keys.forEach((key) => values.push(preparedRows[index][key]))
      return `(${placeholders})`
    })
    .join(',')

  const updateClause = keys
    .filter((key) => key !== upsert.onConflict)
    .map((key) => `\`${key}\` = VALUES(\`${key}\`)`)
    .join(', ')

  if (!updateClause) {
    const error = new Error('upsert rows must include at least one column besides onConflict')
    error.status = 400
    throw error
  }

  const [result] = await pool.query(
    `INSERT INTO \`${table}\` (${keys.map((key) => `\`${key}\``).join(',')}) VALUES ${rowPlaceholders} ON DUPLICATE KEY UPDATE ${updateClause}`,
    values,
  )

  return { insertedId: result.insertId, affectedRows: result.affectedRows }
}

export async function updateTable(table, data, query) {
  validateTable(table)
  const pool = getPool()

  if (!data || typeof data !== 'object') {
    const error = new Error('data object is required')
    error.status = 400
    throw error
  }

  const filters = parseFilters(query)
  if (!filters.length) {
    const error = new Error('Update requires filter conditions')
    error.status = 400
    throw error
  }

  const preparedData = await prepareDataForWrite(table, data)
  const values = []
  const keys = Object.keys(preparedData)
  validateColumnNames(keys)
  const setClause = keys
    .map((key) => {
      values.push(preparedData[key])
      return `\`${key}\` = ?`
    })
    .join(', ')
  const where = buildWhere(filters, values)

  const [result] = await pool.query(`UPDATE \`${table}\` SET ${setClause}${where}`, values)
  return { affectedRows: result.affectedRows }
}

export async function deleteTable(table, query) {
  validateTable(table)
  const pool = getPool()

  const filters = parseFilters(query)
  if (!filters.length) {
    const error = new Error('Delete requires filter conditions')
    error.status = 400
    throw error
  }

  const values = []
  const where = buildWhere(filters, values)
  const [result] = await pool.query(`DELETE FROM \`${table}\`${where}`, values)
  return { affectedRows: result.affectedRows }
}
