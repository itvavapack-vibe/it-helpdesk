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

const positions = {
  'ranida.p': 'เจ้าหน้าที่พัฒนาสื่อภายในองค์กร',
  'sahapap.n': 'เจ้าหน้าที่ Software',
  'khanathip.s': 'เจ้าหน้าที่ Hardware',
  'kittitadphichat.p': 'หัวหน้าส่วนเทคโนโลยีสารสนเทศและ ERP',
  'jakkrit.m': 'ผู้จัดการแผนกเทคโนโลยีสารสนเทศและ ERP',
}

try {
  const [existingColumns] = await pool.query("SHOW COLUMNS FROM admins LIKE 'position'")
  if (existingColumns.length === 0) {
    await pool.query('ALTER TABLE admins ADD COLUMN position VARCHAR(255) NULL AFTER name')
  }

  for (const [username, position] of Object.entries(positions)) {
    await pool.query(
      "UPDATE admins SET position = ? WHERE LOWER(username) = ? AND (position IS NULL OR TRIM(position) = '')",
      [position, username],
    )
  }

  console.log('Migration OK: admins.position and default positions updated')
} catch (error) {
  console.error('Migration failed:', error.message)
  process.exit(1)
} finally {
  await pool.end()
}
