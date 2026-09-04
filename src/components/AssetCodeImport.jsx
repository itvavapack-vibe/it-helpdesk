import React, { useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, LoaderCircle, RotateCcw, Upload, XCircle } from 'lucide-react'
import * as XLSX from 'xlsx'
import Swal from 'sweetalert2'
import { importGlpiAssetCodes } from '../mysqlClient'

const MAX_FILE_SIZE = 2 * 1024 * 1024
const MAX_ROWS = 500

const normalizeHeader = (value) => String(value || '')
  .replace(/^\uFEFF/, '')
  .trim()
  .toLowerCase()
  .replace(/[\s_-]+/g, '')

const SERIAL_HEADERS = new Set(['serialno', 'serialnumber', 'serial', 'หมายเลขเครื่อง', 'ซีเรียล'])
const ASSET_CODE_HEADERS = new Set(['assetcode', 'otherserial', 'inventorynumber', 'รหัสทรัพย์สิน', 'รหัสทรัพสิน'])

const readValue = (row, acceptedHeaders) => {
  const entry = Object.entries(row).find(([header]) => acceptedHeaders.has(normalizeHeader(header)))
  return entry?.[1] ?? ''
}

const parseCsv = async (file) => {
  if (!file?.name?.toLowerCase().endsWith('.csv')) throw new Error('รองรับเฉพาะไฟล์ .csv')
  if (file.size > MAX_FILE_SIZE) throw new Error('ไฟล์ต้องมีขนาดไม่เกิน 2 MB')
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', codepage: 65001 })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const sourceRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })
  if (!sourceRows.length) throw new Error('ไม่พบข้อมูลในไฟล์ CSV')
  if (sourceRows.length > MAX_ROWS) throw new Error(`นำเข้าได้สูงสุด ${MAX_ROWS} รายการต่อครั้ง`)
  const headers = Object.keys(sourceRows[0]).map(normalizeHeader)
  if (!headers.some((header) => SERIAL_HEADERS.has(header)) || !headers.some((header) => ASSET_CODE_HEADERS.has(header))) {
    throw new Error('หัวตารางต้องมี serial_no และ asset_code')
  }
  return sourceRows.map((row, index) => ({
    rowNumber: index + 2,
    serialNo: readValue(row, SERIAL_HEADERS),
    assetCode: readValue(row, ASSET_CODE_HEADERS),
  }))
}

