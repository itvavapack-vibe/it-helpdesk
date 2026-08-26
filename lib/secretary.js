import crypto from 'crypto'
import { getPool } from './db.js'
import { assertPasswordPolicy, hashPassword, verifyPassword } from './auth.js'

const SECRETARY_TOKEN_TTL_MS = 8 * 60 * 60 * 1000
const MAX_FAILED_LOGIN_ATTEMPTS = 5
const VALID_ROLES = new Set(['reporter', 'receiver', 'super_admin'])
const RECEIVER_ROLES = new Set(['receiver', 'super_admin'])
const VALID_BRANCHES = new Set([
  'บริษัท วาวา แพค จำกัด สาขา 1',
  'บริษัท วาวา แพค จำกัด สาขา 2',
  'บริษัท วาวา แพค จำกัด สาขา 3',
])
const VALID_STATUSES = new Set(['Pending', 'In_Progress', 'Completed', 'Cancelled'])
const VALID_IMPACTS = new Set(['Low', 'Medium', 'High', 'Critical'])
const VALID_CATEGORIES = new Set([
  'ปัญหาด้านการผลิต',
  'ปัญหาด้านการขาย',
  'ปัญหาด้านการบัญชี',
  'ปัญหาด้านการซื้อ',
  'ปัญหาด้านการตรวจสอบ',
  'ปัญหาด้านการเทคโนโลยีและสารสนเทศ',
  'ปัญหาด้านการวิศวกรรม',
  'ปัญหาด้านคุณภาพงาน',
  'ปัญหาข้อร้องเรียนลูกค้า',
  'ปัญหาด้านความปลอดภัย',
  'ปัญหาด้านสาธารณูปโภค น้ำประปา ไฟฟ้า',
  'ปัญหาเกี่ยวกับเครื่องจักร',
  'ปัญหาซ่อมบำรุง',
  'ปัญหาการส่งมอบ/การจัดส่ง',
  'อื่น ๆ',
])
const MAX_STATUS_ATTACHMENTS = 5
const MAX_STATUS_ATTACHMENT_SIZE = 5 * 1024 * 1024

const createError = (message, status = 400, code = null) => {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}

const constantTimeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''))
  const rightBuffer = Buffer.from(String(right || ''))
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

const getAuthSecret = () => `${process.env.AUTH_SECRET || process.env.DB_PASSWORD || 'it-helpdesk-local-secret'}:secretary`
const encodePayload = (payload) => Buffer.from(JSON.stringify(payload)).toString('base64url')
const signPayload = (payload) => crypto.createHmac('sha256', getAuthSecret()).update(payload).digest('base64url')

const createSecretaryToken = (user) => {
  const payload = encodePayload({
    id: user.id,
    username: user.username,
    role: user.role,
    purpose: 'secretary_session',
    exp: Date.now() + SECRETARY_TOKEN_TTL_MS,
  })
  return `${payload}.${signPayload(payload)}`
}

const verifySecretaryToken = (token) => {
  const [payload, signature] = String(token || '').split('.')
  if (!payload || !signature || !constantTimeEqual(signature, signPayload(payload))) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!data?.id || data.purpose !== 'secretary_session' || !VALID_ROLES.has(data.role)) return null
    if (Date.now() > Number(data.exp || 0)) return null
    return data
  } catch {
    return null
  }
}

const sanitizeUser = (user) => ({
  id: Number(user.id),
  username: user.username,
  name: user.name,
  department: user.department,
  branch: user.branch || null,
  role: user.role,
  active: Boolean(user.active),
  locked_at: user.locked_at || null,
  created_at: user.created_at,
  updated_at: user.updated_at,
})

export const getSecretaryUserFromRequest = (req) => {
  const authorization = req?.headers?.authorization || req?.headers?.Authorization || ''
  const token = String(authorization).startsWith('Bearer ') ? String(authorization).slice(7) : ''
  return verifySecretaryToken(token)
}

const requireSecretaryAuth = (req) => {
  const user = getSecretaryUserFromRequest(req)
  if (!user) throw createError('กรุณาเข้าสู่ระบบใหม่', 401, 'AUTH_REQUIRED')
  return user
}

const requireReceiver = (req) => {
  const user = requireSecretaryAuth(req)
  if (!RECEIVER_ROLES.has(user.role)) throw createError('เฉพาะผู้รับแจ้งปัญหาหรือ Super Admin เท่านั้น', 403, 'RECEIVER_REQUIRED')
  return user
}

const requireSuperAdmin = (req) => {
  const user = requireSecretaryAuth(req)
  if (user.role !== 'super_admin') throw createError('เฉพาะ Super Admin เท่านั้นที่สามารถจัดการผู้ใช้งานได้', 403, 'SUPER_ADMIN_REQUIRED')
  return user
}

