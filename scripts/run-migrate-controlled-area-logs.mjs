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
    CREATE TABLE IF NOT EXISTS controlled_area_logs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      entry_date DATE NOT NULL,
      department VARCHAR(255) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      entry_time DATETIME NOT NULL,
      reason TEXT NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'Pending_Approval',
      approved_by VARCHAR(255),
      approved_role VARCHAR(50),
      approved_at DATETIME,
      exit_time DATETIME,
      exited_by VARCHAR(255),
      exited_role VARCHAR(50),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)

  const indexes = [
    ['idx_controlled_area_logs_status', 'status'],
    ['idx_controlled_area_logs_entry_time', 'entry_time'],
  ]

  for (const [name, column] of indexes) {
    const [existingIndexes] = await pool.query(
      'SHOW INDEX FROM controlled_area_logs WHERE Key_name = ?',
      [name],
    )

    if (existingIndexes.length === 0) {
      await pool.query(`CREATE INDEX ${name} ON controlled_area_logs(${column})`)
    }
  }

  console.log('Migration OK: controlled area logs table is ready')
} catch (error) {
  console.error('Migration failed:', error.message)
  process.exit(1)
} finally {
  await pool.end()
}
