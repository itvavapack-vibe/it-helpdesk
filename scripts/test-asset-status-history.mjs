import assert from 'node:assert/strict'
import dotenv from 'dotenv'
import { getPool } from '../lib/db.js'
import { deleteTable, getTable, upsertTable } from '../lib/handlers.js'
import { ASSET_STATUS, buildAssetStatusChanges, buildGlpiAssetStatusChanges, hasAssetAssignmentChanged } from '../src/utils/assetStatus.js'
import { buildTransferEventsFromGlpiLogs, cleanGlpiLogValue } from '../src/utils/glpiAssetLogs.js'

dotenv.config()

const suffix = Number(String(Date.now()).slice(-6))
const firstId = -(1_000_000 + suffix)
const secondId = firstId - 1
const newId = firstId - 2
const testIds = [firstId, secondId, newId]
const now = new Date('2099-05-10T08:30:00')

const existingAssets = [
  { glpi_id: firstId, name: 'Transfer Test', users_id: 'Old User', locations_id: 'VAVA 1 > Old', groups_id: 'Hardware', states_id: 'Active' },
  { glpi_id: secondId, name: 'Disposed Test', users_id: 'Disposed User', locations_id: 'VAVA 2 > Old', groups_id: 'Support', states_id: 'Active' },
]
const activeComputers = [
  { id: firstId, name: 'Transfer Test', users_id: 'New User', locations_id: 'VAVA 3 > New', groups_id: 'Infrastructure', states_id: 'Active', date_mod: '2099-05-09 12:00:00' },
  { id: newId, name: 'New Test', users_id: 'New Asset User', locations_id: 'VAVA 1 > New', groups_id: 'Support', states_id: 'Active', date_creation: '2099-05-08 09:00:00' },
]

try {
  assert.equal(hasAssetAssignmentChanged(existingAssets[0], activeComputers[0]), true)
  assert.equal(hasAssetAssignmentChanged(existingAssets[0], { ...existingAssets[0] }), false)
  assert.equal(hasAssetAssignmentChanged(existingAssets[0], { ...existingAssets[0], users_id: 'Changed User' }), false)
  assert.equal(hasAssetAssignmentChanged({ ...existingAssets[0], locations_id: '', groups_id: '' }, activeComputers[0]), false)

  assert.equal(cleanGlpiLogValue('&nbsp; (0)'), '')
  assert.equal(cleanGlpiLogValue('VAVA 1 &gt; Office (42)'), 'VAVA 1 > Office')
  const logEvents = buildTransferEventsFromGlpiLogs(activeComputers[0], [
    { id: 901, id_search_option: 3, old_value: 'VAVA 1 > Old (1)', new_value: 'VAVA 3 > New (3)', date_mod: '2099-05-09 10:00:00' },
    { id: 902, id_search_option: 71, old_value: 'Hardware (4)', new_value: 'Infrastructure (5)', date_mod: '2099-05-09 11:00:00' },
    { id: 903, id_search_option: 4, old_value: 'Old User', new_value: 'New User', date_mod: '2099-05-09 12:00:00' },
    { id: 904, id_search_option: 3, old_value: '&nbsp; (0)', new_value: 'VAVA 1 > Office (2)', date_mod: '2099-05-09 09:00:00' },
  ])
  assert.equal(logEvents.length, 2)
  assert.equal(logEvents[0].previous_location_name, 'VAVA 1 > Old')
  assert.equal(logEvents[0].location_name, 'VAVA 3 > New')
  assert.equal(logEvents[1].previous_group_name, 'Hardware')
  assert.equal(logEvents[1].group_name, 'Infrastructure')

  const { events, staleAssets } = buildAssetStatusChanges(activeComputers, existingAssets, now)
  assert.equal(events.length, 3)
  assert.equal(staleAssets.length, 1)
  assert.deepEqual(new Set(events.map((event) => event.status)), new Set([
    ASSET_STATUS.NEW,
    ASSET_STATUS.TRANSFERRED,
    ASSET_STATUS.DISPOSED,
  ]))
  assert.equal(new Set(events.map((event) => event.event_key)).size, 3)

  const glpiChanges = buildGlpiAssetStatusChanges([
    activeComputers[0],
    { ...activeComputers[1], states_id: 0 },
    { id: secondId, name: 'Disposed Test', states_id: 'Deactive', users_id: 'Disposed User', locations_id: 'VAVA 2 > Old', date_mod: '2099-05-07 10:00:00' },
  ], existingAssets, now)
  assert.equal(glpiChanges.activeComputers.length, 1)
  assert.equal(glpiChanges.staleAssets.length, 1)
  assert.deepEqual(new Set(glpiChanges.events.map((event) => event.status)), new Set([
    ASSET_STATUS.NEW,
    ASSET_STATUS.TRANSFERRED,
    ASSET_STATUS.DISPOSED,
  ]))

  await upsertTable('asset_status_history', events, { onConflict: 'event_key' })
  await upsertTable('asset_status_history', events, { onConflict: 'event_key' })

  const result = await getTable('asset_status_history', {
    select: 'id,event_key,asset_glpi_id,status,previous_user_name,user_name,previous_location_name,location_name,event_date',
    in: { asset_glpi_id: testIds },
  })
  assert.equal(result.data.length, 3)
  const transfer = result.data.find((event) => event.status === ASSET_STATUS.TRANSFERRED)
  assert.equal(transfer?.previous_user_name, 'Old User')
  assert.equal(transfer?.user_name, 'New User')
  assert.equal(transfer?.previous_location_name, 'VAVA 1 > Old')
  assert.equal(transfer?.location_name, 'VAVA 3 > New')

  console.log('Asset GLPI status history integration test passed')
} finally {
  try {
    await deleteTable('asset_status_history', { in: { asset_glpi_id: testIds } })
  } finally {
    await getPool().end()
  }
}
