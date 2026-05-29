import { runHandler } from '../../lib/cors.js'
import { getAdminFromRequest } from '../../lib/auth.js'
import { upsertTable } from '../../lib/handlers.js'

function requireAdminsAccess(req) {
  const admin = getAdminFromRequest(req)
  if (!admin) {
    const error = new Error('Authentication required')
    error.status = 401
    throw error
  }
  if (!['superadmin', 'it_support'].includes(admin.role)) {
    const error = new Error('Permission denied')
    error.status = 403
    throw error
  }
}

export default async function handler(req, res) {
  const { table } = req.query

  if (req.method !== 'POST') {
    return runHandler(req, res, async () => ({
      status: 405,
      body: { error: 'Method not allowed' },
    }))
  }

  return runHandler(req, res, async () => {
    if (table === 'admins') requireAdminsAccess(req)
    return {
      body: {
        data: await upsertTable(table, req.body?.rows, req.body?.upsert),
      },
    }
  })
}
