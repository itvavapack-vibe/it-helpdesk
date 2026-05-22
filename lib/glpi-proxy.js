export function glpiBaseUrl() {
  const raw = process.env.VITE_GLPI_URL || process.env.GLPI_URL || ''
  return raw.replace(/\/+$/, '')
}

export async function proxyGlpiRequest(req, res) {
  const base = glpiBaseUrl()
  if (!base) {
    return res.status(500).json({ error: 'GLPI_URL is not configured' })
  }

  const pathPart = (req.url || '/apirest.php').replace(/^\//, '') || 'apirest.php'
  const target = new URL(`${base}/${pathPart}`)

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
