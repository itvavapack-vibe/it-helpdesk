import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { AlertCircle, Ban, CheckCircle2, Clock3, Download, Loader2, TrendingUp } from 'lucide-react'
import { secretaryGetDashboard, secretaryListIssues } from './secretaryApi'
import { formatSecretaryDate, SECRETARY_IMPACTS, SECRETARY_STATUS } from './secretaryConstants'
import SecretaryStatusBadge from './SecretaryStatusBadge'

const SecretaryDashboard = ({ onOpenIssues }) => {
  const [days, setDays] = useState('')
  const [dashboard, setDashboard] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  useEffect(() => {
    let active = true
    setIsLoading(true)
    setError('')
    secretaryGetDashboard(days)
      .then((data) => { if (active) setDashboard(data) })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [days])

  const maxDepartmentCount = useMemo(() => Math.max(1, ...(dashboard?.top_departments || []).map((item) => item.count)), [dashboard])

  const exportExecutiveReport = async () => {
    setIsExporting(true)
    setError('')
    try {
      const issues = await secretaryListIssues({ limit: 1000 })
      const rows = issues.map((issue) => ({
        'เลขที่': issue.issue_number,
        'วันที่แจ้ง': formatSecretaryDate(issue.created_at),
        'วันที่พบปัญหา': formatSecretaryDate(issue.occurred_at),
        'ผู้แจ้ง': issue.reporter_name,
        'แผนก': issue.department,
        'หัวข้อ': issue.title,
        'หมวดหมู่': issue.category,
        'ระดับผลกระทบ': SECRETARY_IMPACTS[issue.impact_level]?.label || issue.impact_level,
        'วันที่คาดว่าจะแล้วเสร็จ': formatSecretaryDate(issue.expected_completion_date),
        'สถานะ': SECRETARY_STATUS[issue.status]?.label || issue.status,
        'ผู้ดำเนินการ': issue.assigned_name || '',
        'ผลการดำเนินการ': issue.resolution_note || '',
        'วันที่เสร็จสิ้น': formatSecretaryDate(issue.completed_at),
      }))
      const worksheet = XLSX.utils.json_to_sheet(rows)
      worksheet['!cols'] = [14, 14, 14, 24, 22, 38, 24, 16, 18, 18, 24, 45, 16].map((wch) => ({ wch }))
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Executive Report')
      XLSX.writeFile(workbook, `Secretary_Executive_Report_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsExporting(false)
    }
  }

  if (isLoading && !dashboard) {
    return <div className="grid min-h-80 place-items-center text-slate-500"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>
  }

  const summary = dashboard?.summary || { total: 0, pending: 0, in_progress: 0, completed: 0, cancelled: 0 }
  const cards = [
    { key: '', label: 'รายการแจ้งทั้งหมด', value: summary.total, icon: TrendingUp, style: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300' },
    { key: 'Pending', label: 'รอดำเนินการ', value: summary.pending, icon: AlertCircle, style: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300' },
    { key: 'In_Progress', label: 'กำลังดำเนินการ', value: summary.in_progress, icon: Clock3, style: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
    { key: 'Completed', label: 'เสร็จสิ้น', value: summary.completed, icon: CheckCircle2, style: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' },
    { key: 'Cancelled', label: 'ยกเลิก', value: summary.cancelled, icon: Ban, style: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200' },
  ]

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-indigo-600 dark:text-indigo-300">EXECUTIVE OVERVIEW</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">แดชบอร์ดรายงานปัญหา</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={days} onChange={(event) => setDays(event.target.value)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
            <option value="">ทั้งหมด</option>
            <option value="30">30 วันล่าสุด</option>
            <option value="90">90 วันล่าสุด</option>
            <option value="365">ปีล่าสุด</option>
          </select>
          <button type="button" onClick={exportExecutiveReport} disabled={isExporting} className="flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export รายงาน
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <button key={card.label} type="button" onClick={() => onOpenIssues?.(card.key)} className={`min-h-32 rounded-xl border p-4 text-left shadow-sm hover:-translate-y-0.5 hover:shadow-md ${card.style}`}>
              <span className="flex items-center justify-between gap-3"><span className="text-sm font-bold">{card.label}</span><Icon className="h-5 w-5" /></span>
              <strong className="mt-4 block text-3xl font-bold">{card.value}</strong>
            </button>
          )
        })}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.75fr)]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">แผนกที่แจ้งบ่อย</h3>
          <div className="mt-5 space-y-4">
            {(dashboard?.top_departments || []).length ? dashboard.top_departments.map((item) => (
              <div key={item.department}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="truncate font-semibold text-slate-700 dark:text-slate-200">{item.department}</span><strong className="text-slate-900 dark:text-white">{item.count}</strong></div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(5, (item.count / maxDepartmentCount) * 100)}%` }} /></div>
              </div>
            )) : <p className="py-8 text-center text-sm text-slate-500">ยังไม่มีข้อมูล</p>}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">รายการล่าสุด</h3>
          <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {(dashboard?.recent || []).length ? dashboard.recent.map((issue) => (
              <button key={issue.id} type="button" onClick={() => onOpenIssues?.(issue.status)} className="flex w-full min-w-0 items-center gap-3 py-3 text-left hover:text-indigo-600 dark:hover:text-indigo-300">
                <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-800 dark:text-slate-100">{issue.title}</strong><span className="mt-1 block truncate text-xs text-slate-500 dark:text-slate-400">{issue.department} · {formatSecretaryDate(issue.created_at)}</span></span>
                <SecretaryStatusBadge status={issue.status} />
              </button>
            )) : <p className="py-8 text-center text-sm text-slate-500">ยังไม่มีข้อมูล</p>}
          </div>
        </div>
      </div>
    </section>
  )
}

export default SecretaryDashboard