const loadActiveUser = async (userId, connection = getPool()) => {
  const [rows] = await connection.query(
    `SELECT id, username, name, department, branch, role, active, locked_at, created_at, updated_at
     FROM secretary_users WHERE id = ? LIMIT 1`,
    [userId],
  )
  const user = rows[0]
  if (!user || !user.active) throw createError('บัญชีไม่พร้อมใช้งาน', 401, 'ACCOUNT_INACTIVE')
  return user
}

export async function loginSecretary({ username, password } = {}) {
  const normalizedUsername = String(username || '').trim()
  if (!normalizedUsername || !password) throw createError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน', 400)

  const pool = getPool()
  const [rows] = await pool.query(
    `SELECT id, username, password, name, department, branch, role, active, failed_login_attempts,
            locked_at, created_at, updated_at
     FROM secretary_users WHERE username = ? LIMIT 1`,
    [normalizedUsername],
  )
  const user = rows[0]

  if (user && !user.active) throw createError('บัญชีถูกปิดใช้งาน', 403, 'ACCOUNT_INACTIVE')
  if (user?.locked_at) throw createError('บัญชีถูกล็อก กรุณาติดต่อผู้ดูแลระบบ', 423, 'ACCOUNT_LOCKED')

  if (!user || !(await verifyPassword(user.password, password))) {
    if (user) {
      const failedAttempts = Math.min(Number(user.failed_login_attempts || 0) + 1, MAX_FAILED_LOGIN_ATTEMPTS)
      const lockedAt = failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS ? new Date() : null
      await pool.query(
        'UPDATE secretary_users SET failed_login_attempts = ?, locked_at = ? WHERE id = ?',
        [failedAttempts, lockedAt, user.id],
      )
      if (lockedAt) throw createError('บัญชีถูกล็อก กรุณาติดต่อผู้ดูแลระบบ', 423, 'ACCOUNT_LOCKED')
    }
    throw createError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 401, 'INVALID_CREDENTIALS')
  }

  if (!VALID_ROLES.has(user.role)) throw createError('สิทธิ์ผู้ใช้ไม่ถูกต้อง', 403, 'INVALID_ROLE')
  if (user.failed_login_attempts) {
    await pool.query('UPDATE secretary_users SET failed_login_attempts = 0, locked_at = NULL WHERE id = ?', [user.id])
  }

  const safeUser = sanitizeUser(user)
  return {
    ...safeUser,
    token: createSecretaryToken(safeUser),
    session_expires_at: new Date(Date.now() + SECRETARY_TOKEN_TTL_MS).toISOString(),
  }
}

export async function getSecretaryProfile(req) {
  const auth = requireSecretaryAuth(req)
  const user = sanitizeUser(await loadActiveUser(auth.id))
  if (user.role !== auth.role) throw createError('สิทธิ์ผู้ใช้มีการเปลี่ยนแปลง กรุณาเข้าสู่ระบบใหม่', 401, 'ROLE_CHANGED')
  return user
}

const parsePositiveLimit = (value, fallback = 500) => {
  const number = Number(value || fallback)
  if (!Number.isInteger(number) || number < 1) return fallback
  return Math.min(number, 1000)
}

