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
  await pool.query(
    'ALTER TABLE assets MODIFY COLUMN computermodels_id VARCHAR(255) NULL',
  )
  const [cols] = await pool.query(
    "SHOW COLUMNS FROM assets LIKE 'computermodels_id'",
  )
  console.log('Migration OK:', cols[0])
} catch (error) {
  console.error('Migration failed:', error.message)
  process.exit(1)
} finally {
  await pool.end()
}
