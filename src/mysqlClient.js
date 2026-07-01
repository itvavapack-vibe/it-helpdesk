function resolveApiUrl() {
  const configured = import.meta.env.VITE_API_URL?.trim()
  const pageHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
  const sameOriginApi = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'

  if (configured) {
    const isLocalhostConfig = /localhost|127\.0\.0\.1/i.test(configured)
    const onRemoteLanHost = pageHost !== 'localhost' && pageHost !== '127.0.0.1'
    if (isLocalhostConfig && onRemoteLanHost) {
      try {
        const apiUrl = new URL(configured)
        apiUrl.hostname = pageHost
        return apiUrl.toString().replace(/\/+$/, '')
      } catch {
        return sameOriginApi.replace(/:\d+$/, ':4000').replace(/\/+$/, '')
      }
    }
    return configured.replace(/\/+$/, '')
  }

  return sameOriginApi.replace(/\/+$/, '')
}

export const API_URL = resolveApiUrl()

function getStoredAdminToken() {
  if (typeof window === 'undefined') return null
  try {
    const auth = JSON.parse(localStorage.getItem('it-helpdesk-admin-auth') || 'null')
    return auth?.token || null
  } catch {
    return null
  }
}

function authHeaders(headers = {}) {
  const token = getStoredAdminToken()
  return token ? { ...headers, Authorization: `Bearer ${token}` } : headers
}

function buildUrl(table, state, endpoint = '') {
  const base = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL
  const url = new URL(`${base}/api/${table}${endpoint}`, window.location.origin)
  const params = new URLSearchParams()

  if (state.select) params.set('select', state.select)
  if (state.orderBy) params.set('orderBy', state.orderBy)
  if (state.order) params.set('order', state.order)
  if (state.limit != null) params.set('limit', String(state.limit))
  if (state.head) params.set('head', 'true')
  if (state.count) params.set('count', state.count)

  state.filters.forEach(({ op, column, value }) => {
    if (op === 'eq') params.append(`eq[${column}]`, String(value))
    if (op === 'in') params.append(`in[${column}]`, value.map(String).join(','))
    if (op === 'is') params.append(`is[${column}]`, value === null ? 'null' : String(value))
    if (op === 'not') params.append(`not[${column}]`, String(value))
    if (op === 'gte') params.append(`gte[${column}]`, String(value))
    if (op === 'lte') params.append(`lte[${column}]`, String(value))
    if (op === 'gt') params.append(`gt[${column}]`, String(value))
    if (op === 'lt') params.append(`lt[${column}]`, String(value))
  })

  url.search = params.toString()
  return url.toString()
}

async function request(url, init) {
  const fetchJson = async (requestUrl) => {
    const response = await fetch(requestUrl, init)
    const payload = await response.json().catch(() => null)
    return { response, payload }
  }

  const getSameOriginFallbackUrl = () => {
    if (typeof window === 'undefined') return null
    try {
      const requestUrl = new URL(url)
      if (requestUrl.origin === window.location.origin) return null
      if (!requestUrl.pathname.startsWith('/api/')) return null
      return new URL(`${requestUrl.pathname}${requestUrl.search}`, window.location.origin).toString()
    } catch {
      return null
    }
  }

  let response
  let payload
  try {
    const result = await fetchJson(url)
    response = result.response
    payload = result.payload
  } catch (error) {
    const fallbackUrl = getSameOriginFallbackUrl()
    if (fallbackUrl) {
      try {
        const result = await fetchJson(fallbackUrl)
        response = result.response
        payload = result.payload
      } catch {
        return {
          data: null,
          error: `ไม่สามารถเชื่อมต่อ API ได้ (${new URL(url).origin} หรือ ${new URL(fallbackUrl).origin})`,
          code: error?.name || 'FETCH_ERROR',
          status: 0,
        }
      }
    } else {
      return {
        data: null,
        error: `ไม่สามารถเชื่อมต่อ API ได้ (${new URL(url).origin})`,
        code: error?.name || 'FETCH_ERROR',
        status: 0,
      }
    }
  }
  if (!response.ok) {
    return {
      data: null,
      error: payload?.error || response.statusText,
      code: payload?.code || null,
      changeToken: payload?.changeToken || null,
      attemptsRemaining: payload?.attemptsRemaining ?? null,
      policyErrors: payload?.policyErrors || null,
      status: response.status,
    }
  }
  return {
    data: payload?.data ?? null,
    error: payload?.error ?? null,
    count: payload?.count ?? null,
    status: response.status,
  }
}

async function fetchInsertedRows(table, state, insertedResult) {
  const insertedId = insertedResult?.insertedId
  const affectedRows = insertedResult?.affectedRows || 1
  const firstRow = state.body?.rows?.[0] || {}

  const returningState = {
    ...state,
    action: 'select',
    filters: [],
    limit: affectedRows,
    head: false,
    count: null,
    body: null,
  }

  if (insertedId) {
    returningState.filters = [
      { op: 'gte', column: 'id', value: insertedId },
      { op: 'lt', column: 'id', value: Number(insertedId) + Number(affectedRows) },
    ]
  } else if (firstRow.id != null) {
    returningState.filters = [{ op: 'eq', column: 'id', value: firstRow.id }]
  } else {
    return { data: null, error: 'Inserted rows cannot be selected without an id', count: null }
  }

  return request(buildUrl(table, returningState), {
    method: 'GET',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
  })
}

