import { mysql } from '../mysqlClient'
import { ASSET_STATUS, buildGlpiAssetStatusChanges, reuseExistingNewEventKeys } from './assetStatus'

const toAssetRow = (computer) => ({
  glpi_id: Number(computer.id ?? computer.glpi_id),
  name: computer.name || '',
  serial: computer.serial || null,
  otherserial: computer.otherserial || null,
  users_id: computer.users_id || null,
  locations_id: computer.locations_id || null,
  groups_id: computer.groups_id || null,
  computermodels_id: computer.computermodels_id || null,
  computertypes_id: computer.computertypes_id || null,
  states_id: computer.states_id || null,
  autoupdatesystems_id: computer.autoupdatesystems_id || null,
})

const deleteInChunks = async (table, column, ids) => {
  const chunkSize = 80
  for (let index = 0; index < ids.length; index += chunkSize) {
    const { error } = await mysql.from(table).delete().in(column, ids.slice(index, index + chunkSize))
    if (error) throw new Error(typeof error === 'string' ? error : error.message || String(error))
  }
}

export const syncGlpiAssetsToMysql = async (glpiComputers) => {
  const { data: existingAssets, error: existingError } = await mysql.from('assets').select('*')
  if (existingError) throw new Error(existingError)

  const { activeComputers, events, staleAssets } = buildGlpiAssetStatusChanges(glpiComputers, existingAssets || [])
  const statusEvents = events.filter((event) => event.status !== ASSET_STATUS.TRANSFERRED)
  const currentAssets = activeComputers.map(toAssetRow)
  const existingIds = new Set((existingAssets || []).map((asset) => Number(asset.glpi_id)))

  const { data: existingNewRows, error: existingNewError } = await mysql
    .from('asset_status_history')
    .select('event_key,asset_glpi_id')
    .eq('status', ASSET_STATUS.NEW)
    .limit(5000)
  if (existingNewError) throw new Error(existingNewError)
  const normalizedStatusEvents = reuseExistingNewEventKeys(statusEvents, existingNewRows || [])
  const historyRows = normalizedStatusEvents
  if (historyRows.length > 0) {
    const { error: historyError } = await mysql
      .from('asset_status_history')
      .upsert(historyRows, { onConflict: 'event_key' })
    if (historyError) throw new Error(historyError)
  }

  if (currentAssets.length > 0) {
    const { error: assetError } = await mysql.from('assets').upsert(currentAssets, { onConflict: 'glpi_id' })
    if (assetError) throw new Error(assetError)
  }

  if (staleAssets.length > 0) {
    await deleteInChunks('assets', 'glpi_id', staleAssets.map((asset) => asset.glpi_id))
  }

  return {
    total: currentAssets.length,
    added: currentAssets.filter((asset) => !existingIds.has(asset.glpi_id)).length,
    updated: currentAssets.filter((asset) => existingIds.has(asset.glpi_id)).length,
    disposed: staleAssets.length,
    statusEvents: normalizedStatusEvents.length,
    newEvents: normalizedStatusEvents.filter((event) => event.status === ASSET_STATUS.NEW).length,
    transferEvents: 0,
    disposedEvents: normalizedStatusEvents.filter((event) => event.status === ASSET_STATUS.DISPOSED).length,
  }
}
