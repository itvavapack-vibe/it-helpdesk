import { applyCors, handleOptions } from '../../lib/cors.js'
import { glpiBaseUrl, proxyGlpiRequest } from '../../lib/glpi-proxy.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyCors(res)

  const base = glpiBaseUrl()
  if (!base) {
    return res.status(500).json({ error: 'GLPI_URL is not configured' })
  }

  const segments = req.query.path
  const pathPart = Array.isArray(segments) ? segments.join('/') : segments || 'apirest.php'
  req.url = `/${pathPart}`
  return proxyGlpiRequest(req, res)
}
