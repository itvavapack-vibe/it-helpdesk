import dotenv from 'dotenv'
import { getPool } from '../lib/db.js'
import { deleteTable, getTable, upsertTable } from '../lib/handlers.js'
import { ASSET_STATUS, buildGlpiAssetStatusChanges } from '../src/utils/assetStatus.js'
import { buildTransferEventsFromGlpiLogs } from '../src/utils/glpiAssetLogs.js'

dotenv.config()

const baseUrl = String(
  process.env.ASSET_STATUS_GLPI_PROXY_URL
  || `http://127.0.0.1:${process.env.API_PORT || 4000}/glpi-proxy/apirest.php`,
).replace(/\/+$/, '')
const concurrency = 8
let sessionToken = ''

const glpiFetch = async (path) => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: sessionToken ? { 'Session-Token': sessionToken } : {},
  })
  if (!response.ok) throw new Error(`GLPI ${path} failed: ${response.status}`)
  return response.json()
}

try {
  sessionToken = (await glpiFetch('/initSession')).session_token
  const computers = await glpiFetch('/Computer?range=0-999&expand_dropdowns=true&is_deleted=false')
  const existingAssets = (await getTable('assets', { select: '*' })).data || []
  const { activeComputers, events: statusEvents, staleAssets } = buildGlpiAssetStatusChanges(computers, existingAssets)
  const events = []

  const baseStatusEvents = statusEvents.filter((event) => event.status !== ASSET_STATUS.TRANSFERRED)
  for (let index = 0; index < baseStatusEvents.length; index += 100) {
    await upsertTable('asset_status_history', baseStatusEvents.slice(index, index + 100), { onConflict: 'event_key' })
  }

  const activeRows = activeComputers.map((computer) => ({
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
  }))
  for (let index = 0; index < activeRows.length; index += 100) {
    await upsertTable('assets', activeRows.slice(index, index + 100), { onConflict: 'glpi_id' })
  }
  if (staleAssets.length) {
    await deleteTable('assets', { in: { glpi_id: staleAssets.map((asset) => asset.glpi_id) } })
  }

  for (let index = 0; index < computers.length; index += concurrency) {
    const chunk = computers.slice(index, index + concurrency)
    const chunkEvents = await Promise.all(chunk.map(async (computer) => {
      const logs = await glpiFetch(`/Computer/${computer.id}/Log?range=0-999`)
      return buildTransferEventsFromGlpiLogs(computer, Array.isArray(logs) ? logs : Object.values(logs || {}))
    }))
    events.push(...chunkEvents.flat())
    console.log(`Read GLPI history ${Math.min(index + concurrency, computers.length)}/${computers.length}`)
  }

  for (let index = 0; index < events.length; index += 100) {
    await upsertTable('asset_status_history', events.slice(index, index + 100), { onConflict: 'event_key' })
  }

  console.log(`GLPI assets synced: ${activeRows.length} active, ${events.length} transfer history events`)
} catch (error) {
  console.error('GLPI asset transfer history sync failed:', error.message)
  process.exitCode = 1
} finally {
  if (sessionToken) {
    await fetch(`${baseUrl}/killSession`, { headers: { 'Session-Token': sessionToken } }).catch(() => {})
  }
  await getPool().end()
}
