import crypto from 'crypto'
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
import { assertPasswordPolicy, hashPassword } from '../lib/auth.js'

dotenv.config()
const pool = mysql.createPool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME })

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS facilities_users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(120) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    department VARCHAR(255) NOT NULL,
    branch VARCHAR(255) NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'requester',
    active TINYINT(1) NOT NULL DEFAULT 1,
    failed_login_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    locked_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_facilities_users_role (role), INDEX idx_facilities_users_active (active)
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS facilities_requests (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, request_number VARCHAR(40) NULL UNIQUE,
    reporter_user_id BIGINT UNSIGNED NULL, reporter_name VARCHAR(255) NOT NULL,
    department VARCHAR(255) NOT NULL, branch VARCHAR(255) NULL, phone VARCHAR(80) NULL,
    request_type VARCHAR(32) NOT NULL DEFAULT 'General', category VARCHAR(32) NOT NULL, location VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL, description TEXT NOT NULL, priority VARCHAR(24) NOT NULL DEFAULT 'Normal',
    requested_date DATE NOT NULL, expected_completion_date DATE NULL, attachments_json LONGTEXT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'Pending', resolution_note TEXT NULL,
    assigned_user_id BIGINT UNSIGNED NULL, assigned_name VARCHAR(255) NULL, completed_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_facilities_reporter (reporter_user_id), INDEX idx_facilities_status (status),
    INDEX idx_facilities_type (request_type), INDEX idx_facilities_priority (priority),
    INDEX idx_facilities_branch (branch), INDEX idx_facilities_created_at (created_at)
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS facilities_request_status_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, request_id BIGINT UNSIGNED NOT NULL,
    from_status VARCHAR(32) NULL, to_status VARCHAR(32) NOT NULL, expected_completion_date DATE NULL,
    note TEXT NOT NULL, attachments_json LONGTEXT NULL, changed_by_user_id BIGINT UNSIGNED NULL,
    changed_by_name VARCHAR(255) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_facilities_history_request (request_id), INDEX idx_facilities_history_created_at (created_at)
  )`)
  await pool.query("ALTER TABLE facilities_requests MODIFY reporter_user_id BIGINT UNSIGNED NULL, MODIFY request_type VARCHAR(32) NOT NULL DEFAULT 'General'")
  await pool.query('ALTER TABLE facilities_request_status_history MODIFY changed_by_user_id BIGINT UNSIGNED NULL')
  const [counts] = await pool.query('SELECT COUNT(*) AS count FROM facilities_users')
  if (Number(counts[0]?.count || 0) === 0) {
    const username = String(process.env.FACILITIES_INITIAL_ADMIN_USERNAME || 'hr.admin').trim()
    const password = process.env.FACILITIES_INITIAL_ADMIN_PASSWORD || `Hr!9${crypto.randomBytes(9).toString('base64url')}`
    assertPasswordPolicy(password)
    await pool.query("INSERT INTO facilities_users (username, password, name, department, role, active) VALUES (?, ?, ?, 'บุคคลและธุรการ', 'admin', 1)", [username, await hashPassword(password), String(process.env.FACILITIES_INITIAL_ADMIN_NAME || 'HR Administrator').trim()])
    console.log(`FACILITIES_INITIAL_ADMIN username=${username} password=${password}`)
  }
  console.log('Migration OK: HR Facilities tables are ready')
} catch (error) { console.error('Migration failed:', error.message); process.exitCode = 1 } finally { await pool.end() }
