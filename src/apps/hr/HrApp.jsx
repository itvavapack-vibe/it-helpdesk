/* Hallmark · macrostructure: Workbench · genre: modern-minimal · theme: existing HR/indigo · nav: N3 side-rail · footer: authenticated shell
 * audience: VAVA PACK employees and administration staff · use: submit and complete facilities work · tone: utilitarian
 * pre-emit critique: P5 H4 E4 S5 R5 V4
 */
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Building2, CalendarDays, Car, ClipboardList, ClipboardPlus, Eye, EyeOff, Home, LayoutDashboard, LayoutGrid, Loader2, LockKeyhole, Search, Users } from 'lucide-react'
import SystemAppShell from '@/shared/system-ui/SystemAppShell'
import ThemePicker from '@/shared/system-ui/ThemePicker'
import { CENTER_PATH } from '@/config/appPaths'
import FacilitiesDashboard from './facilities/FacilitiesDashboard'
import FacilitiesRequestForm from './facilities/FacilitiesRequestForm'
import FacilitiesRequestManagement from './facilities/FacilitiesRequestManagement'
import FacilitiesUserManagement from './facilities/FacilitiesUserManagement'
import FacilitiesPublicHome from './facilities/FacilitiesPublicHome'
import FacilitiesPublicTracking from './facilities/FacilitiesPublicTracking'
import { facilitiesGetMe, facilitiesLogin } from './facilities/facilitiesApi'
import { FACILITIES_AUTH_STORAGE_KEY, FACILITIES_ROLE_LABELS } from './facilities/facilitiesConstants'

const readStoredAuth = () => {
  try { const auth = JSON.parse(localStorage.getItem(FACILITIES_AUTH_STORAGE_KEY) || 'null'); return auth?.token ? auth : null }
  catch { return null }
}

const PUBLIC_PATHS = { home: '/hr', request: '/hr/request', tracking: '/hr/track', meeting: '/hr/meeting-rooms', vehicle: '/hr/vehicles' }
const getPublicPage = () => {
  const path = window.location.pathname.replace(/\/+$/, '').toLowerCase() || '/hr'
  if (path === '/hr/request') return 'request'
  if (path === '/hr/track') return 'tracking'
  if (path === '/hr/meeting-rooms') return 'meeting'
  if (path === '/hr/vehicles') return 'vehicle'
  return 'home'
}

const HrLogin = ({ onLogin, onBack }) => {
  const [credentials, setCredentials] = useState({ username: '', password: '' })
  const [visible, setVisible] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)
    setError('')
    try { onLogin(await facilitiesLogin(credentials)) }
    catch (requestError) { setError(requestError.message) }
    finally { setIsSubmitting(false) }
  }
  return <div className="ta-shell min-h-screen text-slate-800 dark:text-slate-100">
    <header className="ta-topbar border-b"><div className="mx-auto flex min-h-18 w-full max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8"><button type="button" onClick={() => window.location.assign(CENTER_PATH)} className="flex min-w-0 items-center gap-3 text-left"><img src="/vava-pack-logo.png" width="469" height="346" alt="VAVA PACK" className="h-12 w-16 shrink-0 object-contain sm:h-14 sm:w-20" /><span className="min-w-0 border-l border-slate-300 pl-3 dark:border-slate-600"><strong className="block truncate text-sm font-bold text-slate-900 dark:text-white">HR Center</strong><span className="block truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">ADMINISTRATION SERVICES</span></span></button><div className="flex items-center gap-2"><button type="button" onClick={() => window.location.assign(CENTER_PATH)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300" aria-label="App Center"><LayoutGrid className="h-5 w-5" /></button><ThemePicker /></div></div></header>
    <main className="mx-auto grid min-h-[calc(100vh-4.5rem)] w-full max-w-7xl place-items-center px-4 py-10 sm:px-6"><form onSubmit={submit} className="ta-card w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:p-8"><span className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300"><LockKeyhole className="h-7 w-7" /></span><h1 className="mt-5 text-center text-2xl font-bold text-slate-900 dark:text-white">เข้าสู่ระบบ HR Center</h1><p className="mt-1 text-center text-sm text-slate-500 dark:text-slate-400">สำหรับเจ้าหน้าที่และผู้ดูแลระบบ</p>{error && <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}<div className="mt-6 space-y-4"><label><span className="mb-2 block text-sm font-semibold">ชื่อผู้ใช้</span><input autoFocus required autoComplete="username" value={credentials.username} onChange={(event) => setCredentials((current) => ({ ...current, username: event.target.value }))} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white" /></label><label><span className="mb-2 block text-sm font-semibold">รหัสผ่าน</span><span className="relative block"><input type={visible ? 'text' : 'password'} required autoComplete="current-password" value={credentials.password} onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 pr-12 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white" /><button type="button" onClick={() => setVisible((value) => !value)} className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label={visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}>{visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></span></label></div><button type="submit" disabled={isSubmitting} className="app-primary-button mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white disabled:opacity-60">{isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}เข้าสู่ระบบ</button><button type="button" onClick={onBack} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><ArrowLeft className="h-4 w-4" />กลับหน้า HR Center</button></form></main>
  </div>
}

