export const CENTER_PATH = '/homepage'
export const IT_HELPDESK_BASE_PATH = '/it-helpdesk'
export const SECRETARY_PATH = '/secretary'

const normalizePath = (path = '/') => {
  const normalized = `/${String(path).replace(/^\/+|\/+$/g, '')}`
  return normalized === '/' ? '/' : normalized
}

export const toItHelpdeskPath = (path = '/') => {
  const normalized = normalizePath(path)
  return normalized === '/'
    ? IT_HELPDESK_BASE_PATH
    : `${IT_HELPDESK_BASE_PATH}${normalized}`
}

export const stripItHelpdeskBase = (pathname = '/') => {
  const normalized = normalizePath(pathname)
  const lowerPath = normalized.toLowerCase()
  const lowerBase = IT_HELPDESK_BASE_PATH.toLowerCase()

  if (lowerPath === lowerBase) return '/'
  if (lowerPath.startsWith(`${lowerBase}/`)) {
    return normalized.slice(IT_HELPDESK_BASE_PATH.length) || '/'
  }
  return normalized
}

export const isCenterPath = (pathname = '/', search = '') => {
  const normalized = normalizePath(pathname).toLowerCase()
  return normalized === CENTER_PATH || (normalized === '/' && !search)
}

export const isSecretaryPath = (pathname = '/') => {
  const normalized = normalizePath(pathname).toLowerCase()
  return normalized === SECRETARY_PATH || normalized.startsWith(`${SECRETARY_PATH}/`)
}
