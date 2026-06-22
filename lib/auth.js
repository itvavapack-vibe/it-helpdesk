import crypto from 'crypto'
import { getPool } from './db.js'
import { getPasswordPolicyErrors } from '../shared/passwordPolicy.js'

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
const PASSWORD_CHANGE_TOKEN_TTL_MS = 10 * 60 * 1000
const DEFAULT_ADMIN_SECURITY_SETTINGS = Object.freeze({
  max_failed_login_attempts: 3,
  password_max_age_days: 90,
  login_timeout_minutes: 5,
})
const ADMIN_SECURITY_SETTING_LIMITS = Object.freeze({
  max_failed_login_attempts: { min: 1, max: 20 },
  password_max_age_days: { min: 1, max: 3650 },
  login_timeout_minutes: { min: 1, max: 1440 },
})
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

export function assertPasswordPolicy(password) {
  const errors = getPasswordPolicyErrors(password)
  if (errors.length === 0) return

  const error = new Error(`Password must include: ${errors.join(', ')}`)
  error.status = 400
  error.code = 'WEAK_PASSWORD'
  error.policyErrors = errors
  throw error
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

function createPasswordChangeToken(admin) {
  const payload = base64UrlEncode({
    id: admin.id,
    purpose: 'password_change',
    passwordVersion: admin.password_changed_at ? new Date(admin.password_changed_at).getTime() : null,
    exp: Date.now() + PASSWORD_CHANGE_TOKEN_TTL_MS,
  })
  return `${payload}.${signPayload(payload)}`
}

function verifyPasswordChangeToken(token) {
  const [payload, signature] = String(token || '').split('.')
  if (!payload || !signature || !constantTimeEqual(signature, signPayload(payload))) return null

  try {
    const data = base64UrlDecode(payload)
    if (!data?.id || data?.purpose !== 'password_change' || Date.now() > Number(data.exp || 0)) return null
    return data
  } catch {
    return null
  }
}

function createAuthError(message, status, code, details = {}) {
  const error = new Error(message)
  error.status = status
  error.code = code
  Object.assign(error, details)
  return error
}

function normalizeSecuritySetting(value, key) {
  const limits = ADMIN_SECURITY_SETTING_LIMITS[key]
  const number = Number(value)
  if (!Number.isInteger(number) || number < limits.min || number > limits.max) {
    throw createAuthError(
      `${key} must be an integer between ${limits.min} and ${limits.max}`,
      400,
      'INVALID_SECURITY_SETTINGS',
    )
  }
  return number
}

export async function getAdminSecuritySettings() {
  const pool = getPool()
  try {
    const [rows] = await pool.query(
      'SELECT max_failed_login_attempts, password_max_age_days, login_timeout_minutes, updated_at FROM `admin_security_settings` WHERE `id` = 1 LIMIT 1',
    )
    const settings = rows[0]
    if (!settings) return { ...DEFAULT_ADMIN_SECURITY_SETTINGS, updated_at: null }
    return {
      max_failed_login_attempts: Number(settings.max_failed_login_attempts),
      password_max_age_days: Number(settings.password_max_age_days),
      login_timeout_minutes: Number(settings.login_timeout_minutes),
      updated_at: settings.updated_at,
    }
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return { ...DEFAULT_ADMIN_SECURITY_SETTINGS, updated_at: null }
    }
    throw error
  }
}

export async function updateAdminSecuritySettings(settings = {}) {
  const maxFailedLoginAttempts = normalizeSecuritySetting(
    settings.max_failed_login_attempts,
    'max_failed_login_attempts',
  )
  const passwordMaxAgeDays = normalizeSecuritySetting(
    settings.password_max_age_days,
    'password_max_age_days',
  )
  const loginTimeoutMinutes = normalizeSecuritySetting(
    settings.login_timeout_minutes,
    'login_timeout_minutes',
  )
  const pool = getPool()
  try {
    await pool.query(
      `INSERT INTO \`admin_security_settings\`
        (\`id\`, \`max_failed_login_attempts\`, \`password_max_age_days\`, \`login_timeout_minutes\`)
       VALUES (1, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        \`max_failed_login_attempts\` = VALUES(\`max_failed_login_attempts\`),
        \`password_max_age_days\` = VALUES(\`password_max_age_days\`),
        \`login_timeout_minutes\` = VALUES(\`login_timeout_minutes\`)`,
      [maxFailedLoginAttempts, passwordMaxAgeDays, loginTimeoutMinutes],
    )
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      throw createAuthError('Admin security settings migration is required', 503, 'SECURITY_SETTINGS_MIGRATION_REQUIRED')
    }
    throw error
  }
  return getAdminSecuritySettings()
}

