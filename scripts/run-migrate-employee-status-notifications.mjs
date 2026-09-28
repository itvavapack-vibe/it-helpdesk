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
    CREATE TABLE IF NOT EXISTS employee_status_notifications (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_key VARCHAR(255) NOT NULL,
      employee_id BIGINT UNSIGNED NULL,
      emp_id VARCHAR(20) NOT NULL,
      employee_name VARCHAR(255) NOT NULL,
      change_type VARCHAR(30) NOT NULL,
      from_status VARCHAR(100) NULL,
      to_status VARCHAR(100) NOT NULL,
      from_department VARCHAR(255) NULL,
      to_department VARCHAR(255) NULL,
      from_position VARCHAR(255) NULL,
      to_position VARCHAR(255) NULL,
      effective_date DATE NULL,
      source_admin_id BIGINT UNSIGNED NULL,
      source_admin_name VARCHAR(255) NULL,
      reviewed_at DATETIME NULL,
      reviewed_by_admin_id BIGINT UNSIGNED NULL,
      reviewed_by_name VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_employee_status_notification_event (event_key),
      INDEX idx_employee_status_notification_reviewed (reviewed_at),
      INDEX idx_employee_status_notification_created (created_at),
      INDEX idx_employee_status_notification_emp (emp_id)
    )
  `)

  console.log('Migration OK: employee status notifications table is ready')
} catch (error) {
  console.error('Migration failed:', error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