function createBuilder(table) {
  const state = {
    action: 'select',
    select: '*',
    filters: [],
    orderBy: null,
    order: null,
    limit: null,
    head: false,
    count: null,
    body: null,
    single: false,
    returning: false,
  }

  const execute = async () => {
    let url = buildUrl(table, state)
    const init = { headers: authHeaders({ 'Content-Type': 'application/json' }) }

    if (state.action === 'insert') {
      init.method = 'POST'
      init.body = JSON.stringify({ rows: state.body.rows })
    } else if (state.action === 'upsert') {
      init.method = 'POST'
      url = buildUrl(table, state, '/upsert')
      init.body = JSON.stringify({ rows: state.body.rows, upsert: state.body.upsert })
    } else if (state.action === 'update') {
      init.method = 'PUT'
      init.body = JSON.stringify({ data: state.body.data })
    } else if (state.action === 'delete') {
      init.method = 'DELETE'
    } else {
      init.method = 'GET'
    }

    const result = await request(url, init)
    if (state.action === 'insert' && state.returning && !result.error) {
      return fetchInsertedRows(table, state, result.data)
    }

    if (!state.single || state.action !== 'select') {
      return result
    }

    const rows = Array.isArray(result.data) ? result.data : []
    if (result.error) {
      return result
    }
    if (rows.length !== 1) {
      return {
        data: null,
        error: 'JSON object requested, multiple (or no) rows returned',
        count: result.count ?? null,
      }
    }
    return { data: rows[0], error: null, count: result.count ?? null }
  }

  const builder = {
    select(columns = '*', options = {}) {
      state.select = Array.isArray(columns) ? columns.join(',') : columns
      if (options.count) state.count = options.count
      if (options.head) state.head = true
      if (state.action !== 'select') state.returning = true
      return builder
    },
    order(column, opts = {}) {
      state.orderBy = column
      state.order = opts.ascending === false ? 'DESC' : 'ASC'
      return builder
    },
    eq(column, value) {
      state.filters.push({ op: 'eq', column, value })
      return builder
    },
    in(column, values) {
      state.filters.push({ op: 'in', column, value: Array.isArray(values) ? values : [values] })
      return builder
    },
    is(column, value) {
      state.filters.push({ op: 'is', column, value })
      return builder
    },
    not(column, value) {
      state.filters.push({ op: 'not', column, value })
      return builder
    },
    gte(column, value) {
      state.filters.push({ op: 'gte', column, value })
      return builder
    },
    lte(column, value) {
      state.filters.push({ op: 'lte', column, value })
      return builder
    },
    gt(column, value) {
      state.filters.push({ op: 'gt', column, value })
      return builder
    },
    lt(column, value) {
      state.filters.push({ op: 'lt', column, value })
      return builder
    },
    limit(count) {
      state.limit = count
      return builder
    },
    single() {
      state.single = true
      state.limit = 1
      return builder
    },
    insert(rows) {
      state.action = 'insert'
      state.body = { rows }
      return builder
    },
    update(data) {
      state.action = 'update'
      state.body = { data }
      return builder
    },
    delete() {
      state.action = 'delete'
      return builder
    },
    upsert(rows, opts = {}) {
      state.action = 'upsert'
      state.body = { rows, upsert: opts }
      return builder
    },
    then(resolve, reject) {
      execute().then(resolve, reject)
    },
  }

  return builder
}

export async function loginAdmin(username, password) {
  const base = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL
  return request(new URL(`${base}/api/auth/login`, window.location.origin).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
}

export async function changeExpiredAdminPassword(changeToken, password) {
  const base = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL
  return request(new URL(`${base}/api/auth/change-password`, window.location.origin).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changeToken, password }),
  })
}

export async function unlockAdminAccount(adminId) {
  const base = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL
  return request(new URL(`${base}/api/auth/admins/${adminId}/unlock`, window.location.origin).toString(), {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
  })
}

export async function getAdminSecuritySettings() {
  const base = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL
  return request(new URL(`${base}/api/auth/security-settings`, window.location.origin).toString(), {
    method: 'GET',
    headers: authHeaders(),
  })
}

export async function updateAdminSecuritySettings(settings) {
  const base = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL
  return request(new URL(`${base}/api/auth/security-settings`, window.location.origin).toString(), {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(settings),
  })
}

export async function updateAdminProfile(profile) {
  const base = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL
  return request(new URL(`${base}/api/auth/profile`, window.location.origin).toString(), {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(profile),
  })
}

export async function getAdminProfile() {
  const base = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL
  return request(new URL(`${base}/api/auth/profile`, window.location.origin).toString(), {
    method: 'GET',
    headers: authHeaders(),
  })
}

function createChannel(name) {
  return {
    on(_event, _options, _callback) {
      return {
        subscribe: async () => {
          console.warn(`Realtime channel ${name} is not supported in MySQL API mode.`)
          return { id: name }
        },
      }
    },
  }
}

export const mysql = {
  from(table) {
    return createBuilder(table)
  },
  channel(name) {
    return createChannel(name)
  },
  removeChannel(_channel) {
    return null
  },
}
