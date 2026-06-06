import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

dotenv.config({ path: process.env.ENV_FILE || '.env' })

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
})

try {
  const [columns] = await pool.query("SHOW COLUMNS FROM employees LIKE 'name_en'")

  if (columns.length === 0) {
    await pool.query('ALTER TABLE employees ADD COLUMN name_en VARCHAR(255) NULL AFTER name_th')
    console.log('Added employees.name_en')
  } else {
    console.log('Skipped employees.name_en (already exists)')
  }

  console.log('Migration OK: employee English name field is ready')
} catch (error) {
  console.error('Migration failed:', error.message)
  process.exit(1)
} finally {
  await pool.end()
}
