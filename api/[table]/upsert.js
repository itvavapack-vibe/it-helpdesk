import { runHandler } from '../../lib/cors.js'
import { upsertTable } from '../../lib/handlers.js'

export default async function handler(req, res) {
  const { table } = req.query

  if (req.method !== 'POST') {
    return runHandler(req, res, async () => ({
      status: 405,
      body: { error: 'Method not allowed' },
    }))
  }

  return runHandler(req, res, async () => ({
    body: {
      data: await upsertTable(table, req.body?.rows, req.body?.upsert),
    },
  }))
}
