import http from 'node:http'
import https from 'node:https'

export function glpiBaseUrl() {
  const raw = process.env.VITE_GLPI_URL || process.env.GLPI_URL || ''
  return raw.replace(/\/+$/, '')
}

function glpiAuthConfig() {
  return {
    appToken: process.env.GLPI_APP_TOKEN,
    userToken: process.env.GLPI_USER_TOKEN,
  }
}

function isPrivateHost(hostname) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  )
}

function shouldRejectUnauthorized(target) {
  const configured = process.env.GLPI_TLS_REJECT_UNAUTHORIZED
  if (configured != null) return configured !== 'false' && configured !== '0'
  return !isPrivateHost(target.hostname)
}

function normalizeBody(req, headers) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined
  if (Buffer.isBuffer(req.body) || typeof req.body === 'string') return req.body
  if (req.body == null) return undefined

  if (!headers['content-type'] && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  return JSON.stringify(req.body)
}

function requestUpstream(target, req, headers) {
  return new Promise((resolve, reject) => {
    const transport = target.protocol === 'https:' ? https : http
    const body = normalizeBody(req, headers)
    const options = {
      method: req.method,
      headers,
    }

    if (target.protocol === 'https:') {
      options.rejectUnauthorized = shouldRejectUnauthorized(target)
    }

    const upstreamReq = transport.request(target, options, (upstreamRes) => {
      const chunks = []
      upstreamRes.on('data', (chunk) => chunks.push(chunk))
      upstreamRes.on('end', () => {
        resolve({
          statusCode: upstreamRes.statusCode || 500,
          headers: upstreamRes.headers,
          body: Buffer.concat(chunks),
        })
      })
    })

    upstreamReq.on('error', reject)
    if (body != null) upstreamReq.write(body)
    upstreamReq.end()
  })
}

export async function proxyGlpiRequest(req, res) {
  const base = glpiBaseUrl()
  if (!base) {
    return res.status(500).json({ error: 'GLPI_URL is not configured' })
  }

  const { appToken, userToken } = glpiAuthConfig()
  if (!appToken || !userToken) {
    return res.status(500).json({ error: 'GLPI tokens are not configured' })
  }

  const pathPart = (req.url || '/apirest.php').replace(/^\//, '') || 'apirest.php'
  const target = new URL(`${base}/${pathPart}`)

  const forwardHeaders = {}
  for (const name of ['session-token', 'content-type']) {
    const value = req.headers[name]
    if (value) forwardHeaders[name] = value
  }
  forwardHeaders['App-Token'] = appToken
  if (target.pathname.endsWith('/initSession')) {
    forwardHeaders.Authorization = `user_token ${userToken}`
  }

  try {
    const upstream = await requestUpstream(target, req, forwardHeaders)
    const contentType = upstream.headers['content-type'] || 'application/json'
    res.setHeader('Content-Type', contentType)
    res.status(upstream.statusCode)
    res.send(upstream.body)
  } catch (error) {
    res.status(502).json({ error: `GLPI proxy failed: ${error.message}` })
  }
}
