import { mysql } from '../mysqlClient'
import { ASSET_STATUS, buildGlpiAssetStatusChanges, createAssetStatusEvent } from './assetStatus'

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

  const { data: seedRows, error: seedError } = await mysql
    .from('asset_status_history')
    .select('event_key')
    .limit(5000)
  if (seedError) throw new Error(seedError)
  const seedKeys = new Set((seedRows || []).map((row) => row.event_key).filter((key) => String(key).startsWith('seed-new-')))
  const correctedSeedEvents = activeComputers
    .filter((computer) => seedKeys.has(`seed-new-${Number(computer.id ?? computer.glpi_id)}`))
    .map((computer) => ({
      ...createAssetStatusEvent({
        asset: { ...computer, glpi_id: Number(computer.id ?? computer.glpi_id) },
        status: ASSET_STATUS.NEW,
        eventDate: computer.date_creation,
        now: new Date(),
      }),
      event_key: `seed-new-${Number(computer.id ?? computer.glpi_id)}`,
    }))

  const historyRows = [...correctedSeedEvents, ...statusEvents]
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
    statusEvents: statusEvents.length,
    newEvents: statusEvents.filter((event) => event.status === ASSET_STATUS.NEW).length,
    transferEvents: 0,
    disposedEvents: statusEvents.filter((event) => event.status === ASSET_STATUS.DISPOSED).length,
  }
}