const HrPublicPortal = ({ activePage, onNavigate, onOpenLogin, trackingSeed }) => {
  const navItems = [
    { id: 'home', label: 'หน้าแรก', icon: Home },
    { id: 'request', label: 'ระบบแจ้งซ่อมธุรการ', icon: ClipboardPlus },
    { id: 'tracking', label: 'ติดตามสถานะ', icon: Search },
    { id: 'meeting', label: 'ระบบจองห้องประชุม', icon: CalendarDays },
    { id: 'vehicle', label: 'ระบบจองรถธุรการ', icon: Car },
  ]
  return <SystemAppShell
    brand="HR CENTER"
    brandCaption="ADMINISTRATION SERVICES"
    brandIcon={Building2}
    navItems={navItems}
    activePage={activePage}
    onNavigate={onNavigate}
    onOpenCenter={() => window.location.assign(CENTER_PATH)}
    onLogin={onOpenLogin}
    publicMode
    showSearch={false}
  >
    {activePage === 'home' && <FacilitiesPublicHome onNavigate={onNavigate} />}
    {activePage === 'request' && <FacilitiesRequestForm onCreated={(request) => onNavigate('tracking', request)} />}
    {activePage === 'tracking' && <FacilitiesPublicTracking initialRequestNumber={trackingSeed?.request_number} initialReporterName={trackingSeed?.reporter_name} />}
    {activePage === 'meeting' && <HrModulePlaceholder icon={CalendarDays} title="ระบบจองห้องประชุม" description="สำหรับตรวจสอบห้องว่างและจองห้องประชุมภายในบริษัท" />}
    {activePage === 'vehicle' && <HrModulePlaceholder icon={Car} title="ระบบจองรถธุรการ" description="สำหรับส่งคำขอใช้รถและติดตามสถานะการจัดรถธุรการ" />}
  </SystemAppShell>
}

const HrModulePlaceholder = ({ icon: Icon, title, description }) => <section className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-12">
  <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300"><Icon className="h-8 w-8" /></span>
  <p className="mt-6 text-xs font-bold text-indigo-600 dark:text-indigo-300">HR CENTER</p>
  <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
  <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
  <span className="mt-6 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">กำลังเตรียมพัฒนาระบบ</span>
</section>