function passwordExpiresAt(admin, settings) {
  if (normalizeAdminRole(admin?.role) === 'superadmin' || !admin?.password_changed_at) return null
  return new Date(
    new Date(admin.password_changed_at).getTime()
      + Number(settings.password_max_age_days) * 24 * 60 * 60 * 1000,
  )
}

function requiresPasswordChange(admin, settings) {
  if (!admin?.password_changed_at) return true
  if (normalizeAdminRole(admin.role) === 'superadmin') return false
  return Date.now() >= passwordExpiresAt(admin, settings).getTime()
}

function withPasswordSecurity(admin, settings) {
  return {
    ...admin,
    password_never_expires: normalizeAdminRole(admin?.role) === 'superadmin',
    password_expires_at: passwordExpiresAt(admin, settings),
    password_change_required: requiresPasswordChange(admin, settings),
  }
}

export function createAuthToken(
  admin,
  sessionTimeoutMinutes = DEFAULT_ADMIN_SECURITY_SETTINGS.login_timeout_minutes,
  expiresAt = null,
) {
  const payload = base64UrlEncode({
    id: admin.id,
    username: admin.username,
    role: normalizeAdminRole(admin.role),
    exp: expiresAt || Date.now() + Number(sessionTimeoutMinutes) * 60 * 1000,
  })
  return `${payload}.${signPayload(payload)}`
}

