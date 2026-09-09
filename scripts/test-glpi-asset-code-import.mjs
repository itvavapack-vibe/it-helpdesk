import assert from 'node:assert/strict'
import { validateAssetCodeImportRows } from '../lib/glpi-asset-code-import.js'

const computers = [
  { id: 415, name: 'PC-415', serial: 'SERIAL-415', otherserial: '' },
  { id: 416, name: 'PC-416', serial: 'SERIAL-416', otherserial: 'ASSET-0002' },
  { id: 417, name: 'PC-417', serial: 'SERIAL-417', otherserial: 'ASSET-0003' },
  { id: 418, name: 'PC-418', serial: 'DUPLICATE', otherserial: '' },
  { id: 419, name: 'PC-419', serial: 'duplicate', otherserial: '' },
]

const rows = validateAssetCodeImportRows([
  { rowNumber: 2, serialNo: 'serial-415', assetCode: 'ASSET-0001' },
  { rowNumber: 3, serialNo: 'SERIAL-416', assetCode: 'asset-0002' },
  { rowNumber: 4, serialNo: 'MISSING', assetCode: 'ASSET-0999' },
  { rowNumber: 5, serialNo: 'SERIAL-417', assetCode: 'ASSET-0002' },
  { rowNumber: 6, serialNo: 'SERIAL-415', assetCode: 'ASSET-0004' },
  { rowNumber: 7, serialNo: 'DUPLICATE', assetCode: 'ASSET-0005' },
], computers)

assert.equal(rows[0].status, 'ready')
assert.equal(rows[0].computerName, 'PC-415')
assert.equal(rows[1].status, 'unchanged')
assert.equal(rows[2].status, 'error')
assert.match(rows[2].message, /ไม่พบ Serial No. ใน GLPI/)
assert.equal(rows[3].status, 'error')
assert.match(rows[3].message, /GLPI ID 416/)
assert.equal(rows[4].status, 'error')
assert.match(rows[4].message, /Serial No. ซ้ำในไฟล์/)
assert.equal(rows[5].status, 'error')
assert.match(rows[5].message, /Serial No. ซ้ำหลายเครื่องใน GLPI/)

console.log('GLPI asset code CSV validation test passed')
