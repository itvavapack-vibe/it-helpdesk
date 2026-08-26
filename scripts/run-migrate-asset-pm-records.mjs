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
  ['asset_glpi_id', 'INT NOT NULL'],
  ['asset_name', 'VARCHAR(512)'],
  ['asset_code', 'VARCHAR(128)'],
  ['serial', 'VARCHAR(128)'],
  ['user_name', 'VARCHAR(255)'],
  ['location_name', 'VARCHAR(512)'],
  ['source_type', 'VARCHAR(128)'],
  ['pm_date', 'DATE NOT NULL'],
  ['inspector_name', 'VARCHAR(255) NOT NULL'],
  ['overall_status', "VARCHAR(50) NOT NULL DEFAULT 'Pass'"],
  ['checklist_json', 'LONGTEXT NOT NULL'],
  ['attachments_json', 'LONGTEXT'],
  ['note', 'TEXT'],
  ['next_due_date', 'DATE'],
  ['created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'],
  ['updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'],
]

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS asset_pm_records (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      asset_glpi_id INT NOT NULL,
      asset_name VARCHAR(512),
      asset_code VARCHAR(128),
      serial VARCHAR(128),
      user_name VARCHAR(255),
      location_name VARCHAR(512),
      source_type VARCHAR(128),
      pm_date DATE NOT NULL,
      inspector_name VARCHAR(255) NOT NULL,
      overall_status VARCHAR(50) NOT NULL DEFAULT 'Pass',
      checklist_json LONGTEXT NOT NULL,
      attachments_json LONGTEXT,
      note TEXT,
      next_due_date DATE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS asset_pm_report_batches (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      report_year SMALLINT UNSIGNED NOT NULL,
      records_json LONGTEXT NOT NULL,
      record_count INT UNSIGNED NOT NULL DEFAULT 0,
      branch_summary_json LONGTEXT NOT NULL,
      inspector_admin_id BIGINT UNSIGNED NULL,
      inspector_name VARCHAR(255) NOT NULL,
      inspector_position VARCHAR(255) NULL,
      inspector_signature LONGTEXT NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'Pending_IT_Manager',
      manager_admin_id BIGINT UNSIGNED NULL,
      manager_name VARCHAR(255) NULL,
      manager_position VARCHAR(255) NULL,
      manager_signature LONGTEXT NULL,
      manager_date DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_asset_pm_report_year (report_year),
      INDEX idx_asset_pm_report_status (status),
      INDEX idx_asset_pm_report_created_at (created_at)
    )
  `)

  const [existingColumns] = await pool.query('SHOW COLUMNS FROM asset_pm_records')
  const existingColumnNames = new Set(existingColumns.map((column) => column.Field))

  for (const [name, definition] of columns) {
    if (!existingColumnNames.has(name)) {
      await pool.query(`ALTER TABLE asset_pm_records ADD COLUMN ${name} ${definition}`)
    }
  }

  const indexes = [
    ['idx_asset_pm_records_asset_glpi_id', 'asset_glpi_id'],
    ['idx_asset_pm_records_pm_date', 'pm_date'],
    ['idx_asset_pm_records_overall_status', 'overall_status'],
  ]

  for (const [name, column] of indexes) {
    const [existingIndexes] = await pool.query(
      'SHOW INDEX FROM asset_pm_records WHERE Key_name = ?',
      [name],
    )

    if (existingIndexes.length === 0) {
      await pool.query(`CREATE INDEX ${name} ON asset_pm_records(${column})`)
    }
  }

  console.log('Migration OK: asset PM records and report batches are ready')
} catch (error) {
  console.error('Migration failed:', error.message)
  process.exit(1)
} finally {
  await pool.end()
}
