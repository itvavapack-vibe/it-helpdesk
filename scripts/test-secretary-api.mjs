import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
import { hashPassword } from '../lib/auth.js'

dotenv.config()

const baseUrl = String(process.env.SECRETARY_TEST_API_URL || 'http://127.0.0.1:4001').replace(/\/+$/, '')
const suffix = Date.now()
const testPassword = 'Secretary@Test123'
const testBranch = 'บริษัท วาวา แพค จำกัด สาขา 2'
const useBootstrapAdmin = !process.env.SECRETARY_TEST_ADMIN_PASSWORD
const adminUsername = process.env.SECRETARY_TEST_ADMIN_USERNAME
  || (useBootstrapAdmin ? `secretary.audit.${suffix}` : 'secretary.admin')
const adminPassword = process.env.SECRETARY_TEST_ADMIN_PASSWORD || testPassword

const request = async (path, { method = 'GET', body, token, expectedStatus = 200 } = {}) => {
  const response = await fetch(`${baseUrl}/api/secretary${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await response.json().catch(() => null)
  if (response.status !== expectedStatus) {
    throw new Error(`${method} ${path}: expected ${expectedStatus}, got ${response.status}: ${payload?.error || ''}`)
  }
  return payload?.data
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
})

const reporterUsername = `secretary.test.${suffix}`
const importedUsername = `secretary.import.${suffix}`
const superAdminUsername = `secretary.super.${suffix}`
const receiverUsername = `secretary.receiver.${suffix}`
let bootstrapAdminId = null
let testIssueId = null
let otherIssueId = null

try {
  if (useBootstrapAdmin) {
    const [result] = await pool.query(
      `INSERT INTO secretary_users
        (username, password, name, department, role, active)
       VALUES (?, ?, ?, ?, 'super_admin', 1)`,
      [adminUsername, await hashPassword(adminPassword), 'Secretary API Test Bootstrap Admin', 'แอดมิน'],
    )
    bootstrapAdminId = result.insertId
  }

  const admin = await request('/auth/login', {
    method: 'POST',
    body: { username: adminUsername, password: adminPassword },
  })
  if (admin.role !== 'super_admin' || !admin.token) throw new Error('Super Admin login response is invalid')

  const superAdmin = await request('/users', {
    method: 'POST',
    token: admin.token,
    expectedStatus: 201,
    body: {
      username: superAdminUsername,
      password: testPassword,
      name: 'Secretary API Test Super Admin',
      department: 'แอดมิน',
      branch: testBranch,
      role: 'super_admin',
      active: true,
    },
  })

  const superAdminAuth = await request('/auth/login', {
    method: 'POST',
    body: { username: superAdminUsername, password: testPassword },
  })
  if (superAdminAuth.role !== 'super_admin' || !superAdminAuth.token) throw new Error('Super Admin login response is invalid')
  await request('/dashboard', { token: superAdminAuth.token })
  await request('/users', { token: superAdminAuth.token })

  const receiver = await request('/users', {
    method: 'POST',
    token: admin.token,
    expectedStatus: 201,
    body: {
      username: receiverUsername,
      password: testPassword,
      name: 'Secretary API Test Receiver',
      department: 'สำนักกรรมการ',
      branch: testBranch,
      role: 'receiver',
      active: true,
    },
  })
  const receiverAuth = await request('/auth/login', {
    method: 'POST',
    body: { username: receiverUsername, password: testPassword },
  })
  await request('/dashboard', { token: receiverAuth.token })
  await request('/users', { token: receiverAuth.token, expectedStatus: 403 })

  const reporter = await request('/users', {
    method: 'POST',
    token: admin.token,
    expectedStatus: 201,
    body: {
      username: reporterUsername,
      password: testPassword,
      name: 'Secretary API Test Reporter',
      department: 'Test Department',
      branch: testBranch,
      role: 'reporter',
      active: true,
    },
  })

  const importResult = await request('/users/import', {
    method: 'POST',
    token: admin.token,
    body: {
      rows: [{
        username: importedUsername,
        password: testPassword,
        name: 'Secretary API Imported User',
        department: 'Test Department',
        branch: testBranch,
        role: 'reporter',
        active: true,
      }],
    },
  })
  if (importResult.inserted !== 1) throw new Error('User import did not insert one row')

  const reporterAuth = await request('/auth/login', {
    method: 'POST',
    body: { username: reporterUsername, password: testPassword },
  })
  if (reporterAuth.role !== 'reporter') throw new Error('Reporter login response is invalid')

  const userOptions = await request('/user-options', { token: reporterAuth.token })
  const importedOption = userOptions.find((user) => user.username === importedUsername)
  if (!importedOption || !importedOption.name || !importedOption.department) throw new Error('Reporter cannot load related user options')
  if ('role' in importedOption) throw new Error('User options exposed restricted user data')

  const importedAuth = await request('/auth/login', {
    method: 'POST',
    body: { username: importedUsername, password: testPassword },
  })
  const otherIssue = await request('/issues', {
    method: 'POST',
    token: importedAuth.token,
    expectedStatus: 201,
    body: {
      title: 'Secretary integration test other reporter issue',
      category: 'ปัญหาด้านการผลิต',
      description: 'Must remain private to the other reporter',
      impact_level: 'Medium',
      damage_value: '1000.00',
      related_user_ids: [receiver.id],
      occurred_at: new Date().toISOString().slice(0, 10),
    },
  })
  otherIssueId = otherIssue.id

  const issue = await request('/issues', {
    method: 'POST',
    token: reporterAuth.token,
    expectedStatus: 201,
    body: {
      title: 'Secretary integration test issue',
      category: 'ปัญหาด้านการเทคโนโลยีและสารสนเทศ',
      description: 'Temporary integration test record',
      impact_level: 'High',
      damage_value: '12345.67',
      related_user_ids: [importedOption.id],
      attachments: [{
        name: 'secretary-test-evidence.txt',
        type: 'text/plain',
        size: 128,
        url: '/uploads/secretary-test-evidence.txt',
      }],
      occurred_at: new Date().toISOString().slice(0, 10),
    },
  })
  testIssueId = issue.id
  if (issue.status !== 'Pending' || !issue.issue_number) throw new Error('Created issue is invalid')
  if (Number(issue.damage_value) !== 12345.67) throw new Error('Damage value was not saved')
  if (issue.related_users?.[0]?.name !== 'Secretary API Imported User') throw new Error('Related user snapshot was not saved')
  if (issue.attachments?.[0]?.source !== 'secretary_issue') throw new Error('Issue attachment was not saved')

  await request('/department-overview', { token: reporterAuth.token, expectedStatus: 403 })
  const departmentOverview = await request(`/department-overview?department=${encodeURIComponent('Test Department')}`, {
    token: receiverAuth.token,
  })
  const testDepartment = departmentOverview.departments.find((row) => row.department === 'Test Department')
  if (!testDepartment || testDepartment.open_count < 2 || testDepartment.pending_count < 2) {
    throw new Error('Department overview badge counts are invalid')
  }
  if (!departmentOverview.issues.some((row) => Number(row.id) === Number(testIssueId))) {
    throw new Error('Department overview did not return the selected department issues')
  }
  const departmentReport = await request('/department-overview?include_issues=1', { token: receiverAuth.token })
  if (!departmentReport.issues.some((row) => Number(row.id) === Number(testIssueId))
      || !departmentReport.issues.some((row) => Number(row.id) === Number(otherIssueId))) {
    throw new Error('Department overview report did not return all open issues')
  }
  if (departmentReport.issues.some((row) => !['Pending', 'In_Progress'].includes(row.status))) {
    throw new Error('Department overview report included a completed or cancelled issue')
  }
  const today = new Date().toISOString().slice(0, 10)
  const rangedOverview = await request(`/department-overview?department=${encodeURIComponent('Test Department')}&from=${today}&to=${today}`, {
    token: receiverAuth.token,
  })
  if (!rangedOverview.issues.some((row) => Number(row.id) === Number(testIssueId))) {
    throw new Error('Department overview date range excluded a matching issue')
  }
  const tomorrow = new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString().slice(0, 10)
  const futureOverview = await request(`/department-overview?department=${encodeURIComponent('Test Department')}&from=${tomorrow}&to=${tomorrow}`, {
    token: receiverAuth.token,
  })
  if (futureOverview.issues.some((row) => Number(row.id) === Number(testIssueId))) {
    throw new Error('Department overview date range included an issue outside the range')
  }
  await request(`/department-overview?from=${tomorrow}&to=${today}`, {
    token: receiverAuth.token,
    expectedStatus: 400,
  })

  const reporterIssues = await request('/issues', { token: reporterAuth.token })
  if (!reporterIssues.some((row) => Number(row.id) === Number(testIssueId))) throw new Error('Reporter cannot see own issue')
  if (reporterIssues.some((row) => Number(row.id) === Number(otherIssueId))) throw new Error('Reporter can see another reporter issue')

  const receiverOwnIssues = await request('/issues?mine=1', { token: admin.token })
  if (receiverOwnIssues.some((row) => Number(row.id) === Number(testIssueId))) throw new Error('Reporter view leaked another user issue')

  await request(`/issues/${otherIssueId}/status`, {
    method: 'PATCH',
    token: reporterAuth.token,
    expectedStatus: 403,
    body: {
      status: 'In_Progress',
      note: 'Must remain forbidden',
      expected_completion_date: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10),
    },
  })

  const expectedCompletionDate = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10)
  const inProgress = await request(`/issues/${testIssueId}/status`, {
    method: 'PATCH',
    token: reporterAuth.token,
    body: {
      status: 'In_Progress',
      note: 'ผู้แจ้งกำลังดำเนินการ',
      expected_completion_date: expectedCompletionDate,
    },
  })
  if (inProgress.status !== 'In_Progress' || inProgress.expected_completion_date !== expectedCompletionDate) {
    throw new Error('Issue was not moved to In_Progress with an expected completion date')
  }

  const completed = await request(`/issues/${testIssueId}/status`, {
    method: 'PATCH',
    token: reporterAuth.token,
    body: { status: 'Completed', note: 'ผู้แจ้งดำเนินการเสร็จสิ้น' },
  })
  if (completed.status !== 'Completed' || !completed.completed_at) throw new Error('Issue was not completed')

  const history = await request(`/issues/${testIssueId}/history`, { token: reporterAuth.token })
  if (history.length !== 3) throw new Error(`Expected 3 history rows, got ${history.length}`)

  const dashboard = await request('/dashboard', { token: admin.token })
  if (!dashboard?.summary || !Array.isArray(dashboard.top_departments)) throw new Error('Dashboard response is invalid')

  const users = await request('/users', { token: admin.token })
  const importedUser = users.find((user) => user.username === importedUsername)
  if (!importedUser) throw new Error('Imported user was not found')
  if (importedUser.branch !== testBranch) throw new Error('Imported user branch was not saved')

  await request(`/users/${reporter.id}`, { method: 'DELETE', token: admin.token })
  await request(`/users/${importedUser.id}`, { method: 'DELETE', token: admin.token })
  await request(`/users/${superAdmin.id}`, { method: 'DELETE', token: admin.token })
  await request(`/users/${receiver.id}`, { method: 'DELETE', token: admin.token })

  console.log('Secretary API integration test passed')
} finally {
  try {
    if (testIssueId) {
      await pool.query('DELETE FROM secretary_issue_status_history WHERE issue_id = ?', [testIssueId])
      await pool.query('DELETE FROM secretary_issues WHERE id = ?', [testIssueId])
    }
    if (otherIssueId) {
      await pool.query('DELETE FROM secretary_issue_status_history WHERE issue_id = ?', [otherIssueId])
      await pool.query('DELETE FROM secretary_issues WHERE id = ?', [otherIssueId])
    }
    await pool.query(
      'DELETE FROM secretary_users WHERE username IN (?, ?, ?, ?)',
      [reporterUsername, importedUsername, superAdminUsername, receiverUsername],
    )
    if (bootstrapAdminId) {
      await pool.query('DELETE FROM secretary_users WHERE id = ?', [bootstrapAdminId])
    }
  } finally {
    await pool.end()
  }
}
