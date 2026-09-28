import { getPool } from './db.js'
import { requestGlpiApi, withGlpiApiSession } from './glpi-proxy.js'
import {
  ASSET_STATUS,
  buildGlpiAssetStatusChanges,
  reuseExistingNewEventKeys,
} from '../src/utils/assetStatus.js'
import { buildTransferEventsFromGlpiLogs } from '../src/utils/glpiAssetLogs.js'

const SYNC_KEY = 'glpi_computer_assets'
const DEFAULT_INTERVAL_MINUTES = 120
const UPSERT_CHUNK_SIZE = 100
const TRANSFER_LOG_CONCURRENCY = 4
const ASSET_FIELDS = [
  'name',
  'serial',
  'otherserial',
  'users_id',
  'locations_id',
  'groups_id',
  'computermodels_id',
  'computertypes_id',
  'states_id',
  'autoupdatesystems_id',
]

let activeSyncPromise = null

const intervalMinutes = () => {
  const value = Number(process.env.GLPI_ASSET_SYNC_INTERVAL_MINUTES || DEFAULT_INTERVAL_MINUTES)
  return Number.isFinite(value) && value >= 5 ? Math.floor(value) : DEFAULT_INTERVAL_MINUTES
}

const toRows = (value) => Array.isArray(value) ? value : Object.values(value || {})

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

const sameValue = (left, right) => String(left ?? '').trim() === String(right ?? '').trim()
const hasAssetChanged = (previous, next) => ASSET_FIELDS.some((field) => !sameValue(previous?.[field], next?.[field]))

const uniqueByEventKey = (events) => {
  const map = new Map()
  for (const event of events || []) {
    if (event?.event_key) map.set(event.event_key, event)
  }
  return [...map.values()]
}

const matchesSnapshotTransfer = (event, snapshot) => (
  (
    !sameValue(snapshot.previous_location_name, snapshot.location_name)
    && sameValue(event.previous_location_name, snapshot.previous_location_name)
    && sameValue(event.location_name, snapshot.location_name)
  )
  || (
    !sameValue(snapshot.previous_group_name, snapshot.group_name)
    && sameValue(event.previous_group_name, snapshot.previous_group_name)
    && sameValue(event.group_name, snapshot.group_name)
  )
)

