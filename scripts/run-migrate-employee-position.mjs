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
    name: 'position',
    ddl: 'ALTER TABLE employees ADD COLUMN position VARCHAR(255) NULL AFTER department',
  },
  {
    name: 'transfer_department',
    ddl: 'ALTER TABLE employees ADD COLUMN transfer_department VARCHAR(255) NULL AFTER transfer_date',
  },
  {
    name: 'transfer_position',
    ddl: 'ALTER TABLE employees ADD COLUMN transfer_position VARCHAR(255) NULL AFTER transfer_department',
  },
]

try {
  for (const column of columns) {
    const [existingColumns] = await pool.query(
      `SHOW COLUMNS FROM employees LIKE ?`,
      [column.name],
    )

    if (existingColumns.length === 0) {
      await pool.query(column.ddl)
      console.log(`Added employees.${column.name}`)
    } else {
      console.log(`Skipped employees.${column.name} (already exists)`)
    }
  }

  console.log('Migration OK: employee position and transfer fields are ready')
} catch (error) {
  console.error('Migration failed:', error.message)
  process.exit(1)
} finally {
  await pool.end()
}
