import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRightLeft,
  CalendarDays,
  Download,
  Eye,
  FileSpreadsheet,
  FileUp,
  Laptop,
  MonitorCheck,
  PackageX,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import Swal from 'sweetalert2'
import { getComputerLogs, getComputers, withGlpiSession } from '../glpiClient'
import { mysql } from '../mysqlClient'
import { syncGlpiAssetsToMysql } from '../utils/assetSync'
import { ASSET_STATUS, getAssetStatusLabel } from '../utils/assetStatus'
import { buildTransferEventsFromGlpiLogs } from '../utils/glpiAssetLogs'
import { MAX_ATTACHMENT_FILES, resolveAttachmentUrl, uploadAttachmentFiles } from '../utils/fileUpload'

const ACTIVE_STATUS = 'Active'

const formatDate = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '-'
    : date.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
}

const eventTime = (event) => new Date(event?.event_date || event?.updated_at || event?.created_at || 0).getTime() || 0

const parseAttachments = (value) => {
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const isRentalSource = (value) => {
  const source = String(value || '').trim().toLowerCase()
  return source.includes('rent') || source.includes('เช่า')
}

const displayAssetCode = (row) => isRentalSource(row?.source_type || row?.autoupdatesystems_id)
  ? 'เครื่องเช่า'
  : row?.asset_code || row?.otherserial || '-'

const STATUS_STYLES = {
  [ACTIVE_STATUS]: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200',
  [ASSET_STATUS.NEW]: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-200',
  [ASSET_STATUS.TRANSFERRED]: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/70 dark:bg-sky-950/40 dark:text-sky-200',
  [ASSET_STATUS.DISPOSED]: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/40 dark:text-rose-200',
}

const statusLabel = (status) => status === ACTIVE_STATUS ? 'ใช้งาน (Active)' : getAssetStatusLabel(status)

const latestPerAsset = (rows) => {
  const map = new Map()
  ;[...rows]
    .sort((left, right) => eventTime(right) - eventTime(left) || Number(right.id) - Number(left.id))
    .forEach((row) => {
      const key = String(row.asset_glpi_id)
      if (!map.has(key)) map.set(key, row)
    })
  return Array.from(map.values())
}

const AssetStatusManagement = () => {
  const [history, setHistory] = useState([])
  const [activeAssets, setActiveAssets] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [warning, setWarning] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()))
  const [monthFilter, setMonthFilter] = useState('All')
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [attachmentFiles, setAttachmentFiles] = useState([])
  const [isSavingAttachments, setIsSavingAttachments] = useState(false)
  const [isLoadingLogs, setIsLoadingLogs] = useState(false)

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setIsLoading(true)
    try {
      const [historyResult, assetsResult] = await Promise.all([
        mysql.from('asset_status_history').select('*').order('event_date', { ascending: false }).limit(5000),
        mysql.from('assets').select('*').eq('states_id', 'Active').order('name'),
      ])
      if (historyResult.error) throw new Error(historyResult.error)
      if (assetsResult.error) throw new Error(assetsResult.error)
      setHistory(historyResult.data || [])
      setActiveAssets(assetsResult.data || [])
      setWarning('')
    } catch (error) {
      console.error('Load computer asset data failed:', error)
      setWarning('ไม่สามารถโหลดข้อมูลทรัพย์สินคอมพิวเตอร์ได้')
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [])

  const syncFromGlpi = useCallback(async ({ showResult = true } = {}) => {
    if (isSyncing) return
    setIsSyncing(true)
    try {
      const { computers, transferEvents } = await withGlpiSession(async (sessionToken) => {
        const computerRows = await getComputers(sessionToken)
        const rows = Array.isArray(computerRows) ? computerRows : []
        const events = []
        const concurrency = 8
        for (let index = 0; index < rows.length; index += concurrency) {
          const chunk = rows.slice(index, index + concurrency)
          const chunkEvents = await Promise.all(chunk.map(async (computer) => {
            const logs = await getComputerLogs(sessionToken, computer.id, 1000)
            return buildTransferEventsFromGlpiLogs(computer, logs)
          }))
          events.push(...chunkEvents.flat())
        }
        return { computers: rows, transferEvents: events }
      })
      const result = await syncGlpiAssetsToMysql(computers)
      if (transferEvents.length) {
        const { error } = await mysql.from('asset_status_history').upsert(transferEvents, { onConflict: 'event_key' })
        if (error) throw new Error(error)
      }
      await loadData({ silent: true })
      setWarning('')
      if (showResult) {
        Swal.fire('Sync GLPI สำเร็จ', `Active ${result.total} เครื่อง · เครื่องใหม่ ${result.newEvents} · ประวัติโอนย้าย ${transferEvents.length} · ตัดจำหน่าย ${result.disposedEvents}`, 'success')
      }
    } catch (error) {
      console.error('Sync computer assets from GLPI failed:', error)
      setWarning('เชื่อมต่อ GLPI ไม่สำเร็จ กำลังแสดงข้อมูลจากการ Sync ครั้งล่าสุด')
      if (showResult) Swal.fire('Sync GLPI ไม่สำเร็จ', error.message || 'กรุณาลองใหม่อีกครั้ง', 'error')
    } finally {
      setIsSyncing(false)
    }
  }, [isSyncing, loadData])

  useEffect(() => {
    loadData()
  }, [loadData])

  const activeRows = useMemo(() => activeAssets.map((asset) => ({
    id: `active-${asset.glpi_id}`,
    asset_glpi_id: asset.glpi_id,
    asset_name: asset.name,
    asset_code: asset.otherserial,
    serial: asset.serial,
    user_name: asset.users_id,
    location_name: asset.locations_id,
    group_name: asset.groups_id,
    source_type: asset.autoupdatesystems_id,
    source_state: asset.states_id,
    event_date: asset.updated_at,
    status: ACTIVE_STATUS,
    is_active_row: true,
  })), [activeAssets])

  const yearOptions = useMemo(() => {
    const years = new Set([String(new Date().getFullYear())])
    history.forEach((event) => {
      const year = new Date(event.event_date).getFullYear()
      if (Number.isFinite(year)) years.add(String(year))
    })
    return Array.from(years).sort((left, right) => Number(right) - Number(left))
  }, [history])

  useEffect(() => {
    if (!yearOptions.includes(yearFilter)) setYearFilter(yearOptions[0])
  }, [yearFilter, yearOptions])

  const dateFilteredHistory = useMemo(() => history.filter((event) => {
    const date = new Date(event.event_date)
    if (Number.isNaN(date.getTime())) return false
    return String(date.getFullYear()) === yearFilter
      && (monthFilter === 'All' || String(date.getMonth() + 1).padStart(2, '0') === monthFilter)
  }), [history, monthFilter, yearFilter])

  const statusRows = useMemo(() => ({
    [ASSET_STATUS.NEW]: latestPerAsset(dateFilteredHistory.filter((event) => event.status === ASSET_STATUS.NEW)),
    [ASSET_STATUS.TRANSFERRED]: latestPerAsset(dateFilteredHistory.filter((event) => event.status === ASSET_STATUS.TRANSFERRED)),
    [ASSET_STATUS.DISPOSED]: latestPerAsset(dateFilteredHistory.filter((event) => event.status === ASSET_STATUS.DISPOSED)),
  }), [dateFilteredHistory])

  const filteredRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()
    const rows = statusFilter === 'All' ? activeRows : statusRows[statusFilter] || []
    return rows.filter((row) => !keyword || [
      row.asset_name,
      row.asset_code,
      row.serial,
      row.user_name,
      row.previous_user_name,
      row.location_name,
      row.previous_location_name,
      row.group_name,
      row.previous_group_name,
      row.asset_glpi_id,
    ].some((value) => String(value || '').toLowerCase().includes(keyword)))
  }, [activeRows, searchTerm, statusFilter, statusRows])

  const machineHistory = useMemo(() => selectedEvent
    ? history.filter((event) => Number(event.asset_glpi_id) === Number(selectedEvent.asset_glpi_id)).sort((left, right) => eventTime(right) - eventTime(left))
    : [], [history, selectedEvent])

  const selectedAttachments = useMemo(() => parseAttachments(selectedEvent?.attachments_json), [selectedEvent?.attachments_json])
  const canAttachDocument = selectedEvent && !selectedEvent.is_active_row
    && [ASSET_STATUS.TRANSFERRED, ASSET_STATUS.DISPOSED].includes(selectedEvent.status)

  const exportExcel = () => {
    const rows = filteredRows.map((event) => ({
      'GLPI ID': event.asset_glpi_id,
      'รหัสทรัพย์สิน': displayAssetCode(event),
      'ชื่อเครื่อง': event.asset_name || '',
      'Serial Number': event.serial || '',
      'ประเภท': event.source_type || '',
      'สถานะ': statusLabel(event.status),
      'ผู้ใช้งาน': event.user_name || '',
      'ที่ตั้งเดิม': event.previous_location_name || '',
      'ที่ตั้งปัจจุบัน': event.location_name || '',
      'กรุ๊ปเดิม': event.previous_group_name || '',
      'กรุ๊ปปัจจุบัน': event.group_name || '',
      'วันที่สถานะ': formatDate(event.event_date),
    }))
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'ทรัพย์สินคอมพิวเตอร์')
    XLSX.writeFile(workbook, `Computer_Assets_${statusFilter}_${yearFilter}_${monthFilter}.xlsx`)
  }

  const saveAttachments = async () => {
    if (!canAttachDocument || !attachmentFiles.length || isSavingAttachments) return
    setIsSavingAttachments(true)
    try {
      const uploaded = await uploadAttachmentFiles(attachmentFiles, {
        category: selectedEvent.status === ASSET_STATUS.DISPOSED ? 'asset_disposal_document' : 'asset_transfer_document',
        assetId: selectedEvent.asset_glpi_id,
        source: 'asset_status_history',
      })
      const attachments = [...selectedAttachments, ...uploaded]
      const { error } = await mysql.from('asset_status_history').update({ attachments_json: JSON.stringify(attachments) }).eq('id', selectedEvent.id)
      if (error) throw new Error(error)
      setSelectedEvent((current) => ({ ...current, attachments_json: JSON.stringify(attachments) }))
      setAttachmentFiles([])
      await loadData({ silent: true })
      Swal.fire('บันทึกแล้ว', 'แนบเอกสารกับประวัติเครื่องเรียบร้อยแล้ว', 'success')
    } catch (error) {
      Swal.fire('แนบเอกสารไม่สำเร็จ', error.message || 'กรุณาลองใหม่อีกครั้ง', 'error')
    } finally {
      setIsSavingAttachments(false)
    }
  }

  const syncSelectedMachineLogs = async () => {
    if (!selectedEvent || isLoadingLogs) return
    setIsLoadingLogs(true)
    try {
      const computer = {
        id: selectedEvent.asset_glpi_id,
        name: selectedEvent.asset_name,
        otherserial: selectedEvent.asset_code,
        serial: selectedEvent.serial,
        users_id: selectedEvent.user_name,
        locations_id: selectedEvent.location_name,
        groups_id: selectedEvent.group_name,
        autoupdatesystems_id: selectedEvent.source_type,
        states_id: selectedEvent.source_state,
      }
      const events = await withGlpiSession(async (sessionToken) => {
        const logs = await getComputerLogs(sessionToken, selectedEvent.asset_glpi_id, 1000)
        return buildTransferEventsFromGlpiLogs(computer, logs)
      })
      if (events.length) {
        const { error } = await mysql.from('asset_status_history').upsert(events, { onConflict: 'event_key' })
        if (error) throw new Error(error)
      }
      await loadData({ silent: true })
      Swal.fire('อัปเดตประวัติแล้ว', `พบประวัติเปลี่ยนที่ตั้ง/กรุ๊ป ${events.length} รายการ`, 'success')
    } catch (error) {
      Swal.fire('โหลดประวัติ GLPI ไม่สำเร็จ', error.message || 'กรุณาลองใหม่อีกครั้ง', 'error')
    } finally {
      setIsLoadingLogs(false)
    }
  }

  const cards = [
    { status: 'All', label: 'เครื่อง Active ทั้งหมด', value: activeRows.length, icon: Laptop, style: 'bg-slate-100 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200' },
    { status: ASSET_STATUS.NEW, label: 'เครื่องใหม่', value: statusRows[ASSET_STATUS.NEW].length, icon: MonitorCheck, style: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200' },
    { status: ASSET_STATUS.TRANSFERRED, label: 'โอนย้าย', value: statusRows[ASSET_STATUS.TRANSFERRED].length, icon: ArrowRightLeft, style: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-200' },
    { status: ASSET_STATUS.DISPOSED, label: 'ตัดจำหน่าย', value: statusRows[ASSET_STATUS.DISPOSED].length, icon: PackageX, style: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200' },
  ]

  return (
    <div className="space-y-5 pb-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-200"><MonitorCheck className="h-6 w-6" /></div><div><h2 className="text-xl font-bold text-slate-900 dark:text-white">ทรัพย์สินคอมพิวเตอร์</h2><p className="text-sm text-slate-500 dark:text-slate-400">เครื่อง Active และประวัติจาก GLPI</p></div></div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={exportExcel} disabled={!filteredRows.length} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300"><FileSpreadsheet className="h-4 w-4" />Excel</button><button type="button" onClick={() => syncFromGlpi()} disabled={isSyncing} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />{isSyncing ? 'กำลัง Sync...' : 'Sync GLPI'}</button></div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_140px_140px]">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="input-modern w-full !py-2.5 !pl-9 text-sm" placeholder="ค้นหาชื่อเครื่อง, รหัส, Serial, ผู้ใช้งาน, ที่ตั้ง, กรุ๊ป..." /></div>
          <select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} disabled={statusFilter === 'All'} className="input-modern w-full !py-2.5 text-sm font-semibold disabled:opacity-50"><option value="All">ทุกเดือน</option>{Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((month) => <option key={month} value={month}>{new Date(2026, Number(month) - 1, 1).toLocaleDateString('th-TH', { month: 'long' })}</option>)}</select>
          <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} disabled={statusFilter === 'All'} className="input-modern w-full !py-2.5 text-sm font-semibold disabled:opacity-50">{yearOptions.map((year) => <option key={year} value={year}>ปี {Number(year).toLocaleString('th-TH', { useGrouping: false })}</option>)}</select>
        </div>
        {warning && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{warning}</div>}
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => { const Icon = card.icon; const selected = statusFilter === card.status; return <button key={card.status} type="button" onClick={() => setStatusFilter(card.status)} aria-pressed={selected} className={`glass-card flex items-center gap-4 rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${selected ? 'border-sky-400 ring-2 ring-sky-200 dark:border-sky-500 dark:ring-sky-900/60' : ''}`}><div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${card.style}`}><Icon className="h-6 w-6" /></div><div><p className="text-xs font-bold text-slate-500 dark:text-slate-400">{card.label}</p><p className="text-3xl font-extrabold text-slate-900 dark:text-white">{card.value}</p></div></button> })}</div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        {isLoading ? <div className="grid min-h-64 place-items-center"><RefreshCw className="h-8 w-8 animate-spin text-sky-500" /></div> : filteredRows.length === 0 ? <div className="px-5 py-16 text-center"><Laptop className="mx-auto h-14 w-14 text-slate-300 dark:text-slate-600" /><h3 className="mt-3 font-bold text-slate-700 dark:text-slate-200">ไม่พบข้อมูลเครื่องตามตัวกรอง</h3></div> : <div className="overflow-x-auto"><table className="w-full min-w-[1120px] border-collapse text-left"><thead><tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400"><th className="p-4">รหัสทรัพย์สิน</th><th className="p-4">เครื่องคอมพิวเตอร์</th><th className="p-4">ผู้ใช้งาน</th><th className="p-4">ที่ตั้ง / กรุ๊ป</th><th className="p-4">การเปลี่ยนแปลง</th><th className="p-4">วันที่ / สถานะ</th><th className="p-4 text-right">รายละเอียด</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">{filteredRows.map((row) => <tr key={row.id} className="align-top hover:bg-slate-50/80 dark:hover:bg-slate-900/30"><td className="p-4"><div className={`font-mono text-sm font-bold ${isRentalSource(row.source_type) ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-100'}`}>{displayAssetCode(row)}</div><div className="mt-1 text-xs text-slate-400">GLPI #{row.asset_glpi_id}</div></td><td className="p-4"><div className="font-bold text-slate-800 dark:text-slate-100">{row.asset_name || '-'}</div><div className="mt-1 text-xs text-slate-500">Serial: {row.serial || '-'}</div></td><td className="p-4 text-sm text-slate-700 dark:text-slate-300">{row.user_name || row.previous_user_name || '-'}</td><td className="max-w-64 p-4 text-sm"><div className="text-slate-700 dark:text-slate-300">{row.location_name || row.previous_location_name || '-'}</div><div className="mt-1 text-xs font-semibold text-sky-700 dark:text-sky-300">กรุ๊ป: {row.group_name || row.previous_group_name || '-'}</div></td><td className="max-w-80 p-4 text-xs leading-5 text-slate-500 dark:text-slate-400">{row.status === ASSET_STATUS.TRANSFERRED ? <div className="space-y-1">{row.previous_location_name !== row.location_name && <div><strong>ที่ตั้ง:</strong> {row.previous_location_name || '-'} → {row.location_name || '-'}</div>}{row.previous_group_name !== row.group_name && <div><strong>กรุ๊ป:</strong> {row.previous_group_name || '-'} → {row.group_name || '-'}</div>}</div> : row.status === ASSET_STATUS.DISPOSED ? 'ไม่อยู่ในรายการ Active จาก GLPI' : row.status === ASSET_STATUS.NEW ? 'เพิ่มเครื่องจาก GLPI' : 'ข้อมูลเครื่อง Active ปัจจุบัน'}</td><td className="p-4"><div className="flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-slate-600 dark:text-slate-300"><CalendarDays className="h-4 w-4 text-slate-400" />{formatDate(row.event_date)}</div><span className={`mt-2 inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[row.status]}`}>{statusLabel(row.status)}</span></td><td className="p-4 text-right"><button type="button" onClick={() => { setSelectedEvent(row); setAttachmentFiles([]) }} className="inline-flex items-center gap-2 rounded-lg border border-sky-200 px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/30"><Eye className="h-4 w-4" />ดูรายละเอียด</button></td></tr>)}</tbody></table></div>}
      </section>

      {selectedEvent && <div className="fixed inset-0 z-[170] flex items-start justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5"><div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800"><header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-700"><div><h3 className="text-lg font-bold text-slate-900 dark:text-white">{selectedEvent.asset_name || '-'}</h3><p className="mt-1 text-sm text-slate-500">{displayAssetCode(selectedEvent)} · GLPI #{selectedEvent.asset_glpi_id}</p></div><button type="button" onClick={() => setSelectedEvent(null)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="ปิด"><X className="h-5 w-5" /></button></header><div className="max-h-[calc(100dvh-8rem)] overflow-y-auto p-5"><div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">{[['Serial Number', selectedEvent.serial], ['ประเภท', selectedEvent.source_type], ['ผู้ใช้งาน', selectedEvent.user_name || selectedEvent.previous_user_name], ['ที่ตั้ง', selectedEvent.location_name || selectedEvent.previous_location_name], ['กรุ๊ป', selectedEvent.group_name || selectedEvent.previous_group_name], ['สถานะ', statusLabel(selectedEvent.status)]].map(([label, value]) => <div key={label}><div className="text-xs font-bold text-slate-400">{label}</div><div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{value || '-'}</div></div>)}</div><div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-200 pt-5 dark:border-slate-700"><h4 className="font-bold text-slate-800 dark:text-slate-100">ประวัติสถานะ</h4><button type="button" onClick={syncSelectedMachineLogs} disabled={isLoadingLogs} className="inline-flex items-center gap-2 rounded-lg border border-sky-200 px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-50 disabled:opacity-50 dark:border-sky-800 dark:text-sky-300"><RefreshCw className={`h-4 w-4 ${isLoadingLogs ? 'animate-spin' : ''}`} />ดึงประวัติ GLPI</button></div><div className="mt-3 space-y-2">{machineHistory.map((event) => <div key={event.id} className="grid gap-2 border-b border-slate-100 py-3 text-sm dark:border-slate-700/60 sm:grid-cols-[110px_120px_minmax(0,1fr)]"><span className="text-slate-500">{formatDate(event.event_date)}</span><span className={`w-fit rounded-full border px-2 py-0.5 text-xs font-bold ${STATUS_STYLES[event.status]}`}>{statusLabel(event.status)}</span><span className="text-slate-600 dark:text-slate-300">{event.status === ASSET_STATUS.TRANSFERRED ? `${event.previous_location_name || '-'} → ${event.location_name || '-'} · ${event.previous_group_name || '-'} → ${event.group_name || '-'}` : event.status === ASSET_STATUS.DISPOSED ? 'ตัดจำหน่าย/ไม่อยู่ใน Active' : 'เพิ่มเครื่องเข้าสู่ GLPI'}</span></div>)}</div>{canAttachDocument && <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-700"><h4 className="font-bold text-slate-800 dark:text-slate-100">เอกสารประกอบ{selectedEvent.status === ASSET_STATUS.DISPOSED ? 'การตัดจำหน่าย' : 'การโอนย้าย'}</h4>{selectedAttachments.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{selectedAttachments.map((file, index) => <a key={`${file.url}-${index}`} href={resolveAttachmentUrl(file.url)} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 dark:border-slate-700 dark:text-sky-300"><span className="truncate">{file.name || `เอกสาร ${index + 1}`}</span><Download className="h-4 w-4 shrink-0" /></a>)}</div>}<div className="mt-3 flex flex-col gap-3 sm:flex-row"><label className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-sky-300 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-300"><FileUp className="h-4 w-4" /><span>{attachmentFiles.length ? `เลือกแล้ว ${attachmentFiles.length} ไฟล์` : `เลือกเอกสาร (สูงสุด ${MAX_ATTACHMENT_FILES} ไฟล์)`}</span><input type="file" multiple className="hidden" onChange={(event) => setAttachmentFiles(Array.from(event.target.files || []))} /></label><button type="button" onClick={saveAttachments} disabled={!attachmentFiles.length || isSavingAttachments} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50">{isSavingAttachments ? 'กำลังบันทึก...' : 'บันทึกเอกสาร'}</button></div></div>}</div></div></div>}
    </div>
  )
}

export default AssetStatusManagement
