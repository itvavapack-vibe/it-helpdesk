import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { Building2, CalendarDays, ChevronRight, FileText, Image as ImageIcon, Loader2, MapPin, Paperclip, RefreshCw, Save, Search, UserRound, X } from 'lucide-react'
import { MAX_ATTACHMENT_FILES, MAX_ATTACHMENT_SIZE, resolveAttachmentUrl, uploadAttachmentFiles } from '@/utils/fileUpload'
import { facilitiesGetHistory, facilitiesListRequests, facilitiesUpdateStatus } from './facilitiesApi'
import { FACILITIES_BRANCHES, FACILITIES_CATEGORIES, FACILITIES_PRIORITIES, FACILITIES_STATUS, formatFacilitiesDate } from './facilitiesConstants'
import FacilitiesStatusBadge from './FacilitiesStatusBadge'

const ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip'
const isStaff = (role) => role === 'staff' || role === 'admin'

const FacilitiesRequestManagement = ({ auth, mineOnly = false, initialFilter = '', externalSearch = '' }) => {
  const [requests, setRequests] = useState([])
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [filters, setFilters] = useState({ status: '', priority: '', branch: '' })
  const [presetFilter, setPresetFilter] = useState(initialFilter)
  const [selected, setSelected] = useState(null)
  const [history, setHistory] = useState([])
  const [status, setStatus] = useState('Pending')
  const [note, setNote] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [files, setFiles] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const load = async () => {
    setIsLoading(true)
    setError('')
    try { setRequests(await facilitiesListRequests({ mine: mineOnly ? 1 : '' })) }
    catch (requestError) { setError(requestError.message) }
    finally { setIsLoading(false) }
  }
  useEffect(() => { load() }, [mineOnly])
  useEffect(() => {
    setPresetFilter(initialFilter)
    if (['Pending', 'Accepted', 'In_Progress', 'Waiting', 'Completed', 'Cancelled'].includes(initialFilter)) setFilters((current) => ({ ...current, status: initialFilter }))
    else setFilters((current) => ({ ...current, status: '' }))
  }, [initialFilter])

  const filtered = requests.filter((item) => {
    if (presetFilter === 'active' && !['Accepted', 'In_Progress', 'Waiting'].includes(item.status)) return false
    if (presetFilter === 'urgent' && (item.priority !== 'Urgent' || ['Completed', 'Cancelled'].includes(item.status))) return false
    if (filters.status && item.status !== filters.status) return false
    if (filters.priority && item.priority !== filters.priority) return false
    if (filters.branch && item.branch !== filters.branch) return false
    const query = `${deferredSearch} ${externalSearch}`.trim().toLocaleLowerCase('th')
    return !query || [item.request_number, item.title, item.description, item.location, item.reporter_name, item.department].some((value) => String(value || '').toLocaleLowerCase('th').includes(query))
  })

  const openRequest = async (item) => {
    setSelected(item)
    setStatus(item.status)
    setNote('')
    setExpectedDate(item.expected_completion_date || '')
    setFiles([])
    setIsDetailLoading(true)
    setError('')
    try { setHistory(await facilitiesGetHistory(item.id)) }
    catch (requestError) { setError(requestError.message) }
    finally { setIsDetailLoading(false) }
  }

  const selectFiles = (event) => {
    const selectedFiles = Array.from(event.target.files || [])
    event.target.value = ''
    const next = [...files, ...selectedFiles]
    if (next.length > MAX_ATTACHMENT_FILES) return setError(`แนบไฟล์ได้สูงสุด ${MAX_ATTACHMENT_FILES} ไฟล์`)
    const oversized = selectedFiles.find((file) => file.size > MAX_ATTACHMENT_SIZE && !String(file.type || '').startsWith('image/'))
    if (oversized) return setError(`ไฟล์ ${oversized.name} มีขนาดเกิน 5 MB`)
    setFiles(next)
  }

  const updateStatus = async () => {
    setIsUpdating(true)
    setError('')
    try {
      const attachments = files.length ? await uploadAttachmentFiles(files, { uploadedBy: auth.name, uploadedByType: auth.role, source: 'facilities_status' }) : []
      const updated = await facilitiesUpdateStatus(selected.id, { status, note, expected_completion_date: expectedDate || null, attachments })
      setRequests((current) => current.map((item) => Number(item.id) === Number(updated.id) ? updated : item))
      setSelected(updated)
      setNote('')
      setFiles([])
      setHistory(await facilitiesGetHistory(updated.id))
    } catch (requestError) { setError(requestError.message) }
    finally { setIsUpdating(false) }
  }

  const AttachmentList = ({ items = [] }) => items.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{items.map((file, index) => <a key={`${file.url}-${index}`} href={resolveAttachmentUrl(file.url)} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 p-2 text-xs text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300">{String(file.type || '').startsWith('image/') ? <ImageIcon className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}<span className="truncate">{file.name}</span></a>)}</div> : null

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-bold text-indigo-600 dark:text-indigo-300">FACILITIES WORK QUEUE</p><h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{mineOnly ? 'ติดตามงานที่แจ้ง' : 'จัดการและอัปเดตสถานะซ่อม'}</h2></div>
        <button type="button" onClick={load} disabled={isLoading} className="flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:text-indigo-600 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"><RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />รีเฟรช</button>
      </div>
      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="relative sm:col-span-2 xl:col-span-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white" placeholder="ค้นหาเลขที่ หัวข้อ สถานที่" /></label>
          <select value={filters.status} onChange={(event) => { setPresetFilter(''); setFilters((current) => ({ ...current, status: event.target.value })) }} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"><option value="">ทุกสถานะ</option>{Object.entries(FACILITIES_STATUS).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}</select>
          <select value={filters.priority} onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"><option value="">ทุกระดับ</option>{Object.entries(FACILITIES_PRIORITIES).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}</select>
          {!mineOnly && <select value={filters.branch} onChange={(event) => setFilters((current) => ({ ...current, branch: event.target.value }))} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"><option value="">ทุกสาขา</option>{FACILITIES_BRANCHES.map((branch) => <option key={branch} value={branch}>{branch}</option>)}</select>}
        </div>
      </div>
      <p className="mb-3 text-sm text-slate-500">พบ {filtered.length.toLocaleString('th-TH')} รายการ</p>
      {isLoading ? <div className="grid min-h-64 place-items-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div> : filtered.length ? <>
        <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/80 md:block"><div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-sm"><thead className="bg-slate-50 text-xs font-bold text-slate-500 dark:bg-slate-800/80"><tr><th className="px-4 py-3">เลขที่ / วันที่</th><th className="px-4 py-3">ผู้แจ้ง</th><th className="px-4 py-3">หมวดหมู่ / งาน</th><th className="px-4 py-3">สถานที่</th><th className="px-4 py-3">ความเร่งด่วน</th><th className="px-4 py-3">สถานะ</th><th /></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{filtered.map((item) => <tr key={item.id} onClick={() => openRequest(item)} className="cursor-pointer hover:bg-indigo-50/60 dark:hover:bg-indigo-950/20"><td className="whitespace-nowrap px-4 py-4"><strong className="block text-slate-800 dark:text-slate-100">{item.request_number}</strong><span className="mt-1 block text-xs text-slate-500">{formatFacilitiesDate(item.created_at, { hour: '2-digit', minute: '2-digit' })}</span></td><td className="px-4 py-4"><strong className="block text-slate-700 dark:text-slate-200">{item.reporter_name}</strong><span className="text-xs text-slate-500">{item.department}</span></td><td className="max-w-sm px-4 py-4"><span className="text-xs font-semibold text-indigo-600">{FACILITIES_CATEGORIES[item.category] || item.category}</span><strong className="mt-1 block truncate text-slate-800 dark:text-slate-100">{item.title}</strong></td><td className="max-w-64 px-4 py-4 text-slate-600 dark:text-slate-300">{item.location}</td><td className={`px-4 py-4 font-bold ${FACILITIES_PRIORITIES[item.priority]?.className}`}>{FACILITIES_PRIORITIES[item.priority]?.label}</td><td className="px-4 py-4"><FacilitiesStatusBadge status={item.status} /></td><td className="px-3"><ChevronRight className="h-4 w-4 text-slate-400" /></td></tr>)}</tbody></table></div></div>
        <div className="grid gap-3 md:hidden">{filtered.map((item) => <button key={item.id} type="button" onClick={() => openRequest(item)} className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm dark:border-slate-700 dark:bg-slate-900/80"><span className="flex items-start justify-between gap-3"><span className="min-w-0"><span className="text-xs font-semibold text-indigo-600">{item.request_number}</span><strong className="mt-1 block truncate text-slate-800 dark:text-slate-100">{item.title}</strong></span><FacilitiesStatusBadge status={item.status} /></span><span className="mt-3 flex items-start gap-2 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5 shrink-0" />{item.location}</span></button>)}</div>
      </> : <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-slate-300 text-center dark:border-slate-600"><div><Search className="mx-auto h-8 w-8 text-slate-400" /><strong className="mt-3 block text-slate-700 dark:text-slate-200">ไม่พบรายการ</strong></div></div>}

      {selected && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null) }}><div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"><div className="min-w-0"><span className="text-xs font-semibold text-indigo-600">{selected.request_number}</span><h3 className="truncate text-lg font-bold text-slate-900 dark:text-white">{selected.title}</h3></div><button type="button" onClick={() => setSelected(null)} className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="ปิด"><X className="h-5 w-5" /></button></div>
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-5"><div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><span className="flex items-center gap-2 text-xs text-slate-500"><UserRound className="h-3.5 w-3.5" />ผู้แจ้ง</span><strong className="mt-1 block text-sm">{selected.reporter_name} · {selected.department}</strong></div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><span className="flex items-center gap-2 text-xs text-slate-500"><Building2 className="h-3.5 w-3.5" />สาขา</span><strong className="mt-1 block text-sm">{selected.branch || '-'}</strong></div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><span className="flex items-center gap-2 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" />สถานที่</span><strong className="mt-1 block text-sm">{selected.location}</strong></div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><span className="flex items-center gap-2 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" />วันที่แจ้ง</span><strong className="mt-1 block text-sm">{formatFacilitiesDate(selected.requested_date)}</strong></div>
          </div><div><h4 className="text-sm font-bold">รายละเอียด</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600 dark:text-slate-300">{selected.description}</p><AttachmentList items={selected.attachments} /></div>
          <div><h4 className="text-sm font-bold">ประวัติสถานะ</h4>{isDetailLoading ? <Loader2 className="mt-4 h-5 w-5 animate-spin text-indigo-500" /> : <div className="mt-4 space-y-0">{history.map((item, index) => <div key={item.id} className="relative flex gap-3 pb-5"><div className="relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full bg-indigo-500 ring-4 ring-indigo-100 dark:ring-indigo-950" />{index < history.length - 1 && <div className="absolute left-[5px] top-4 h-full w-px bg-slate-200 dark:bg-slate-700" />}<div className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><FacilitiesStatusBadge status={item.to_status} /><span className="text-xs text-slate-500">{formatFacilitiesDate(item.created_at, { hour: '2-digit', minute: '2-digit' })}</span></span><p className="mt-1 text-xs text-slate-500">โดย {item.changed_by_name}</p>{item.note && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{item.note}</p>}<AttachmentList items={item.attachments} /></div></div>)}</div>}</div></div>
          <aside><div className="sticky top-20 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60"><h4 className="text-sm font-bold">สถานะปัจจุบัน</h4><div className="mt-3"><FacilitiesStatusBadge status={selected.status} /></div><p className="mt-4 text-xs text-slate-500">ผู้ดำเนินการ</p><strong className="mt-1 block text-sm">{selected.assigned_name || '-'}</strong>
            {isStaff(auth.role) && <div className="mt-5 border-t border-slate-200 pt-5 dark:border-slate-700"><label><span className="mb-2 block text-sm font-semibold">อัปเดตสถานะ</span><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white">{Object.entries(FACILITIES_STATUS).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}</select></label>{status === 'In_Progress' && <label className="mt-4 block"><span className="mb-2 block text-sm font-semibold">วันที่คาดว่าจะแล้วเสร็จ <span className="text-rose-500">*</span></span><input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white" /></label>}<label className="mt-4 block"><span className="mb-2 block text-sm font-semibold">{status === 'Cancelled' ? 'เหตุผลการยกเลิก' : 'ผลการดำเนินการ'} <span className="text-rose-500">*</span></span><textarea rows={5} value={note} onChange={(event) => setNote(event.target.value)} className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white" /></label><input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={selectFiles} /><button type="button" onClick={() => fileRef.current?.click()} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white text-sm font-semibold text-slate-600 hover:text-indigo-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"><Paperclip className="h-4 w-4" />แนบหลักฐาน {files.length ? `(${files.length})` : ''}</button><button type="button" onClick={updateStatus} disabled={isUpdating || !note.trim() || (status === 'In_Progress' && !expectedDate)} className="app-primary-button mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white disabled:opacity-50">{isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}บันทึกสถานะ</button></div>}
          </div></aside>
        </div>
      </div></div>}
    </section>
  )
}

export default FacilitiesRequestManagement
