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
    CREATE TABLE IF NOT EXISTS asset_status_history (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_key VARCHAR(64) NOT NULL,
      asset_glpi_id INT NOT NULL,
      asset_name VARCHAR(512) NULL,
      asset_code VARCHAR(128) NULL,
      serial VARCHAR(128) NULL,
      status VARCHAR(50) NOT NULL,
      event_date DATETIME NOT NULL,
      previous_user_name VARCHAR(255) NULL,
      user_name VARCHAR(255) NULL,
      previous_location_name VARCHAR(512) NULL,
      location_name VARCHAR(512) NULL,
      source_state VARCHAR(128) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_asset_status_event_key (event_key),
      INDEX idx_asset_status_glpi_id (asset_glpi_id),
      INDEX idx_asset_status_status (status),
      INDEX idx_asset_status_event_date (event_date)
    )
  `)

  await pool.query(`
    INSERT INTO asset_status_history (
      event_key,
      asset_glpi_id,
      asset_name,
      asset_code,
      serial,
      status,
      event_date,
      user_name,
      location_name,
      source_state
    )
    SELECT
      CONCAT('seed-new-', asset.glpi_id),
      asset.glpi_id,
      asset.name,
      asset.otherserial,
      asset.serial,
      'New',
      COALESCE(asset.created_at, CURRENT_TIMESTAMP),
      asset.users_id,
      asset.locations_id,
      asset.states_id
    FROM assets asset
    WHERE NOT EXISTS (
      SELECT 1
      FROM asset_status_history history
      WHERE history.asset_glpi_id = asset.glpi_id
    )
  `)

  console.log('Migration OK: asset status history is ready')
} catch (error) {
  console.error('Migration failed:', error.message)
  process.exit(1)
} finally {
  await pool.end()
}
