/* Hallmark · pre-emit critique: P5 H4 E4 S5 R5 V4 */
import { useRef, useState } from 'react'
import { AlertCircle, CalendarDays, CheckCircle2, FileText, Image as ImageIcon, Loader2, MapPin, Paperclip, Send, X } from 'lucide-react'
import { MAX_ATTACHMENT_FILES, MAX_ATTACHMENT_SIZE, uploadAttachmentFiles } from '@/utils/fileUpload'
import { facilitiesCreatePublicRequest } from './facilitiesApi'
import { FACILITIES_BRANCHES, FACILITIES_CATEGORIES, FACILITIES_PRIORITIES } from './facilitiesConstants'

const ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip'
const initialForm = () => ({
  reporter_name: '',
  department: '',
  branch: '',
  category: 'Building',
  location: '',
  title: '',
  description: '',
  priority: 'Normal',
  phone: '',
  requested_date: new Date().toISOString().slice(0, 10),
})

const formatFileSize = (size) => size >= 1024 * 1024
  ? `${(size / (1024 * 1024)).toFixed(1)} MB`
  : `${Math.max(1, Math.round(size / 1024))} KB`

const FacilitiesRequestForm = ({ onCreated }) => {
  const [form, setForm] = useState(initialForm)
  const [files, setFiles] = useState([])
  const [message, setMessage] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef(null)
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  const selectFiles = (event) => {
    const selected = Array.from(event.target.files || [])
    event.target.value = ''
    if (!selected.length) return
    const next = [...files, ...selected]
    if (next.length > MAX_ATTACHMENT_FILES) return setMessage({ type: 'error', text: `แนบไฟล์ได้สูงสุด ${MAX_ATTACHMENT_FILES} ไฟล์` })
    const oversized = selected.find((file) => file.size > MAX_ATTACHMENT_SIZE && !String(file.type || '').startsWith('image/'))
    if (oversized) return setMessage({ type: 'error', text: `ไฟล์ ${oversized.name} มีขนาดเกิน 5 MB` })
    setFiles(next)
    setMessage(null)
  }

  const submit = async (event) => {
    event.preventDefault()
    setMessage(null)
    setIsSubmitting(true)
    try {
      const attachments = files.length
        ? await uploadAttachmentFiles(files, { uploadedBy: form.reporter_name.trim(), uploadedByType: 'public', source: 'facilities_request' })
        : []
      const request = await facilitiesCreatePublicRequest({ ...form, attachments })
      setForm(initialForm())
      setFiles([])
      setMessage({ type: 'success', text: `รับเรื่องเรียบร้อย เลขที่ ${request.request_number}` })
      onCreated?.(request)
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="mb-6">
        <p className="text-xs font-bold text-indigo-600 dark:text-indigo-300">ADMINISTRATION REPAIR REQUEST</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">ฟอร์มระบบแจ้งซ่อมธุรการ</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">แจ้งซ่อม แจ้งปัญหา หรือแจ้งติดตั้ง พร้อมระบุจุดที่ต้องดำเนินการ</p>
      </div>

      <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 sm:p-7">
        {message && <div className={`mb-5 flex items-start gap-2 rounded-xl border p-3 text-sm ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300'}`}>{message.type === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}<span>{message.text}</span></div>}

        <div className="grid gap-5 sm:grid-cols-2">
          <label><span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">ชื่อผู้แจ้ง <span className="text-rose-500">*</span></span><input required maxLength={255} value={form.reporter_name} onChange={(event) => update('reporter_name', event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white" placeholder="ชื่อ-นามสกุล" /></label>
          <label><span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">แผนก <span className="text-rose-500">*</span></span><input required maxLength={255} value={form.department} onChange={(event) => update('department', event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white" placeholder="ระบุแผนก" /></label>
          <label className="sm:col-span-2"><span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">สาขา</span><select value={form.branch} onChange={(event) => update('branch', event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white"><option value="">เลือกสาขา (ไม่บังคับ)</option>{FACILITIES_BRANCHES.map((branch) => <option key={branch} value={branch}>{branch}</option>)}</select></label>

          <label><span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">หมวดหมู่งาน <span className="text-rose-500">*</span></span><select required value={form.category} onChange={(event) => update('category', event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white">{Object.entries(FACILITIES_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">ความเร่งด่วน</span><select value={form.priority} onChange={(event) => update('priority', event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white">{Object.entries(FACILITIES_PRIORITIES).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}</select></label>
          <label className="sm:col-span-2"><span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">หัวข้องาน <span className="text-rose-500">*</span></span><input required maxLength={255} value={form.title} onChange={(event) => update('title', event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white" placeholder="เช่น เครื่องปรับอากาศห้องประชุมไม่เย็น" /></label>
          <label className="sm:col-span-2"><span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">สถานที่ / จุดที่พบ <span className="text-rose-500">*</span></span><span className="relative block"><MapPin className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" /><input required maxLength={255} value={form.location} onChange={(event) => update('location', event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white" placeholder="อาคาร ชั้น ห้อง หรือจุดสังเกต" /></span></label>
          <label><span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">วันที่ต้องการแจ้ง</span><span className="relative block"><CalendarDays className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" /><input type="date" required value={form.requested_date} onChange={(event) => update('requested_date', event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white" /></span></label>
          <label><span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">เบอร์ติดต่อ</span><input maxLength={80} value={form.phone} onChange={(event) => update('phone', event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white" placeholder="เบอร์ภายในหรือมือถือ" /></label>
          <label className="sm:col-span-2"><span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">รายละเอียด <span className="text-rose-500">*</span></span><textarea required maxLength={10000} rows={7} value={form.description} onChange={(event) => update('description', event.target.value)} className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm leading-6 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white" placeholder="อธิบายอาการ ปัญหา หรือรายละเอียดการติดตั้งที่ต้องการ" /></label>

          <div className="sm:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">รูปภาพ / ไฟล์แนบ <span className="font-normal text-slate-400">(ไม่บังคับ)</span></span>
            <input ref={fileInputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={selectFiles} />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isSubmitting || files.length >= MAX_ATTACHMENT_FILES} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm font-semibold text-slate-600 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-300"><Paperclip className="h-4 w-4" />แนบรูป / ไฟล์</button>
            {files.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{files.map((file, index) => <div key={`${file.name}-${index}`} className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">{String(file.type || '').startsWith('image/') ? <ImageIcon className="h-5 w-5 shrink-0 text-indigo-500" /> : <FileText className="h-5 w-5 shrink-0 text-slate-500" />}<span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-700 dark:text-slate-200">{file.name}</strong><span className="text-[11px] text-slate-400">{formatFileSize(file.size)}</span></span><button type="button" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`นำไฟล์ ${file.name} ออก`}><X className="h-4 w-4" /></button></div>)}</div>}
          </div>
        </div>

        <div className="mt-6 flex justify-end"><button type="submit" disabled={isSubmitting} className="app-primary-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold text-white shadow-md disabled:opacity-60">{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{isSubmitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอ'}</button></div>
      </form>
    </section>
  )
}

export default FacilitiesRequestForm
