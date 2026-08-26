import { useEffect, useState } from 'react'
import { Building2, CalendarDays, FileText, Loader2, Tag, UserRound, X } from 'lucide-react'
import { resolveAttachmentUrl } from '../utils/fileUpload'
import { secretaryGetIssueHistory } from './secretaryApi'
import { formatSecretaryDate } from './secretaryConstants'
import SecretaryStatusBadge from './SecretaryStatusBadge'

const formatFileSize = (size) => Number(size || 0) >= 1024 * 1024
  ? `${(Number(size) / (1024 * 1024)).toFixed(1)} MB`
  : `${Math.max(1, Math.round(Number(size || 0) / 1024))} KB`

const formatDamageValue = (value) => new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value || 0))

const ReadOnlyAttachments = ({ attachments = [] }) => {
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
          {String(file?.type || '').startsWith('image/')
            ? <img src={resolveAttachmentUrl(file.url)} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
            : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-slate-100 dark:bg-slate-800"><FileText className="h-5 w-5" /></span>}
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-xs">{file.name}</strong>
            <span className="mt-0.5 block text-[11px] text-slate-400">{formatFileSize(file.size)}</span>
          </span>
        </a>
      ))}
    </div>
  )
}

const SecretaryIssueReadOnlyModal = ({ issue, onClose }) => {
  const [history, setHistory] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setHistory([])
    setError('')
    setIsLoading(true)
    secretaryGetIssueHistory(issue.id)
      .then((data) => { if (active) setHistory(data || []) })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [issue.id])

  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="department-issue-title" className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
          <div className="min-w-0">
            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">{issue.issue_number}</span>
            <h3 id="department-issue-title" className="truncate text-lg font-bold text-slate-900 dark:text-white">{issue.title}</h3>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="ปิด"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><span className="flex items-center gap-2 text-xs text-slate-500"><UserRound className="h-3.5 w-3.5" />ผู้แจ้ง</span><strong className="mt-1 block text-sm text-slate-800 dark:text-slate-100">{issue.reporter_name}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><span className="flex items-center gap-2 text-xs text-slate-500"><Building2 className="h-3.5 w-3.5" />แผนก</span><strong className="mt-1 block text-sm text-slate-800 dark:text-slate-100">{issue.department}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><span className="flex items-center gap-2 text-xs text-slate-500"><Tag className="h-3.5 w-3.5" />หมวดหมู่</span><strong className="mt-1 block text-sm text-slate-800 dark:text-slate-100">{issue.category}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><span className="flex items-center gap-2 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" />วันที่พบปัญหา</span><strong className="mt-1 block text-sm text-slate-800 dark:text-slate-100">{formatSecretaryDate(issue.occurred_at)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><span className="text-xs text-slate-500">มูลค่าความเสียหาย</span><strong className="mt-1 block text-sm text-slate-800 dark:text-slate-100">{formatDamageValue(issue.damage_value)} บาท</strong></div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><span className="text-xs text-slate-500">แผนกที่เกี่ยวข้อง</span><span className="mt-1 block space-y-1">{(issue.related_users || []).length ? issue.related_users.map((user) => <strong key={`${user.user_id}-${user.username}`} className="block break-words text-sm text-slate-800 dark:text-slate-100">{user.name || user.username} - {user.department}</strong>) : <span className="text-sm text-slate-500">-</span>}</span></div>
              {issue.expected_completion_date && <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><span className="flex items-center gap-2 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" />วันที่คาดว่าจะแล้วเสร็จ</span><strong className="mt-1 block text-sm text-slate-800 dark:text-slate-100">{formatSecretaryDate(issue.expected_completion_date)}</strong></div>}
            </div>

            <div><h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">รายละเอียดปัญหา</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600 dark:text-slate-300">{issue.description}</p></div>
            {(issue.attachments || []).length > 0 && <div><h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">ไฟล์แนบ</h4><ReadOnlyAttachments attachments={issue.attachments} /></div>}
            {issue.resolution_note && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30"><h4 className="text-sm font-bold text-emerald-800 dark:text-emerald-300">ผลการดำเนินการล่าสุด</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-emerald-700 dark:text-emerald-200">{issue.resolution_note}</p></div>}

            <div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">ประวัติสถานะ</h4>
              {isLoading ? <Loader2 className="mt-4 h-5 w-5 animate-spin text-indigo-500" /> : error ? <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{error}</p> : history.length ? (
                <div className="mt-4 space-y-0">
                  {history.map((item, index) => (
                    <div key={item.id} className="relative flex gap-3 pb-5">
                      <div className="relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full bg-indigo-500 ring-4 ring-indigo-100 dark:ring-indigo-950" />
                      {index < history.length - 1 && <div className="absolute left-[5px] top-4 h-full w-px bg-slate-200 dark:bg-slate-700" />}
                      <div className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2"><SecretaryStatusBadge status={item.to_status} /><span className="text-xs text-slate-500">{formatSecretaryDate(item.created_at, { hour: '2-digit', minute: '2-digit' })}</span></span>
                        <p className="mt-1 text-xs text-slate-500">โดย {item.changed_by_name}{item.changed_by_department ? ` · ${item.changed_by_department}` : ''}</p>
                        {item.expected_completion_date && <p className="mt-1 text-xs font-semibold text-indigo-600 dark:text-indigo-300">กำหนดแล้วเสร็จ {formatSecretaryDate(item.expected_completion_date)}</p>}
                        {item.note && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{item.note}</p>}
                        <ReadOnlyAttachments attachments={item.attachments} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="mt-3 text-sm text-slate-500">ยังไม่มีประวัติสถานะ</p>}
            </div>
          </div>

          <aside className="min-w-0">
            <div className="sticky top-20 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">สถานะปัจจุบัน</h4>
              <div className="mt-3"><SecretaryStatusBadge status={issue.status} /></div>
              <div className="mt-4 text-xs text-slate-500"><span className="block">ผู้ดำเนินการ</span><strong className="mt-1 block text-sm text-slate-700 dark:text-slate-200">{issue.assigned_name || '-'}</strong></div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

export default SecretaryIssueReadOnlyModal
