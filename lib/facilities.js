import crypto from 'crypto'
import { getPool } from './db.js'
import { assertPasswordPolicy, hashPassword, verifyPassword } from './auth.js'

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000
const MAX_FAILED_LOGIN_ATTEMPTS = 5
const VALID_ROLES = new Set(['requester', 'staff', 'admin'])
const STAFF_ROLES = new Set(['staff', 'admin'])
const VALID_CATEGORIES = new Set(['Electrical', 'Plumbing', 'AirConditioning', 'Building', 'Furniture', 'Sanitary', 'Safety', 'Other'])
const VALID_PRIORITIES = new Set(['Low', 'Normal', 'High', 'Urgent'])
const VALID_STATUSES = new Set(['Pending', 'Accepted', 'In_Progress', 'Waiting', 'Completed', 'Cancelled'])
const MAX_ATTACHMENTS = 5
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024

const createError = (message, status = 400, code = null) => Object.assign(new Error(message), { status, code })
const constantTimeEqual = (left, right) => {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
const encodePayload = (payload) => Buffer.from(JSON.stringify(payload)).toString('base64url')
const authSecret = () => `${process.env.AUTH_SECRET || process.env.DB_PASSWORD || 'it-helpdesk-local-secret'}:hr-facilities`
const signPayload = (payload) => crypto.createHmac('sha256', authSecret()).update(payload).digest('base64url')
const createToken = (user) => {
  const payload = encodePayload({ id: user.id, role: user.role, purpose: 'hr_facilities_session', exp: Date.now() + TOKEN_TTL_MS })
  return `${payload}.${signPayload(payload)}`
}
const verifyToken = (token) => {
  const [payload, signature] = String(token || '').split('.')
  if (!payload || !signature || !constantTimeEqual(signature, signPayload(payload))) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return data?.id && data.purpose === 'hr_facilities_session' && VALID_ROLES.has(data.role) && Date.now() <= Number(data.exp || 0) ? data : null
  } catch { return null }
}
const getTokenFromRequest = (req) => {
  const value = req?.headers?.authorization || req?.headers?.Authorization || ''
  return String(value).startsWith('Bearer ') ? String(value).slice(7) : ''
}
const sanitizeUser = (user) => ({ id: Number(user.id), username: user.username, name: user.name, department: user.department, branch: user.branch || null, role: user.role, active: Boolean(user.active), locked_at: user.locked_at || null, created_at: user.created_at, updated_at: user.updated_at })

