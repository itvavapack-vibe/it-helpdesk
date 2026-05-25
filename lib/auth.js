import crypto from 'crypto'
import { getPool } from './db.js'

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ''))
  const rightBuffer = Buffer.from(String(right ?? ''))

  if (leftBuffer.length !== rightBuffer.length) return false
  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

export async function loginAdmin({ username, password }) {
  if (!username || !password) {
    const error = new Error('username and password are required')
    error.status = 400
    throw error
  }

  const pool = getPool()
  const [rows] = await pool.query(
    'SELECT id, username, password, name, role, created_at FROM `admins` WHERE `username` = ? LIMIT 1',
    [username],
  )
  const admin = rows[0]

  if (!admin || !constantTimeEqual(admin.password, password)) {
    const error = new Error('Invalid username or password')
    error.status = 401
    throw error
  }

  const { password: _password, ...safeAdmin } = admin
  return safeAdmin
}
