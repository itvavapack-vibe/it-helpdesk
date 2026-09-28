import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, Pencil, Plus, Search, Trash2, UserRound, X } from 'lucide-react'
import { facilitiesCreateUser, facilitiesDeleteUser, facilitiesListUsers, facilitiesUpdateUser } from './facilitiesApi'
import { FACILITIES_BRANCHES, FACILITIES_ROLE_LABELS } from './facilitiesConstants'

const blankForm = () => ({ username: '', password: '', name: '', department: '', branch: '', role: 'requester', active: true })

const FacilitiesUserManagement = ({ auth }) => {
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blankForm)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState(null)

  const load = async () => {
    setIsLoading(true)
    try { setUsers(await facilitiesListUsers()) }
    catch (error) { setMessage({ type: 'error', text: error.message }) }
    finally { setIsLoading(false) }
  }
  useEffect(() => { load() }, [])

  const openCreate = () => { setEditing({ id: null }); setForm(blankForm()); setMessage(null) }
  const openEdit = (user) => { setEditing(user); setForm({ username: user.username, password: '', name: user.name, department: user.department, branch: user.branch || '', role: user.role, active: user.active }); setMessage(null) }
  const close = () => { if (!isSaving) setEditing(null) }
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  const save = async (event) => {
    event.preventDefault()
    setIsSaving(true)
    setMessage(null)
    try {
      const saved = editing.id ? await facilitiesUpdateUser(editing.id, form) : await facilitiesCreateUser(form)
      setUsers((current) => editing.id ? current.map((user) => user.id === saved.id ? saved : user) : [...current, saved].sort((a, b) => a.name.localeCompare(b.name, 'th')))
      setEditing(null)
      setMessage({ type: 'success', text: editing.id ? 'บันทึกข้อมูลผู้ใช้งานแล้ว' : 'เพิ่มผู้ใช้งานแล้ว' })
    } catch (error) { setMessage({ type: 'error', text: error.message }) }
    finally { setIsSaving(false) }
  }

  const remove = async (user) => {
    if (!window.confirm(`ยืนยันลบผู้ใช้ ${user.name}?`)) return
    setMessage(null)
    try { await facilitiesDeleteUser(user.id); setUsers((current) => current.filter((item) => item.id !== user.id)); setMessage({ type: 'success', text: 'ลบผู้ใช้งานแล้ว' }) }
    catch (error) { setMessage({ type: 'error', text: error.message }) }
  }

  const query = search.trim().toLocaleLowerCase('th')
  const filtered = users.filter((user) => !query || [user.username, user.name, user.department, user.branch, FACILITIES_ROLE_LABELS[user.role]].some((value) => String(value || '').toLocaleLowerCase('th').includes(query)))

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold text-indigo-600 dark:text-indigo-300">HR ACCESS CONTROL</p><h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">จัดการผู้ใช้งาน</h2><p className="mt-1 text-sm text-slate-500">กำหนดผู้แจ้งงาน เจ้าหน้าที่ธุรการ และผู้ดูแลระบบ HR</p></div><button type="button" onClick={openCreate} className="app-primary-button flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold text-white"><Plus className="h-4 w-4" />เพิ่มผู้ใช้</button></div>
      {message && <div className={`mb-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>{message.type === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4" /> : <AlertCircle className="mt-0.5 h-4 w-4" />}<span>{message.text}</span></div>}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/80"><label className="relative block max-w-md"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white" placeholder="ค้นหาชื่อ ผู้ใช้ แผนก หรือสาขา" /></label></div>
      {isLoading ? <div className="grid min-h-64 place-items-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div> : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/80"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs font-bold text-slate-500 dark:bg-slate-800/80"><tr><th className="px-4 py-3">ผู้ใช้งาน</th><th className="px-4 py-3">แผนก / สาขา</th><th className="px-4 py-3">สิทธิ์</th><th className="px-4 py-3">สถานะ</th><th className="px-4 py-3 text-right">จัดการ</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{filtered.map((user) => <tr key={user.id}><td className="px-4 py-4"><span className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50"><UserRound className="h-4 w-4" /></span><span><strong className="block text-slate-800 dark:text-slate-100">{user.name}</strong><span className="text-xs text-slate-500">{user.username}</span></span></span></td><td className="px-4 py-4"><strong className="block text-slate-700 dark:text-slate-200">{user.department}</strong><span className="text-xs text-slate-500">{user.branch || '-'}</span></td><td className="px-4 py-4 font-semibold text-indigo-600 dark:text-indigo-300">{FACILITIES_ROLE_LABELS[user.role]}</td><td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${user.active ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{user.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</span></td><td className="px-4 py-4"><span className="flex justify-end gap-1"><button type="button" onClick={() => openEdit(user)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-indigo-50 hover:text-indigo-600" aria-label={`แก้ไข ${user.name}`}><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => remove(user)} disabled={user.id === auth.id} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30" aria-label={`ลบ ${user.name}`}><Trash2 className="h-4 w-4" /></button></span></td></tr>)}</tbody></table></div>{!filtered.length && <p className="p-10 text-center text-sm text-slate-500">ไม่พบผู้ใช้งาน</p>}</div>}

      {editing && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}><form onSubmit={save} className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl"><div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-900"><h3 className="text-lg font-bold">{editing.id ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มผู้ใช้งาน'}</h3><button type="button" onClick={close} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="ปิด"><X className="h-5 w-5" /></button></div><div className="grid gap-4 p-5 sm:grid-cols-2">
        <label><span className="mb-2 block text-sm font-semibold">ชื่อผู้ใช้ <span className="text-rose-500">*</span></span><input required maxLength={120} value={form.username} onChange={(event) => update('username', event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white" /></label>
        <label><span className="mb-2 block text-sm font-semibold">รหัสผ่าน {editing.id ? <span className="font-normal text-slate-400">(เว้นว่างถ้าไม่เปลี่ยน)</span> : <span className="text-rose-500">*</span>}</span><input type="password" required={!editing.id} value={form.password} onChange={(event) => update('password', event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white" /><span className="mt-1 block text-xs text-slate-400">อย่างน้อย 8 ตัว มี A-Z, a-z, ตัวเลข และอักขระพิเศษ</span></label>
        <label className="sm:col-span-2"><span className="mb-2 block text-sm font-semibold">ชื่อ-นามสกุล <span className="text-rose-500">*</span></span><input required value={form.name} onChange={(event) => update('name', event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white" /></label>
        <label><span className="mb-2 block text-sm font-semibold">แผนก <span className="text-rose-500">*</span></span><input required value={form.department} onChange={(event) => update('department', event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white" /></label>
        <label><span className="mb-2 block text-sm font-semibold">สาขา</span><select value={form.branch} onChange={(event) => update('branch', event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"><option value="">ไม่ระบุ</option>{FACILITIES_BRANCHES.map((branch) => <option key={branch} value={branch}>{branch}</option>)}</select></label>
        <label><span className="mb-2 block text-sm font-semibold">สิทธิ์</span><select value={form.role} onChange={(event) => update('role', event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white">{Object.entries(FACILITIES_ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><input type="checkbox" checked={form.active} onChange={(event) => update('active', event.target.checked)} className="h-4 w-4" /><span className="text-sm font-semibold">เปิดใช้งานบัญชี</span></label>
      </div><div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-700"><button type="button" onClick={close} className="h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold">ยกเลิก</button><button type="submit" disabled={isSaving} className="app-primary-button flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold text-white disabled:opacity-60">{isSaving && <Loader2 className="h-4 w-4 animate-spin" />}บันทึก</button></div></form></div>}
    </section>
  )
}

export default FacilitiesUserManagement