const loadCurrentUser = async (req, connection = getPool()) => {
  const auth = verifyToken(getTokenFromRequest(req))
  if (!auth) throw createError('กรุณาเข้าสู่ระบบใหม่', 401, 'AUTH_REQUIRED')
  const [rows] = await connection.query(`SELECT id, username, name, department, branch, role, active, locked_at, created_at, updated_at FROM facilities_users WHERE id = ? LIMIT 1`, [auth.id])
  const user = rows[0]
  if (!user?.active || user.role !== auth.role) throw createError('บัญชีไม่พร้อมใช้งาน กรุณาเข้าสู่ระบบใหม่', 401, 'ACCOUNT_INACTIVE')
  return user
}
const requireStaff = async (req, connection = getPool()) => {
  const user = await loadCurrentUser(req, connection)
  if (!STAFF_ROLES.has(user.role)) throw createError('เฉพาะเจ้าหน้าที่ธุรการเท่านั้น', 403, 'FACILITIES_STAFF_REQUIRED')
  return user
}
const requireAdmin = async (req, connection = getPool()) => {
  const user = await loadCurrentUser(req, connection)
  if (user.role !== 'admin') throw createError('เฉพาะผู้ดูแลระบบ HR เท่านั้น', 403, 'FACILITIES_ADMIN_REQUIRED')
  return user
}
const cleanText = (value, label, maxLength = 255) => {
  const text = String(value || '').trim()
  if (!text) throw createError(`กรุณากรอก${label}`, 400, 'REQUIRED_FIELD')
  if (text.length > maxLength) throw createError(`${label}ยาวเกิน ${maxLength} ตัวอักษร`)
  return text
}
const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value
  if (!value) return []
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
}
const serializeDateOnly = (value) => value ? (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)) : null
const serializeRequest = ({ attachments_json: attachmentsJson, ...row }) => ({ ...row, id: Number(row.id), reporter_user_id: row.reporter_user_id == null ? null : Number(row.reporter_user_id), assigned_user_id: row.assigned_user_id == null ? null : Number(row.assigned_user_id), attachments: parseJsonArray(attachmentsJson), requested_date: serializeDateOnly(row.requested_date), expected_completion_date: serializeDateOnly(row.expected_completion_date) })
const normalizeAttachments = (value, user, source) => {
  if (value == null) return []
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) throw createError(`แนบไฟล์ได้สูงสุด ${MAX_ATTACHMENTS} ไฟล์`, 400, 'INVALID_ATTACHMENTS')
  return value.map((file) => {
    const name = cleanText(file?.name, 'ชื่อไฟล์', 255)
    const url = cleanText(file?.url, 'ที่อยู่ไฟล์', 1000)
    const size = Number(file?.size || 0)
    if (!Number.isFinite(size) || size < 0 || size > MAX_ATTACHMENT_SIZE) throw createError(`ไฟล์ ${name} มีขนาดไม่ถูกต้อง`, 400, 'INVALID_ATTACHMENT_SIZE')
    return { name, url, size, type: String(file?.type || '').slice(0, 150), uploadedAt: file?.uploadedAt || new Date().toISOString(), uploadedBy: user.name, uploadedByType: user.role, source }
  })
}
const requestSelect = `SELECT id, request_number, reporter_user_id, reporter_name, department, branch, phone, request_type, category, location, title, description, priority, requested_date, expected_completion_date, attachments_json, status, resolution_note, assigned_user_id, assigned_name, completed_at, created_at, updated_at FROM facilities_requests`
const getRequestById = async (requestId, connection = getPool()) => {
  const [rows] = await connection.query(`${requestSelect} WHERE id = ? LIMIT 1`, [requestId])
  if (!rows[0]) throw createError('ไม่พบรายการงานอาคาร', 404, 'FACILITIES_REQUEST_NOT_FOUND')
  return serializeRequest(rows[0])
}

export async function loginFacilities({ username, password } = {}) {
  const normalizedUsername = String(username || '').trim()
  if (!normalizedUsername || !password) throw createError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน')
  const pool = getPool()
  const [rows] = await pool.query('SELECT * FROM facilities_users WHERE username = ? LIMIT 1', [normalizedUsername])
  const user = rows[0]
  if (user && !user.active) throw createError('บัญชีถูกปิดใช้งาน', 403, 'ACCOUNT_INACTIVE')
  if (user?.locked_at) throw createError('บัญชีถูกล็อก กรุณาติดต่อผู้ดูแลระบบ', 423, 'ACCOUNT_LOCKED')
  if (!user || !(await verifyPassword(user.password, password))) {
    if (user) {
      const attempts = Math.min(Number(user.failed_login_attempts || 0) + 1, MAX_FAILED_LOGIN_ATTEMPTS)
      const lockedAt = attempts >= MAX_FAILED_LOGIN_ATTEMPTS ? new Date() : null
      await pool.query('UPDATE facilities_users SET failed_login_attempts = ?, locked_at = ? WHERE id = ?', [attempts, lockedAt, user.id])
      if (lockedAt) throw createError('บัญชีถูกล็อก กรุณาติดต่อผู้ดูแลระบบ', 423, 'ACCOUNT_LOCKED')
    }
    throw createError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 401, 'INVALID_CREDENTIALS')
  }
  if (user.failed_login_attempts) await pool.query('UPDATE facilities_users SET failed_login_attempts = 0, locked_at = NULL WHERE id = ?', [user.id])
  const safe = sanitizeUser(user)
  return { ...safe, token: createToken(safe), session_expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString() }
}
export async function getFacilitiesProfile(req) { return sanitizeUser(await loadCurrentUser(req)) }

