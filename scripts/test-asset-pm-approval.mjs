import assert from 'node:assert/strict'
import dotenv from 'dotenv'
import { getPool } from '../lib/db.js'
import { deleteTable, getTable, insertTable, updateTable } from '../lib/handlers.js'
import { getAllAssetBranches, getAssetBranchKey, isAssetReportBranch } from '../src/utils/assetBranch.js'

dotenv.config()

const suffix = Date.now()
const records = [
  { id: suffix, asset_name: 'PM Test VAVA 1', location_name: 'VAVA 1 > Test', pm_date: '2099-01-10', overall_status: 'Pass' },
  { id: suffix + 1, asset_name: 'PM Test VAVA 2', location_name: 'VAVA 2 > Test', pm_date: '2099-01-11', overall_status: 'Pass' },
  { id: suffix + 2, asset_name: 'PM Test VAVA 3', location_name: 'VAVA 3 > Test', pm_date: '2099-01-12', overall_status: 'Fail' },
  { id: suffix + 3, asset_name: 'PM Test Other', location_name: 'VAVA 4 > Test', pm_date: '2099-01-13', overall_status: 'Pass' },
]
const reportRecords = records.filter((record) => isAssetReportBranch(getAssetBranchKey(record.location_name)))
const branchSummary = getAllAssetBranches().map(({ key }) => ({
  key,
  count: reportRecords.filter((record) => getAssetBranchKey(record.location_name) === key).length,
}))
let batchId = null

try {
  assert.deepEqual(records.map((record) => getAssetBranchKey(record.location_name)), ['VAVA1', 'VAVA2', 'VAVA3', 'OTHER'])

  const insertResult = await insertTable('asset_pm_report_batches', [{
    report_year: 2099,
    records_json: JSON.stringify(reportRecords),
    record_count: reportRecords.length,
    branch_summary_json: JSON.stringify(branchSummary),
    inspector_name: `PM Integration Test ${suffix}`,
    inspector_position: 'IT Test',
    inspector_signature: 'data:image/png;base64,cG0tdGVzdA==',
    status: 'Pending_IT_Manager',
  }])
  batchId = insertResult.insertedId

  const pendingResult = await getTable('asset_pm_report_batches', {
    select: 'id,report_year,records_json,record_count,branch_summary_json,inspector_signature,status',
    eq: { id: batchId, status: 'Pending_IT_Manager' },
    limit: 1,
  })
  const pendingBatch = pendingResult.data?.[0]
  assert.equal(Number(pendingBatch?.record_count), reportRecords.length)
  assert.equal(JSON.parse(pendingBatch?.records_json || '[]').length, reportRecords.length)
  assert.deepEqual(JSON.parse(pendingBatch?.branch_summary_json || '[]').map((branch) => branch.count), [1, 1, 1])
  assert.ok(pendingBatch?.inspector_signature)

  const managerDate = new Date()
  await updateTable('asset_pm_report_batches', {
    status: 'Approved',
    manager_name: 'PM Test Manager',
    manager_position: 'IT Manager',
    manager_signature: 'data:image/png;base64,bWFuYWdlci10ZXN0',
    manager_date: managerDate,
  }, { eq: { id: batchId } })

  const approvedResult = await getTable('asset_pm_report_batches', {
    select: 'id,status,manager_name,manager_signature,manager_date',
    eq: { id: batchId },
    limit: 1,
  })
  const approvedBatch = approvedResult.data?.[0]
  assert.equal(approvedBatch?.status, 'Approved')
  assert.equal(approvedBatch?.manager_name, 'PM Test Manager')
  assert.ok(approvedBatch?.manager_signature)
  assert.ok(approvedBatch?.manager_date)

  console.log('Asset PM branch report and manager approval integration test passed')
} finally {
  try {
    if (batchId) await deleteTable('asset_pm_report_batches', { eq: { id: batchId } })
  } finally {
    await getPool().end()
  }
}
