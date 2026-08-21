import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  Building2,
  CalendarDays,
  ChevronRight,
  Download,
  FileText,
  Filter,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  RefreshCw,
  Save,
  Search,
  Tag,
  UserRound,
  X,
} from 'lucide-react'
import { MAX_ATTACHMENT_FILES, MAX_ATTACHMENT_SIZE, resolveAttachmentUrl, uploadAttachmentFiles } from '../utils/fileUpload'
import {
  secretaryGetIssueHistory,
  secretaryListIssues,
  secretaryUpdateIssueStatus,
} from './secretaryApi'
import {
  formatSecretaryDate,
  isSecretaryReceiverRole,
  SECRETARY_IMPACTS,
  SECRETARY_STATUS,
} from './secretaryConstants'
import SecretaryStatusBadge from './SecretaryStatusBadge'

const STATUS_ATTACHMENT_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip'
const formatFileSize = (size) => size >= 1024 * 1024
  ? `${(size / (1024 * 1024)).toFixed(1)} MB`
  : `${Math.max(1, Math.round(size / 1024))} KB`
const formatDamageValue = (value) => new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value || 0))
const isImageAttachment = (file) => String(file?.type || '').startsWith('image/')

const HistoryAttachments = ({ attachments = [] }) => {
  if (!attachments.length) return null
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {attachments.map((file, index) => (
        <a
          key={`${file.url}-${index}`}
          href={resolveAttachmentUrl(file.url)}
          target="_blank"
          rel="noreferrer"
          className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          title={file.name}
        >
          {isImageAttachment(file)
            ? <img src={resolveAttachmentUrl(file.url)} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
            : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-slate-100 dark:bg-slate-800"><FileText className="h-5 w-5" /></span>}
          <span className="min-w-0 flex-1"><strong className="block truncate text-xs">{file.name}</strong><span className="mt-0.5 block text-[11px] text-slate-400">{formatFileSize(Number(file.size || 0))}</span></span>
        </a>
      ))}
    </div>
  )
}

const emptyFilters = (status = '') => ({
  search: '',
  status,
  department: '',
  category: '',
  impact: '',
  from: '',
  to: '',
})