const normalizeUserInput = (input, requirePassword) => {
  const password = String(input.password || '')
  if (requirePassword || password) {
    try { assertPasswordPolicy(password) }
    catch (error) {
      if (error.code === 'WEAK_PASSWORD') throw createError(`รหัสผ่านต้องประกอบด้วย: ${(error.policyErrors || []).join(', ')}`, 400, 'WEAK_PASSWORD')
      throw error
    }
  }
  return { username: cleanText(input.username, 'ชื่อผู้ใช้', 120), name: cleanText(input.name, 'ชื่อ-นามสกุล', 255), department: cleanText(input.department, 'แผนก', 255), branch: String(input.branch || '').trim().slice(0, 255) || null, role: VALID_ROLES.has(input.role) ? input.role : 'requester', active: input.active === false || input.active === 0 ? 0 : 1, password }
}
export async function listFacilitiesUsers(req) {
  await requireAdmin(req)
  const [rows] = await getPool().query('SELECT id, username, name, department, branch, role, active, locked_at, created_at, updated_at FROM facilities_users ORDER BY active DESC, name ASC')
  return rows.map(sanitizeUser)
}
export async function createFacilitiesUser(req) {
  await requireAdmin(req)
  const input = normalizeUserInput(req.body || {}, true)
  try {
    const [result] = await getPool().query('INSERT INTO facilities_users (username, password, name, department, branch, role, active) VALUES (?, ?, ?, ?, ?, ?, ?)', [input.username, await hashPassword(input.password), input.name, input.department, input.branch, input.role, input.active])
    const [rows] = await getPool().query('SELECT id, username, name, department, branch, role, active, locked_at, created_at, updated_at FROM facilities_users WHERE id = ?', [result.insertId])
    return sanitizeUser(rows[0])
  } catch (error) { if (error.code === 'ER_DUP_ENTRY') throw createError('ชื่อผู้ใช้นี้มีอยู่แล้ว', 409, 'DUPLICATE_USERNAME'); throw error }
}
export async function updateFacilitiesUser(req, userId) {
  const admin = await requireAdmin(req)
  const input = normalizeUserInput(req.body || {}, false)
  if (Number(admin.id) === Number(userId) && (!input.active || input.role !== 'admin')) throw createError('ไม่สามารถลดสิทธิ์หรือปิดบัญชีของตนเองได้', 400, 'SELF_ADMIN_PROTECTED')
  const fields = ['username = ?', 'name = ?', 'department = ?', 'branch = ?', 'role = ?', 'active = ?', 'locked_at = NULL', 'failed_login_attempts = 0']
  const values = [input.username, input.name, input.department, input.branch, input.role, input.active]
  if (input.password) { fields.push('password = ?'); values.push(await hashPassword(input.password)) }
  values.push(userId)
  try {
    const [result] = await getPool().query(`UPDATE facilities_users SET ${fields.join(', ')} WHERE id = ?`, values)
    if (!result.affectedRows) throw createError('ไม่พบผู้ใช้งาน', 404, 'USER_NOT_FOUND')
    const [rows] = await getPool().query('SELECT id, username, name, department, branch, role, active, locked_at, created_at, updated_at FROM facilities_users WHERE id = ?', [userId])
    return sanitizeUser(rows[0])
  } catch (error) { if (error.code === 'ER_DUP_ENTRY') throw createError('ชื่อผู้ใช้นี้มีอยู่แล้ว', 409, 'DUPLICATE_USERNAME'); throw error }
}
export async function deleteFacilitiesUser(req, userId) {
  const admin = await requireAdmin(req)
  if (Number(admin.id) === Number(userId)) throw createError('ไม่สามารถลบบัญชีของตนเองได้', 400, 'SELF_DELETE_FORBIDDEN')
  const [usage] = await getPool().query('SELECT COUNT(*) AS count FROM facilities_requests WHERE reporter_user_id = ? OR assigned_user_id = ?', [userId, userId])
  if (Number(usage[0]?.count || 0)) throw createError('ผู้ใช้นี้มีประวัติงาน กรุณาปิดใช้งานแทนการลบ', 409, 'USER_IN_USE')
  const [result] = await getPool().query('DELETE FROM facilities_users WHERE id = ?', [userId])
  if (!result.affectedRows) throw createError('ไม่พบผู้ใช้งาน', 404, 'USER_NOT_FOUND')
  return { id: Number(userId), deleted: true }
}

