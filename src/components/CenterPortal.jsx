import { useEffect, useMemo, useState } from 'react'
import {
    ArrowUpRight,
    ClipboardCheck,
    FileText,
    Headphones,
    LayoutGrid,
    Search,
    SearchX,
    Users,
    Wrench,
    X,
} from 'lucide-react'
import ThemePicker from './ThemePicker'
import { IT_HELPDESK_BASE_PATH, SECRETARY_PATH, toItHelpdeskPath } from '../config/appPaths'

const SYSTEMS = [
    {
        id: 'it-helpdesk',
        group: 'เทคโนโลยีสารสนเทศ',
        title: 'IT Helpdesk',
        description: 'แจ้งซ่อม ขอใช้งานระบบ ขอพัฒนาโปรแกรม และติดต่อเจ้าหน้าที่ไอที',
        icon: Headphones,
        path: IT_HELPDESK_BASE_PATH,
        keywords: 'it helpdesk แจ้งซ่อม user โปรแกรม ติดต่อไอที',
    },
    {
        id: 'hr',
        group: 'ทรัพยากรบุคคล',
        title: 'HR Center',
        description: 'ข้อมูลพนักงาน โครงสร้างองค์กร คำร้อง เอกสาร และบริการจากฝ่ายทรัพยากรบุคคล',
        icon: Users,
        keywords: 'hr พนักงาน บุคคล แผนก ตำแหน่ง โอนย้าย คำร้อง เอกสาร',
    },
    {
        id: 'secretary',
        group: 'งานเลขานุการ',
        title: 'Secretary Center',
        description: 'รับส่งเอกสาร นัดหมาย หนังสือภายในและภายนอก รวมถึงงานประสานงานเลขานุการ',
        icon: FileText,
        path: SECRETARY_PATH,
        keywords: 'secretary เลขานุการ เอกสาร หนังสือ นัดหมาย ประสานงาน',
    },
]

const QUICK_ACTIONS = [
    { id: 'report', label: 'แจ้งซ่อม / ปัญหา', path: '/report-issue', icon: Wrench },
    { id: 'track', label: 'ติดตามงานแจ้งซ่อม', path: '/track-repair', icon: Search },
    { id: 'access', label: 'ขอ User และสิทธิ์', path: '/request-access', icon: Users },
    { id: 'change', label: 'ขอพัฒนาระบบ', path: '/request-change', icon: ClipboardCheck },
]

const normalizeSearch = (value) => String(value || '').trim().toLocaleLowerCase('th')

