import { API_URL } from '../mysqlClient'
import { SECRETARY_AUTH_STORAGE_KEY } from './secretaryConstants'

const getToken = () => {
  try {
    return JSON.parse(localStorage.getItem(SECRETARY_AUTH_STORAGE_KEY) || 'null')?.token || null
  } catch {
    return null
  }
}

const secretaryRequest = async (path, options = {}) => {
  const base = API_URL.replace(/\/+$/, '')
  const token = getToken()
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  }

  let response
  try {
    response = await fetch(new URL(`${base}/api/secretary${path}`, window.location.origin), {
      ...options,
      headers,
    })
  } catch {
    throw new Error('ไม่สามารถเชื่อมต่อระบบ Secretary ได้')
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(payload?.error || 'เกิดข้อผิดพลาดในการทำรายการ')
    error.status = response.status
    error.code = payload?.code
    throw error
  }
  return payload?.data
}

export const secretaryLogin = (credentials) => secretaryRequest('/auth/login', {
  method: 'POST',
  body: JSON.stringify(credentials),
})

export const secretaryGetMe = () => secretaryRequest('/auth/me')

export const secretaryListIssues = (filters = {}) => {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value != null && value !== '') params.set(key, String(value))
  })
  return secretaryRequest(`/issues${params.size ? `?${params}` : ''}`)
}

export const secretaryCreateIssue = (data) => secretaryRequest('/issues', {
  method: 'POST',
  body: JSON.stringify(data),
})

export const secretaryGetIssueHistory = (issueId) => secretaryRequest(`/issues/${issueId}/history`)

export const secretaryUpdateIssueStatus = (issueId, data) => secretaryRequest(`/issues/${issueId}/status`, {
  method: 'PATCH',
  body: JSON.stringify(data),
})

export const secretaryGetDashboard = (days = '') => secretaryRequest(`/dashboard${days ? `?days=${days}` : ''}`)

export const secretaryListUserOptions = () => secretaryRequest('/user-options')

export const secretaryListUsers = () => secretaryRequest('/users')

export const secretaryCreateUser = (data) => secretaryRequest('/users', {
  method: 'POST',
  body: JSON.stringify(data),
})

export const secretaryUpdateUser = (userId, data) => secretaryRequest(`/users/${userId}`, {
  method: 'PUT',
  body: JSON.stringify(data),
})

export const secretaryDeleteUser = (userId) => secretaryRequest(`/users/${userId}`, { method: 'DELETE' })

export const secretaryImportUsers = (rows) => secretaryRequest('/users/import', {
  method: 'POST',
  body: JSON.stringify({ rows }),
})