export async function listFacilitiesRequests(req) {
  const user = await loadCurrentUser(req)
  const clauses = []
  const values = []
  if (user.role === 'requester' || String(req.query.mine || '') === '1') { clauses.push('reporter_user_id = ?'); values.push(user.id) }
  const search = String(req.query.search || '').trim()
  if (search) { const like = `%${search}%`; clauses.push('(request_number LIKE ? OR title LIKE ? OR description LIKE ? OR location LIKE ? OR reporter_name LIKE ? OR department LIKE ?)'); values.push(like, like, like, like, like, like) }
  for (const [field, allowed] of [['status', VALID_STATUSES], ['priority', VALID_PRIORITIES]]) {
    const value = String(req.query[field] || '').trim()
    if (value && allowed.has(value)) { clauses.push(`${field} = ?`); values.push(value) }
  }
  const branch = String(req.query.branch || '').trim()
  if (branch) { clauses.push('branch = ?'); values.push(branch) }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const [rows] = await getPool().query(`${requestSelect} ${where} ORDER BY updated_at DESC, id DESC LIMIT 1000`, values)
  return rows.map(serializeRequest)
}
const insertFacilitiesRequest = async ({ input, reporter, reporterUserId = null }) => {
  const category = String(input.category || '').trim()
  const priority = VALID_PRIORITIES.has(input.priority) ? input.priority : 'Normal'
  if (!VALID_CATEGORIES.has(category)) throw createError('หมวดหมู่งานไม่ถูกต้อง', 400, 'INVALID_CATEGORY')
  const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(input.requested_date || '')) ? input.requested_date : new Date().toISOString().slice(0, 10)
  const attachments = normalizeAttachments(input.attachments, reporter, 'facilities_request')
  const connection = await getPool().getConnection()
  try {
    await connection.beginTransaction()
    const [result] = await connection.query(`INSERT INTO facilities_requests (reporter_user_id, reporter_name, department, branch, phone, request_type, category, location, title, description, priority, requested_date, attachments_json, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`, [reporterUserId, reporter.name, reporter.department, reporter.branch || null, String(input.phone || '').trim().slice(0, 80) || null, 'General', category, cleanText(input.location, 'สถานที่', 255), cleanText(input.title, 'หัวข้องาน', 255), cleanText(input.description, 'รายละเอียด', 10000), priority, requestedDate, attachments.length ? JSON.stringify(attachments) : null])
    const now = new Date()
    const requestNumber = `FAC-${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}-${String(result.insertId).padStart(5, '0')}`
    await connection.query('UPDATE facilities_requests SET request_number = ? WHERE id = ?', [requestNumber, result.insertId])
    await connection.query("INSERT INTO facilities_request_status_history (request_id, from_status, to_status, note, changed_by_user_id, changed_by_name) VALUES (?, NULL, 'Pending', 'สร้างรายการแจ้งงานอาคารสถานที่', ?, ?)", [result.insertId, reporterUserId, reporter.name])
    await connection.commit()
    return getRequestById(result.insertId)
  } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
}

export async function createFacilitiesRequest(req) {
  const user = await loadCurrentUser(req)
  return insertFacilitiesRequest({ input: req.body || {}, reporter: user, reporterUserId: user.id })
}

export async function createPublicFacilitiesRequest(req) {
  const input = req.body || {}
  const reporter = {
    name: cleanText(input.reporter_name, 'ชื่อผู้แจ้ง', 255),
    department: cleanText(input.department, 'แผนก', 255),
    branch: String(input.branch || '').trim().slice(0, 255) || null,
    role: 'public',
  }
  return insertFacilitiesRequest({ input, reporter })
}

export async function trackPublicFacilitiesRequest(req) {
  const requestNumber = cleanText(req.query?.request_number, 'เลขที่ใบแจ้ง', 50).toUpperCase()
  const reporterName = cleanText(req.query?.reporter_name, 'ชื่อผู้แจ้ง', 255)
  const [rows] = await getPool().query(
    `${requestSelect} WHERE UPPER(request_number) = ? AND TRIM(reporter_name) = ? LIMIT 1`,
    [requestNumber, reporterName],
  )
  if (!rows[0]) throw createError('ไม่พบรายการ กรุณาตรวจสอบเลขที่ใบแจ้งและชื่อผู้แจ้ง', 404, 'FACILITIES_TRACKING_NOT_FOUND')

  const request = serializeRequest(rows[0])
  const [historyRows] = await getPool().query(
    'SELECT id, request_id, from_status, to_status, expected_completion_date, note, changed_by_name, created_at FROM facilities_request_status_history WHERE request_id = ? ORDER BY created_at ASC, id ASC',
    [request.id],
  )
  const history = historyRows.map((row) => ({
    ...row,
    id: Number(row.id),
    request_id: Number(row.request_id),
    expected_completion_date: serializeDateOnly(row.expected_completion_date),
  }))
  return { request, history }
}

