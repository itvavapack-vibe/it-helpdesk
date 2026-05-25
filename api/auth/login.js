import { runHandler } from '../../lib/cors.js'
import { loginAdmin } from '../../lib/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return runHandler(req, res, async () => ({
      status: 405,
      body: { error: 'Method not allowed' },
    }))
  }

  return runHandler(req, res, async () => ({
    body: {
      data: await loginAdmin(req.body || {}),
    },
  }))
}
