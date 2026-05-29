export function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Session-Token')
}

export function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    applyCors(res)
    res.status(204).end()
    return true
  }
  return false
}

export function sendJson(res, status, body) {
  applyCors(res)
  res.status(status).json(body)
}

export async function runHandler(req, res, fn) {
  if (handleOptions(req, res)) return
  applyCors(res)
  try {
    const result = await fn()
    res.status(result.status ?? 200).json(result.body)
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
}
