import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

dotenv.config({ path: process.env.ENV_FILE || '.env' })

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
})

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_helpdesk_documents (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      source_file VARCHAR(512) NOT NULL UNIQUE,
      title VARCHAR(512),
      content LONGTEXT NOT NULL,
      document_type VARCHAR(64) DEFAULT 'pdf',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)

  const [indexes] = await pool.query(
    "SHOW INDEX FROM ai_helpdesk_documents WHERE Key_name = 'idx_ai_helpdesk_documents_type'",
  )
  if (indexes.length === 0) {
    await pool.query('CREATE INDEX idx_ai_helpdesk_documents_type ON ai_helpdesk_documents(document_type)')
  }

  console.log('Migration OK: ai_helpdesk_documents is ready')
} catch (error) {
  console.error('Migration failed:', error.message)
  process.exit(1)
} finally {
  await pool.end()
}