async function upsertRows(table, rows, conflictColumn) {
  if (!rows.length) return 0
  const pool = getPool()
  let affectedRows = 0

  for (let index = 0; index < rows.length; index += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + UPSERT_CHUNK_SIZE)
    const keys = Object.keys(chunk[0])
    const placeholders = `(${keys.map(() => '?').join(',')})`
    const values = chunk.flatMap((row) => keys.map((key) => row[key]))
    const updateClause = keys
      .filter((key) => key !== conflictColumn)
      .map((key) => `\`${key}\` = VALUES(\`${key}\`)`)
      .join(', ')
    const [result] = await pool.query(
      `INSERT INTO \`${table}\` (${keys.map((key) => `\`${key}\``).join(',')}) VALUES ${chunk.map(() => placeholders).join(',')} ON DUPLICATE KEY UPDATE ${updateClause}`,
      values,
    )
    affectedRows += result.affectedRows
  }

  return affectedRows
}

async function deleteAssets(ids) {
  if (!ids.length) return
  const pool = getPool()
  for (let index = 0; index < ids.length; index += UPSERT_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + UPSERT_CHUNK_SIZE)
    await pool.query(`DELETE FROM assets WHERE glpi_id IN (${chunk.map(() => '?').join(',')})`, chunk)
  }
}

export async function ensureGlpiAssetSyncStatusTable() {
  const pool = getPool()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_sync_status (
      sync_key VARCHAR(64) PRIMARY KEY,
      status VARCHAR(20) NOT NULL DEFAULT 'Idle',
      trigger_source VARCHAR(80) NULL,
      started_at DATETIME NULL,
      completed_at DATETIME NULL,
      next_run_at DATETIME NULL,
      total_items INT NOT NULL DEFAULT 0,
      added_items INT NOT NULL DEFAULT 0,
      updated_items INT NOT NULL DEFAULT 0,
      removed_items INT NOT NULL DEFAULT 0,
      history_events INT NOT NULL DEFAULT 0,
      error_message TEXT NULL,
      details_json LONGTEXT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)
}

async function recordSyncStarted(triggerSource) {
  const pool = getPool()
  await ensureGlpiAssetSyncStatusTable()
  await pool.query(`
    INSERT INTO system_sync_status (sync_key, status, trigger_source, started_at, error_message)
    VALUES (?, 'Running', ?, NOW(), NULL)
    ON DUPLICATE KEY UPDATE
      status = 'Running',
      trigger_source = VALUES(trigger_source),
      started_at = NOW(),
      error_message = NULL
  `, [SYNC_KEY, triggerSource])
}

async function recordSyncSuccess(result) {
  const pool = getPool()
  await pool.query(`
    UPDATE system_sync_status
    SET
      status = 'Success',
      completed_at = NOW(),
      next_run_at = DATE_ADD(NOW(), INTERVAL ? MINUTE),
      total_items = ?,
      added_items = ?,
      updated_items = ?,
      removed_items = ?,
      history_events = ?,
      error_message = NULL,
      details_json = ?
    WHERE sync_key = ?
  `, [
    intervalMinutes(),
    result.total,
    result.added,
    result.updated,
    result.removed,
    result.historyEvents,
    JSON.stringify(result),
    SYNC_KEY,
  ])
}

async function recordSyncFailure(error) {
  const pool = getPool()
  await ensureGlpiAssetSyncStatusTable()
  await pool.query(`
    INSERT INTO system_sync_status (sync_key, status, completed_at, next_run_at, error_message)
    VALUES (?, 'Failed', NOW(), DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)
    ON DUPLICATE KEY UPDATE
      status = 'Failed',
      completed_at = NOW(),
      next_run_at = DATE_ADD(NOW(), INTERVAL ? MINUTE),
      error_message = VALUES(error_message)
  `, [SYNC_KEY, intervalMinutes(), error.message || String(error), intervalMinutes()])
}

async function fetchGlpiComputers(sessionToken) {
  const [computerResult, lastBootResult] = await Promise.all([
    requestGlpiApi('Computer?range=0-999&expand_dropdowns=true&is_deleted=false', { sessionToken }),
    requestGlpiApi('search/Computer?range=0-999&forcedisplay[0]=2&forcedisplay[1]=5182', { sessionToken }),
  ])
  const lastBootById = new Map(
    toRows(lastBootResult?.data).map((row) => [Number(row?.['2']), row?.['5182'] || null]),
  )
  return toRows(computerResult).map((computer) => ({
    ...computer,
    last_boot: lastBootById.get(Number(computer.id)) || null,
  }))
}

async function resolveTransferEvents(sessionToken, computers, snapshotEvents) {
  if (!snapshotEvents.length) return { events: [], errors: 0 }
  const computerById = new Map(computers.map((computer) => [Number(computer.id), computer]))
  const resolved = []
  let errors = 0

  for (let index = 0; index < snapshotEvents.length; index += TRANSFER_LOG_CONCURRENCY) {
    const chunk = snapshotEvents.slice(index, index + TRANSFER_LOG_CONCURRENCY)
    const results = await Promise.allSettled(chunk.map(async (snapshot) => {
      const computer = computerById.get(Number(snapshot.asset_glpi_id))
      if (!computer) return [snapshot]
      const logs = toRows(await requestGlpiApi(
        `Computer/${computer.id}/Log?range=0-999`,
        { sessionToken },
      ))
      const matches = buildTransferEventsFromGlpiLogs(computer, logs)
        .filter((event) => matchesSnapshotTransfer(event, snapshot))
      return matches.length ? matches : [snapshot]
    }))

    results.forEach((result, resultIndex) => {
      if (result.status === 'fulfilled') resolved.push(...result.value)
      else {
        errors += 1
        resolved.push(chunk[resultIndex])
      }
    })
  }

  return { events: uniqueByEventKey(resolved), errors }
}

async function performGlpiAssetSync(triggerSource) {
  const startedAt = Date.now()
  await recordSyncStarted(triggerSource)

  try {
    const result = await withGlpiApiSession(async (sessionToken) => {
      const computers = await fetchGlpiComputers(sessionToken)
      const pool = getPool()
      const [existingAssets] = await pool.query('SELECT * FROM assets')
      const { activeComputers, events, staleAssets } = buildGlpiAssetStatusChanges(
        computers,
        existingAssets,
      )
      const currentAssets = activeComputers.map(toAssetRow)
      const existingById = new Map(existingAssets.map((asset) => [Number(asset.glpi_id), asset]))
      const added = currentAssets.filter((asset) => !existingById.has(asset.glpi_id)).length
      const updated = currentAssets.filter((asset) => {
        const previous = existingById.get(asset.glpi_id)
        return previous && hasAssetChanged(previous, asset)
      }).length

      const snapshotTransferEvents = events.filter((event) => event.status === ASSET_STATUS.TRANSFERRED)
      const transferResult = await resolveTransferEvents(
        sessionToken,
        computers,
        snapshotTransferEvents,
      )
      const baseEvents = [
        ...events.filter((event) => event.status !== ASSET_STATUS.TRANSFERRED),
        ...transferResult.events,
      ]
      const [existingNewRows] = await pool.query(
        'SELECT event_key, asset_glpi_id FROM asset_status_history WHERE status = ?',
        [ASSET_STATUS.NEW],
      )
      const historyRows = uniqueByEventKey(reuseExistingNewEventKeys(baseEvents, existingNewRows))

      await upsertRows('asset_status_history', historyRows, 'event_key')
      await upsertRows('assets', currentAssets, 'glpi_id')
      await deleteAssets(staleAssets.map((asset) => asset.glpi_id))

      return {
        total: currentAssets.length,
        glpiTotal: computers.length,
        added,
        updated,
        unchanged: currentAssets.length - added - updated,
        removed: staleAssets.length,
        historyEvents: historyRows.length,
        transferEvents: transferResult.events.length,
        transferLogErrors: transferResult.errors,
        durationMs: Date.now() - startedAt,
        triggerSource,
      }
    })

    await recordSyncSuccess(result)
    console.log(`GLPI asset sync complete: ${result.total} active, +${result.added}, ~${result.updated}, -${result.removed}`)
    return result
  } catch (error) {
    await recordSyncFailure(error)
    console.error('GLPI asset sync failed:', error.message)
    throw error
  }
}

export function runGlpiAssetSync({ triggerSource = 'manual' } = {}) {
  if (activeSyncPromise) return activeSyncPromise
  activeSyncPromise = performGlpiAssetSync(triggerSource)
    .finally(() => {
      activeSyncPromise = null
    })
  return activeSyncPromise
}

export async function getGlpiAssetSyncStatus() {
  await ensureGlpiAssetSyncStatusTable()
  const pool = getPool()
  const [rows] = await pool.query('SELECT * FROM system_sync_status WHERE sync_key = ? LIMIT 1', [SYNC_KEY])
  const row = rows[0] || null
  if (!row) return null
  let details = null
  try {
    details = row.details_json ? JSON.parse(row.details_json) : null
  } catch {
    details = null
  }
  return { ...row, details, interval_minutes: intervalMinutes() }
}

export function startGlpiAssetSyncJob() {
  const runScheduled = () => runGlpiAssetSync({ triggerSource: 'scheduled' }).catch(() => {})
  const initialTimer = setTimeout(runScheduled, 5000)
  const timer = setInterval(runScheduled, intervalMinutes() * 60 * 1000)
  initialTimer.unref?.()
  timer.unref?.()
  return { initialTimer, timer }
}