function withAuthSession(admin, settings) {
  const expiresAt = Date.now() + Number(settings.login_timeout_minutes) * 60 * 1000
  return {
    ...admin,
    session_timeout_minutes: Number(settings.login_timeout_minutes),
    session_expires_at: new Date(expiresAt).toISOString(),
    token: createAuthToken(admin, settings.login_timeout_minutes, expiresAt),
  }
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
    'SELECT id, username, password, name, position, signature, role, failed_login_attempts, locked_at, password_changed_at, created_at FROM `admins` WHERE `username` = ? LIMIT 1',
    [String(username).trim()],
  )
  const admin = rows[0]
  const isSuperAdmin = normalizeAdminRole(admin?.role) === 'superadmin'
  const securitySettings = await getAdminSecuritySettings()

  if (admin?.locked_at && !isSuperAdmin) {
    throw createAuthError('Account is locked. Contact Administrator.', 423, 'ACCOUNT_LOCKED')
  }

  if (!admin || !(await verifyPassword(admin.password, password))) {
    if (admin && !isSuperAdmin) {
      const maxFailedLoginAttempts = securitySettings.max_failed_login_attempts
      const failedAttempts = Math.min(Number(admin.failed_login_attempts || 0) + 1, maxFailedLoginAttempts)
      const isLocked = failedAttempts >= maxFailedLoginAttempts
      await pool.query(
        'UPDATE `admins` SET `failed_login_attempts` = ?, `locked_at` = ? WHERE `id` = ?',
        [failedAttempts, isLocked ? new Date() : null, admin.id],
      )
      if (isLocked) {
        throw createAuthError('Account is locked. Contact Administrator.', 423, 'ACCOUNT_LOCKED')
      }
      throw createAuthError('Invalid username or password', 401, 'INVALID_CREDENTIALS', {
        attemptsRemaining: maxFailedLoginAttempts - failedAttempts,
      })
    }

    throw createAuthError('Invalid username or password', 401, 'INVALID_CREDENTIALS')
  }

  if (admin.failed_login_attempts || admin.locked_at) {
    await pool.query(
      'UPDATE `admins` SET `failed_login_attempts` = 0, `locked_at` = NULL WHERE `id` = ?',
      [admin.id],
    )
  }

  if (!isPasswordHash(admin.password)) {
    const hashedPassword = await hashPassword(password)
    await pool.query('UPDATE `admins` SET `password` = ? WHERE `id` = ?', [hashedPassword, admin.id])
  }

  if (requiresPasswordChange(admin, securitySettings)) {
    throw createAuthError('Password change is required', 403, 'PASSWORD_CHANGE_REQUIRED', {
      changeToken: createPasswordChangeToken(admin),
    })
  }

  const { password: _password, ...adminWithoutPassword } = admin
  let safeAdmin = withPasswordSecurity(withAdminPosition(adminWithoutPassword), securitySettings)
  delete safeAdmin.failed_login_attempts
  delete safeAdmin.locked_at
  safeAdmin.role = normalizeAdminRole(safeAdmin.role)
  safeAdmin = withAuthSession(safeAdmin, securitySettings)
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
    'SELECT id, username, name, position, signature, role, password_changed_at, created_at FROM `admins` WHERE `id` = ? LIMIT 1',
    [adminId],
  )

  if (!rows[0]) {
    const error = new Error('Admin user not found')
    error.status = 404
    throw error
  }

  const securitySettings = await getAdminSecuritySettings()
  let safeAdmin = withPasswordSecurity(withAdminPosition(rows[0]), securitySettings)
  safeAdmin.role = normalizeAdminRole(safeAdmin.role)
  safeAdmin = withAuthSession(safeAdmin, securitySettings)
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
  const hasSignatureUpdate = Object.prototype.hasOwnProperty.call(profile, 'signature')
  const signature = typeof profile.signature === 'string' ? profile.signature.trim() || null : null

  if (!username || !name || !position) {
    const error = new Error('username, name and position are required')
    error.status = 400
    throw error
  }

  const pool = getPool()
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()

    const [existingRows] = await connection.query(
      'SELECT username, name FROM `admins` WHERE `id` = ? LIMIT 1',
      [adminId],
    )
    const existingAdmin = existingRows[0]
    if (!existingAdmin) {
      const error = new Error('Admin user not found')
      error.status = 404
      throw error
    }

    const [duplicateRows] = await connection.query(
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

    if (hasSignatureUpdate) {
      updates.push('`signature` = ?')
      values.push(signature)
    }

    if (password) {
      assertPasswordPolicy(password)
      updates.push('`password` = ?')
      values.push(await hashPassword(password))
      updates.push('`password_changed_at` = ?', '`failed_login_attempts` = 0', '`locked_at` = NULL')
      values.push(new Date())
    }

    values.push(adminId)
    await connection.query(`UPDATE \`admins\` SET ${updates.join(', ')} WHERE \`id\` = ?`, values)

    if (hasSignatureUpdate && signature) {
      const operatorNames = [...new Set([
        existingAdmin.username,
        existingAdmin.name,
        username,
        name,
      ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))]
      const operatorConditions = operatorNames.map(() => 'LOWER(TRIM(`it_staff_name`)) = ?').join(' OR ')

      await connection.query(
        `UPDATE \`change_requests\`
         SET \`it_staff_sign\` = ?
         WHERE (\`it_staff_sign\` IS NULL OR \`it_staff_sign\` = '')
           AND (${operatorConditions})`,
        [signature, ...operatorNames],
      )
    }

    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }

  return getAdminProfile(adminId)
}

export async function changeExpiredPassword(changeToken, password) {
  const tokenData = verifyPasswordChangeToken(changeToken)
  if (!tokenData) {
    throw createAuthError('Password change token is invalid or expired', 401, 'INVALID_CHANGE_TOKEN')
  }

  assertPasswordPolicy(password)

  const pool = getPool()
  const [rows] = await pool.query(
    'SELECT id, password_changed_at FROM `admins` WHERE `id` = ? LIMIT 1',
    [tokenData.id],
  )
  const admin = rows[0]
  const passwordVersion = admin?.password_changed_at ? new Date(admin.password_changed_at).getTime() : null
  if (!admin || passwordVersion !== tokenData.passwordVersion) {
    throw createAuthError('Password change token is invalid or expired', 401, 'INVALID_CHANGE_TOKEN')
  }

  await pool.query(
    'UPDATE `admins` SET `password` = ?, `password_changed_at` = ?, `failed_login_attempts` = 0, `locked_at` = NULL WHERE `id` = ?',
    [await hashPassword(password), new Date(), admin.id],
  )

  return getAdminProfile(admin.id)
}

export async function unlockAdminAccount(adminId) {
  const pool = getPool()
  const [result] = await pool.query(
    'UPDATE `admins` SET `failed_login_attempts` = 0, `locked_at` = NULL WHERE `id` = ?',
    [adminId],
  )
  if (!result.affectedRows) {
    throw createAuthError('Admin user not found', 404, 'ADMIN_NOT_FOUND')
  }
  return getAdminProfile(adminId)
}
