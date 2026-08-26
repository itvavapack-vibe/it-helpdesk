import crypto from 'crypto'
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
import { assertPasswordPolicy, hashPassword } from '../lib/auth.js'

dotenv.config()

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
})

const makeInitialPassword = () => `Sec!9${crypto.randomBytes(9).toString('base64url')}`

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS secretary_users (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(120) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      department VARCHAR(255) NOT NULL,
      branch VARCHAR(255) NULL,
      role VARCHAR(32) NOT NULL DEFAULT 'reporter',
      active TINYINT(1) NOT NULL DEFAULT 1,
      failed_login_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
      locked_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_secretary_users_department (department),
      INDEX idx_secretary_users_role (role),
      INDEX idx_secretary_users_active (active)
    )
  `)

  const [userBranchColumns] = await pool.query(
    "SHOW COLUMNS FROM secretary_users LIKE 'branch'",
  )
  if (!userBranchColumns.length) {
    await pool.query(
      'ALTER TABLE secretary_users ADD COLUMN branch VARCHAR(255) NULL AFTER department',
    )
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS secretary_issues (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      issue_number VARCHAR(40) NULL UNIQUE,
      reporter_user_id BIGINT UNSIGNED NULL,
      reporter_name VARCHAR(255) NOT NULL,
      department VARCHAR(255) NOT NULL,
      title VARCHAR(255) NOT NULL,
      category VARCHAR(120) NOT NULL,
      description TEXT NOT NULL,
      impact_level VARCHAR(32) NOT NULL DEFAULT 'Medium',
      damage_value DECIMAL(15,2) NULL,
      related_users_json LONGTEXT NULL,
      attachments_json LONGTEXT NULL,
      occurred_at DATE NOT NULL,
      expected_completion_date DATE NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'Pending',
      resolution_note TEXT NULL,
      assigned_user_id BIGINT UNSIGNED NULL,
      assigned_name VARCHAR(255) NULL,
      completed_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_secretary_issues_reporter (reporter_user_id),
      INDEX idx_secretary_issues_department (department),
      INDEX idx_secretary_issues_status (status),
      INDEX idx_secretary_issues_category (category),
      INDEX idx_secretary_issues_created_at (created_at),
      INDEX idx_secretary_issues_occurred_at (occurred_at)
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS secretary_issue_status_history (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      issue_id BIGINT UNSIGNED NOT NULL,
      from_status VARCHAR(32) NULL,
      to_status VARCHAR(32) NOT NULL,
      expected_completion_date DATE NULL,
      note TEXT NULL,
      attachments_json LONGTEXT NULL,
      changed_by_user_id BIGINT UNSIGNED NULL,
      changed_by_name VARCHAR(255) NOT NULL,
      changed_by_department VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_secretary_history_issue (issue_id),
      INDEX idx_secretary_history_created_at (created_at)
    )
  `)

  const issueColumns = [
    ['damage_value', 'DECIMAL(15,2) NULL AFTER impact_level'],
    ['related_users_json', 'LONGTEXT NULL AFTER damage_value'],
    ['attachments_json', 'LONGTEXT NULL AFTER related_users_json'],
    ['expected_completion_date', 'DATE NULL AFTER occurred_at'],
  ]
  for (const [column, definition] of issueColumns) {
    const [columns] = await pool.query(`SHOW COLUMNS FROM secretary_issues LIKE ?`, [column])
    if (!columns.length) await pool.query(`ALTER TABLE secretary_issues ADD COLUMN ${column} ${definition}`)
  }

  const [attachmentColumns] = await pool.query(
    "SHOW COLUMNS FROM secretary_issue_status_history LIKE 'attachments_json'",
  )
  if (!attachmentColumns.length) {
    await pool.query(
      'ALTER TABLE secretary_issue_status_history ADD COLUMN attachments_json LONGTEXT NULL AFTER note',
    )
  }

  const [historyExpectedDateColumns] = await pool.query(
    "SHOW COLUMNS FROM secretary_issue_status_history LIKE 'expected_completion_date'",
  )
  if (!historyExpectedDateColumns.length) {
    await pool.query(
      'ALTER TABLE secretary_issue_status_history ADD COLUMN expected_completion_date DATE NULL AFTER to_status',
    )
  }

  const [historyDepartmentColumns] = await pool.query(
    "SHOW COLUMNS FROM secretary_issue_status_history LIKE 'changed_by_department'",
  )
  if (!historyDepartmentColumns.length) {
    await pool.query(
      'ALTER TABLE secretary_issue_status_history ADD COLUMN changed_by_department VARCHAR(255) NULL AFTER changed_by_name',
    )
  }
  await pool.query(`
    UPDATE secretary_issue_status_history AS history
    LEFT JOIN secretary_users AS user ON user.id = history.changed_by_user_id
    SET history.changed_by_department = user.department
    WHERE history.changed_by_department IS NULL
      AND user.department IS NOT NULL
  `)

  const [countRows] = await pool.query('SELECT COUNT(*) AS count FROM secretary_users')
  if (Number(countRows[0]?.count || 0) === 0) {
    const username = String(process.env.SECRETARY_INITIAL_ADMIN_USERNAME || 'secretary.admin').trim()
    const password = process.env.SECRETARY_INITIAL_ADMIN_PASSWORD || makeInitialPassword()
    const name = String(process.env.SECRETARY_INITIAL_ADMIN_NAME || 'Secretary Administrator').trim()
    assertPasswordPolicy(password)
    const passwordHash = await hashPassword(password)

    await pool.query(
      `INSERT INTO secretary_users
        (username, password, name, department, role, active)
       VALUES (?, ?, ?, 'Secretary', 'super_admin', 1)`,
      [username, passwordHash, name],
    )

    console.log(`SECRETARY_INITIAL_ADMIN username=${username} password=${password}`)
  }

  console.log('Migration OK: Secretary tables are ready')
} catch (error) {
  console.error('Migration failed:', error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