export async function getFacilitiesRequestHistory(req, requestId) {
  const user = await loadCurrentUser(req)
  const request = await getRequestById(requestId)
  if (user.role === 'requester' && Number(request.reporter_user_id) !== Number(user.id)) throw createError('ไม่มีสิทธิ์ดูรายการนี้', 403, 'REQUEST_FORBIDDEN')
  const [rows] = await getPool().query('SELECT id, request_id, from_status, to_status, expected_completion_date, note, attachments_json, changed_by_user_id, changed_by_name, created_at FROM facilities_request_status_history WHERE request_id = ? ORDER BY created_at ASC, id ASC', [requestId])
  return rows.map(({ attachments_json: attachmentsJson, ...row }) => ({ ...row, id: Number(row.id), request_id: Number(row.request_id), expected_completion_date: serializeDateOnly(row.expected_completion_date), attachments: parseJsonArray(attachmentsJson) }))
}
export async function updateFacilitiesRequestStatus(req, requestId) {
  const connection = await getPool().getConnection()
  try {
    const user = await requireStaff(req, connection)
    const input = req.body || {}
    const status = String(input.status || '').trim()
    if (!VALID_STATUSES.has(status)) throw createError('สถานะไม่ถูกต้อง', 400, 'INVALID_STATUS')
    const note = cleanText(input.note, status === 'Cancelled' ? 'เหตุผลการยกเลิก' : 'ผลการดำเนินการ', 10000)
    const expectedDate = String(input.expected_completion_date || '').trim()
    if (expectedDate && !/^\d{4}-\d{2}-\d{2}$/.test(expectedDate)) throw createError('วันที่คาดว่าจะแล้วเสร็จไม่ถูกต้อง')
    if (status === 'In_Progress' && !expectedDate) throw createError('กรุณาระบุวันที่คาดว่าจะแล้วเสร็จ', 400, 'EXPECTED_DATE_REQUIRED')
    const attachments = normalizeAttachments(input.attachments, user, 'facilities_status')
    await connection.beginTransaction()
    const [rows] = await connection.query(`${requestSelect} WHERE id = ? FOR UPDATE`, [requestId])
    if (!rows[0]) throw createError('ไม่พบรายการงานอาคาร', 404, 'FACILITIES_REQUEST_NOT_FOUND')
    const current = serializeRequest(rows[0])
    const assign = ['Accepted', 'In_Progress', 'Waiting', 'Completed'].includes(status)
    await connection.query('UPDATE facilities_requests SET status = ?, resolution_note = ?, expected_completion_date = ?, assigned_user_id = ?, assigned_name = ?, completed_at = ? WHERE id = ?', [status, note, expectedDate || null, assign ? user.id : current.assigned_user_id, assign ? user.name : current.assigned_name, status === 'Completed' ? (current.completed_at || new Date()) : null, requestId])
    await connection.query('INSERT INTO facilities_request_status_history (request_id, from_status, to_status, expected_completion_date, note, attachments_json, changed_by_user_id, changed_by_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [requestId, current.status, status, expectedDate || null, note, attachments.length ? JSON.stringify(attachments) : null, user.id, user.name])
    await connection.commit()
    return getRequestById(requestId)
  } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
}
export async function getFacilitiesDashboard(req) {
  const user = await loadCurrentUser(req)
  const where = user.role === 'requester' ? 'WHERE reporter_user_id = ?' : ''
  const values = user.role === 'requester' ? [user.id] : []
  const pool = getPool()
  const [[summaryRows], [categoryRows], [recentRows]] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total, SUM(status = 'Pending') AS pending, SUM(status IN ('Accepted', 'In_Progress', 'Waiting')) AS active, SUM(status = 'Completed') AS completed, SUM(status = 'Cancelled') AS cancelled, SUM(priority = 'Urgent' AND status NOT IN ('Completed', 'Cancelled')) AS urgent FROM facilities_requests ${where}`, values),
    pool.query(`SELECT category, COUNT(*) AS count FROM facilities_requests ${where} GROUP BY category ORDER BY count DESC LIMIT 8`, values),
    pool.query(`${requestSelect} ${where} ORDER BY created_at DESC LIMIT 8`, values),
  ])
  return { summary: Object.fromEntries(Object.entries(summaryRows[0] || {}).map(([key, value]) => [key, Number(value || 0)])), by_category: categoryRows.map((row) => ({ ...row, count: Number(row.count) })), recent: recentRows.map(serializeRequest) }
}
