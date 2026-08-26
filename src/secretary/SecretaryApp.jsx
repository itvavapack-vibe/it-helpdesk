import { useEffect, useMemo, useState } from 'react'
import {
  ClipboardList,
  ClipboardPlus,
  Eye,
  EyeOff,
  LayoutDashboard,
  LayoutGrid,
  Loader2,
  LockKeyhole,
  LogOut,
  Menu,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import ThemePicker from '../components/ThemePicker'
import { CENTER_PATH } from '../config/appPaths'
import SecretaryDashboard from './SecretaryDashboard'
import SecretaryDepartmentOverview from './SecretaryDepartmentOverview'
import SecretaryIssueForm from './SecretaryIssueForm'
import SecretaryIssueList from './SecretaryIssueList'
import SecretaryUserManagement from './SecretaryUserManagement'
import { secretaryGetMe, secretaryLogin } from './secretaryApi'
import { isSecretaryReceiverRole, isSecretarySuperAdmin, SECRETARY_AUTH_STORAGE_KEY, SECRETARY_ROLE_LABELS } from './secretaryConstants'

const SECRETARY_SIDEBAR_STORAGE_KEY = 'secretary-sidebar-collapsed'

const readStoredAuth = () => {
  try {
    const auth = JSON.parse(localStorage.getItem(SECRETARY_AUTH_STORAGE_KEY) || 'null')
    return auth?.token ? auth : null
  } catch {
    return null
  }
}

const SecretaryLogin = ({ onLogin }) => {
  const [credentials, setCredentials] = useState({ username: '', password: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)
    setError('')
    try {
      onLogin(await secretaryLogin(credentials))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen text-slate-800 dark:text-slate-100">
      <header className="glass-panel border-b border-white/50 dark:border-slate-700/60">
        <div className="mx-auto flex min-h-18 w-full max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
          <button type="button" onClick={() => window.location.assign(CENTER_PATH)} className="flex min-w-0 items-center gap-3 text-left">
            <img src="/vava-pack-logo.png" width="469" height="346" alt="VAVA PACK" className="h-12 w-16 shrink-0 object-contain sm:h-14 sm:w-20" />
            <span className="min-w-0 border-l border-slate-300 pl-3 dark:border-slate-600">
              <strong className="block truncate text-sm font-bold text-slate-900 dark:text-white">Secretary Center</strong>
              <span className="block truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">ISSUE REPORTING</span>
            </span>
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => window.location.assign(CENTER_PATH)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300" title="App Center" aria-label="App Center"><LayoutGrid className="h-5 w-5" /></button>
            <ThemePicker />
          </div>
        </div>
      </header>
      <main className="mx-auto grid min-h-[calc(100vh-4.5rem)] w-full max-w-7xl place-items-center px-4 py-10 sm:px-6">
        <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900/90 sm:p-8">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300"><LockKeyhole className="h-7 w-7" /></span>
          <h1 className="mt-5 text-center text-2xl font-bold text-slate-900 dark:text-white">เข้าสู่ระบบ Secretary</h1>
          <p className="mt-1 text-center text-sm text-slate-500 dark:text-slate-400">ระบบติดตามปัญหาของแต่ละแผนก</p>
          {error && <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>}
          <div className="mt-6 space-y-4">
            <label><span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">ชื่อผู้ใช้</span><input autoFocus required autoComplete="username" value={credentials.username} onChange={(event) => setCredentials((current) => ({ ...current, username: event.target.value }))} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950/60" /></label>
            <label>
              <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">รหัสผ่าน</span>
              <span className="relative block">
                <input type={isPasswordVisible ? 'text' : 'password'} required autoComplete="current-password" value={credentials.password} onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 pr-12 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950/60" />
                <button
                  type="button"
                  onClick={() => setIsPasswordVisible((current) => !current)}
                  className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-indigo-300"
                  title={isPasswordVisible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  aria-label={isPasswordVisible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  aria-pressed={isPasswordVisible}
                >
                  {isPasswordVisible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </span>
            </label>
          </div>
          <button type="submit" disabled={isSubmitting} className="app-primary-button mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white shadow-md disabled:opacity-60">{isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}เข้าสู่ระบบ</button>
        </form>
      </main>
    </div>
  )
}

const SecretaryApp = () => {
  const [auth, setAuth] = useState(readStoredAuth)
  const [isValidating, setIsValidating] = useState(Boolean(auth))
  const [activeTab, setActiveTab] = useState(null)
  const [issueStatusPreset, setIssueStatusPreset] = useState('')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => localStorage.getItem(SECRETARY_SIDEBAR_STORAGE_KEY) === 'true')
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Secretary Center | VAVA PACK'
    const checkDarkMode = () => {
      const hour = new Date().getHours()
      document.documentElement.classList.toggle('dark', hour >= 18 || hour < 6)
    }
    checkDarkMode()
    const intervalId = window.setInterval(checkDarkMode, 60 * 1000)
    return () => {
      window.clearInterval(intervalId)
      document.title = previousTitle
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(SECRETARY_SIDEBAR_STORAGE_KEY, String(isSidebarCollapsed))
  }, [isSidebarCollapsed])

  useEffect(() => {
    if (!auth?.token) {
      setIsValidating(false)
      return
    }
    let active = true
    secretaryGetMe()
      .then((profile) => {
        if (!active) return
        const nextAuth = { ...auth, ...profile }
        localStorage.setItem(SECRETARY_AUTH_STORAGE_KEY, JSON.stringify(nextAuth))
        setAuth(nextAuth)
      })
      .catch(() => {
        if (!active) return
        localStorage.removeItem(SECRETARY_AUTH_STORAGE_KEY)
        setAuth(null)
      })
      .finally(() => { if (active) setIsValidating(false) })
    return () => { active = false }
  }, [auth?.token])

  useEffect(() => {
    if (!auth?.role) return
    const allowedTabs = isSecretarySuperAdmin(auth.role)
      ? ['dashboard', 'department-overview', 'issues', 'users', 'report', 'tracking']
      : isSecretaryReceiverRole(auth.role)
        ? ['dashboard', 'department-overview', 'issues', 'report', 'tracking']
        : ['report', 'tracking']
    setActiveTab((current) => allowedTabs.includes(current) ? current : allowedTabs[0])
  }, [auth?.role])

  const navGroups = useMemo(() => {
    const reporterItems = [
      { id: 'report', label: 'แจ้งปัญหา', icon: ClipboardPlus },
      { id: 'tracking', label: 'ติดตามสถานะ', icon: ClipboardList },
    ]
    if (!isSecretaryReceiverRole(auth?.role)) return [{ id: 'reporter', label: 'ฝั่งผู้แจ้ง', items: reporterItems }]
    return [
      {
        id: 'receiver',
        label: 'ฝั่งผู้รับแจ้ง',
        items: [
          { id: 'dashboard', label: 'แดชบอร์ด', icon: LayoutDashboard },
          { id: 'department-overview', label: 'แผนผังภาพรวม', icon: Network, isChild: true },
          { id: 'issues', label: 'รายการปัญหา', icon: ClipboardList },
          ...(isSecretarySuperAdmin(auth?.role) ? [{ id: 'users', label: 'จัดการผู้ใช้', icon: Users }] : []),
        ],
      },
      { id: 'reporter', label: 'ฝั่งผู้แจ้ง', items: reporterItems },
    ]
  }, [auth?.role])

  const login = (loginAuth) => {
    localStorage.setItem(SECRETARY_AUTH_STORAGE_KEY, JSON.stringify(loginAuth))
    setAuth(loginAuth)
    setActiveTab(isSecretaryReceiverRole(loginAuth.role) ? 'dashboard' : 'report')
  }

  const logout = () => {
    localStorage.removeItem(SECRETARY_AUTH_STORAGE_KEY)
    setAuth(null)
    setActiveTab(null)
  }

  const selectTab = (tabId) => {
    setIssueStatusPreset('')
    setActiveTab(tabId)
    setIsMobileSidebarOpen(false)
  }

  const openIssues = (status = '') => {
    setIssueStatusPreset(status)
    setActiveTab(isSecretaryReceiverRole(auth.role) ? 'issues' : 'tracking')
  }

  const openReporterTracking = (status = '') => {
    setIssueStatusPreset(status)
    setActiveTab('tracking')
  }

  if (isValidating) return <div className="grid min-h-screen place-items-center"><Loader2 className="h-9 w-9 animate-spin text-indigo-500" /></div>
  if (!auth) return <SecretaryLogin onLogin={login} />

  return (
    <div className="min-h-screen text-slate-800 dark:text-slate-100">
      {isMobileSidebarOpen && <button type="button" className="fixed inset-0 z-[65] bg-slate-950/45 backdrop-blur-sm xl:hidden" onClick={() => setIsMobileSidebarOpen(false)} aria-label="ปิดเมนู" />}

      <aside className={`fixed inset-y-0 left-0 z-[70] flex w-72 flex-col border-r border-slate-200/80 bg-white/95 px-4 py-5 shadow-xl shadow-slate-200/50 backdrop-blur-xl transition-[width,transform] duration-300 dark:border-slate-800 dark:bg-slate-950/95 dark:shadow-slate-950/40 ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'} xl:translate-x-0 ${isSidebarCollapsed ? 'xl:w-20 xl:px-2' : 'xl:w-72 xl:px-4'}`}>
        <div className={`flex items-center border-b border-slate-100 pb-5 dark:border-slate-800 ${isSidebarCollapsed ? 'xl:justify-center' : 'gap-3 px-2'}`}>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white shadow-md"><ClipboardList className="h-5 w-5" /></span>
          <div className={`min-w-0 ${isSidebarCollapsed ? 'xl:hidden' : ''}`}>
            <strong className="block truncate text-sm font-bold text-slate-900 dark:text-white">Secretary Center</strong>
            <span className="block truncate text-[10px] font-medium text-slate-500 dark:text-slate-400">ISSUE REPORTING</span>
          </div>
          <button type="button" onClick={() => setIsMobileSidebarOpen(false)} className="ml-auto grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900 xl:hidden" aria-label="ปิดเมนู"><X className="h-5 w-5" /></button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto py-5">
          {navGroups.map((group) => (
            <section key={group.id}>
              <p className={`px-3 pb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 ${isSidebarCollapsed ? 'xl:hidden' : ''}`}>{group.label}</p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isSelected = activeTab === item.id
                  return (
                    <button key={item.id} type="button" onClick={() => selectTab(item.id)} title={isSidebarCollapsed ? item.label : undefined} className={`flex w-full min-w-0 items-center rounded-xl py-2.5 text-left transition-colors ${isSidebarCollapsed ? `${item.isChild ? 'gap-3 px-3 pl-10' : 'gap-3 px-3'} xl:justify-center xl:px-2` : item.isChild ? 'gap-3 px-3 pl-10' : 'gap-3 px-3'} ${isSelected ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:bg-indigo-500 dark:shadow-indigo-950/40' : 'text-slate-600 hover:bg-slate-100 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-indigo-300'}`}>
                      <Icon className={`${item.isChild ? 'h-4 w-4' : 'h-5 w-5'} shrink-0`} />
                      <span className={`truncate text-sm font-semibold ${isSidebarCollapsed ? 'xl:hidden' : ''}`}>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </nav>

        <div className="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className={`flex min-w-0 items-center rounded-xl bg-slate-50 py-3 dark:bg-slate-900 ${isSidebarCollapsed ? 'xl:justify-center xl:px-2' : 'gap-3 px-3'}`} title={isSidebarCollapsed ? auth.name : undefined}>
            <UserRound className="h-5 w-5 shrink-0 text-indigo-500" />
            <div className={`min-w-0 ${isSidebarCollapsed ? 'xl:hidden' : ''}`}><strong className="block truncate text-sm text-slate-800 dark:text-slate-100">{auth.name}</strong><span className="block truncate text-xs text-slate-500">{SECRETARY_ROLE_LABELS[auth.role]}</span></div>
          </div>
          <div className={`flex gap-2 ${isSidebarCollapsed ? 'xl:flex-col xl:items-center' : ''}`}>
            <button type="button" onClick={() => window.location.assign(CENTER_PATH)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300" title="App Center" aria-label="App Center"><LayoutGrid className="h-5 w-5" /></button>
            <div className={`min-w-0 flex-1 ${isSidebarCollapsed ? 'xl:w-10 xl:flex-none' : ''}`}><ThemePicker variant="sidebar" isCollapsed={isSidebarCollapsed} /></div>
            <button type="button" onClick={logout} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/30" title="ออกจากระบบ" aria-label="ออกจากระบบ"><LogOut className="h-5 w-5" /></button>
          </div>
          <button type="button" onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)} className="hidden h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-slate-900 xl:flex" title={isSidebarCollapsed ? 'ขยาย sidebar' : 'ย่อ sidebar'} aria-label={isSidebarCollapsed ? 'ขยาย sidebar' : 'ย่อ sidebar'}>
            {isSidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <><PanelLeftClose className="h-5 w-5" /><span>ย่อ sidebar</span></>}
          </button>
        </div>
      </aside>

      <header className="glass-panel fixed inset-x-0 top-0 z-[60] flex min-h-16 items-center justify-between border-b border-white/50 px-4 dark:border-slate-700/60 xl:hidden">
        <button type="button" onClick={() => setIsMobileSidebarOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300" aria-label="เปิดเมนู"><Menu className="h-5 w-5" /></button>
        <strong className="truncate px-3 text-sm font-bold text-slate-900 dark:text-white">Secretary Center</strong>
        <ThemePicker />
      </header>

      <main className={`min-h-screen w-full px-4 pb-8 pt-24 transition-[margin,width] duration-300 sm:px-6 xl:pt-8 ${isSidebarCollapsed ? 'xl:ml-20 xl:w-[calc(100%-5rem)]' : 'xl:ml-72 xl:w-[calc(100%-18rem)]'}`}>
        <div className="mx-auto w-full max-w-[1450px]">
          {activeTab === 'dashboard' && <SecretaryDashboard onOpenIssues={openIssues} />}
          {activeTab === 'department-overview' && <SecretaryDepartmentOverview />}
          {activeTab === 'report' && <SecretaryIssueForm auth={auth} onCreated={() => openReporterTracking('Pending')} />}
          {activeTab === 'issues' && <SecretaryIssueList key="receiver-issues" auth={auth} initialStatus={issueStatusPreset} />}
          {activeTab === 'tracking' && <SecretaryIssueList key="reporter-tracking" auth={auth} initialStatus={issueStatusPreset} mineOnly />}
          {activeTab === 'users' && isSecretarySuperAdmin(auth.role) && <SecretaryUserManagement auth={auth} />}
        </div>
      </main>
    </div>
  )
}

export default SecretaryApp
