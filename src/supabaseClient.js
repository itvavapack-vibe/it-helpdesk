function resolveApiUrl() {
  const configured = import.meta.env.VITE_API_URL?.trim()
  const pageHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
  const lanApi = `${typeof window !== 'undefined' ? window.location.protocol : 'http:'}//${pageHost}:4000`

  if (configured) {
    const isLocalhostConfig = /localhost|127\.0\.0\.1/i.test(configured)
    const onRemoteLanHost = pageHost !== 'localhost' && pageHost !== '127.0.0.1'
    if (isLocalhostConfig && onRemoteLanHost) return lanApi.replace(/\/+$/, '')
    return configured.replace(/\/+$/, '')
  }

  return lanApi.replace(/\/+$/, '')
}

const API_URL = resolveApiUrl()

function serializeFilters(filters) {
  const params = new URLSearchParams()
  filters.forEach(({ op, column, value }) => {
    if (op === 'eq') params.append(`eq[${column}]`, String(value))
    if (op === 'in') params.append(`in[${column}]`, value.map(String).join(','))
    if (op === 'is') params.append(`is[${column}]`, value === null ? 'null' : String(value))
    if (op === 'not') params.append(`not[${column}]`, String(value))
  })
  return params.toString()
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
  })

  url.search = params.toString()
  return url.toString()
}

async function request(url, init) {
  const response = await fetch(url, init)
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    return { data: null, error: payload?.error || response.statusText }
  }
  return { data: payload?.data ?? null, error: payload?.error ?? null, count: payload?.count ?? null }
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
  }

  const execute = async () => {
    let url = buildUrl(table, state)
    const init = { headers: { 'Content-Type': 'application/json' } }

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

function createChannel(name) {
  return {
    on(_event, _options, _callback) {
      return {
        subscribe: async () => {
          console.warn(`Realtime channel ${name} is not supported in MySQL proxy mode.`)
          return { id: name }
        },
      }
    },
  }
}

export const supabase = {
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