const CenterPortal = () => {
    const [searchTerm, setSearchTerm] = useState('')

    useEffect(() => {
        const previousTitle = document.title
        document.title = 'App Center | VAVA PACK'
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

    const filteredSystems = useMemo(() => {
        const query = normalizeSearch(searchTerm)
        return SYSTEMS.filter((system) => (
            !query || normalizeSearch(`${system.title} ${system.group} ${system.description} ${system.keywords}`).includes(query)
        ))
    }, [searchTerm])

    const openPath = (path) => window.location.assign(path)

    return (
        <div className="min-h-screen text-slate-800 dark:text-slate-100">
            <header className="glass-panel sticky top-0 z-50 border-b border-white/50 dark:border-slate-700/60">
                <div className="mx-auto flex min-h-18 w-full max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
                    <button type="button" onClick={() => window.scrollTo({ top: 0 })} className="flex min-w-0 items-center gap-3 text-left" aria-label="กลับด้านบน">
                        <img src="/vava-pack-logo.png" width="469" height="346" alt="VAVA PACK" className="h-12 w-16 shrink-0 object-contain sm:h-14 sm:w-20" />
                        <span className="min-w-0 border-l border-slate-300 pl-3 dark:border-slate-600">
                            <strong className="block truncate text-sm font-bold text-slate-900 dark:text-white">App Center</strong>
                            <span className="block truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">INTERNAL SYSTEMS</span>
                        </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                        <ThemePicker />
                        <button
                            type="button"
                            onClick={() => openPath(toItHelpdeskPath('/contact-it'))}
                            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-indigo-600 dark:hover:text-indigo-300 min-[440px]:h-10 min-[440px]:w-auto min-[440px]:gap-2 min-[440px]:px-3"
                            title="ติดต่อ IT"
                        >
                            <Headphones className="h-5 w-5" />
                            <span className="hidden whitespace-nowrap text-sm font-semibold min-[440px]:inline">ติดต่อ IT</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-14">
                <section className="grid items-end gap-8 border-b border-slate-200 pb-8 dark:border-slate-700 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
                    <div className="min-w-0">
                        <p className="mb-2 text-xs font-bold uppercase text-indigo-600 dark:text-indigo-300">VAVA PACK INTERNAL SYSTEMS</p>
                        <h1 className="text-3xl font-bold leading-tight text-slate-900 dark:text-white sm:text-4xl">ศูนย์รวมระบบงานบริษัท</h1>
                        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">เลือกเข้าสู่ระบบของแต่ละแผนกได้จากจุดเดียว ทุกระบบใช้ธีมหลักร่วมกันและแยกพื้นที่การทำงานอย่างชัดเจน</p>
                    </div>
                    <label className="block min-w-0">
                        <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">ค้นหาระบบ</span>
                        <span className="flex h-12 min-w-0 items-center rounded-xl border border-slate-300 bg-white px-3 shadow-sm focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-100 dark:border-slate-600 dark:bg-slate-900 dark:focus-within:border-indigo-500 dark:focus-within:ring-indigo-950/60">
                            <Search className="h-5 w-5 shrink-0 text-slate-400" />
                            <input
                                type="search"
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                placeholder="เช่น แจ้งซ่อม, HR, Secretary"
                                className="h-full min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
                            />
                            {searchTerm && <button type="button" onClick={() => setSearchTerm('')} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" aria-label="ล้างคำค้นหา"><X className="h-4 w-4" /></button>}
                        </span>
                    </label>
                </section>

                <section className="pt-9" aria-labelledby="system-directory-title">
                    <div className="mb-4 flex items-end justify-between gap-4">
                        <div>
                            <p className="mb-1 text-xs font-bold text-indigo-600 dark:text-indigo-300">APPLICATION DIRECTORY</p>
                            <h2 id="system-directory-title" className="text-xl font-bold text-slate-900 dark:text-white">ระบบงานทั้งหมด</h2>
                        </div>
                        <span className="shrink-0 text-sm font-medium text-slate-500 dark:text-slate-400">{filteredSystems.length} ระบบ</span>
                    </div>

                    {filteredSystems.length > 0 ? (
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {filteredSystems.map((system) => {
                                const Icon = system.icon
                                const isActive = Boolean(system.path)
                                const content = (
                                    <>
                                        <span className="flex items-center justify-between gap-3">
                                            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${isActive ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}><Icon className="h-5 w-5" /></span>
                                            <span className={`rounded-lg px-2 py-1 text-xs font-bold ${isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'}`}>{isActive ? 'พร้อมใช้งาน' : 'กำลังวางระบบ'}</span>
                                        </span>
                                        <span className="mt-4 text-xs font-semibold text-slate-500 dark:text-slate-400">{system.group}</span>
                                        <strong className="mt-1 block truncate text-lg font-bold text-slate-900 dark:text-white">{system.title}</strong>
                                        <span className="mt-2 line-clamp-2 min-h-11 text-sm leading-6 text-slate-600 dark:text-slate-300">{system.description}</span>
                                        <span className={`mt-auto flex items-center justify-between gap-2 pt-5 text-sm font-semibold ${isActive ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}`}>
                                            {isActive ? 'เข้าสู่ระบบ' : 'เตรียมพัฒนาเป็นระบบถัดไป'}
                                            {isActive && <ArrowUpRight className="h-4 w-4" />}
                                        </span>
                                    </>
                                )

                                return isActive ? (
                                    <button key={system.id} type="button" onClick={() => openPath(system.path)} className="flex min-h-56 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900/80 dark:hover:border-indigo-600">{content}</button>
                                ) : (
                                    <article key={system.id} className="flex min-h-56 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-700 dark:bg-slate-900/45">{content}</article>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="grid min-h-72 place-content-center justify-items-center gap-2 rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-600">
                            <SearchX className="mb-2 h-8 w-8 text-slate-400" />
                            <strong className="text-slate-800 dark:text-slate-100">ไม่พบระบบที่ค้นหา</strong>
                            <span className="text-sm text-slate-500 dark:text-slate-400">ลองใช้คำค้นหาอื่น หรือแสดงระบบทั้งหมด</span>
                            <button type="button" onClick={() => setSearchTerm('')} className="mt-3 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">แสดงทั้งหมด</button>
                        </div>
                    )}
                </section>

                <section className="mt-10 border-t border-slate-200 pt-9 dark:border-slate-700" aria-labelledby="it-shortcuts-title">
                    <p className="mb-1 text-xs font-bold text-indigo-600 dark:text-indigo-300">IT HELPDESK</p>
                    <h2 id="it-shortcuts-title" className="text-xl font-bold text-slate-900 dark:text-white">ทางลัดบริการไอที</h2>
                    <div className="mt-4 grid border-t border-slate-200 dark:border-slate-700 sm:grid-cols-2">
                        {QUICK_ACTIONS.map((action) => {
                            const Icon = action.icon
                            return <button key={action.id} type="button" onClick={() => openPath(toItHelpdeskPath(action.path))} className="grid min-h-15 min-w-0 grid-cols-[1.25rem_minmax(0,1fr)_1rem] items-center gap-3 border-b border-slate-200 px-3 text-left hover:bg-white/70 hover:text-indigo-600 dark:border-slate-700 dark:hover:bg-slate-900/60 dark:hover:text-indigo-300 sm:odd:border-r"><Icon className="h-5 w-5 text-indigo-600 dark:text-indigo-300" /><span className="truncate text-sm font-semibold">{action.label}</span><ArrowUpRight className="h-4 w-4 text-slate-400" /></button>
                        })}
                    </div>
                </section>
            </main>

            <footer className="mx-auto flex min-h-18 w-[calc(100%-2rem)] max-w-7xl items-center justify-between gap-4 border-t border-slate-200 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400 sm:w-[calc(100%-3rem)]">
                <span>VAVA PACK</span>
                <span>Internal Systems Center</span>
            </footer>
        </div>
    )
}

export default CenterPortal