const HrApp = () => {
  const [auth, setAuth] = useState(readStoredAuth)
  const [isValidating, setIsValidating] = useState(Boolean(auth))
  const [activePage, setActivePage] = useState('dashboard')
  const [requestFilter, setRequestFilter] = useState('')
  const [query, setQuery] = useState('')
  const [showLogin, setShowLogin] = useState(false)
  const [publicPage, setPublicPage] = useState(getPublicPage)
  const [trackingSeed, setTrackingSeed] = useState(null)

  useEffect(() => { document.title = 'HR Center | VAVA PACK' }, [])
  useEffect(() => {
    const handlePopState = () => { setPublicPage(getPublicPage()); setShowLogin(false) }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])
  useEffect(() => {
    if (!auth?.token) { setIsValidating(false); return }
    let active = true
    facilitiesGetMe().then((profile) => { if (!active) return; const next = { ...auth, ...profile }; localStorage.setItem(FACILITIES_AUTH_STORAGE_KEY, JSON.stringify(next)); setAuth(next) }).catch(() => { if (!active) return; localStorage.removeItem(FACILITIES_AUTH_STORAGE_KEY); setAuth(null) }).finally(() => { if (active) setIsValidating(false) })
    return () => { active = false }
  }, [auth?.token])

  const navItems = useMemo(() => [
    { id: 'dashboard', label: 'แจ้งซ่อม: แดชบอร์ด', icon: LayoutDashboard },
    { id: 'request', label: 'แจ้งซ่อม: ฟอร์มแจ้งงาน', icon: ClipboardPlus },
    { id: 'manage', label: auth?.role === 'requester' ? 'แจ้งซ่อม: ติดตามสถานะ' : 'แจ้งซ่อม: จัดการสถานะ', icon: ClipboardList },
    { id: 'meeting', label: 'ระบบจองห้องประชุม', icon: CalendarDays },
    { id: 'vehicle', label: 'ระบบจองรถธุรการ', icon: Car },
    ...(auth?.role === 'admin' ? [{ id: 'users', label: 'จัดการผู้ใช้งาน', icon: Users }] : []),
  ], [auth?.role])

  useEffect(() => { if (auth?.role && !navItems.some((item) => item.id === activePage)) setActivePage('dashboard') }, [activePage, auth?.role, navItems])
  const login = (loginAuth) => { localStorage.setItem(FACILITIES_AUTH_STORAGE_KEY, JSON.stringify(loginAuth)); window.history.replaceState({}, '', '/hr'); setAuth(loginAuth); setActivePage('dashboard') }
  const logout = () => { localStorage.removeItem(FACILITIES_AUTH_STORAGE_KEY); window.history.replaceState({}, '', '/hr'); setAuth(null); setActivePage('dashboard'); setPublicPage('home'); setShowLogin(false) }
  const openRequests = (filter = '') => { setRequestFilter(filter); setActivePage('manage') }
  const navigatePublic = (page, createdRequest = null) => {
    const nextPage = PUBLIC_PATHS[page] ? page : 'home'
    if (createdRequest) setTrackingSeed(createdRequest)
    else if (nextPage !== 'tracking') setTrackingSeed(null)
    window.history.pushState({}, '', PUBLIC_PATHS[nextPage])
    setPublicPage(nextPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (isValidating) return <div className="grid min-h-screen place-items-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>
  if (!auth) return showLogin
    ? <HrLogin onLogin={login} onBack={() => setShowLogin(false)} />
    : <HrPublicPortal activePage={publicPage} onNavigate={navigatePublic} onOpenLogin={() => setShowLogin(true)} trackingSeed={trackingSeed} />

  return <SystemAppShell
    brand="HR CENTER"
    brandCaption="ADMINISTRATION SERVICES"
    brandIcon={Building2}
    navItems={navItems}
    activePage={activePage}
    onNavigate={(page) => { setRequestFilter(''); setActivePage(page) }}
    onOpenCenter={() => window.location.assign(CENTER_PATH)}
    onExit={logout}
    exitLabel="ออกจากระบบ"
    userManagementPage={auth.role === 'admin' ? 'users' : null}
    query={query}
    onQueryChange={setQuery}
    searchPlaceholder="ค้นหางานอาคาร..."
    currentUser={{ ...auth, position: FACILITIES_ROLE_LABELS[auth.role] }}
  >
    {activePage === 'dashboard' && <FacilitiesDashboard onOpenRequests={openRequests} />}
    {activePage === 'request' && <FacilitiesRequestForm onCreated={() => openRequests('Pending')} />}
    {activePage === 'manage' && <FacilitiesRequestManagement auth={auth} mineOnly={auth.role === 'requester'} initialFilter={requestFilter} externalSearch={query} />}
    {activePage === 'meeting' && <HrModulePlaceholder icon={CalendarDays} title="ระบบจองห้องประชุม" description="สำหรับตรวจสอบห้องว่างและจองห้องประชุมภายในบริษัท" />}
    {activePage === 'vehicle' && <HrModulePlaceholder icon={Car} title="ระบบจองรถธุรการ" description="สำหรับส่งคำขอใช้รถและติดตามสถานะการจัดรถธุรการ" />}
    {activePage === 'users' && auth.role === 'admin' && <FacilitiesUserManagement auth={auth} />}
  </SystemAppShell>
}

export default HrApp
