import { runHandler } from '../lib/cors.js'
import {
  deleteTable,
  getTable,
  insertTable,
  updateTable,
} from '../lib/handlers.js'
import { getAdminFromRequest } from '../lib/auth.js'

function requireAdminsAccess(req, action) {
  const admin = getAdminFromRequest(req)
  if (!admin) {
    const error = new Error('Authentication required')
    error.status = 401
    throw error
  }
  if (action === 'delete' && admin.role !== 'superadmin') {
    const error = new Error('Only Super Admin can delete users')
    error.status = 403
    throw error
  }
  if (!['superadmin', 'it'].includes(admin.role)) {
    const error = new Error('Permission denied')
    error.status = 403
    throw error
  }
  return admin
}

export default async function handler(req, res) {
  const { table } = req.query
  const query = { ...req.query }
  delete query.table

  return runHandler(req, res, async () => {
    switch (req.method) {
      case 'GET':
        if (table === 'admins') requireAdminsAccess(req, 'read')
        return { body: await getTable(table, query) }
      case 'POST':
        if (table === 'admins') requireAdminsAccess(req, 'write')
        return { body: { data: await insertTable(table, req.body?.rows) } }
      case 'PUT':
        if (table === 'admins') requireAdminsAccess(req, 'write')
        return { body: { data: await updateTable(table, req.body?.data, query) } }
      case 'DELETE':
        if (table === 'admins') requireAdminsAccess(req, 'delete')
        return { body: { data: await deleteTable(table, query) } }
      default:
        return { status: 405, body: { error: 'Method not allowed' } }
    }
  })
}
