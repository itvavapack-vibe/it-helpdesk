import { toMysqlDateTime } from './dateTime.js'

export const ASSET_STATUS = Object.freeze({
  NEW: 'New',
  TRANSFERRED: 'Transferred',
  DISPOSED: 'Disposed',
})

export const ASSET_STATUS_LABELS = Object.freeze({
  [ASSET_STATUS.NEW]: 'เครื่องใหม่',
  [ASSET_STATUS.TRANSFERRED]: 'โอนย้าย',
  [ASSET_STATUS.DISPOSED]: 'ตัดจำหน่าย',
})

const normalizeValue = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()

export const isGlpiActiveAsset = (asset) => normalizeValue(asset?.states_id) === 'active'

export const isGlpiNewAsset = (asset) => {
  const state = normalizeValue(asset?.states_id)
  return !state || state === '0' || state === 'new'
}

export const getGlpiNewAssetDate = (asset) => asset?.last_boot || asset?.date_creation

export const hasAssetAssignmentChanged = (previousAsset, nextAsset) => (
  (
    Boolean(normalizeValue(previousAsset?.locations_id))
    && normalizeValue(previousAsset?.locations_id) !== normalizeValue(nextAsset?.locations_id)
  )
  || (
    Boolean(normalizeValue(previousAsset?.groups_id))
    && normalizeValue(previousAsset?.groups_id) !== normalizeValue(nextAsset?.groups_id)
  )
)

const hashEventParts = (parts) => {
  let hash = 2166136261
  for (const character of parts.join('|')) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export const createAssetStatusEventKey = ({ assetGlpiId, status, eventDate, parts = [] }) => {
  const compactDate = String(eventDate || '').replace(/\D/g, '').slice(0, 14) || 'unknown'
  return `asset-${assetGlpiId}-${String(status || '').slice(0, 1).toLowerCase()}-${compactDate}-${hashEventParts(parts)}`
}

const normalizeEventDate = (value, fallback) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2})?/.test(value)) {
    return value.slice(0, 19).replace('T', ' ')
  }
  return toMysqlDateTime(value || fallback) || toMysqlDateTime(fallback)
}

export const createAssetStatusEvent = ({ asset, previousAsset = null, status, eventDate, now }) => {
  const normalizedDate = normalizeEventDate(eventDate, now)
  const event = {
    asset_glpi_id: Number(asset.glpi_id ?? asset.id),
    asset_name: asset.name || '',
    asset_code: asset.otherserial || null,
    serial: asset.serial || null,
    status,
    event_date: normalizedDate,
    previous_user_name: previousAsset?.users_id || null,
    user_name: asset.users_id || null,
    previous_location_name: previousAsset?.locations_id || null,
    location_name: asset.locations_id || null,
    previous_group_name: previousAsset?.groups_id || null,
    group_name: asset.groups_id || null,
    source_type: asset.autoupdatesystems_id || previousAsset?.autoupdatesystems_id || null,
    source_state: asset.states_id || null,
  }
  event.event_key = createAssetStatusEventKey({
    assetGlpiId: event.asset_glpi_id,
    status,
    eventDate: normalizedDate,
    parts: [
      event.previous_user_name,
      event.user_name,
      event.previous_location_name,
      event.location_name,
      event.previous_group_name,
      event.group_name,
      event.source_state,
    ],
  })
  return event
}

export const reuseExistingNewEventKeys = (events, existingNewRows) => {
  const existingByAssetId = new Map()
  ;(existingNewRows || []).forEach((row) => {
    const assetId = Number(row.asset_glpi_id)
    if (!existingByAssetId.has(assetId)) existingByAssetId.set(assetId, row)
  })
  return (events || []).map((event) => {
    const existing = event.status === ASSET_STATUS.NEW
      ? existingByAssetId.get(Number(event.asset_glpi_id))
      : null
    return existing ? { ...event, event_key: existing.event_key } : event
  })
}

export const buildAssetStatusChanges = (activeComputers, existingAssets, now = new Date()) => {
  const existingById = new Map(existingAssets.map((asset) => [Number(asset.glpi_id), asset]))
  const currentIds = new Set(activeComputers.map((asset) => Number(asset.id ?? asset.glpi_id)))
  const events = []

  activeComputers.forEach((computer) => {
    const glpiId = Number(computer.id ?? computer.glpi_id)
    const previousAsset = existingById.get(glpiId)
    const asset = { ...computer, glpi_id: glpiId }
    if (!previousAsset) {
      events.push(createAssetStatusEvent({ asset, status: ASSET_STATUS.NEW, eventDate: getGlpiNewAssetDate(computer), now }))
    } else if (hasAssetAssignmentChanged(previousAsset, asset)) {
      events.push(createAssetStatusEvent({ asset, previousAsset, status: ASSET_STATUS.TRANSFERRED, eventDate: computer.date_mod, now }))
    }
  })

  const staleAssets = existingAssets.filter((asset) => !currentIds.has(Number(asset.glpi_id)))
  staleAssets.forEach((asset) => {
    events.push(createAssetStatusEvent({ asset, previousAsset: asset, status: ASSET_STATUS.DISPOSED, eventDate: now, now }))
  })

  return { events, staleAssets }
}

export const buildGlpiAssetStatusChanges = (glpiComputers, existingAssets, now = new Date()) => {
  const activeComputers = glpiComputers.filter(isGlpiActiveAsset)
  const allGlpiIds = new Set(glpiComputers.map((asset) => Number(asset.id ?? asset.glpi_id)))
  const activeIds = new Set(activeComputers.map((asset) => Number(asset.id ?? asset.glpi_id)))
  const existingById = new Map(existingAssets.map((asset) => [Number(asset.glpi_id), asset]))
  const { events: activeEvents } = buildAssetStatusChanges(activeComputers, existingAssets, now)
  const events = activeEvents.filter((event) => event.status !== ASSET_STATUS.DISPOSED)

  glpiComputers.filter((asset) => !isGlpiActiveAsset(asset)).forEach((computer) => {
    const glpiId = Number(computer.id ?? computer.glpi_id)
    const previousAsset = existingById.get(glpiId) || null
    const status = isGlpiNewAsset(computer) ? ASSET_STATUS.NEW : ASSET_STATUS.DISPOSED
    const eventDate = status === ASSET_STATUS.NEW ? getGlpiNewAssetDate(computer) : computer.date_mod
    events.push(createAssetStatusEvent({
      asset: { ...computer, glpi_id: glpiId },
      previousAsset,
      status,
      eventDate,
      now,
    }))
  })

  existingAssets
    .filter((asset) => !allGlpiIds.has(Number(asset.glpi_id)))
    .forEach((asset) => {
      events.push(createAssetStatusEvent({ asset, previousAsset: asset, status: ASSET_STATUS.DISPOSED, eventDate: now, now }))
    })

  return {
    activeComputers,
    events,
    staleAssets: existingAssets.filter((asset) => !activeIds.has(Number(asset.glpi_id))),
  }
}

export const getAssetStatusLabel = (status) => ASSET_STATUS_LABELS[status] || status || '-'
