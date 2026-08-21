import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Send,
  X,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover'
import {
  MAX_ATTACHMENT_FILES,
  MAX_ATTACHMENT_SIZE,
  uploadAttachmentFiles,
} from '../utils/fileUpload'
import { secretaryCreateIssue, secretaryListUserOptions } from './secretaryApi'
import { SECRETARY_CATEGORIES, SECRETARY_IMPACTS } from './secretaryConstants'

const ATTACHMENT_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip'

const initialForm = () => ({
  title: '',
  category: '',
  description: '',
  impact_level: 'Medium',
  damage_value: '',
  related_user_ids: [],
  occurred_at: new Date().toISOString().slice(0, 10),
})

const formatFileSize = (size) => size >= 1024 * 1024
  ? `${(size / (1024 * 1024)).toFixed(1)} MB`
  : `${Math.max(1, Math.round(size / 1024))} KB`

const SecretaryIssueForm = ({ auth, onCreated }) => {
  const [form, setForm] = useState(initialForm)
  const [userOptions, setUserOptions] = useState([])
  const [isLoadingOptions, setIsLoadingOptions] = useState(true)
  const [attachmentFiles, setAttachmentFiles] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    let active = true
    const loadOptions = async () => {
      try {
        const options = await secretaryListUserOptions()
        if (active) setUserOptions(options || [])
      } catch (error) {
        if (active) setMessage({ type: 'error', text: error.message })
      } finally {
        if (active) setIsLoadingOptions(false)
      }
    }
    loadOptions()
    return () => { active = false }
  }, [])

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  const toggleRelatedUser = (userId) => {
    setForm((current) => ({
      ...current,
      related_user_ids: current.related_user_ids.includes(userId)
        ? current.related_user_ids.filter((id) => id !== userId)
        : [...current.related_user_ids, userId],
    }))
  }

  const selectFiles = (event) => {
    const selectedFiles = Array.from(event.target.files || [])
    event.target.value = ''
    if (!selectedFiles.length) return
    const nextFiles = [...attachmentFiles, ...selectedFiles]
    if (nextFiles.length > MAX_ATTACHMENT_FILES) {
      setMessage({ type: 'error', text: `แนบไฟล์ได้สูงสุด ${MAX_ATTACHMENT_FILES} ไฟล์` })
      return
    }
    const oversizedFile = selectedFiles.find((file) => (
      file.size > MAX_ATTACHMENT_SIZE && !String(file.type || '').startsWith('image/')
    ))
    if (oversizedFile) {
      setMessage({ type: 'error', text: `ไฟล์ ${oversizedFile.name} มีขนาดเกิน 5 MB` })
      return
    }
    setMessage(null)
    setAttachmentFiles(nextFiles)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setMessage(null)
    if (!form.related_user_ids.length) {
      setMessage({ type: 'error', text: 'กรุณาเลือกแผนกที่เกี่ยวข้องอย่างน้อย 1 รายการ' })
      return
    }
    setIsSubmitting(true)
    try {
      const attachments = attachmentFiles.length
        ? await uploadAttachmentFiles(attachmentFiles, {
          uploadedBy: auth.name,
          uploadedByType: auth.role,
          source: 'secretary_issue',
        })
        : []
      const issue = await secretaryCreateIssue({
        ...form,
        related_user_ids: form.related_user_ids.map(Number),
        attachments,
      })
      setForm(initialForm())
      setAttachmentFiles([])
      if (fileInputRef.current) fileInputRef.current.value = ''
      setMessage({ type: 'success', text: `ส่งข้อมูลเรียบร้อย เลขที่ ${issue.issue_number}` })
      onCreated?.(issue)
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-4xl">
      <div className="mb-6">
        <p className="text-xs font-bold text-indigo-600 dark:text-indigo-300">REPORT AN ISSUE</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">แจ้งรายงานปัญหาของแผนก</h2>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 sm:p-7">
        <div className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60 sm:grid-cols-2">
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">ผู้แจ้ง</span>
            <strong className="mt-1 block text-sm text-slate-800 dark:text-slate-100">{auth.name}</strong>
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">แผนก</span>
            <strong className="mt-1 block text-sm text-slate-800 dark:text-slate-100">{auth.department}</strong>
          </div>
        </div>

        {message && (
          <div className={`mb-5 flex items-start gap-2 rounded-xl border p-3 text-sm ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300'}`}>
            {message.type === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">หัวข้อปัญหา <span className="text-rose-500">*</span></span>
            <input required maxLength={255} value={form.title} onChange={(event) => updateField('title', event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950/60" placeholder="ระบุหัวข้อปัญหาที่พบ" />
          </label>

          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">หมวดหมู่ <span className="text-rose-500">*</span></span>
            <select required value={form.category} onChange={(event) => updateField('category', event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950/60">
              <option value="">เลือกหมวดหมู่</option>
              {SECRETARY_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>

          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">ระดับผลกระทบ</span>
            <select value={form.impact_level} onChange={(event) => updateField('impact_level', event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950/60">
              {Object.entries(SECRETARY_IMPACTS).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}
            </select>
          </label>

          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">มูลค่าความเสียหาย <span className="text-rose-500">*</span></span>
            <span className="relative block">
              <input
                required
                type="text"
                inputMode="decimal"
                value={form.damage_value}
                onChange={(event) => {
                  if (/^\d*(?:\.\d{0,2})?$/.test(event.target.value)) updateField('damage_value', event.target.value)
                }}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 pr-14 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950/60"
                placeholder="0.00"
              />
              <span className="pointer-events-none absolute right-3 top-3 text-sm text-slate-400">บาท</span>
            </span>
          </label>

          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">วันที่พบปัญหา</span>
            <span className="relative block">
              <CalendarDays className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <input type="date" required value={form.occurred_at} onChange={(event) => updateField('occurred_at', event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950/60" />
            </span>
          </label>

          <div className="sm:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">แผนกที่เกี่ยวข้อง <span className="text-rose-500">*</span></span>
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" disabled={isLoadingOptions} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-3 text-left text-sm outline-none hover:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950/60">
                  <span className={form.related_user_ids.length ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400'}>
                    {isLoadingOptions ? 'กำลังโหลดรายชื่อ...' : form.related_user_ids.length ? `เลือกแล้ว ${form.related_user_ids.length} รายการ` : 'เลือกชื่อ-สกุล - แผนก'}
                  </span>
                  {isLoadingOptions ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[min(32rem,calc(100vw-2rem))] p-2">
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {userOptions.map((user) => {
                    const selected = form.related_user_ids.includes(user.id)
                    return (
                      <button key={user.id} type="button" onClick={() => toggleRelatedUser(user.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${selected ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${selected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>{selected && <Check className="h-3.5 w-3.5" />}</span>
                        <span className="min-w-0 break-words"><strong>{user.name}</strong><span className="text-slate-400"> - </span>{user.department}</span>
                      </button>
                    )
                  })}
                  {!isLoadingOptions && !userOptions.length && <p className="p-3 text-sm text-slate-500">ไม่พบรายชื่อผู้ใช้งาน</p>}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <label className="sm:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">รายละเอียดปัญหา <span className="text-rose-500">*</span></span>
            <textarea required maxLength={10000} rows={7} value={form.description} onChange={(event) => updateField('description', event.target.value)} className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm leading-6 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950/60" placeholder="อธิบายสิ่งที่เกิดขึ้น ผลกระทบ และข้อมูลที่เกี่ยวข้อง" />
          </label>

          <div className="sm:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">รูปภาพ / ไฟล์แนบ <span className="font-normal text-slate-400">(ไม่บังคับ)</span></span>
            <input ref={fileInputRef} type="file" multiple accept={ATTACHMENT_ACCEPT} className="hidden" onChange={selectFiles} />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isSubmitting || attachmentFiles.length >= MAX_ATTACHMENT_FILES} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm font-semibold text-slate-600 hover:border-indigo-400 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-300" title={`แนบได้สูงสุด ${MAX_ATTACHMENT_FILES} ไฟล์ ไฟล์ละไม่เกิน 5 MB`}>
              <Paperclip className="h-4 w-4" />
              แนบรูป / ไฟล์
            </button>
            {attachmentFiles.length > 0 && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {attachmentFiles.map((file, index) => (
                  <div key={`${file.name}-${file.lastModified}-${index}`} className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                    {String(file.type || '').startsWith('image/') ? <ImageIcon className="h-5 w-5 shrink-0 text-indigo-500" /> : <FileText className="h-5 w-5 shrink-0 text-slate-500" />}
                    <span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-700 dark:text-slate-200">{file.name}</strong><span className="text-[11px] text-slate-400">{formatFileSize(file.size)}</span></span>
                    <button type="button" onClick={() => setAttachmentFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30" title="นำไฟล์ออก" aria-label={`นำไฟล์ ${file.name} ออก`}><X className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button type="submit" disabled={isSubmitting || isLoadingOptions} className="app-primary-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-60">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {isSubmitting ? 'กำลังส่งข้อมูล...' : 'ส่งรายงานปัญหา'}
          </button>
        </div>
      </form>
    </section>
  )
}

export default SecretaryIssueForm
