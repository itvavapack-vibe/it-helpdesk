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

try {
  const [existingColumns] = await pool.query("SHOW COLUMNS FROM admins LIKE 'signature'")
  if (existingColumns.length === 0) {
    await pool.query('ALTER TABLE admins ADD COLUMN signature MEDIUMTEXT NULL AFTER position')
  }

  console.log('Migration OK: admins.signature is ready')
} catch (error) {
  console.error('Migration failed:', error.message)
  process.exit(1)
} finally {
  await pool.end()
}
