import fs from 'fs/promises'
import path from 'path'
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
import { hashPassword } from '../lib/auth.js'

dotenv.config()

const baseUrl = String(process.env.SECRETARY_TEST_API_URL || 'http://127.0.0.1:4001').replace(/\/+$/, '')
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
})

const request = async (urlPath, { method = 'GET', body, token, expectedStatus = 200 } = {}) => {
  const response = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  })
  const payload = await response.json().catch(() => null)
  if (response.status !== expectedStatus) {
    throw new Error(`${method} ${urlPath}: expected ${expectedStatus}, got ${response.status}: ${payload?.error || ''}`)
  }
  return payload?.data
}

const suffix = Date.now()
const reporterUsername = `secretary.report.${suffix}`
const relatedUsername = `secretary.related.${suffix}`
const superAdminUsername = `secretary.super.${suffix}`
const password = 'Secretary@Test123'
let reporterId = null
let relatedId = null
let superAdminId = null
let issueId = null
let uploadedPath = null

try {
  const passwordHash = await hashPassword(password)
  const [reporterResult] = await pool.query(
    `INSERT INTO secretary_users (username, password, name, department, role, active)
     VALUES (?, ?, ?, ?, 'reporter', 1)`,
    [reporterUsername, passwordHash, 'Issue Report Test User', 'เทคโนโลยีสารสนเทศ และ ERP'],
  )
  reporterId = Number(reporterResult.insertId)

  const [relatedResult] = await pool.query(
    `INSERT INTO secretary_users (username, password, name, department, role, active)
     VALUES (?, ?, ?, ?, 'reporter', 1)`,
    [relatedUsername, passwordHash, 'Related Department Test User', 'ฝ่ายผลิต'],
  )
  relatedId = Number(relatedResult.insertId)

  const [superAdminResult] = await pool.query(
    `INSERT INTO secretary_users (username, password, name, department, role, active)
     VALUES (?, ?, ?, ?, 'super_admin', 1)`,
    [superAdminUsername, passwordHash, 'Hidden Super Admin Test User', 'แอดมิน'],
  )
  superAdminId = Number(superAdminResult.insertId)

  const auth = await request('/api/secretary/auth/login', {
    method: 'POST',
    body: { username: reporterUsername, password },
  })
  const relatedAuth = await request('/api/secretary/auth/login', {
    method: 'POST',
    body: { username: relatedUsername, password },
  })

  const options = await request('/api/secretary/user-options', { token: auth.token })
  if (options.some((option) => option.id === reporterId)) throw new Error('Current user is visible in related user options')
  if (options.some((option) => option.id === superAdminId)) throw new Error('Super Admin is visible in related user options')
  const relatedOption = options.find((option) => option.id === relatedId)
  if (!relatedOption || relatedOption.name !== 'Related Department Test User' || relatedOption.department !== 'ฝ่ายผลิต') {
    throw new Error('Related user option is missing or invalid')
  }
  if ('role' in relatedOption) throw new Error('Restricted user fields were exposed')

  const uploadBody = new FormData()
  uploadBody.append('files', new Blob(['Secretary issue report attachment test'], { type: 'text/plain' }), 'issue-report-test.txt')
  const uploadedFiles = await request('/api/upload', { method: 'POST', body: uploadBody })
  const uploadedFile = uploadedFiles?.[0]
  if (!uploadedFile?.url) throw new Error('Attachment upload failed')
  uploadedPath = uploadedFile.url

  const issue = await request('/api/secretary/issues', {
    method: 'POST',
    token: auth.token,
    expectedStatus: 201,
    body: {
      title: 'Secretary issue report integration test',
      category: 'ปัญหาด้านคุณภาพงาน',
      description: 'Temporary issue created by the automated integration test',
      impact_level: 'High',
      damage_value: '12345.67',
      related_user_ids: [relatedId],
      attachments: [uploadedFile],
      occurred_at: new Date().toISOString().slice(0, 10),
    },
  })
  issueId = Number(issue.id)

  if (Number(issue.damage_value) !== 12345.67) throw new Error('Damage value was not stored')
  if (issue.related_users?.[0]?.name !== 'Related Department Test User') throw new Error('Related user snapshot was not stored')
  if (issue.attachments?.[0]?.url !== uploadedFile.url || issue.attachments?.[0]?.source !== 'secretary_issue') {
    throw new Error('Issue attachment was not stored')
  }

  const issues = await request('/api/secretary/issues', { token: auth.token })
  const savedIssue = issues.find((item) => Number(item.id) === issueId)
  if (!savedIssue || Number(savedIssue.damage_value) !== 12345.67 || savedIssue.related_users?.length !== 1 || savedIssue.attachments?.length !== 1) {
    throw new Error('Saved issue cannot be read back with all new fields')
  }

  const relatedIssues = await request('/api/secretary/issues?mine=1', { token: relatedAuth.token })
  if (!relatedIssues.some((item) => Number(item.id) === issueId)) {
    throw new Error('Related user cannot see the issue in tracking')
  }
  await request(`/api/secretary/issues/${issueId}/history`, { token: relatedAuth.token })
  await request(`/api/secretary/issues/${issueId}/status`, {
    method: 'PATCH',
    token: relatedAuth.token,
    expectedStatus: 400,
    body: { status: 'Pending', note: '' },
  })
  await request(`/api/secretary/issues/${issueId}/status`, {
    method: 'PATCH',
    token: auth.token,
    expectedStatus: 400,
    body: { status: 'In_Progress', note: 'Missing expected completion date' },
  })
  const expectedCompletionDate = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10)
  const ownerUpdate = await request(`/api/secretary/issues/${issueId}/status`, {
    method: 'PATCH',
    token: auth.token,
    body: {
      status: 'In_Progress',
      note: 'Owner moved issue to in progress',
      expected_completion_date: expectedCompletionDate,
    },
  })
  if (ownerUpdate.status !== 'In_Progress') throw new Error('Owner cannot move issue to In_Progress')

  await request(`/api/secretary/issues/${issueId}/status`, {
    method: 'PATCH',
    token: relatedAuth.token,
    expectedStatus: 403,
    body: { status: 'Completed', note: 'Related user must not change status' },
  })
  const relatedExpectedCompletionDate = new Date(Date.now() + (10 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10)
  const relatedUpdate = await request(`/api/secretary/issues/${issueId}/status`, {
    method: 'PATCH',
    token: relatedAuth.token,
    body: {
      status: 'In_Progress',
      note: 'Related user integration test contribution',
      expected_completion_date: relatedExpectedCompletionDate,
      attachments: [uploadedFile],
    },
  })
  if (relatedUpdate.status !== 'In_Progress' || relatedUpdate.expected_completion_date !== relatedExpectedCompletionDate) {
    throw new Error('Related user cannot save a contribution without changing status')
  }
  const progressHistory = await request(`/api/secretary/issues/${issueId}/history`, { token: relatedAuth.token })
  if (!progressHistory.some((item) => (
    item.from_status === 'In_Progress'
    && item.to_status === 'In_Progress'
    && item.expected_completion_date === relatedExpectedCompletionDate
    && item.note === 'Related user integration test contribution'
    && item.changed_by_department === 'ฝ่ายผลิต'
    && item.attachments?.[0]?.source === 'secretary_status'
  ))) {
    throw new Error('Related contribution was not saved in status history')
  }

  await request(`/api/secretary/issues/${issueId}/status`, {
    method: 'PATCH',
    token: auth.token,
    expectedStatus: 400,
    body: { status: 'Cancelled', note: '' },
  })
  const cancelledIssue = await request(`/api/secretary/issues/${issueId}/status`, {
    method: 'PATCH',
    token: auth.token,
    body: { status: 'Cancelled', note: 'Cancelled by the integration test' },
  })
  if (cancelledIssue.status !== 'Cancelled' || cancelledIssue.resolution_note !== 'Cancelled by the integration test') {
    throw new Error('Issue cancellation was not saved')
  }

  await request('/api/secretary/issues', {
    method: 'POST',
    token: auth.token,
    expectedStatus: 400,
    body: {
      title: 'Invalid numeric value test',
      category: 'ปัญหาด้านการผลิต',
      description: 'This request must be rejected',
      damage_value: 'not-a-number',
      related_user_ids: [relatedId],
    },
  })

  console.log('Secretary issue report integration test passed')
} finally {
  try {
    if (issueId) {
      await pool.query('DELETE FROM secretary_issue_status_history WHERE issue_id = ?', [issueId])
      await pool.query('DELETE FROM secretary_issues WHERE id = ?', [issueId])
    }
    if (reporterId || relatedId || superAdminId) {
      await pool.query(
        'DELETE FROM secretary_users WHERE id IN (?, ?, ?)',
        [reporterId || 0, relatedId || 0, superAdminId || 0],
      )
    }
    if (uploadedPath) {
      const filename = path.basename(uploadedPath)
      const uploadDirectory = path.resolve('uploads')
      const target = path.resolve(uploadDirectory, filename)
      if (path.dirname(target) === uploadDirectory) await fs.unlink(target).catch(() => {})
    }
  } finally {
    await pool.end()
  }
}
