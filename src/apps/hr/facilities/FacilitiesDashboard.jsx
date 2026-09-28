import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardList, Clock3, Loader2, RefreshCw, Wrench } from 'lucide-react'
import { facilitiesGetDashboard } from './facilitiesApi'
import { FACILITIES_CATEGORIES, formatFacilitiesDate } from './facilitiesConstants'
import FacilitiesStatusBadge from './FacilitiesStatusBadge'

const FacilitiesDashboard = ({ onOpenRequests }) => {
  const [dashboard, setDashboard] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setIsLoading(true)
    setError('')
    try {
      setDashboard(await facilitiesGetDashboard())
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  const summary = dashboard?.summary || { total: 0, pending: 0, active: 0, completed: 0, urgent: 0 }
  const maxCategory = useMemo(() => Math.max(1, ...(dashboard?.by_category || []).map((item) => item.count)), [dashboard])
  const cards = [
    { label: 'คำขอทั้งหมด', value: summary.total, icon: ClipboardList, filter: '', style: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300' },
    { label: 'รอรับเรื่อง', value: summary.pending, icon: AlertTriangle, filter: 'Pending', style: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300' },
    { label: 'กำลังดำเนินการ', value: summary.active, icon: Clock3, filter: 'active', style: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
    { label: 'เสร็จสิ้น', value: summary.completed, icon: CheckCircle2, filter: 'Completed', style: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' },
    { label: 'งานเร่งด่วนค้าง', value: summary.urgent, icon: Wrench, filter: 'urgent', style: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300' },
  ]

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-bold text-indigo-600 dark:text-indigo-300">ADMINISTRATION REPAIR OVERVIEW</p><h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">แดชบอร์ดระบบแจ้งซ่อมธุรการ</h2></div>
        <button type="button" onClick={load} disabled={isLoading} className="flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"><RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />รีเฟรช</button>
      </div>
      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>}
      {isLoading && !dashboard ? <div className="grid min-h-80 place-items-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div> : <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{cards.map((card) => { const Icon = card.icon; return <button key={card.label} type="button" onClick={() => onOpenRequests?.(card.filter)} className={`min-h-32 rounded-xl border p-4 text-left shadow-sm hover:shadow-md ${card.style}`}><span className="flex items-center justify-between gap-3"><span className="text-sm font-bold">{card.label}</span><Icon className="h-5 w-5" /></span><strong className="mt-4 block text-3xl font-bold">{Number(card.value || 0).toLocaleString('th-TH')}</strong></button> })}</div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">งานแยกตามหมวดหมู่</h3>
            <div className="mt-5 space-y-4">{(dashboard?.by_category || []).length ? dashboard.by_category.map((item) => <div key={item.category}><div className="mb-1.5 flex justify-between gap-3 text-sm"><span className="truncate font-semibold text-slate-700 dark:text-slate-200">{FACILITIES_CATEGORIES[item.category] || item.category}</span><strong>{item.count}</strong></div><div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(5, (item.count / maxCategory) * 100)}%` }} /></div></div>) : <p className="py-8 text-center text-sm text-slate-500">ยังไม่มีข้อมูล</p>}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">รายการล่าสุด</h3>
            <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">{(dashboard?.recent || []).length ? dashboard.recent.map((request) => <button key={request.id} type="button" onClick={() => onOpenRequests?.(request.status)} className="flex w-full min-w-0 items-center gap-3 py-3 text-left hover:text-indigo-600"><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-800 dark:text-slate-100">{request.title}</strong><span className="mt-1 block truncate text-xs text-slate-500">{request.request_number} · {formatFacilitiesDate(request.created_at)}</span></span><FacilitiesStatusBadge status={request.status} /></button>) : <p className="py-8 text-center text-sm text-slate-500">ยังไม่มีรายการแจ้งงาน</p>}</div>
          </div>
        </div>
      </>}
    </section>
  )
}

export default FacilitiesDashboard
