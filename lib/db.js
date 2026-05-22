import mysql from 'mysql2/promise'

let pool = null

export function getPool() {
  if (pool) return pool

  const {
    DB_HOST,
    DB_PORT = '3306',
    DB_NAME,
    DB_USER,
    DB_PASSWORD,
    DB_SSL,
  } = process.env

  if (!DB_HOST || !DB_NAME || !DB_USER || !DB_PASSWORD) {
    throw new Error('Missing MySQL env: DB_HOST, DB_NAME, DB_USER, DB_PASSWORD')
  }

  const ssl =
    DB_SSL === 'true' || DB_SSL === '1'
      ? { rejectUnauthorized: true }
      : undefined

  pool = mysql.createPool({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 4,
    queueLimit: 0,
    ssl,
  })

  return pool
}
