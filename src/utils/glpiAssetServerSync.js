import { API_URL } from '@/mysqlClient'

const authToken = () => {
  try {
    return JSON.parse(localStorage.getItem('it-helpdesk-admin-auth') || 'null')?.token || ''
  } catch {
    return ''
  }
}

const request = async (path, options = {}) => {
  const token = authToken()
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`)
  return payload?.data ?? null
}

export const getGlpiAssetSyncStatus = () => request('/api/glpi/asset-sync/status')

export const triggerGlpiAssetSync = () => request('/api/glpi/asset-sync', { method: 'POST' })
