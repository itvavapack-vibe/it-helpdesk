import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRightLeft,
  CalendarDays,
  FileSpreadsheet,
  Laptop,
  MonitorCheck,
  PackageX,
  RefreshCw,
  Search,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import Swal from 'sweetalert2'
import { getComputers, withGlpiSession } from '../glpiClient'
import { mysql } from '../mysqlClient'
import { syncGlpiAssetsToMysql } from '../utils/assetSync'
import { ASSET_STATUS, getAssetStatusLabel } from '../utils/assetStatus'

const formatDate = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('th-TH')
}

const eventTime = (event) => new Date(event?.event_date || event?.created_at || 0).getTime() || 0

const STATUS_STYLES = {
  [ASSET_STATUS.NEW]: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-200',
  [ASSET_STATUS.TRANSFERRED]: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/70 dark:bg-sky-950/40 dark:text-sky-200',
  [ASSET_STATUS.DISPOSED]: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/40 dark:text-rose-200',
}

const AssetStatusManagement = () => {
  const [history, setHistory] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [warning, setWarning] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()))
  const [monthFilter, setMonthFilter] = useState('All')

  const loadHistory = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setIsLoading(true)
    try {
      const { data, error } = await mysql
        .from('asset_status_history')
        .select('*')
        .order('event_date', { ascending: false })
        .limit(5000)
      if (error) throw new Error(error)
      setHistory(data || [])
      setWarning('')
    } catch (error) {
      console.error('Load asset status history failed:', error)
      setWarning('ไม่สามารถโหลดประวัติสถานะเครื่องได้')
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [])

  const syncFromGlpi = useCallback(async ({ showResult = true } = {}) => {
    if (isSyncing) return
    setIsSyncing(true)
    try {
      const computers = await withGlpiSession(getComputers)
      const glpiComputers = Array.isArray(computers) ? computers : []
      const result = await syncGlpiAssetsToMysql(glpiComputers)
      await loadHistory({ silent: true })
      setWarning('')
      if (showResult) {
        Swal.fire(
          'Sync GLPI สำเร็จ',
          `เครื่องใหม่ ${result.newEvents} เครื่อง · โอนย้าย ${result.transferEvents} เครื่อง · ตัดจำหน่าย ${result.disposedEvents} เครื่อง`,
          'success',
        )
      }
    } catch (error) {
      console.error('Sync asset status from GLPI failed:', error)
      setWarning('เชื่อมต่อ GLPI ไม่สำเร็จ กำลังแสดงข้อมูลจากการ Sync ครั้งล่าสุด')
      if (showResult) Swal.fire('Sync GLPI ไม่สำเร็จ', error.message || 'กรุณาลองใหม่อีกครั้ง', 'error')
    } finally {
      setIsSyncing(false)
    }
  }, [isSyncing, loadHistory])

  useEffect(() => {
    loadHistory()
    syncFromGlpi({ showResult: false })
  }, [])

  const latestStatuses = useMemo(() => {
    const latestByAsset = new Map()
    ;[...history]
      .sort((left, right) => eventTime(right) - eventTime(left) || Number(right.id) - Number(left.id))
      .forEach((event) => {
        const key = String(event.asset_glpi_id)
        if (!latestByAsset.has(key)) latestByAsset.set(key, event)
      })
    return Array.from(latestByAsset.values())
  }, [history])

  const yearOptions = useMemo(() => {
    const years = new Set([String(new Date().getFullYear())])
    latestStatuses.forEach((event) => {
      const year = new Date(event.event_date).getFullYear()
      if (Number.isFinite(year)) years.add(String(year))
    })
    return Array.from(years).sort((left, right) => Number(right) - Number(left))
  }, [latestStatuses])

  useEffect(() => {
    if (!yearOptions.includes(yearFilter)) setYearFilter(yearOptions[0])
  }, [yearFilter, yearOptions])

  const dateFilteredStatuses = useMemo(() => latestStatuses.filter((event) => {
    const date = new Date(event.event_date)
    if (Number.isNaN(date.getTime())) return false
    const matchesYear = !yearFilter || String(date.getFullYear()) === yearFilter
    const matchesMonth = monthFilter === 'All' || String(date.getMonth() + 1).padStart(2, '0') === monthFilter
    return matchesYear && matchesMonth
  }), [latestStatuses, monthFilter, yearFilter])

  const statusCounts = useMemo(() => ({
    All: dateFilteredStatuses.length,
    [ASSET_STATUS.NEW]: dateFilteredStatuses.filter((event) => event.status === ASSET_STATUS.NEW).length,
    [ASSET_STATUS.TRANSFERRED]: dateFilteredStatuses.filter((event) => event.status === ASSET_STATUS.TRANSFERRED).length,
    [ASSET_STATUS.DISPOSED]: dateFilteredStatuses.filter((event) => event.status === ASSET_STATUS.DISPOSED).length,
  }), [dateFilteredStatuses])

  const filteredStatuses = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()
    return dateFilteredStatuses.filter((event) => {
      const matchesStatus = statusFilter === 'All' || event.status === statusFilter
      const matchesSearch = !keyword || [
        event.asset_name,
        event.asset_code,
        event.serial,
        event.user_name,
        event.previous_user_name,
        event.location_name,
        event.previous_location_name,
        event.asset_glpi_id,
      ].some((value) => String(value || '').toLowerCase().includes(keyword))
      return matchesStatus && matchesSearch
    }).sort((left, right) => eventTime(right) - eventTime(left))
  }, [dateFilteredStatuses, searchTerm, statusFilter])

  const exportExcel = () => {
    const rows = filteredStatuses.map((event) => ({
      'GLPI ID': event.asset_glpi_id,
      'รหัสทรัพย์สิน': event.asset_code || '',
      'ชื่อเครื่อง': event.asset_name || '',
      'Serial Number': event.serial || '',
      'สถานะ': getAssetStatusLabel(event.status),
      'ผู้ใช้งานเดิม': event.previous_user_name || '',
      'ผู้ใช้งานปัจจุบัน': event.user_name || '',
      'สถานที่เดิม': event.previous_location_name || '',
      'สถานที่ปัจจุบัน': event.location_name || '',
      'วันที่สถานะ': formatDate(event.event_date),
    }))
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'สถานะเครื่อง')
    XLSX.writeFile(workbook, `Computer_Status_${yearFilter}_${monthFilter}.xlsx`)
  }

  const cards = [
    { status: 'All', label: 'เครื่องทั้งหมด', icon: Laptop, style: 'bg-slate-100 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200' },
    { status: ASSET_STATUS.NEW, label: 'เครื่องใหม่', icon: MonitorCheck, style: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200' },
    { status: ASSET_STATUS.TRANSFERRED, label: 'โอนย้าย', icon: ArrowRightLeft, style: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-200' },
    { status: ASSET_STATUS.DISPOSED, label: 'ตัดจำหน่าย', icon: PackageX, style: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200' },
  ]

  return (
    <div className="space-y-5 pb-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-200"><MonitorCheck className="h-6 w-6" /></div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">สถานะเครื่องคอมพิวเตอร์</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">ข้อมูลสถานะและการเปลี่ยนแปลงจาก GLPI</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportExcel} disabled={!filteredStatuses.length} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300"><FileSpreadsheet className="h-4 w-4" />Excel</button>
            <button type="button" onClick={() => syncFromGlpi()} disabled={isSyncing} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-sm font-bold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />{isSyncing ? 'กำลัง Sync...' : 'Sync GLPI'}</button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_140px_140px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="input-modern w-full !py-2.5 !pl-9 text-sm" placeholder="ค้นหาชื่อเครื่อง, รหัส, Serial, ผู้ใช้งาน, สถานที่..." />
          </div>
          <select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} className="input-modern w-full !py-2.5 text-sm font-semibold">
            <option value="All">ทุกเดือน</option>
            {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((month) => <option key={month} value={month}>{new Date(2026, Number(month) - 1, 1).toLocaleDateString('th-TH', { month: 'long' })}</option>)}
          </select>
          <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} className="input-modern w-full !py-2.5 text-sm font-semibold">
            {yearOptions.map((year) => <option key={year} value={year}>ปี {Number(year).toLocaleString('th-TH', { useGrouping: false })}</option>)}
          </select>
        </div>
        {warning && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{warning}</div>}
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon
          const selected = statusFilter === card.status
          return <button key={card.status} type="button" onClick={() => setStatusFilter(card.status)} aria-pressed={selected} className={`glass-card flex items-center gap-4 rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${selected ? 'border-sky-400 ring-2 ring-sky-200 dark:border-sky-500 dark:ring-sky-900/60' : ''}`}><div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${card.style}`}><Icon className="h-6 w-6" /></div><div><p className="text-xs font-bold text-slate-500 dark:text-slate-400">{card.label}</p><p className="text-3xl font-extrabold text-slate-900 dark:text-white">{statusCounts[card.status] || 0}</p></div></button>
        })}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        {isLoading ? (
          <div className="grid min-h-64 place-items-center"><RefreshCw className="h-8 w-8 animate-spin text-sky-500" /></div>
        ) : filteredStatuses.length === 0 ? (
          <div className="px-5 py-16 text-center"><Laptop className="mx-auto h-14 w-14 text-slate-300 dark:text-slate-600" /><h3 className="mt-3 font-bold text-slate-700 dark:text-slate-200">ไม่พบข้อมูลเครื่องตามตัวกรอง</h3></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] border-collapse text-left">
              <thead><tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400"><th className="p-4">รหัส / GLPI</th><th className="p-4">เครื่องคอมพิวเตอร์</th><th className="p-4">ผู้ใช้งาน</th><th className="p-4">สถานที่</th><th className="p-4">รายละเอียดการเปลี่ยนแปลง</th><th className="p-4">วันที่</th><th className="p-4">สถานะ</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {filteredStatuses.map((event) => (
                  <tr key={event.id} className="align-top transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-900/30">
                    <td className="p-4"><div className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100">{event.asset_code || '-'}</div><div className="mt-1 text-xs text-slate-400">GLPI #{event.asset_glpi_id}</div></td>
                    <td className="p-4"><div className="font-bold text-slate-800 dark:text-slate-100">{event.asset_name || '-'}</div><div className="mt-1 text-xs text-slate-500">Serial: {event.serial || '-'}</div></td>
                    <td className="p-4 text-sm text-slate-700 dark:text-slate-300">{event.user_name || event.previous_user_name || '-'}</td>
                    <td className="max-w-64 p-4 text-sm text-slate-700 dark:text-slate-300">{event.location_name || event.previous_location_name || '-'}</td>
                    <td className="max-w-80 p-4 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {event.status === ASSET_STATUS.TRANSFERRED ? <div className="space-y-1"><div><strong className="text-slate-600 dark:text-slate-300">ผู้ใช้:</strong> {event.previous_user_name || '-'} → {event.user_name || '-'}</div><div><strong className="text-slate-600 dark:text-slate-300">สถานที่:</strong> {event.previous_location_name || '-'} → {event.location_name || '-'}</div></div> : event.status === ASSET_STATUS.DISPOSED ? 'ไม่พบเครื่องในรายการ Active จาก GLPI' : 'เพิ่มเครื่องจาก GLPI เข้าสู่ระบบ'}
                    </td>
                    <td className="p-4 whitespace-nowrap"><span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300"><CalendarDays className="h-4 w-4 text-slate-400" />{formatDate(event.event_date)}</span></td>
                    <td className="p-4"><span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[event.status] || STATUS_STYLES[ASSET_STATUS.NEW]}`}>{getAssetStatusLabel(event.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default AssetStatusManagement