export async function listSecretaryIssues(req) {
  const auth = requireSecretaryAuth(req)
  const pool = getPool()
  const clauses = []
  const values = []

  const mineOnly = String(req.query.mine || '').trim() === '1'
  if (auth.role === 'reporter' || mineOnly) {
    const currentUser = await loadActiveUser(auth.id, pool)
    clauses.push(`(
      (reporter_user_id = ? AND department = ?)
      OR JSON_CONTAINS(COALESCE(related_users_json, '[]'), JSON_OBJECT('user_id', ?))
    )`)
    values.push(auth.id, currentUser.department, Number(auth.id))
  }

  const search = String(req.query.search || '').trim()
  if (search) {
    const like = `%${search}%`
    clauses.push('(issue_number LIKE ? OR title LIKE ? OR description LIKE ? OR department LIKE ? OR reporter_name LIKE ? OR category LIKE ?)')
    values.push(like, like, like, like, like, like)
  }

  const status = String(req.query.status || '').trim()
  if (status && VALID_STATUSES.has(status)) {
    clauses.push('status = ?')
    values.push(status)
  }

  const department = String(req.query.department || '').trim()
  if (department && RECEIVER_ROLES.has(auth.role)) {
    clauses.push('department = ?')
    values.push(department)
  }

  const category = String(req.query.category || '').trim()
  if (category) {
    clauses.push('category = ?')
    values.push(category)
  }

  const impact = String(req.query.impact || '').trim()
  if (impact && VALID_IMPACTS.has(impact)) {
    clauses.push('impact_level = ?')
    values.push(impact)
  }

  const from = String(req.query.from || '').trim()
  const to = String(req.query.to || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    clauses.push('occurred_at >= ?')
    values.push(from)
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    clauses.push('occurred_at <= ?')
    values.push(to)
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const limit = parsePositiveLimit(req.query.limit)
  const [rows] = await pool.query(
    `SELECT id, issue_number, reporter_user_id, reporter_name, department, title, category,
            description, impact_level, damage_value, related_users_json, attachments_json,
            occurred_at, expected_completion_date, status, resolution_note, assigned_user_id,
            assigned_name, completed_at, created_at, updated_at
     FROM secretary_issues ${where}
     ORDER BY updated_at DESC, id DESC LIMIT ${limit}`,
    values,
  )
  return rows.map(serializeIssue)
}

const getAuthorizedIssue = async (auth, issueId, connection = getPool()) => {
  const [rows] = await connection.query(
    `SELECT id, issue_number, reporter_user_id, reporter_name, department, title, category,
            description, impact_level, damage_value, related_users_json, attachments_json,
            occurred_at, expected_completion_date, status, resolution_note, assigned_user_id,
            assigned_name, completed_at, created_at, updated_at
     FROM secretary_issues WHERE id = ? LIMIT 1`,
    [issueId],
  )
  const issue = rows[0]
  if (!issue) throw createError('ไม่พบรายการปัญหา', 404, 'ISSUE_NOT_FOUND')
  if (auth.role === 'reporter') {
    const currentUser = await loadActiveUser(auth.id, connection)
    const ownsIssue = Number(issue.reporter_user_id) === Number(auth.id)
      && String(issue.department || '').trim() === String(currentUser.department || '').trim()
    const isRelatedUser = parseRelatedUsers(issue.related_users_json)
      .some((user) => Number(user?.user_id) === Number(auth.id))
    if (!ownsIssue && !isRelatedUser) throw createError('ไม่มีสิทธิ์ดูหรือแก้ไขรายการนี้', 403, 'ISSUE_FORBIDDEN')
  }
  return serializeIssue(issue)
}

export async function getSecretaryIssueHistory(req, issueId) {
  const auth = requireSecretaryAuth(req)
  const pool = getPool()
  await getAuthorizedIssue(auth, issueId, pool)
  const [rows] = await pool.query(
    `SELECT id, issue_id, from_status, to_status, expected_completion_date, note, attachments_json,
            changed_by_user_id, changed_by_name, changed_by_department, created_at
     FROM secretary_issue_status_history WHERE issue_id = ? ORDER BY created_at ASC, id ASC`,
    [issueId],
  )
  return rows.map(({ attachments_json: attachmentsJson, ...row }) => ({
    ...row,
    expected_completion_date: serializeDateOnly(row.expected_completion_date),
    attachments: parseStatusAttachments(attachmentsJson),
  }))
}

const cleanRequiredText = (value, label, maxLength = 255) => {
  const text = String(value || '').trim()
  if (!text) throw createError(`กรุณากรอก${label}`, 400)
  if (text.length > maxLength) throw createError(`${label}ยาวเกิน ${maxLength} ตัวอักษร`, 400)
  return text
}

const normalizeSecretaryAttachments = (value, currentUser, source) => {
  if (value == null) return []
  if (!Array.isArray(value)) throw createError('ข้อมูลไฟล์แนบไม่ถูกต้อง', 400, 'INVALID_ATTACHMENTS')
  if (value.length > MAX_STATUS_ATTACHMENTS) throw createError(`แนบไฟล์ได้สูงสุด ${MAX_STATUS_ATTACHMENTS} ไฟล์`, 400, 'TOO_MANY_ATTACHMENTS')

  return value.map((file) => {
    const name = String(file?.name || '').trim().slice(0, 255)
    const type = String(file?.type || '').trim().slice(0, 120)
    const url = String(file?.url || '').trim()
    const size = Number(file?.size || 0)
    if (!name || !/^\/uploads\/[A-Za-z0-9._-]+$/.test(url) || !Number.isFinite(size) || size < 0 || size > MAX_STATUS_ATTACHMENT_SIZE) {
      throw createError('ข้อมูลไฟล์แนบไม่ถูกต้องหรือไฟล์มีขนาดเกิน 5 MB', 400, 'INVALID_ATTACHMENT')
    }
    return {
      name,
      size,
      type,
      url,
      uploadedAt: String(file?.uploadedAt || new Date().toISOString()).slice(0, 40),
      uploadedBy: currentUser.name,
      uploadedByType: currentUser.role,
      source,
    }
  })
}

const parseStatusAttachments = (value) => {
  if (!value) return []
  try {
    const attachments = typeof value === 'string' ? JSON.parse(value) : value
    return Array.isArray(attachments) ? attachments : []
  } catch {
    return []
  }
}

const parseRelatedUsers = (value) => {
  if (!value) return []
  try {
    const users = typeof value === 'string' ? JSON.parse(value) : value
    return Array.isArray(users) ? users : []
  } catch {
    return []
  }
}

const serializeDateOnly = (value) => {
  if (!value) return null
  if (typeof value === 'string') return value.slice(0, 10)
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
    ].join('-')
  }
  return String(value).slice(0, 10)
}

