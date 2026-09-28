import { useEffect, useState } from 'react'
import { AlertCircle, Building2, CalendarDays, ClipboardList, Loader2, MapPin, Search, UserRound } from 'lucide-react'
import FacilitiesStatusBadge from './FacilitiesStatusBadge'
import { facilitiesTrackPublicRequest } from './facilitiesApi'
import { FACILITIES_CATEGORIES, FACILITIES_PRIORITIES, FACILITIES_STATUS, formatFacilitiesDate } from './facilitiesConstants'

const formatDateTime = (value) => formatFacilitiesDate(value, { hour: '2-digit', minute: '2-digit' })

const FacilitiesPublicTracking = ({ initialRequestNumber = '', initialReporterName = '' }) => {
  const [form, setForm] = useState({ requestNumber: initialRequestNumber, reporterName: initialReporterName })
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const search = async (values = form) => {
    const requestNumber = String(values.requestNumber || '').trim()
    const reporterName = String(values.reporterName || '').trim()
    if (!requestNumber || !reporterName) { setError('กรุณากรอกเลขที่ใบแจ้งและชื่อผู้แจ้ง'); return }
    setLoading(true)
    setError('')
    setResult(null)
    try { setResult(await facilitiesTrackPublicRequest({ requestNumber, reporterName })) }
    catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (!initialRequestNumber || !initialReporterName) return
    const values = { requestNumber: initialRequestNumber, reporterName: initialReporterName }
    setForm(values)
    search(values)
    // Search once when a newly submitted request is handed to this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRequestNumber, initialReporterName])

  const request = result?.request
  const history = result?.history || []
  return <div className="mx-auto max-w-5xl space-y-6">
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-7">
      <p className="text-xs font-bold text-indigo-600 dark:text-indigo-300">FACILITIES REQUEST TRACKING</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">ติดตามสถานะระบบแจ้งซ่อมธุรการ</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">กรอกข้อมูลให้ตรงกับใบแจ้งเพื่อดูสถานะและประวัติการดำเนินงาน</p>
      <form onSubmit={(event) => { event.preventDefault(); search() }} className="mt-6 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label><span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">เลขที่ใบแจ้ง</span><input required value={form.requestNumber} onChange={(event) => setForm((current) => ({ ...current, requestNumber: event.target.value }))} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 font-mono text-sm uppercase outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white" placeholder="FAC-YYMM-XXXXX" /></label>
        <label><span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">ชื่อผู้แจ้ง</span><input required value={form.reporterName} onChange={(event) => setForm((current) => ({ ...current, reporterName: event.target.value }))} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white" placeholder="ชื่อ-นามสกุลที่ใช้แจ้ง" /></label>
        <button type="submit" disabled={loading} className="app-primary-button flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold text-white disabled:opacity-60">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}ค้นหา</button>
      </form>
      {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    </section>

    {request && <>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-7">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-300">{request.request_number}</p><h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{request.title}</h2><p className="mt-1 text-sm text-slate-500">แจ้งเมื่อ {formatDateTime(request.created_at)}</p></div>
          <FacilitiesStatusBadge status={request.status} />
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex gap-3"><UserRound className="mt-0.5 h-5 w-5 text-indigo-500" /><div><span className="block text-xs text-slate-400">ผู้แจ้ง / แผนก</span><strong className="mt-1 block text-sm text-slate-800 dark:text-slate-100">{request.reporter_name}</strong><span className="text-xs text-slate-500">{request.department}</span></div></div>
          <div className="flex gap-3"><Building2 className="mt-0.5 h-5 w-5 text-indigo-500" /><div><span className="block text-xs text-slate-400">หมวดหมู่ / ความเร่งด่วน</span><strong className="mt-1 block text-sm text-slate-800 dark:text-slate-100">{FACILITIES_CATEGORIES[request.category] || request.category}</strong><span className="text-xs text-slate-500">{FACILITIES_PRIORITIES[request.priority]?.label || request.priority}</span></div></div>
          <div className="flex gap-3"><MapPin className="mt-0.5 h-5 w-5 text-indigo-500" /><div><span className="block text-xs text-slate-400">สถานที่</span><strong className="mt-1 block text-sm text-slate-800 dark:text-slate-100">{request.location}</strong><span className="text-xs text-slate-500">{request.branch || '-'}</span></div></div>
          <div className="sm:col-span-2 lg:col-span-3"><span className="block text-xs text-slate-400">รายละเอียด</span><p className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700 dark:bg-slate-950/60 dark:text-slate-300">{request.description}</p></div>
          {request.assigned_name && <div><span className="block text-xs text-slate-400">ผู้รับผิดชอบ</span><strong className="mt-1 block text-sm text-slate-800 dark:text-slate-100">{request.assigned_name}</strong></div>}
          {request.expected_completion_date && <div className="flex gap-3"><CalendarDays className="mt-0.5 h-5 w-5 text-indigo-500" /><div><span className="block text-xs text-slate-400">คาดว่าจะแล้วเสร็จ</span><strong className="mt-1 block text-sm text-slate-800 dark:text-slate-100">{formatFacilitiesDate(request.expected_completion_date)}</strong></div></div>}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-7">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300"><ClipboardList className="h-5 w-5" /></span><div><h2 className="font-bold text-slate-900 dark:text-white">ประวัติการดำเนินงาน</h2><p className="text-xs text-slate-500">อัปเดตล่าสุด {formatDateTime(request.updated_at)}</p></div></div>
        <div className="tap-timeline mt-6">{[...history].reverse().map((item) => <article key={item.id}><i /><div><strong>{FACILITIES_STATUS[item.to_status]?.label || item.to_status}</strong><p>{item.note || '-'}</p><span>{formatDateTime(item.created_at)}{item.changed_by_name ? ` · ${item.changed_by_name}` : ''}</span></div></article>)}</div>
      </section>
    </>}
  </div>
}

export default FacilitiesPublicTracking
