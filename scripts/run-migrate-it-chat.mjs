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
  ['session_id', 'VARCHAR(64) NOT NULL'],
  ['sender_type', 'VARCHAR(32) NOT NULL'],
  ['sender_name', 'VARCHAR(255)'],
  ['requester_name', 'VARCHAR(255)'],
  ['document_no', 'VARCHAR(128)'],
  ['category', 'VARCHAR(255)'],
  ['assignee_key', 'VARCHAR(64)'],
  ['assignee_name', 'VARCHAR(255)'],
  ['assignee_role', 'VARCHAR(255)'],
  ['message_text', 'TEXT NOT NULL'],
  ['attachments_json', 'LONGTEXT'],
  ['status', "VARCHAR(32) NOT NULL DEFAULT 'Open'"],
  ['created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'],
  ['updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'],
]

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS it_chat_messages (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      session_id VARCHAR(64) NOT NULL,
      sender_type VARCHAR(32) NOT NULL,
      sender_name VARCHAR(255),
      requester_name VARCHAR(255),
      document_no VARCHAR(128),
      category VARCHAR(255),
      assignee_key VARCHAR(64),
      assignee_name VARCHAR(255),
      assignee_role VARCHAR(255),
      message_text TEXT NOT NULL,
      attachments_json LONGTEXT,
      status VARCHAR(32) NOT NULL DEFAULT 'Open',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)

  const [existingColumns] = await pool.query('SHOW COLUMNS FROM it_chat_messages')
  const existingColumnNames = new Set(existingColumns.map((column) => column.Field))

  for (const [name, definition] of columns) {
    if (!existingColumnNames.has(name)) {
      await pool.query(`ALTER TABLE it_chat_messages ADD COLUMN ${name} ${definition}`)
    }
  }

  const indexes = [
    ['idx_it_chat_messages_session_id', 'session_id'],
    ['idx_it_chat_messages_document_no', 'document_no'],
    ['idx_it_chat_messages_assignee_key', 'assignee_key'],
    ['idx_it_chat_messages_status', 'status'],
    ['idx_it_chat_messages_created_at', 'created_at'],
  ]

  for (const [name, column] of indexes) {
    const [existingIndexes] = await pool.query(
      'SHOW INDEX FROM it_chat_messages WHERE Key_name = ?',
      [name],
    )

    if (existingIndexes.length === 0) {
      await pool.query(`CREATE INDEX ${name} ON it_chat_messages(${column})`)
    }
  }

  console.log('Migration OK: it_chat_messages table is ready')
} catch (error) {
  console.error('Migration failed:', error.message)
  process.exit(1)
} finally {
  await pool.end()
}
