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
  ['asset_type', 'VARCHAR(255) NULL AFTER asset_name'],
  ['asset_location', 'VARCHAR(512) NULL AFTER asset_type'],
  ['operation_started_at', 'DATETIME NULL AFTER asset_location'],
  ['budget', 'DECIMAL(12,2) NULL AFTER operation_started_at'],
  ['user_close_position', 'VARCHAR(255) NULL AFTER user_close_name'],
  ['inspector_name', 'VARCHAR(255) NULL AFTER user_closed_at'],
  ['inspector_position', 'VARCHAR(255) NULL AFTER inspector_name'],
  ['inspector_sign', 'MEDIUMTEXT NULL AFTER inspector_position'],
  ['inspector_signed_at', 'DATETIME NULL AFTER inspector_sign'],
]

try {
  const [assetTypeColumns] = await pool.query(
    "SHOW COLUMNS FROM assets LIKE 'computertypes_id'",
  )
  if (assetTypeColumns.length === 0) {
    await pool.query(
      'ALTER TABLE assets ADD COLUMN computertypes_id VARCHAR(255) NULL AFTER computermodels_id',
    )
  }

  for (const [name, definition] of columns) {
    const [existingColumns] = await pool.query(
      `SHOW COLUMNS FROM issues LIKE ?`,
      [name],
    )
    if (existingColumns.length === 0) {
      await pool.query(`ALTER TABLE issues ADD COLUMN ${name} ${definition}`)
    }
  }

  await pool.query(`
    UPDATE issues AS issue
    INNER JOIN assets AS asset ON asset.glpi_id = issue.asset_id
    SET
      issue.asset_type = COALESCE(asset.computertypes_id, issue.asset_type, asset.computermodels_id),
      issue.asset_location = COALESCE(issue.asset_location, asset.locations_id)
    WHERE issue.asset_id IS NOT NULL
  `)

  const [updatedColumns] = await pool.query('SHOW COLUMNS FROM issues')
  console.log(
    'Migration OK:',
    updatedColumns
      .map(column => column.Field)
      .filter(name => columns.some(([columnName]) => columnName === name)),
  )
} catch (error) {
  console.error('Migration failed:', error.message)
  process.exit(1)
} finally {
  await pool.end()
}
