import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

dotenv.config()
const baseUrl = process.env.EMPLOYEE_NOTIFICATION_TEST_BASE_URL || 'http://127.0.0.1:4001'
const eventKey = `test:employee-notification:${Date.now()}`
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
})

const call = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: ${response.status} ${payload?.error || ''}`)
  return payload
}

try {
  const created = await call('/api/employee_status_notifications', {
    method: 'POST',
    body: JSON.stringify({ rows: [{
      event_key: eventKey,
      emp_id: '999999',
      employee_name: 'Notification Integration Test',
      change_type: 'transferred',
      from_status: 'ทำงาน',
      to_status: 'โอนย้าย',
      from_department: 'A',
      to_department: 'B',
      effective_date: new Date().toISOString().slice(0, 10),
      source_admin_name: 'HR Integration Test',
    }] }),
  })
  if (created?.data?.affectedRows !== 1) throw new Error('Notification was not inserted')

  const query = new URLSearchParams({ 'eq[event_key]': eventKey })
  const listed = await call(`/api/employee_status_notifications?${query}`)
  const row = listed?.data?.[0]
  if (!row?.id || row.reviewed_at) throw new Error('Unread notification was not returned')

  const reviewedAt = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const updated = await call(`/api/employee_status_notifications?eq[id]=${row.id}`, {
    method: 'PUT',
    body: JSON.stringify({ data: { reviewed_at: reviewedAt, reviewed_by_name: 'IT Hardware Integration Test' } }),
  })
  if (updated?.data?.affectedRows !== 1) throw new Error('Notification was not marked as reviewed')

  const verified = await call(`/api/employee_status_notifications?${query}`)
  if (!verified?.data?.[0]?.reviewed_at) throw new Error('Reviewed state was not persisted')
  console.log('Employee status notification integration test passed')
} finally {
  await pool.query('DELETE FROM employee_status_notifications WHERE event_key = ?', [eventKey])
  await pool.end()
}
