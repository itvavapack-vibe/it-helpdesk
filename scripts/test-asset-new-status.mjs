import assert from 'node:assert/strict'
import { buildGlpiAssetStatusChanges, getMonthlyNewAssetCounts, isGlpiNewAsset, isNewAssetHistory } from '../src/utils/assetStatus.js'

for (const state of ['New', 'new', ' NEW ']) {
  assert.equal(isGlpiNewAsset({ states_id: state }), true)
}
for (const state of [undefined, null, '', 0, '0', 'Active', 'Deactive']) {
  assert.equal(isGlpiNewAsset({ states_id: state }), false)
  assert.equal(isNewAssetHistory({ status: 'New', source_state: state }), false)
}
assert.equal(isNewAssetHistory({ status: 'New', source_state: 'New' }), true)
assert.equal(isNewAssetHistory({ status: 'Disposed', source_state: 'New' }), false)

const computers = ['Active', 'New', '', 0, 'Deactive'].map((states_id, index) => ({
  id: index + 1, states_id, computermodels_id: 'Same model', date_creation: '2026-09-01 09:00:00',
}))
const changes = buildGlpiAssetStatusChanges(computers, [])
assert.deepEqual(changes.events.filter(isNewAssetHistory).map((event) => event.asset_glpi_id), [2])
assert.deepEqual(changes.activeComputers.map((asset) => asset.id), [1])
assert.deepEqual(changes.events.filter((event) => event.status === 'Disposed').map((event) => event.asset_glpi_id), [5])
console.log('New asset status regression checks passed')

const newEvent = (id, date, state = 'New') => ({ asset_glpi_id: id, event_date: date, status: 'New', source_state: state })
assert.deepEqual(getMonthlyNewAssetCounts([
  newEvent(1, '2026-01-01'), newEvent('1', '2026-01-15'),
  newEvent(2, '2026-02-28'), newEvent(3, '2026-12-31'),
  newEvent(4, '2025-01-01'), newEvent(5, 'invalid'),
  newEvent(6, '2026-01-01', 'Active'), newEvent(7, '2026-01-01', ''),
], '2026'), [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])
assert.deepEqual(getMonthlyNewAssetCounts([], '2026'), Array(12).fill(0))
console.log('Monthly new asset count checks passed')
