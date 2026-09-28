import { API_URL } from '@/mysqlClient'
import { FACILITIES_AUTH_STORAGE_KEY } from './facilitiesConstants'

const getToken = () => {
  try {
    return JSON.parse(localStorage.getItem(FACILITIES_AUTH_STORAGE_KEY) || 'null')?.token || null
  } catch {
    return null
  }
}

const request = async (path, options = {}) => {
  const token = getToken()
  let response
  try {
    response = await fetch(new URL(`${API_URL.replace(/\/+$/, '')}/api/facilities${path}`, window.location.origin), {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    })
  } catch {
    throw new Error('ไม่สามารถเชื่อมต่อระบบแจ้งซ่อมธุรการได้')
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

export const facilitiesGetDashboard = () => request('/dashboard')

export const facilitiesLogin = (credentials) => request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) })
export const facilitiesGetMe = () => request('/auth/me')

export const facilitiesListRequests = (filters = {}) => {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value != null && value !== '') params.set(key, String(value))
  })
  return request(`/requests${params.size ? `?${params}` : ''}`)
}

export const facilitiesCreatePublicRequest = (data) => request('/public/requests', {
  method: 'POST',
  body: JSON.stringify(data),
})

export const facilitiesTrackPublicRequest = ({ requestNumber, reporterName }) => {
  const params = new URLSearchParams({
    request_number: String(requestNumber || '').trim(),
    reporter_name: String(reporterName || '').trim(),
  })
  return request(`/public/requests/track?${params}`)
}

export const facilitiesGetHistory = (requestId) => request(`/requests/${requestId}/history`)

export const facilitiesUpdateStatus = (requestId, data) => request(`/requests/${requestId}/status`, {
  method: 'PATCH',
  body: JSON.stringify(data),
})

export const facilitiesListUsers = () => request('/users')
export const facilitiesCreateUser = (data) => request('/users', { method: 'POST', body: JSON.stringify(data) })
export const facilitiesUpdateUser = (userId, data) => request(`/users/${userId}`, { method: 'PUT', body: JSON.stringify(data) })
export const facilitiesDeleteUser = (userId) => request(`/users/${userId}`, { method: 'DELETE' })