const serializeIssue = ({ attachments_json: attachmentsJson, related_users_json: relatedUsersJson, ...issue }) => ({
  ...issue,
  occurred_at: serializeDateOnly(issue.occurred_at),
  expected_completion_date: serializeDateOnly(issue.expected_completion_date),
  damage_value: issue.damage_value == null ? null : Number(issue.damage_value),
  related_users: parseRelatedUsers(relatedUsersJson),
  attachments: parseStatusAttachments(attachmentsJson),
})

const normalizeDamageValue = (value) => {
  const text = String(value ?? '').trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw createError('กรุณาระบุมูลค่าความเสียหายเป็นตัวเลขไม่เกิน 2 ตำแหน่งทศนิยม', 400, 'INVALID_DAMAGE_VALUE')
  const amount = Number(text)
  if (!Number.isFinite(amount) || amount < 0 || amount > 9999999999999.99) {
    throw createError('มูลค่าความเสียหายไม่ถูกต้อง', 400, 'INVALID_DAMAGE_VALUE')
  }
  return amount
}

const normalizeRelatedUserIds = (value) => {
  if (!Array.isArray(value)) throw createError('กรุณาเลือกแผนกที่เกี่ยวข้อง', 400, 'RELATED_USERS_REQUIRED')
  const ids = [...new Set(value.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
  if (!ids.length) throw createError('กรุณาเลือกแผนกที่เกี่ยวข้องอย่างน้อย 1 รายการ', 400, 'RELATED_USERS_REQUIRED')
  if (ids.length > 50) throw createError('เลือกแผนกที่เกี่ยวข้องได้สูงสุด 50 รายการ', 400, 'TOO_MANY_RELATED_USERS')
  return ids
}

const resolveRelatedUsers = async (connection, ids) => {
  const placeholders = ids.map(() => '?').join(',')
  const [rows] = await connection.query(
    `SELECT id, username, name, department FROM secretary_users WHERE active = 1 AND id IN (${placeholders})`,
    ids,
  )
  if (rows.length !== ids.length) throw createError('มีผู้ใช้งานหรือแผนกที่เลือกไม่พร้อมใช้งาน กรุณาเลือกใหม่', 400, 'RELATED_USER_NOT_FOUND')
  const byId = new Map(rows.map((user) => [Number(user.id), user]))
  return ids.map((id) => ({
    user_id: id,
    username: byId.get(id).username,
    name: byId.get(id).name,
    department: byId.get(id).department,
  }))
}

export async function createSecretaryIssue(req) {
  const auth = requireSecretaryAuth(req)
  const currentUser = await loadActiveUser(auth.id)
  const input = req.body || {}
  const title = cleanRequiredText(input.title, 'หัวข้อปัญหา')
  const category = cleanRequiredText(input.category, 'หมวดหมู่', 120)
  if (!VALID_CATEGORIES.has(category)) throw createError('หมวดหมู่ไม่ถูกต้อง', 400, 'INVALID_CATEGORY')
  const description = cleanRequiredText(input.description, 'รายละเอียดปัญหา', 10000)
  const impactLevel = VALID_IMPACTS.has(input.impact_level) ? input.impact_level : 'Medium'
  const damageValue = normalizeDamageValue(input.damage_value)
  const relatedUserIds = normalizeRelatedUserIds(input.related_user_ids)
  const attachments = normalizeSecretaryAttachments(input.attachments, currentUser, 'secretary_issue')
  const occurredAt = /^\d{4}-\d{2}-\d{2}$/.test(String(input.occurred_at || ''))
    ? input.occurred_at
    : new Date().toISOString().slice(0, 10)

  const pool = getPool()
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const relatedUsers = await resolveRelatedUsers(connection, relatedUserIds)
    const [result] = await connection.query(
      `INSERT INTO secretary_issues
        (reporter_user_id, reporter_name, department, title, category, description, impact_level,
         damage_value, related_users_json, attachments_json, occurred_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [
        currentUser.id,
        currentUser.name,
        currentUser.department,
        title,
        category,
        description,
        impactLevel,
        damageValue,
        JSON.stringify(relatedUsers),
        attachments.length ? JSON.stringify(attachments) : null,
        occurredAt,
      ],
    )
    const now = new Date()
    const issueNumber = `SEC-${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}-${String(result.insertId).padStart(5, '0')}`
    await connection.query('UPDATE secretary_issues SET issue_number = ? WHERE id = ?', [issueNumber, result.insertId])
    await connection.query(
      `INSERT INTO secretary_issue_status_history
        (issue_id, from_status, to_status, note, changed_by_user_id, changed_by_name,
         changed_by_department)
       VALUES (?, NULL, 'Pending', 'สร้างรายการแจ้งปัญหา', ?, ?, ?)`,
      [result.insertId, currentUser.id, currentUser.name, currentUser.department],
    )
    await connection.commit()
    return getAuthorizedIssue(auth, result.insertId, pool)
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export async function updateSecretaryIssueStatus(req, issueId) {
  const auth = requireSecretaryAuth(req)
  const input = req.body || {}
  const status = String(input.status || '').trim()
  const note = String(input.note || '').trim()
  const expectedCompletionDate = String(input.expected_completion_date || '').trim()
  if (!VALID_STATUSES.has(status)) throw createError('สถานะไม่ถูกต้อง', 400)
  if (!note) throw createError('กรุณาระบุผลการดำเนินการ', 400, 'STATUS_NOTE_REQUIRED')
  let isValidExpectedDate = false
  if (expectedCompletionDate) {
    const parsedExpectedDate = new Date(`${expectedCompletionDate}T00:00:00Z`)
    isValidExpectedDate = /^\d{4}-\d{2}-\d{2}$/.test(expectedCompletionDate)
      && !Number.isNaN(parsedExpectedDate.getTime())
      && parsedExpectedDate.toISOString().slice(0, 10) === expectedCompletionDate
    if (!isValidExpectedDate) throw createError('วันที่คาดว่าจะแล้วเสร็จไม่ถูกต้อง', 400, 'INVALID_EXPECTED_COMPLETION_DATE')
  }
  if (status === 'In_Progress' && !isValidExpectedDate) {
    throw createError('กรุณาระบุวันที่คาดว่าจะแล้วเสร็จ', 400, 'EXPECTED_COMPLETION_DATE_REQUIRED')
  }
  if (note.length > 10000) throw createError('หมายเหตุยาวเกิน 10000 ตัวอักษร', 400)

  const pool = getPool()
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const currentUser = await loadActiveUser(auth.id, connection)
    const issue = await getAuthorizedIssue(auth, issueId, connection)
    const isOwner = Number(issue.reporter_user_id) === Number(auth.id)
    const isRelatedContributor = auth.role === 'reporter'
      && !isOwner
      && (issue.related_users || []).some((user) => Number(user?.user_id) === Number(auth.id))
    if (isRelatedContributor && status !== issue.status) {
      throw createError('ผู้เกี่ยวข้องไม่สามารถเปลี่ยนสถานะเอกสารได้', 403, 'RELATED_USER_STATUS_FORBIDDEN')
    }
    const attachments = normalizeSecretaryAttachments(input.attachments, currentUser, 'secretary_status')
    const completedAt = status === 'Completed'
      ? issue.status === 'Completed' && issue.completed_at ? issue.completed_at : new Date()
      : null
    const nextExpectedCompletionDate = expectedCompletionDate || issue.expected_completion_date || null
    await connection.query(
      `UPDATE secretary_issues
       SET status = ?, resolution_note = ?, assigned_user_id = ?, assigned_name = ?,
           expected_completion_date = ?, completed_at = ?
       WHERE id = ?`,
      [
        status,
        note || issue.resolution_note || null,
        currentUser.id,
        currentUser.name,
        nextExpectedCompletionDate,
        completedAt,
        issueId,
      ],
    )
    await connection.query(
      `INSERT INTO secretary_issue_status_history
        (issue_id, from_status, to_status, expected_completion_date, note, attachments_json,
         changed_by_user_id, changed_by_name, changed_by_department)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        issueId,
        issue.status,
        status,
        expectedCompletionDate || null,
        note || null,
        attachments.length ? JSON.stringify(attachments) : null,
        currentUser.id,
        currentUser.name,
        currentUser.department,
      ],
    )
    await connection.commit()
    return getAuthorizedIssue(auth, issueId, pool)
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export async function getSecretaryDashboard(req) {
  requireReceiver(req)
  const pool = getPool()
  const days = Number(req.query.days || 0)
  const useRange = Number.isInteger(days) && days > 0 && days <= 3650
  const where = useRange ? 'WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)' : ''
  const values = useRange ? [days] : []

  const [[summaryRows], [departmentRows], [categoryRows], [recentRows]] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total,
              SUM(status = 'Pending') AS pending,
              SUM(status = 'In_Progress') AS in_progress,
              SUM(status = 'Completed') AS completed,
              SUM(status = 'Cancelled') AS cancelled
       FROM secretary_issues ${where}`,
      values,
    ),
    pool.query(
      `SELECT department, COUNT(*) AS count
       FROM secretary_issues ${where}
       GROUP BY department ORDER BY count DESC, department ASC LIMIT 8`,
      values,
    ),
    pool.query(
      `SELECT category, COUNT(*) AS count
       FROM secretary_issues ${where}
       GROUP BY category ORDER BY count DESC, category ASC LIMIT 8`,
      values,
    ),
    pool.query(
      `SELECT id, issue_number, reporter_name, department, title, status, impact_level, created_at, updated_at
       FROM secretary_issues ${where}
       ORDER BY created_at DESC LIMIT 8`,
      values,
    ),
  ])

  const summary = summaryRows[0] || {}
  return {
    summary: {
      total: Number(summary.total || 0),
      pending: Number(summary.pending || 0),
      in_progress: Number(summary.in_progress || 0),
      completed: Number(summary.completed || 0),
      cancelled: Number(summary.cancelled || 0),
    },
    top_departments: departmentRows.map((row) => ({ ...row, count: Number(row.count) })),
    top_categories: categoryRows.map((row) => ({ ...row, count: Number(row.count) })),
    recent: recentRows,
  }
}

export async function getSecretaryDepartmentOverview(req) {
  requireReceiver(req)
  const pool = getPool()
  const department = String(req.query.department || '').trim()
  const includeIssues = String(req.query.include_issues || '').trim() === '1'
  const from = String(req.query.from || '').trim()
  const to = String(req.query.to || '').trim()
  if (department.length > 255) throw createError('ชื่อแผนกยาวเกิน 255 ตัวอักษร', 400)
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) throw createError('วันที่เริ่มต้นไม่ถูกต้อง', 400)
  if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw createError('วันที่สิ้นสุดไม่ถูกต้อง', 400)
  if (from && to && from > to) throw createError('วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น', 400)

  const dateClauses = []
  const dateValues = []
  if (from) {
    dateClauses.push('occurred_at >= ?')
    dateValues.push(from)
  }
  if (to) {
    dateClauses.push('occurred_at <= ?')
    dateValues.push(to)
  }
  const openDateWhere = dateClauses.length ? ` AND ${dateClauses.join(' AND ')}` : ''

  const [departmentRows] = await pool.query(`
    SELECT department_source.department,
           COALESCE(open_counts.open_count, 0) AS open_count,
           COALESCE(open_counts.pending_count, 0) AS pending_count,
           COALESCE(open_counts.in_progress_count, 0) AS in_progress_count,
           open_counts.last_updated_at
    FROM (
      SELECT department
      FROM secretary_users
      WHERE department IS NOT NULL AND TRIM(department) <> ''
      UNION
      SELECT department
      FROM secretary_issues
      WHERE department IS NOT NULL AND TRIM(department) <> ''
    ) AS department_source
    LEFT JOIN (
      SELECT department,
             COUNT(*) AS open_count,
             SUM(status = 'Pending') AS pending_count,
             SUM(status = 'In_Progress') AS in_progress_count,
             MAX(updated_at) AS last_updated_at
      FROM secretary_issues
      WHERE status IN ('Pending', 'In_Progress')${openDateWhere}
      GROUP BY department
    ) AS open_counts ON open_counts.department = department_source.department
    ORDER BY open_count DESC, department_source.department ASC
  `, dateValues)

  let issues = []
  if (department || includeIssues) {
    const departmentClause = department ? 'department = ? AND ' : ''
    const issueValues = [...(department ? [department] : []), ...dateValues]
    const issueDateWhere = dateClauses.length ? ` AND ${dateClauses.join(' AND ')}` : ''
    const [issueRows] = await pool.query(
      `SELECT id, issue_number, reporter_user_id, reporter_name, department, title, category,
              description, impact_level, damage_value, related_users_json, attachments_json,
              occurred_at, expected_completion_date, status, resolution_note, assigned_user_id,
              assigned_name, completed_at, created_at, updated_at
       FROM secretary_issues
       WHERE ${departmentClause}status IN ('Pending', 'In_Progress')${issueDateWhere}
       ORDER BY department ASC, FIELD(status, 'Pending', 'In_Progress'), updated_at DESC, id DESC`,
      issueValues,
    )
    issues = issueRows.map(serializeIssue)
  }

  const departments = departmentRows.map((row) => ({
    ...row,
    open_count: Number(row.open_count || 0),
    pending_count: Number(row.pending_count || 0),
    in_progress_count: Number(row.in_progress_count || 0),
  }))

  return {
    summary: departments.reduce((summary, row) => ({
      open: summary.open + row.open_count,
      pending: summary.pending + row.pending_count,
      in_progress: summary.in_progress + row.in_progress_count,
    }), { open: 0, pending: 0, in_progress: 0 }),
    departments,
    selected_department: department || null,
    issues,
  }
}

const normalizeRole = (role) => {
  const normalized = String(role || 'reporter').trim()
  if (!VALID_ROLES.has(normalized)) throw createError('สิทธิ์ผู้ใช้ไม่ถูกต้อง', 400, 'INVALID_ROLE')
  return normalized
}
const normalizeBranch = (branch) => {
  const normalized = String(branch || '').trim()
  if (!VALID_BRANCHES.has(normalized)) throw createError('สาขาไม่ถูกต้อง', 400, 'INVALID_BRANCH')
  return normalized
}
const normalizeActive = (value) => value === false || value === 0 || String(value).toLowerCase() === 'false' ? 0 : 1
const isUnsafeSelfUpdate = (auth, role, active) => (
  !active
  || !RECEIVER_ROLES.has(role)
  || (auth.role === 'super_admin' && role !== 'super_admin')
)

const validateUsername = (value) => {
  const username = String(value || '').trim().toLowerCase()
  if (!/^[a-z0-9._-]{3,120}$/.test(username)) {
    throw createError('ชื่อผู้ใช้ต้องมี 3-120 ตัว และใช้ a-z, 0-9, จุด, ขีดกลาง หรือขีดล่าง', 400)
  }
  return username
}

export async function listSecretaryUsers(req) {
  requireSuperAdmin(req)
  const pool = getPool()
  const [rows] = await pool.query(
    `SELECT id, username, name, department, branch, role, active, locked_at, created_at, updated_at
     FROM secretary_users ORDER BY active DESC, name ASC, username ASC`,
  )
  return rows.map(sanitizeUser)
}

export async function listSecretaryUserOptions(req) {
  const auth = requireSecretaryAuth(req)
  const pool = getPool()
  const [rows] = await pool.query(
    `SELECT id, username, name, department
     FROM secretary_users
     WHERE active = 1
       AND role <> 'super_admin'
       AND id <> ?
     ORDER BY name ASC, department ASC`,
    [auth.id],
  )
  return rows.map((user) => ({
    id: Number(user.id),
    username: user.username,
    name: user.name,
    department: user.department,
  }))
}

export async function createSecretaryUser(req) {
  requireSuperAdmin(req)
  const input = req.body || {}
  const username = validateUsername(input.username)
  const password = String(input.password || '')
  assertPasswordPolicy(password)
  const passwordHash = await hashPassword(password)
  const name = cleanRequiredText(input.name, 'ชื่อ-สกุล')
  const department = cleanRequiredText(input.department, 'แผนก')
  const branch = normalizeBranch(input.branch)
  const role = normalizeRole(input.role)
  const active = normalizeActive(input.active)
  const pool = getPool()
  try {
    const [result] = await pool.query(
      `INSERT INTO secretary_users (username, password, name, department, branch, role, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [username, passwordHash, name, department, branch, role, active],
    )
    const [rows] = await pool.query(
      `SELECT id, username, name, department, branch, role, active, locked_at, created_at, updated_at
       FROM secretary_users WHERE id = ?`,
      [result.insertId],
    )
    return sanitizeUser(rows[0])
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') throw createError('ชื่อผู้ใช้นี้มีอยู่แล้ว', 409, 'USERNAME_EXISTS')
    throw error
  }
}

export async function updateSecretaryUser(req, userId) {
  const auth = requireSuperAdmin(req)
  const input = req.body || {}
  const pool = getPool()
  const [existingRows] = await pool.query('SELECT id, role FROM secretary_users WHERE id = ? LIMIT 1', [userId])
  const existing = existingRows[0]
  if (!existing) throw createError('ไม่พบผู้ใช้', 404, 'USER_NOT_FOUND')

  const username = validateUsername(input.username)
  const name = cleanRequiredText(input.name, 'ชื่อ-สกุล')
  const department = cleanRequiredText(input.department, 'แผนก')
  const branch = normalizeBranch(input.branch)
  const role = normalizeRole(input.role)
  const active = normalizeActive(input.active)
  if (Number(auth.id) === Number(userId) && isUnsafeSelfUpdate(auth, role, active)) {
    throw createError('ไม่สามารถลดสิทธิ์หรือปิดบัญชีที่กำลังใช้งานอยู่', 400)
  }

  const sets = ['username = ?', 'name = ?', 'department = ?', 'branch = ?', 'role = ?', 'active = ?', 'failed_login_attempts = 0', 'locked_at = NULL']
  const values = [username, name, department, branch, role, active]
  const password = String(input.password || '')
  if (password) {
    assertPasswordPolicy(password)
    sets.push('password = ?')
    values.push(await hashPassword(password))
  }
  values.push(userId)

  try {
    await pool.query(`UPDATE secretary_users SET ${sets.join(', ')} WHERE id = ?`, values)
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') throw createError('ชื่อผู้ใช้นี้มีอยู่แล้ว', 409, 'USERNAME_EXISTS')
    throw error
  }
  const [rows] = await pool.query(
    `SELECT id, username, name, department, branch, role, active, locked_at, created_at, updated_at
     FROM secretary_users WHERE id = ?`,
    [userId],
  )
  return sanitizeUser(rows[0])
}

export async function deleteSecretaryUser(req, userId) {
  const auth = requireSuperAdmin(req)
  if (Number(auth.id) === Number(userId)) throw createError('ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่', 400)
  const pool = getPool()
  const [rows] = await pool.query('SELECT role FROM secretary_users WHERE id = ? LIMIT 1', [userId])
  if (!rows[0]) throw createError('ไม่พบผู้ใช้', 404, 'USER_NOT_FOUND')
  if (RECEIVER_ROLES.has(rows[0].role)) {
    const [receiverRows] = await pool.query("SELECT COUNT(*) AS count FROM secretary_users WHERE role IN ('receiver', 'super_admin') AND active = 1")
    if (Number(receiverRows[0]?.count || 0) <= 1) throw createError('ต้องมีผู้รับแจ้งที่ใช้งานได้อย่างน้อย 1 คน', 400)
  }
  await pool.query('DELETE FROM secretary_users WHERE id = ?', [userId])
  return { deleted: true }
}

export async function importSecretaryUsers(req) {
  const auth = requireSuperAdmin(req)
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : []
  if (!rows.length) throw createError('ไม่พบข้อมูลสำหรับนำเข้า', 400)
  if (rows.length > 500) throw createError('นำเข้าได้สูงสุดครั้งละ 500 รายการ', 400)

  const pool = getPool()
  const connection = await pool.getConnection()
  let inserted = 0
  let updated = 0
  try {
    await connection.beginTransaction()
    for (let index = 0; index < rows.length; index += 1) {
      const input = rows[index] || {}
      try {
        const username = validateUsername(input.username)
        const name = cleanRequiredText(input.name, 'ชื่อ-สกุล')
        const department = cleanRequiredText(input.department, 'แผนก')
        const branch = normalizeBranch(input.branch)
        const role = normalizeRole(input.role)
        const active = normalizeActive(input.active)
        const [existingRows] = await connection.query('SELECT id FROM secretary_users WHERE username = ? LIMIT 1', [username])
        const existing = existingRows[0]
        const password = String(input.password || '')
        if (!existing && !password) throw createError('ผู้ใช้ใหม่ต้องมีรหัสผ่าน', 400)

        if (existing) {
          if (Number(existing.id) === Number(auth.id) && isUnsafeSelfUpdate(auth, role, active)) {
            throw createError('ไม่สามารถลดสิทธิ์หรือปิดบัญชีที่กำลังใช้งานอยู่', 400)
          }
          const sets = ['name = ?', 'department = ?', 'branch = ?', 'role = ?', 'active = ?', 'failed_login_attempts = 0', 'locked_at = NULL']
          const values = [name, department, branch, role, active]
          if (password) {
            assertPasswordPolicy(password)
            sets.push('password = ?')
            values.push(await hashPassword(password))
          }
          values.push(existing.id)
          await connection.query(`UPDATE secretary_users SET ${sets.join(', ')} WHERE id = ?`, values)
          updated += 1
        } else {
          assertPasswordPolicy(password)
          await connection.query(
            `INSERT INTO secretary_users (username, password, name, department, branch, role, active)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [username, await hashPassword(password), name, department, branch, role, active],
          )
          inserted += 1
        }
      } catch (error) {
        throw createError(`แถวที่ ${index + 2}: ${error.message}`, error.status || 400, error.code)
      }
    }
    await connection.commit()
    return { inserted, updated, total: rows.length }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
