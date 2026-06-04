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
  {
    name: 'failed_login_attempts',
    sql: 'ALTER TABLE admins ADD COLUMN failed_login_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER role',
  },
  {
    name: 'locked_at',
    sql: 'ALTER TABLE admins ADD COLUMN locked_at DATETIME NULL AFTER failed_login_attempts',
  },
  {
    name: 'password_changed_at',
    sql: 'ALTER TABLE admins ADD COLUMN password_changed_at DATETIME NULL AFTER locked_at',
  },
]

try {
  for (const column of columns) {
    const [existingColumns] = await pool.query(`SHOW COLUMNS FROM admins LIKE '${column.name}'`)
    if (existingColumns.length === 0) {
      await pool.query(column.sql)
    }
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_security_settings (
      id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
      max_failed_login_attempts TINYINT UNSIGNED NOT NULL DEFAULT 3,
      password_max_age_days SMALLINT UNSIGNED NOT NULL DEFAULT 90,
      login_timeout_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 5,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)
  const [loginTimeoutColumns] = await pool.query("SHOW COLUMNS FROM admin_security_settings LIKE 'login_timeout_minutes'")
  if (loginTimeoutColumns.length === 0) {
    await pool.query(
      'ALTER TABLE admin_security_settings ADD COLUMN login_timeout_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 5 AFTER password_max_age_days',
    )
  }
  await pool.query(`
    INSERT INTO admin_security_settings (id, max_failed_login_attempts, password_max_age_days, login_timeout_minutes)
    VALUES (1, 3, 90, 5)
    ON DUPLICATE KEY UPDATE id = VALUES(id)
  `)

  console.log('Migration OK: admin login security columns and settings are ready')
} catch (error) {
  console.error('Migration failed:', error.message)
  process.exit(1)
} finally {
  await pool.end()
}
