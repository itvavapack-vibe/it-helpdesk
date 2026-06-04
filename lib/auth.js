import crypto from 'crypto'
import { getPool } from './db.js'

const PASSWORD_HASH_PREFIX = 'scrypt'
const SCRYPT_KEY_LENGTH = 64
const VALID_ROLES = new Set(['superadmin', 'it_support', 'it_supervisor', 'it_manager', 'it_software', 'it_media', 'hr'])
const ROLE_ALIASES = {
  super_admin: 'superadmin',
  admin: 'it_support',
  it: 'it_support',
  support: 'it_support',
  supervisor: 'it_supervisor',
  manager: 'it_manager',
  software: 'it_software',
  media: 'it_media',
  itsoftware: 'it_software',
  itmedia: 'it_media',
}
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000
const DEFAULT_ADMIN_POSITIONS = {
  'ranida.p': 'เจ้าหน้าที่พัฒนาสื่อภายในองค์กร',
  'sahapap.n': 'เจ้าหน้าที่ Software',
  'khanathip.s': 'เจ้าหน้าที่ Hardware',
  'kittitadphichat.p': 'หัวหน้าส่วนเทคโนโลยีสารสนเทศและ ERP',
  'jakkrit.m': 'ผู้จัดการแผนกเทคโนโลยีสารสนเทศและ ERP',
}

function getDefaultAdminPosition(username) {
  return DEFAULT_ADMIN_POSITIONS[String(username || '').trim().toLowerCase()] || ''
}

function withAdminPosition(admin) {
  return {
    ...admin,
    position: String(admin?.position || getDefaultAdminPosition(admin?.username)).trim(),
  }
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ''))
  const rightBuffer = Buffer.from(String(right ?? ''))

  if (leftBuffer.length !== rightBuffer.length) return false
  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, SCRYPT_KEY_LENGTH, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey)
    })
  })
}

export function normalizeAdminRole(role) {
  const roleKey = String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const normalizedRole = ROLE_ALIASES[roleKey] || roleKey
  return VALID_ROLES.has(normalizedRole) ? normalizedRole : 'it_support'
}

export function isPasswordHash(value) {
  return String(value || '').startsWith(`${PASSWORD_HASH_PREFIX}:`)
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const derivedKey = await scryptAsync(password, salt)
  return `${PASSWORD_HASH_PREFIX}:${salt}:${derivedKey.toString('hex')}`
}

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function base64UrlDecode(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
}

function getAuthSecret() {
  return process.env.AUTH_SECRET || process.env.DB_PASSWORD || 'it-helpdesk-local-secret'
}

function signPayload(payload) {
  return crypto.createHmac('sha256', getAuthSecret()).update(payload).digest('base64url')
}

export function createAuthToken(admin) {
  const payload = base64UrlEncode({
    id: admin.id,
    username: admin.username,
    role: normalizeAdminRole(admin.role),
    exp: Date.now() + TOKEN_TTL_MS,
  })
  return `${payload}.${signPayload(payload)}`
}

export function verifyAuthToken(token) {
  const [payload, signature] = String(token || '').split('.')
  if (!payload || !signature || !constantTimeEqual(signature, signPayload(payload))) return null

  try {
    const data = base64UrlDecode(payload)
    if (!data?.id || !data?.role || Date.now() > Number(data.exp || 0)) return null
    return { ...data, role: normalizeAdminRole(data.role) }
  } catch {
    return null
  }
}

export function getAdminFromRequest(req) {
  const authorization = req?.headers?.authorization || req?.headers?.Authorization || ''
  const token = String(authorization).startsWith('Bearer ') ? String(authorization).slice(7) : ''
  return verifyAuthToken(token)
}

async function verifyPassword(storedPassword, password) {
  const stored = String(storedPassword || '')
  if (!isPasswordHash(stored)) {
    return constantTimeEqual(stored, password)
  }

  const [, salt, key] = stored.split(':')
  if (!salt || !key) return false

  const derivedKey = await scryptAsync(password, salt)
  return constantTimeEqual(key, derivedKey.toString('hex'))
}

export async function loginAdmin({ username, password }) {
  if (!username || !password) {
    const error = new Error('username and password are required')
    error.status = 400
    throw error
  }

  const pool = getPool()
  const [rows] = await pool.query(
    'SELECT id, username, password, name, position, role, created_at FROM `admins` WHERE `username` = ? LIMIT 1',
    [username],
  )
  const admin = rows[0]

  if (!admin || !(await verifyPassword(admin.password, password))) {
    const error = new Error('Invalid username or password')
    error.status = 401
    throw error
  }

  if (!isPasswordHash(admin.password)) {
    const hashedPassword = await hashPassword(password)
    await pool.query('UPDATE `admins` SET `password` = ? WHERE `id` = ?', [hashedPassword, admin.id])
  }

  const { password: _password, ...adminWithoutPassword } = admin
  const safeAdmin = withAdminPosition(adminWithoutPassword)
  safeAdmin.role = normalizeAdminRole(safeAdmin.role)
  safeAdmin.token = createAuthToken(safeAdmin)
  return safeAdmin
}

export async function getAdminProfile(adminId) {
  if (!adminId) {
    const error = new Error('Authentication required')
    error.status = 401
    throw error
  }

  const pool = getPool()
  const [rows] = await pool.query(
    'SELECT id, username, name, position, role, created_at FROM `admins` WHERE `id` = ? LIMIT 1',
    [adminId],
  )

  if (!rows[0]) {
    const error = new Error('Admin user not found')
    error.status = 404
    throw error
  }

  const safeAdmin = withAdminPosition(rows[0])
  safeAdmin.role = normalizeAdminRole(safeAdmin.role)
  safeAdmin.token = createAuthToken(safeAdmin)
  return safeAdmin
}

export async function updateAdminProfile(adminId, profile = {}) {
  if (!adminId) {
    const error = new Error('Authentication required')
    error.status = 401
    throw error
  }

  const username = String(profile.username || '').trim()
  const name = String(profile.name || '').trim()
  const position = String(profile.position || getDefaultAdminPosition(username)).trim()
  const password = String(profile.password || '').trim()

  if (!username || !name || !position) {
    const error = new Error('username, name and position are required')
    error.status = 400
    throw error
  }

  const pool = getPool()
  const [duplicateRows] = await pool.query(
    'SELECT id FROM `admins` WHERE `username` = ? AND `id` <> ? LIMIT 1',
    [username, adminId],
  )

  if (duplicateRows.length > 0) {
    const error = new Error('Username already exists')
    error.status = 409
    throw error
  }

  const updates = ['`username` = ?', '`name` = ?', '`position` = ?']
  const values = [username, name, position]

  if (password) {
    updates.push('`password` = ?')
    values.push(await hashPassword(password))
  }

  values.push(adminId)
  const [result] = await pool.query(`UPDATE \`admins\` SET ${updates.join(', ')} WHERE \`id\` = ?`, values)

  if (!result.affectedRows) {
    const error = new Error('Admin user not found')
    error.status = 404
    throw error
  }

  return getAdminProfile(adminId)
}
