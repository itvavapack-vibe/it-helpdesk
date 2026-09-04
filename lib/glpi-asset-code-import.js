import { updateTable } from './handlers.js'
import { requestGlpiApi, withGlpiApiSession } from './glpi-proxy.js'

export const MAX_ASSET_CODE_IMPORT_ROWS = 500

const clean = (value) => String(value ?? '').trim()
const codeKey = (value) => clean(value).toLocaleLowerCase('en-US')

export function validateAssetCodeImportRows(inputRows, computers) {
  const rows = Array.isArray(inputRows) ? inputRows : []
  if (rows.length === 0) throw Object.assign(new Error('CSV file does not contain any rows'), { status: 400 })
  if (rows.length > MAX_ASSET_CODE_IMPORT_ROWS) {
    throw Object.assign(new Error(`CSV file supports up to ${MAX_ASSET_CODE_IMPORT_ROWS} rows per import`), { status: 400 })
  }

  const computersBySerial = new Map()
  ;(computers || []).forEach((computer) => {
    const key = codeKey(computer.serial)
    if (!key) return
    computersBySerial.set(key, [...(computersBySerial.get(key) || []), computer])
  })
  const ownersByCode = new Map()
  ;(computers || []).forEach((computer) => {
    const key = codeKey(computer.otherserial)
    if (key && !ownersByCode.has(key)) ownersByCode.set(key, Number(computer.id))
  })

  const fileSerials = new Set()
  const fileCodes = new Set()
  return rows.map((source, index) => {
    const rowNumber = Number(source?.rowNumber) || index + 2
    const serialNo = clean(source?.serialNo)
    const assetCode = clean(source?.assetCode)
    const errors = []

    if (!serialNo) errors.push('ไม่พบ Serial No.')
    if (!assetCode) errors.push('ไม่พบรหัสทรัพย์สิน')
    if (assetCode.length > 255) errors.push('รหัสทรัพย์สินยาวเกิน 255 ตัวอักษร')
    if (serialNo && fileSerials.has(codeKey(serialNo))) errors.push('Serial No. ซ้ำในไฟล์')
    if (assetCode && fileCodes.has(codeKey(assetCode))) errors.push('รหัสทรัพย์สินซ้ำในไฟล์')
    if (serialNo) fileSerials.add(codeKey(serialNo))
    if (assetCode) fileCodes.add(codeKey(assetCode))

    const matches = computersBySerial.get(codeKey(serialNo)) || []
    if (serialNo && matches.length === 0) errors.push('ไม่พบ Serial No. ใน GLPI')
    if (serialNo && matches.length > 1) errors.push('พบ Serial No. ซ้ำหลายเครื่องใน GLPI')
    const computer = matches.length === 1 ? matches[0] : null
    const glpiId = Number(computer?.id)
    const ownerId = ownersByCode.get(codeKey(assetCode))
    if (ownerId && ownerId !== glpiId) errors.push(`รหัสทรัพย์สินถูกใช้โดย GLPI ID ${ownerId}`)

    const currentAssetCode = clean(computer?.otherserial)
    const unchanged = Boolean(computer && assetCode && codeKey(currentAssetCode) === codeKey(assetCode))
    return {
      rowNumber,
      serialNo,
      glpiId: Number.isInteger(glpiId) ? glpiId : '',
      computerName: clean(computer?.name),
      currentAssetCode,
      assetCode,
      status: errors.length ? 'error' : unchanged ? 'unchanged' : 'ready',
      message: errors.join(', '),
    }
  })
}

const summarize = (rows) => rows.reduce((summary, row) => {
  summary.total += 1
  summary[row.status] = (summary[row.status] || 0) + 1
  return summary
}, { total: 0, ready: 0, unchanged: 0, error: 0, success: 0 })

export async function importGlpiAssetCodes(inputRows, { dryRun = true, actor = null } = {}) {
  return withGlpiApiSession(async (sessionToken) => {
    const computerRows = await requestGlpiApi('Computer?range=0-9999&expand_dropdowns=true&is_deleted=false', { sessionToken })
    const validatedRows = validateAssetCodeImportRows(inputRows, Array.isArray(computerRows) ? computerRows : [])
    if (dryRun) return { rows: validatedRows, summary: summarize(validatedRows), dryRun: true }

    const results = []
    for (const row of validatedRows) {
      if (row.status !== 'ready') {
        results.push(row)
        continue
      }
      try {
        await requestGlpiApi(`Computer/${row.glpiId}`, {
          method: 'PUT',
          sessionToken,
          body: { input: { id: row.glpiId, otherserial: row.assetCode } },
        })
        await updateTable('assets', { otherserial: row.assetCode }, { eq: { glpi_id: row.glpiId } })
        await updateTable('asset_status_history', { asset_code: row.assetCode }, { eq: { asset_glpi_id: row.glpiId } })
        results.push({ ...row, status: 'success', message: 'อัปเดตสำเร็จ' })
      } catch (error) {
        results.push({ ...row, status: 'error', message: error.message || 'อัปเดต GLPI ไม่สำเร็จ' })
      }
    }

    console.info('GLPI asset code CSV import', {
      adminId: actor?.id,
      username: actor?.username,
      summary: summarize(results),
    })
    return { rows: results, summary: summarize(results), dryRun: false }
  })
}
