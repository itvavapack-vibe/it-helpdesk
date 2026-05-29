import { runHandler } from '../../lib/cors.js'
import { getAdminFromRequest, getAdminProfile, updateAdminProfile } from '../../lib/auth.js'

export default async function handler(req, res) {
  if (!['GET', 'PUT'].includes(req.method)) {
    return runHandler(req, res, async () => ({
      status: 405,
      body: { error: 'Method not allowed' },
    }))
  }

  return runHandler(req, res, async () => {
    const admin = getAdminFromRequest(req)
    if (!admin) {
      return {
        status: 401,
        body: { error: 'Authentication required' },
      }
    }

    return {
      body: {
        data: req.method === 'GET'
          ? await getAdminProfile(admin.id)
          : await updateAdminProfile(admin.id, req.body || {}),
      },
    }
  })
}
