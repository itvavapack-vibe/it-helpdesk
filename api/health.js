import { runHandler } from '../lib/cors.js'
import { healthCheck } from '../lib/handlers.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return runHandler(req, res, async () => ({
      status: 405,
      body: { error: 'Method not allowed' },
    }))
  }

  return runHandler(req, res, async () => {
    const result = await healthCheck()
    return { body: result }
  })
}
