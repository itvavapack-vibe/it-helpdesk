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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_transfers (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      emp_id VARCHAR(6) NOT NULL,
      transfer_date DATE NOT NULL,
      from_department VARCHAR(255),
      from_position VARCHAR(255),
      to_department VARCHAR(255) NOT NULL,
      to_position VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const [uniqueEmployeeIndexes] = await pool.query(`
    SHOW INDEX FROM employee_transfers
    WHERE Column_name = 'emp_id'
      AND Non_unique = 0
      AND Key_name <> 'PRIMARY'
  `)

  for (const index of uniqueEmployeeIndexes) {
    await pool.query(`ALTER TABLE employee_transfers DROP INDEX \`${index.Key_name}\``)
  }

  const indexes = [
    ['idx_employee_transfers_emp_id', 'emp_id'],
    ['idx_employee_transfers_transfer_date', 'transfer_date'],
  ]

  for (const [name, column] of indexes) {
    const [existingIndexes] = await pool.query(
      'SHOW INDEX FROM employee_transfers WHERE Key_name = ?',
      [name],
    )

    if (existingIndexes.length === 0) {
      await pool.query(`CREATE INDEX ${name} ON employee_transfers(${column})`)
    }
  }

  console.log('Migration OK: employee transfer history table is ready')
} catch (error) {
  console.error('Migration failed:', error.message)
  process.exit(1)
} finally {
  await pool.end()
}
