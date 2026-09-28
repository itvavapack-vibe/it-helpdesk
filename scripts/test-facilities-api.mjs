import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
import { hashPassword } from '../lib/auth.js'

dotenv.config()
const baseUrl = process.env.FACILITIES_TEST_BASE_URL || 'http://127.0.0.1:4001'
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const password = 'Facilities@Test123'
const usernames = { admin: `fac.admin.${suffix}`, requester: `fac.user.${suffix}`, managed: `fac.managed.${suffix}` }
const pool = mysql.createPool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME })
let requestId = null

const call = async (path, { token, method = 'GET', body, expected = 200 } = {}) => {
  const response = await fetch(`${baseUrl}/api/facilities${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await response.json().catch(() => null)
  if (response.status !== expected) throw new Error(`${method} ${path}: expected ${expected}, got ${response.status} (${payload?.error || 'no message'})`)
  return payload?.data
}

try {
  const passwordHash = await hashPassword(password)
  await pool.query(`INSERT INTO facilities_users (username, password, name, department, branch, role, active) VALUES (?, ?, 'Facilities Test Admin', 'บุคคลและธุรการ', 'บริษัท วาวา แพค จำกัด สาขา 1', 'admin', 1), (?, ?, 'Facilities Test Requester', 'บัญชี', 'บริษัท วาวา แพค จำกัด สาขา 1', 'requester', 1)`, [usernames.admin, passwordHash, usernames.requester, passwordHash])
  const admin = await call('/auth/login', { method: 'POST', body: { username: usernames.admin, password } })
  const requester = await call('/auth/login', { method: 'POST', body: { username: usernames.requester, password } })
  if (admin.role !== 'admin' || requester.role !== 'requester') throw new Error('Login roles are incorrect')

  const users = await call('/users', { token: admin.token })
  if (!users.some((user) => user.username === usernames.requester)) throw new Error('Admin cannot list requester')
  await call('/users', { token: requester.token, expected: 403 })
  const managed = await call('/users', { token: admin.token, method: 'POST', expected: 201, body: { username: usernames.managed, password, name: 'Facilities Managed User', department: 'คลังสินค้า', role: 'requester', active: true } })
  const managedUpdated = await call(`/users/${managed.id}`, { token: admin.token, method: 'PUT', body: { username: usernames.managed, password: '', name: 'Facilities Managed User Updated', department: 'คลังสินค้า', role: 'staff', active: true } })
  if (managedUpdated.role !== 'staff') throw new Error('User role update was not saved')
  await call(`/users/${managed.id}`, { token: admin.token, method: 'DELETE' })

  const created = await call('/public/requests', { method: 'POST', expected: 201, body: {
    reporter_name: 'ผู้แจ้งทดสอบ', department: 'บัญชี', branch: 'บริษัท วาวา แพค จำกัด สาขา 1',
    category: 'AirConditioning', location: 'ห้องประชุม ทดสอบ',
    title: 'ทดสอบระบบแจ้งซ่อมอาคาร', description: 'เครื่องปรับอากาศไม่เย็นสำหรับ integration test',
    priority: 'Urgent', requested_date: new Date().toISOString().slice(0, 10), phone: '1234',
  } })
  requestId = created.id
  if (!/^FAC-\d{4}-\d{5}$/.test(created.request_number)) throw new Error('Request number format is incorrect')
  if (created.reporter_name !== 'ผู้แจ้งทดสอบ' || created.department !== 'บัญชี' || created.request_type !== 'General') throw new Error('Public reporter fields were not saved')
  const initialTracking = await call(`/public/requests/track?request_number=${encodeURIComponent(created.request_number)}&reporter_name=${encodeURIComponent(created.reporter_name)}`)
  if (initialTracking.request.id !== requestId || initialTracking.history.length !== 1) throw new Error('Public tracking did not return the created request')
  await call(`/public/requests/track?request_number=${encodeURIComponent(created.request_number)}&reporter_name=${encodeURIComponent('ชื่อไม่ตรง')}`, { expected: 404 })
  const requests = await call('/requests', { token: admin.token })
  if (!requests.some((item) => item.id === requestId)) throw new Error('Staff cannot see public request')
  await call(`/requests/${requestId}/status`, { token: requester.token, method: 'PATCH', expected: 403, body: { status: 'Accepted', note: 'should be forbidden' } })

  await call(`/requests/${requestId}/status`, { token: admin.token, method: 'PATCH', body: { status: 'Accepted', note: 'รับเรื่องโดยธุรการ' } })
  await call(`/requests/${requestId}/status`, { token: admin.token, method: 'PATCH', body: { status: 'In_Progress', note: 'กำลังประสานช่าง', expected_completion_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10) } })
  const completed = await call(`/requests/${requestId}/status`, { token: admin.token, method: 'PATCH', body: { status: 'Completed', note: 'ดำเนินการเรียบร้อย' } })
  if (completed.status !== 'Completed' || !completed.assigned_name) throw new Error('Completion state was not saved')
  const history = await call(`/requests/${requestId}/history`, { token: admin.token })
  if (history.length !== 4 || history.at(-1)?.to_status !== 'Completed') throw new Error('Status history is incomplete')
  const completedTracking = await call(`/public/requests/track?request_number=${encodeURIComponent(created.request_number.toLowerCase())}&reporter_name=${encodeURIComponent(created.reporter_name)}`)
  if (completedTracking.request.status !== 'Completed' || completedTracking.history.length !== 4) throw new Error('Public tracking is not up to date')
  const dashboard = await call('/dashboard', { token: admin.token })
  if (!Number.isFinite(dashboard.summary.total) || dashboard.summary.total < 1) throw new Error('Dashboard summary is incorrect')
  console.log('Facilities API integration test passed')
} finally {
  if (requestId) {
    await pool.query('DELETE FROM facilities_request_status_history WHERE request_id = ?', [requestId])
    await pool.query('DELETE FROM facilities_requests WHERE id = ?', [requestId])
  }
  await pool.query('DELETE FROM facilities_users WHERE username IN (?, ?, ?)', [usernames.admin, usernames.requester, usernames.managed])
  await pool.end()
}