const downloadTemplate = () => {
  const blob = new Blob(['\uFEFFserial_no,asset_code\r\n3SC12H4,ASSET-0001\r\n'], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'glpi_asset_code_template.csv'
  link.click()
  URL.revokeObjectURL(url)
}

const STATUS_META = {
  ready: { label: 'พร้อมนำเข้า', className: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200', icon: CheckCircle2 },
  unchanged: { label: 'ข้อมูลตรงกัน', className: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300', icon: CheckCircle2 },
  success: { label: 'สำเร็จ', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200', icon: CheckCircle2 },
  error: { label: 'ตรวจสอบข้อมูล', className: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200', icon: XCircle },
}

export default function AssetCodeImport() {
  const inputRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const [sourceRows, setSourceRows] = useState([])
  const [result, setResult] = useState(null)
  const [isChecking, setIsChecking] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  const rows = result?.rows || []
  const summary = result?.summary || { total: 0, ready: 0, unchanged: 0, error: 0, success: 0 }
  const canImport = useMemo(() => summary.ready > 0 && !isChecking && !isImporting, [summary, isChecking, isImporting])

  const reset = () => {
    setFileName('')
    setSourceRows([])
    setResult(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const checkRows = async (nextRows) => {
    setIsChecking(true)
    const response = await importGlpiAssetCodes(nextRows, true)
    setIsChecking(false)
    if (response.error) {
      await Swal.fire('ตรวจสอบไม่สำเร็จ', response.error, 'error')
      return
    }
    setResult(response.data)
  }

  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const nextRows = await parseCsv(file)
      setFileName(file.name)
      setSourceRows(nextRows)
      setResult(null)
      await checkRows(nextRows)
    } catch (error) {
      reset()
      await Swal.fire('ไฟล์ไม่ถูกต้อง', error.message, 'warning')
    }
  }

  const handleImport = async () => {
    const confirmation = await Swal.fire({
      title: 'ยืนยันการนำเข้า',
      text: `อัปเดตรหัสทรัพย์สินใน GLPI จำนวน ${summary.ready} เครื่อง`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'นำเข้าข้อมูล',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#0284c7',
    })
    if (!confirmation.isConfirmed) return
    setIsImporting(true)
    const response = await importGlpiAssetCodes(sourceRows, false)
    setIsImporting(false)
    if (response.error) {
      await Swal.fire('นำเข้าไม่สำเร็จ', response.error, 'error')
      return
    }
    setResult(response.data)
    const imported = response.data?.summary?.success || 0
    await Swal.fire('นำเข้าเรียบร้อย', `อัปเดต GLPI สำเร็จ ${imported} เครื่อง`, imported ? 'success' : 'info')
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-sky-600 dark:text-sky-300">Computer Management</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">นำเข้ารหัสทรัพย์สินเข้า GLPI</h2>
        </div>
        <button type="button" onClick={downloadTemplate} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
          <Download className="h-4 w-4" /> ดาวน์โหลด CSV Template
        </button>
      </header>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <h3 className="font-bold text-slate-900 dark:text-white">ไฟล์ข้อมูล</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">คอลัมน์ที่ต้องมี: serial_no และ asset_code</p>
        </div>
        <div className="p-5">
          <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-sky-200 bg-sky-50/60 px-5 text-center transition-colors hover:border-sky-400 hover:bg-sky-50 dark:border-sky-900 dark:bg-sky-950/20 dark:hover:border-sky-700">
            {isChecking ? <LoaderCircle className="h-9 w-9 animate-spin text-sky-600" /> : <Upload className="h-9 w-9 text-sky-600 dark:text-sky-300" />}
            <div>
              <div className="font-bold text-slate-800 dark:text-slate-100">{fileName || 'เลือกไฟล์ CSV'}</div>
              <div className="mt-1 text-xs text-slate-500">สูงสุด 500 รายการ ขนาดไม่เกิน 2 MB</div>
            </div>
            <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} disabled={isChecking || isImporting} />
          </label>
        </div>
      </section>

      {result && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['ทั้งหมด', summary.total, 'text-slate-800 dark:text-white'],
              [result.dryRun ? 'พร้อมนำเข้า' : 'นำเข้าสำเร็จ', result.dryRun ? summary.ready : summary.success, 'text-emerald-600 dark:text-emerald-300'],
              ['ข้อมูลตรงกัน', summary.unchanged, 'text-slate-500 dark:text-slate-300'],
              ['ต้องตรวจสอบ', summary.error, 'text-rose-600 dark:text-rose-300'],
            ].map(([label, value, color]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</div>
                <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
              </div>
            ))}
          </section>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white"><FileSpreadsheet className="h-5 w-5 text-sky-600" /> ผลการตรวจสอบ</div>
              <div className="flex gap-2">
                <button type="button" onClick={reset} disabled={isImporting} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"><RotateCcw className="h-4 w-4" /> เริ่มใหม่</button>
                {result.dryRun && <button type="button" onClick={handleImport} disabled={!canImport} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-bold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">{isImporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} นำเข้า GLPI</button>}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead><tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400"><th className="p-3">แถว</th><th className="p-3">Serial No.</th><th className="p-3">GLPI ID</th><th className="p-3">เครื่องคอมพิวเตอร์</th><th className="p-3">รหัสเดิม</th><th className="p-3">รหัสใหม่</th><th className="p-3">ผลตรวจสอบ</th></tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {rows.map((row) => {
                    const meta = STATUS_META[row.status] || STATUS_META.error
                    const Icon = meta.icon
                    return <tr key={`${row.rowNumber}-${row.serialNo}`} className="align-top hover:bg-slate-50/70 dark:hover:bg-slate-900/30"><td className="p-3 text-slate-500">{row.rowNumber}</td><td className="p-3 font-mono font-bold text-slate-800 dark:text-slate-100">{row.serialNo || '-'}</td><td className="p-3 font-mono text-slate-500">{row.glpiId || '-'}</td><td className="p-3 font-semibold text-slate-700 dark:text-slate-200">{row.computerName || '-'}</td><td className="p-3 font-mono text-slate-500">{row.currentAssetCode || '-'}</td><td className="p-3 font-mono font-bold text-sky-700 dark:text-sky-300">{row.assetCode || '-'}</td><td className="p-3"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${meta.className}`}><Icon className="h-3.5 w-3.5" />{meta.label}</span>{row.message && <div className="mt-1.5 flex max-w-72 gap-1.5 text-xs text-rose-600 dark:text-rose-300"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{row.message}</div>}</td></tr>
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
