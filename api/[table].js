import { runHandler } from '../lib/cors.js'
import {
  deleteTable,
  getTable,
  insertTable,
  updateTable,
} from '../lib/handlers.js'

export default async function handler(req, res) {
  const { table } = req.query
  const query = { ...req.query }
  delete query.table

  return runHandler(req, res, async () => {
    switch (req.method) {
      case 'GET':
        return { body: await getTable(table, query) }
      case 'POST':
        return { body: { data: await insertTable(table, req.body?.rows) } }
      case 'PUT':
        return { body: { data: await updateTable(table, req.body?.data, query) } }
      case 'DELETE':
        return { body: { data: await deleteTable(table, query) } }
      default:
        return { status: 405, body: { error: 'Method not allowed' } }
    }
  })
}
