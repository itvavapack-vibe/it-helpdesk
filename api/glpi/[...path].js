import { applyCors, handleOptions } from '../../lib/cors.js'

function glpiBaseUrl() {
  const raw = process.env.VITE_GLPI_URL || process.env.GLPI_URL || ''
  return raw.replace(/\/+$/, '')
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyCors(res)

  const base = glpiBaseUrl()
  if (!base) {
    return res.status(500).json({ error: 'GLPI_URL is not configured' })
  }

  const segments = req.query.path
  const pathPart = Array.isArray(segments) ? segments.join('/') : segments || 'apirest.php'
  const target = new URL(`${base}/${pathPart}`)
  const incoming = new URL(req.url || '/', 'http://localhost')
  incoming.searchParams.forEach((value, key) => {
    if (key !== 'path') target.searchParams.set(key, value)
  })

  const forwardHeaders = {}
  for (const name of ['app-token', 'authorization', 'session-token', 'content-type']) {
    const value = req.headers[name]
    if (value) forwardHeaders[name] = value
  }

  try {
    const upstream = await fetch(target.toString(), {
      method: req.method,
      headers: forwardHeaders,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
    })

    const contentType = upstream.headers.get('content-type') || 'application/json'
    res.setHeader('Content-Type', contentType)
    res.status(upstream.status)
    const buffer = await upstream.arrayBuffer()
    res.send(Buffer.from(buffer))
  } catch (error) {
    res.status(502).json({ error: `GLPI proxy failed: ${error.message}` })
  }
}
