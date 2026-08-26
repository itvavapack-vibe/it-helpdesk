import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import Swal from 'sweetalert2'
import { Download, FileSpreadsheet, Loader2, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react'
import { PASSWORD_POLICY_TEXT } from '../../shared/passwordPolicy'
import {
  secretaryCreateUser,
  secretaryDeleteUser,
  secretaryImportUsers,
  secretaryListUsers,
  secretaryUpdateUser,
} from './secretaryApi'
import { SECRETARY_BRANCH_OPTIONS, SECRETARY_DEPARTMENT_OPTIONS, SECRETARY_ROLE_LABELS } from './secretaryConstants'

const emptyUserForm = () => ({
  username: '',
  password: '',
  name: '',
  department: '',
  branch: '',
  role: 'reporter',
  active: true,
})

const pickValue = (row, keys) => {
  const entry = Object.entries(row).find(([key]) => keys.includes(String(key).trim().toLowerCase()))
  return entry?.[1] ?? ''
}

const normalizeImportedRole = (value) => {
  const role = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (role === 'super_admin' || role.includes('superadmin') || role.includes('ซูเปอร์แอดมิน')) return 'super_admin'
  if (role === 'receiver' || role.includes('ผู้รับ')) return 'receiver'
  return 'reporter'
}

const SecretaryUserManagement = ({ auth }) => {
  const [users, setUsers] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingUser, setEditingUser] = useState(null)
  const [form, setForm] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef(null)

  const loadUsers = async () => {
    setIsLoading(true)
    setError('')
    try {
      setUsers(await secretaryListUsers())
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  const filteredUsers = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase('th')
    if (!query) return users
    return users.filter((user) => [user.username, user.name, user.department, user.branch, SECRETARY_ROLE_LABELS[user.role]]
      .some((value) => String(value || '').toLocaleLowerCase('th').includes(query)))
  }, [searchTerm, users])

  const openCreate = () => {
    setEditingUser(null)
    setForm(emptyUserForm())
  }

  const openEdit = (user) => {
    setEditingUser(user)
    setForm({
      username: user.username,
      password: '',
      name: user.name,
      department: user.department,
      branch: user.branch || '',
      role: user.role,
      active: Boolean(user.active),
    })
  }

  const closeModal = () => {
    setEditingUser(null)
    setForm(null)
  }

  const saveUser = async (event) => {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    try {
      if (editingUser) await secretaryUpdateUser(editingUser.id, form)
      else await secretaryCreateUser(form)
      closeModal()
      await loadUsers()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSaving(false)
    }
  }

  const removeUser = async (user) => {
    const result = await Swal.fire({
      title: 'ลบผู้ใช้นี้?',
      text: `${user.name} (${user.username})`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ลบผู้ใช้',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#e11d48',
    })
    if (!result.isConfirmed) return
    setError('')
    try {
      await secretaryDeleteUser(user.id)
      await loadUsers()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const exportTemplate = () => {
    const rows = [{
      username: 'manager.sales',
      password: 'Manager@123',
      name: 'ตัวอย่าง ผู้จัดการ',
      department: 'การตลาดและขาย(ในประเทศ)',
      branch: SECRETARY_BRANCH_OPTIONS[0],
      role: 'reporter',
      active: true,
    }]
    const worksheet = XLSX.utils.json_to_sheet(rows)
    worksheet['!cols'] = [22, 22, 30, 28, 34, 16, 12].map((wch) => ({ wch }))
    const departmentWorksheet = XLSX.utils.json_to_sheet(
      SECRETARY_DEPARTMENT_OPTIONS.map((department) => ({ department })),
    )
    departmentWorksheet['!cols'] = [{ wch: 36 }]
    const branchWorksheet = XLSX.utils.json_to_sheet(
      SECRETARY_BRANCH_OPTIONS.map((branch) => ({ branch })),
    )
    branchWorksheet['!cols'] = [{ wch: 38 }]
    const roleWorksheet = XLSX.utils.json_to_sheet([
      { role: 'reporter', description: 'ผู้แจ้งปัญหา' },
      { role: 'receiver', description: 'ผู้รับแจ้ง / เลขานุการ' },
      { role: 'super_admin', description: 'Super Admin' },
    ])
    roleWorksheet['!cols'] = [{ wch: 20 }, { wch: 32 }]
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Users')
    XLSX.utils.book_append_sheet(workbook, departmentWorksheet, 'Departments')
    XLSX.utils.book_append_sheet(workbook, branchWorksheet, 'Branches')
    XLSX.utils.book_append_sheet(workbook, roleWorksheet, 'Roles')
    XLSX.writeFile(workbook, 'Secretary_User_Import_Template.xlsx')
  }

  const importFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setIsImporting(true)
    setError('')
    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
      const rows = rawRows.map((row) => {
        const roleValue = String(pickValue(row, ['role', 'สิทธิ์', 'บทบาท'])).trim().toLowerCase()
        const activeValue = pickValue(row, ['active', 'สถานะใช้งาน', 'ใช้งาน'])
        return {
          username: pickValue(row, ['username', 'ชื่อผู้ใช้', 'user']),
          password: pickValue(row, ['password', 'รหัสผ่าน']),
          name: pickValue(row, ['name', 'ชื่อ-สกุล', 'ชื่อสกุล']),
          department: pickValue(row, ['department', 'แผนก']),
          branch: pickValue(row, ['branch', 'สาขา']),
          role: normalizeImportedRole(roleValue),
          active: !['false', '0', 'no', 'ไม่ใช้งาน'].includes(String(activeValue).trim().toLowerCase()),
        }
      }).filter((row) => String(row.username).trim())
      const result = await secretaryImportUsers(rows)
      await Swal.fire({
        icon: 'success',
        title: 'นำเข้าผู้ใช้เรียบร้อย',
        text: `เพิ่ม ${result.inserted} รายการ อัปเดต ${result.updated} รายการ`,
        confirmButtonText: 'ตกลง',
      })
      await loadUsers()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsImporting(false)
    }
  }

  const showModal = form !== null

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-indigo-600 dark:text-indigo-300">USER MANAGEMENT</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">จัดการผู้ใช้งาน</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportTemplate} className="flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"><Download className="h-4 w-4" />Export Template</button>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isImporting} className="flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">{isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Import Excel</button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importFile} />
          <button type="button" onClick={openCreate} className="app-primary-button flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold text-white shadow-md"><Plus className="h-4 w-4" />เพิ่มผู้ใช้</button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>}

      <div className="mb-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
        <Search className="h-5 w-5 shrink-0 text-slate-400" />
        <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="h-9 min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-white" placeholder="ค้นหาชื่อผู้ใช้ ชื่อ แผนก สาขา หรือสิทธิ์" />
        <span className="shrink-0 text-xs text-slate-500">{filteredUsers.length} คน</span>
      </div>

      {isLoading ? <div className="grid min-h-64 place-items-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div> : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-500 dark:bg-slate-800/80 dark:text-slate-400"><tr><th className="px-4 py-3">ผู้ใช้งาน</th><th className="px-4 py-3">แผนก</th><th className="px-4 py-3">สาขา</th><th className="px-4 py-3">สิทธิ์</th><th className="px-4 py-3">สถานะ</th><th className="px-4 py-3 text-right">จัดการ</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/45">
                    <td className="px-4 py-4"><strong className="block text-slate-800 dark:text-slate-100">{user.name}</strong><span className="mt-1 block text-xs text-slate-500">{user.username}{Number(auth.id) === Number(user.id) ? ' · บัญชีปัจจุบัน' : ''}</span></td>
                    <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{user.department}</td>
                    <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{user.branch || '-'}</td>
                    <td className="px-4 py-4"><span className="rounded-lg bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">{SECRETARY_ROLE_LABELS[user.role] || user.role}</span></td>
                    <td className="px-4 py-4"><span className={`inline-flex items-center gap-1.5 text-xs font-bold ${user.active ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-400'}`}><span className={`h-2 w-2 rounded-full ${user.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />{user.active ? 'ใช้งาน' : 'ปิดใช้งาน'}{user.locked_at ? ' · ถูกล็อก' : ''}</span></td>
                    <td className="px-4 py-4"><div className="flex justify-end gap-1"><button type="button" onClick={() => openEdit(user)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/40" title="แก้ไข"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => removeUser(user)} disabled={Number(auth.id) === Number(user.id)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-rose-950/40" title="ลบ"><Trash2 className="h-4 w-4" /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filteredUsers.length && <div className="grid min-h-48 place-items-center text-center text-sm text-slate-500"><div><FileSpreadsheet className="mx-auto mb-2 h-8 w-8 text-slate-400" />ไม่พบผู้ใช้</div></div>}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal() }}>
          <form onSubmit={saveUser} className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:rounded-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"><h3 className="text-lg font-bold text-slate-900 dark:text-white">{editingUser ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้'}</h3><button type="button" onClick={closeModal} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="ปิด"><X className="h-5 w-5" /></button></div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <label><span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Username <span className="text-rose-500">*</span></span><input required pattern="[A-Za-z0-9._-]{3,120}" value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white" /></label>
              <label><span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">รหัสผ่าน {!editingUser && <span className="text-rose-500">*</span>}</span><input type="password" required={!editingUser} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white" placeholder={editingUser ? 'เว้นว่างหากไม่เปลี่ยน' : ''} /><span className="mt-1 block text-[11px] leading-4 text-slate-500">{PASSWORD_POLICY_TEXT}</span></label>
              <label><span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">ชื่อ-สกุล <span className="text-rose-500">*</span></span><input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white" /></label>
              <label>
                <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">แผนก <span className="text-rose-500">*</span></span>
                <select required value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white">
                  <option value="" disabled>เลือกแผนก</option>
                  {form.department && !SECRETARY_DEPARTMENT_OPTIONS.includes(form.department) && (
                    <option value={form.department}>{form.department}</option>
                  )}
                  {SECRETARY_DEPARTMENT_OPTIONS.map((department) => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">สาขา <span className="text-rose-500">*</span></span>
                <select required value={form.branch} onChange={(event) => setForm((current) => ({ ...current, branch: event.target.value }))} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white">
                  <option value="" disabled>เลือกสาขา</option>
                  {SECRETARY_BRANCH_OPTIONS.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
                </select>
              </label>
              <label><span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">สิทธิ์</span><select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"><option value="reporter">ผู้แจ้งปัญหา</option><option value="receiver">ผู้รับแจ้ง / เลขานุการ</option><option value="super_admin">Super Admin</option></select></label>
              <label className="flex min-h-11 items-center gap-3 self-end rounded-xl border border-slate-200 px-3 dark:border-slate-700"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} className="h-4 w-4 accent-indigo-600" /><span className="text-sm font-semibold text-slate-700 dark:text-slate-200">เปิดใช้งานบัญชี</span></label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-700"><button type="button" onClick={closeModal} className="h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">ยกเลิก</button><button type="submit" disabled={isSaving} className="app-primary-button flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold text-white disabled:opacity-60">{isSaving && <Loader2 className="h-4 w-4 animate-spin" />}บันทึก</button></div>
          </form>
        </div>
      )}
    </section>
  )
}

export default SecretaryUserManagement
