import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

dotenv.config()

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
})

const columns = [
  ['user_acknowledge_sign', 'MEDIUMTEXT NULL AFTER action_result'],
  ['user_acknowledge_date', 'DATETIME NULL AFTER user_acknowledge_sign'],
]

try {
  for (const [name, definition] of columns) {
    const [existingColumns] = await pool.query(
      'SHOW COLUMNS FROM access_requests LIKE ?',
      [name],
    )
    if (existingColumns.length === 0) {
      await pool.query(`ALTER TABLE access_requests ADD COLUMN ${name} ${definition}`)
    }
  }

  console.log('Migration OK: access request acknowledgement columns updated')
} catch (error) {
  console.error('Migration failed:', error.message)
  process.exit(1)
} finally {
  await pool.end()
}