const SecretaryIssueList = ({ auth, initialStatus = '', mineOnly = false }) => {
  const [issues, setIssues] = useState([])
  const [filters, setFilters] = useState(() => emptyFilters(initialStatus))
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedIssue, setSelectedIssue] = useState(null)
  const [history, setHistory] = useState([])
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [statusDraft, setStatusDraft] = useState('Pending')
  const [statusNote, setStatusNote] = useState('')
  const [expectedCompletionDate, setExpectedCompletionDate] = useState('')
  const [statusFiles, setStatusFiles] = useState([])
  const [isUpdating, setIsUpdating] = useState(false)
  const statusFileInputRef = useRef(null)
  const deferredSearch = useDeferredValue(filters.search)
  const isReceiver = isSecretaryReceiverRole(auth.role) && !mineOnly
  const canUpdateStatus = isReceiver || auth.role === 'reporter'
  const isRelatedContributor = auth.role === 'reporter'
    && selectedIssue
    && Number(selectedIssue.reporter_user_id) !== Number(auth.id)
    && (selectedIssue.related_users || []).some((user) => Number(user?.user_id) === Number(auth.id))

  const loadIssues = async () => {
    setIsLoading(true)
    setError('')
    try {
      setIssues(await secretaryListIssues({ limit: 1000, mine: mineOnly ? 1 : '' }))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadIssues() }, [mineOnly])
  useEffect(() => {
    setFilters((current) => ({ ...current, status: initialStatus || '' }))
  }, [initialStatus])

  const departments = useMemo(() => [...new Set(issues.map((issue) => issue.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th')), [issues])
  const categories = useMemo(() => [...new Set(issues.map((issue) => issue.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th')), [issues])
  const statusCounts = useMemo(() => issues.reduce((counts, issue) => ({ ...counts, [issue.status]: (counts[issue.status] || 0) + 1 }), {}), [issues])

  const filteredIssues = useMemo(() => {
    const query = deferredSearch.trim().toLocaleLowerCase('th')
    return issues.filter((issue) => {
      if (filters.status && issue.status !== filters.status) return false
      if (filters.department && issue.department !== filters.department) return false
      if (filters.category && issue.category !== filters.category) return false
      if (filters.impact && issue.impact_level !== filters.impact) return false
      const occurredDate = String(issue.occurred_at || '').slice(0, 10)
      if (filters.from && occurredDate < filters.from) return false
      if (filters.to && occurredDate > filters.to) return false
      if (!query) return true
      const relatedUsers = (issue.related_users || []).map((user) => `${user.name || user.username} ${user.department}`).join(' ')
      return [issue.issue_number, issue.title, issue.description, issue.department, issue.reporter_name, issue.category, issue.assigned_name, relatedUsers]
        .some((value) => String(value || '').toLocaleLowerCase('th').includes(query))
    })
  }, [deferredSearch, filters, issues])

  const openIssue = async (issue) => {
    setSelectedIssue(issue)
    setStatusDraft(issue.status)
    setStatusNote('')
    setExpectedCompletionDate(String(issue.expected_completion_date || '').slice(0, 10))
    setStatusFiles([])
    setHistory([])
    setIsDetailLoading(true)
    setError('')
    try {
      setHistory(await secretaryGetIssueHistory(issue.id))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsDetailLoading(false)
    }
  }

  const updateStatus = async () => {
    setIsUpdating(true)
    setError('')
    try {
      const attachments = statusFiles.length
        ? await uploadAttachmentFiles(statusFiles, {
          uploadedBy: auth.name,
          uploadedByType: auth.role,
          source: 'secretary_status',
        })
        : []
      const updated = await secretaryUpdateIssueStatus(selectedIssue.id, {
        status: statusDraft,
        note: statusNote,
        expected_completion_date: expectedCompletionDate || null,
        attachments,
      })
      setIssues((current) => current.map((issue) => Number(issue.id) === Number(updated.id) ? updated : issue))
      setSelectedIssue(updated)
      setStatusNote('')
      setExpectedCompletionDate(String(updated.expected_completion_date || '').slice(0, 10))
      setStatusFiles([])
      if (statusFileInputRef.current) statusFileInputRef.current.value = ''
      setHistory(await secretaryGetIssueHistory(updated.id))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsUpdating(false)
    }
  }

  const selectStatusFiles = (event) => {
    const selectedFiles = Array.from(event.target.files || [])
    event.target.value = ''
    if (!selectedFiles.length) return
    const nextFiles = [...statusFiles, ...selectedFiles]
    if (nextFiles.length > MAX_ATTACHMENT_FILES) {
      setError(`แนบไฟล์ได้สูงสุด ${MAX_ATTACHMENT_FILES} ไฟล์`)
      return
    }
    const oversizedFile = selectedFiles.find((file) => file.size > MAX_ATTACHMENT_SIZE && !String(file.type || '').startsWith('image/'))
    if (oversizedFile) {
      setError(`ไฟล์ ${oversizedFile.name} มีขนาดเกิน 5 MB`)
      return
    }
    setError('')
    setStatusFiles(nextFiles)
  }

  const removeStatusFile = (index) => {
    setStatusFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))
  }

  const exportFiltered = () => {
    const rows = filteredIssues.map((issue) => ({
      'เลขที่': issue.issue_number,
      'วันที่แจ้ง': formatSecretaryDate(issue.created_at),
      'วันที่พบปัญหา': formatSecretaryDate(issue.occurred_at),
      'ผู้แจ้ง': issue.reporter_name,
      'แผนก': issue.department,
      'หัวข้อ': issue.title,
      'หมวดหมู่': issue.category,
      'รายละเอียด': issue.description,
      'ผลกระทบ': SECRETARY_IMPACTS[issue.impact_level]?.label || issue.impact_level,
      'วันที่คาดว่าจะแล้วเสร็จ': formatSecretaryDate(issue.expected_completion_date),
      'มูลค่าความเสียหาย (บาท)': issue.damage_value == null ? '' : Number(issue.damage_value),
      'แผนกที่เกี่ยวข้อง': (issue.related_users || []).map((user) => `${user.name || user.username} - ${user.department}`).join(', '),
      'ไฟล์แนบ': (issue.attachments || []).map((file) => file.name).join(', '),
      'สถานะ': SECRETARY_STATUS[issue.status]?.label || issue.status,
      'ผู้ดำเนินการ': issue.assigned_name || '',
      'ผลการดำเนินการ': issue.resolution_note || '',
    }))
    const worksheet = XLSX.utils.json_to_sheet(rows)
    worksheet['!cols'] = [14, 14, 14, 24, 22, 36, 28, 52, 14, 18, 22, 48, 34, 18, 24, 45].map((wch) => ({ wch }))
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Issues')
    XLSX.writeFile(workbook, `Secretary_Issues_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const statusTabs = [
    { value: '', label: 'ทั้งหมด', count: issues.length },
    ...Object.entries(SECRETARY_STATUS).map(([value, config]) => ({ value, label: config.label, count: statusCounts[value] || 0 })),
  ]

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-indigo-600 dark:text-indigo-300">ISSUE TRACKING</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{isReceiver ? 'ตรวจสอบและดำเนินการ' : 'ติดตามสถานะ'}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={exportFiltered} disabled={!filteredIssues.length} className="flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"><Download className="h-4 w-4" />Export</button>
          <button type="button" onClick={loadIssues} disabled={isLoading} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-300 bg-white text-slate-600 shadow-sm hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300" title="โหลดข้อมูลใหม่"><RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>}

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {statusTabs.map((tab) => (
          <button key={tab.value || 'all'} type="button" onClick={() => setFilters((current) => ({ ...current, status: tab.value }))} className={`flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${filters.status === tab.value ? 'border-indigo-600 bg-indigo-600 text-white shadow-md dark:border-indigo-500 dark:bg-indigo-500' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>
            {tab.label}<span className={`rounded-md px-1.5 py-0.5 text-xs ${filters.status === tab.value ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>{tab.count}</span>
          </button>
        ))}
      </div>

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
        <div className="mb-3 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100"><Filter className="h-4 w-4 text-indigo-500" />ตัวกรอง</span><button type="button" onClick={() => setFilters(emptyFilters())} className="text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300">ล้างตัวกรอง</button></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <label className="relative sm:col-span-2 xl:col-span-2"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950/50" placeholder="ค้นหาเลขที่ หัวข้อ ผู้แจ้ง แผนก..." /></label>
          {isReceiver && <select value={filters.department} onChange={(event) => setFilters((current) => ({ ...current, department: event.target.value }))} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"><option value="">ทุกแผนก</option>{departments.map((department) => <option key={department}>{department}</option>)}</select>}
          <select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"><option value="">ทุกหมวดหมู่</option>{categories.map((category) => <option key={category}>{category}</option>)}</select>
          <select value={filters.impact} onChange={(event) => setFilters((current) => ({ ...current, impact: event.target.value }))} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"><option value="">ทุกระดับผลกระทบ</option>{Object.entries(SECRETARY_IMPACTS).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}</select>
          <label className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white" title="ตั้งแต่วันที่" /></label>
          <label className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white" title="ถึงวันที่" /></label>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between gap-3 text-sm text-slate-500 dark:text-slate-400"><span>พบ {filteredIssues.length} รายการ</span></div>

      {isLoading ? (
        <div className="grid min-h-64 place-items-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>
      ) : filteredIssues.length ? (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/80 md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500 dark:bg-slate-800/80 dark:text-slate-400"><tr><th className="px-4 py-3">เลขที่ / วันที่</th>{isReceiver && <th className="px-4 py-3">ผู้แจ้ง / แผนก</th>}<th className="px-4 py-3">ปัญหา</th><th className="px-4 py-3">ผลกระทบ</th><th className="px-4 py-3">สถานะ</th><th className="w-12 px-3 py-3" /></tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredIssues.map((issue) => (
                    <tr key={issue.id} onClick={() => openIssue(issue)} className="cursor-pointer hover:bg-indigo-50/60 dark:hover:bg-indigo-950/20">
                      <td className="whitespace-nowrap px-4 py-4"><strong className="block text-slate-800 dark:text-slate-100">{issue.issue_number}</strong><span className="mt-1 block text-xs text-slate-500">{formatSecretaryDate(issue.created_at)}</span></td>
                      {isReceiver && <td className="px-4 py-4"><strong className="block text-slate-700 dark:text-slate-200">{issue.reporter_name}</strong><span className="mt-1 block text-xs text-slate-500">{issue.department}</span></td>}
                      <td className="max-w-sm px-4 py-4"><strong className="block truncate text-slate-800 dark:text-slate-100">{issue.title}</strong><span className="mt-1 block truncate text-xs text-slate-500">{issue.category}</span></td>
                      <td className={`px-4 py-4 font-semibold ${SECRETARY_IMPACTS[issue.impact_level]?.className || ''}`}>{SECRETARY_IMPACTS[issue.impact_level]?.label || issue.impact_level}</td>
                      <td className="px-4 py-4"><SecretaryStatusBadge status={issue.status} /></td>
                      <td className="px-3 py-4"><ChevronRight className="h-4 w-4 text-slate-400" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-3 md:hidden">
            {filteredIssues.map((issue) => (
              <button key={issue.id} type="button" onClick={() => openIssue(issue)} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
                <span className="flex items-start justify-between gap-3"><span className="min-w-0"><span className="block text-xs font-semibold text-slate-500">{issue.issue_number}</span><strong className="mt-1 block truncate text-slate-800 dark:text-slate-100">{issue.title}</strong></span><SecretaryStatusBadge status={issue.status} /></span>
                <span className="mt-3 flex items-center gap-2 text-xs text-slate-500"><Building2 className="h-3.5 w-3.5" />{issue.department}<span>·</span>{formatSecretaryDate(issue.created_at)}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-slate-300 text-center dark:border-slate-600"><div><Search className="mx-auto h-8 w-8 text-slate-400" /><strong className="mt-3 block text-slate-700 dark:text-slate-200">ไม่พบรายการ</strong><span className="mt-1 block text-sm text-slate-500">ลองเปลี่ยนคำค้นหาหรือตัวกรอง</span></div></div>
      )}

      {selectedIssue && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedIssue(null) }}>
          <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:rounded-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
              <div className="min-w-0"><span className="text-xs font-semibold text-slate-500">{selectedIssue.issue_number}</span><h3 className="truncate text-lg font-bold text-slate-900 dark:text-white">{selectedIssue.title}</h3></div>
              <button type="button" onClick={() => setSelectedIssue(null)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="ปิด"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="min-w-0 space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><span className="flex items-center gap-2 text-xs text-slate-500"><UserRound className="h-3.5 w-3.5" />ผู้แจ้ง</span><strong className="mt-1 block text-sm text-slate-800 dark:text-slate-100">{selectedIssue.reporter_name}</strong></div>
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><span className="flex items-center gap-2 text-xs text-slate-500"><Building2 className="h-3.5 w-3.5" />แผนก</span><strong className="mt-1 block text-sm text-slate-800 dark:text-slate-100">{selectedIssue.department}</strong></div>
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><span className="flex items-center gap-2 text-xs text-slate-500"><Tag className="h-3.5 w-3.5" />หมวดหมู่</span><strong className="mt-1 block text-sm text-slate-800 dark:text-slate-100">{selectedIssue.category}</strong></div>
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><span className="flex items-center gap-2 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" />วันที่พบปัญหา</span><strong className="mt-1 block text-sm text-slate-800 dark:text-slate-100">{formatSecretaryDate(selectedIssue.occurred_at)}</strong></div>
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><span className="text-xs text-slate-500">มูลค่าความเสียหาย</span><strong className="mt-1 block text-sm text-slate-800 dark:text-slate-100">{formatDamageValue(selectedIssue.damage_value)} บาท</strong></div>
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><span className="text-xs text-slate-500">แผนกที่เกี่ยวข้อง</span><span className="mt-1 block space-y-1">{(selectedIssue.related_users || []).map((user) => <strong key={`${user.user_id}-${user.username}`} className="block break-words text-sm text-slate-800 dark:text-slate-100">{user.name || user.username} - {user.department}</strong>)}</span></div>
                  {selectedIssue.expected_completion_date && <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><span className="flex items-center gap-2 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" />วันที่คาดว่าจะแล้วเสร็จ</span><strong className="mt-1 block text-sm text-slate-800 dark:text-slate-100">{formatSecretaryDate(selectedIssue.expected_completion_date)}</strong></div>}
                </div>
                <div><h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">รายละเอียดปัญหา</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600 dark:text-slate-300">{selectedIssue.description}</p></div>
                {(selectedIssue.attachments || []).length > 0 && <div><h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">ไฟล์แนบ</h4><HistoryAttachments attachments={selectedIssue.attachments} /></div>}
                {selectedIssue.resolution_note && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30"><h4 className="text-sm font-bold text-emerald-800 dark:text-emerald-300">ผลการดำเนินการล่าสุด</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-emerald-700 dark:text-emerald-200">{selectedIssue.resolution_note}</p></div>}

                <div><h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">ประวัติสถานะ</h4>{isDetailLoading ? <Loader2 className="mt-4 h-5 w-5 animate-spin text-indigo-500" /> : <div className="mt-4 space-y-0">{history.map((item, index) => <div key={item.id} className="relative flex gap-3 pb-5"><div className="relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full bg-indigo-500 ring-4 ring-indigo-100 dark:ring-indigo-950" />{index < history.length - 1 && <div className="absolute left-[5px] top-4 h-full w-px bg-slate-200 dark:bg-slate-700" />}<div className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><SecretaryStatusBadge status={item.to_status} /><span className="text-xs text-slate-500">{formatSecretaryDate(item.created_at, { hour: '2-digit', minute: '2-digit' })}</span></span><p className="mt-1 text-xs text-slate-500">โดย {item.changed_by_name}{item.changed_by_department ? ` · ${item.changed_by_department}` : ''}</p>{item.expected_completion_date && <p className="mt-1 text-xs font-semibold text-indigo-600 dark:text-indigo-300">กำหนดแล้วเสร็จ {formatSecretaryDate(item.expected_completion_date)}</p>}{item.note && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{item.note}</p>}<HistoryAttachments attachments={item.attachments} /></div></div>)}</div>}</div>
              </div>

              <aside className="min-w-0">
                <div className="sticky top-20 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">สถานะปัจจุบัน</h4>
                  <div className="mt-3"><SecretaryStatusBadge status={selectedIssue.status} /></div>
                  <div className="mt-4 text-xs text-slate-500"><span className="block">ผู้ดำเนินการ</span><strong className="mt-1 block text-sm text-slate-700 dark:text-slate-200">{selectedIssue.assigned_name || '-'}</strong></div>

                  {canUpdateStatus && (
                    <div className="mt-5 border-t border-slate-200 pt-5 dark:border-slate-700">
                      <label>
                        <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">อัปเดตสถานะ</span>
                        <select value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)} disabled={isRelatedContributor} title={isRelatedContributor ? 'ผู้เกี่ยวข้องไม่สามารถเปลี่ยนสถานะเอกสารได้' : undefined} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-800">
                          {Object.entries(SECRETARY_STATUS).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}
                        </select>
                      </label>
                      {(statusDraft === 'In_Progress' || isRelatedContributor) && (
                        <label className="mt-4 block">
                          <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">วันที่คาดว่าจะแล้วเสร็จ {statusDraft === 'In_Progress' && <span className="text-rose-500">*</span>}</span>
                          <input type="date" required={statusDraft === 'In_Progress'} value={expectedCompletionDate} onChange={(event) => setExpectedCompletionDate(event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white" />
                        </label>
                      )}
                      <label className="mt-4 block">
                        <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">{statusDraft === 'Cancelled' ? 'เหตุผลการยกเลิก' : 'ผลการดำเนินการ'} <span className="text-rose-500">*</span></span>
                        <textarea rows={5} value={statusNote} onChange={(event) => setStatusNote(event.target.value)} className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white" placeholder={statusDraft === 'Cancelled' ? 'ระบุเหตุผลที่ยกเลิกเอกสาร' : 'บันทึกความคืบหน้าหรือผลการแก้ไข'} />
                      </label>
                      <input ref={statusFileInputRef} type="file" multiple accept={STATUS_ATTACHMENT_ACCEPT} className="hidden" onChange={selectStatusFiles} />
                      <button
                        type="button"
                        onClick={() => statusFileInputRef.current?.click()}
                        disabled={isUpdating || statusFiles.length >= MAX_ATTACHMENT_FILES}
                        className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white text-sm font-semibold text-slate-600 hover:border-indigo-400 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
                        title={`แนบได้สูงสุด ${MAX_ATTACHMENT_FILES} ไฟล์ ไฟล์ละไม่เกิน 5 MB`}
                      >
                        <Paperclip className="h-4 w-4" />
                        แนบรูป / ไฟล์
                      </button>
                      {statusFiles.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {statusFiles.map((file, index) => (
                            <div key={`${file.name}-${file.lastModified}-${index}`} className="flex min-w-0 items-center gap-2 rounded-lg bg-white px-2 py-2 dark:bg-slate-900">
                              {String(file.type || '').startsWith('image/') ? <ImageIcon className="h-4 w-4 shrink-0 text-indigo-500" /> : <FileText className="h-4 w-4 shrink-0 text-slate-500" />}
                              <span className="min-w-0 flex-1 truncate text-xs text-slate-600 dark:text-slate-300">{file.name}</span>
                              <span className="shrink-0 text-[11px] text-slate-400">{formatFileSize(file.size)}</span>
                              <button type="button" onClick={() => removeStatusFile(index)} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30" title="นำไฟล์ออก" aria-label={`นำไฟล์ ${file.name} ออก`}><X className="h-4 w-4" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                      <button type="button" onClick={updateStatus} disabled={isUpdating || !statusNote.trim() || (statusDraft === 'In_Progress' && !expectedCompletionDate)} className="app-primary-button mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}บันทึกสถานะ</button>
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default SecretaryIssueList
