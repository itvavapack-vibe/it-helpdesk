import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Building2, CalendarDays, CarFront, ChartNoAxesCombined, ChevronRight, ClipboardCheck, FileText, Headphones, LayoutDashboard, Menu, Search, ShieldCheck, Users, Wrench, X } from 'lucide-react'
import ThemePicker from '@/shared/system-ui/ThemePicker'
import { HR_PATH, IT_HELPDESK_BASE_PATH, SECRETARY_PATH, toItHelpdeskPath } from '@/config/appPaths'
import './center-portal.css'

const SYSTEMS = [
  { id: 'it-helpdesk', group: 'เทคโนโลยีสารสนเทศ', title: 'IT Helpdesk', description: 'แจ้งซ่อม ขอใช้งานระบบ ขอพัฒนาโปรแกรม และจัดการทรัพย์สิน IT', icon: Headphones, path: IT_HELPDESK_BASE_PATH, tone: 'indigo', keywords: 'it helpdesk แจ้งซ่อม user โปรแกรม ติดต่อไอที ทรัพย์สิน pm' },
  { id: 'hr', group: 'ทรัพยากรบุคคลและธุรการ', title: 'HR Center', description: 'แจ้งซ่อมธุรการ จองห้องประชุม และจองรถส่วนกลาง', icon: Users, path: HR_PATH, tone: 'green', keywords: 'hr center ธุรการ อาคาร แจ้งซ่อม ห้องประชุม จองรถ' },
  { id: 'secretary', group: 'งานเลขานุการ', title: 'Secretary Center', description: 'รับส่งเอกสาร นัดหมาย หนังสือ และงานประสานงาน', icon: FileText, path: SECRETARY_PATH, tone: 'amber', keywords: 'secretary เลขานุการ เอกสาร หนังสือ นัดหมาย ประสานงาน' },
]

const QUICK_ACTIONS = [
  { label: 'แจ้งซ่อม IT', helper: 'แจ้งปัญหาอุปกรณ์หรือระบบ', path: '/report-issue', icon: Wrench },
  { label: 'ติดตามงานซ่อม', helper: 'ตรวจสถานะด้วยเลขที่เอกสาร', path: '/track-repair', icon: Search },
  { label: 'ขอ User และสิทธิ์', helper: 'ขอเข้าใช้งานระบบบริษัท', path: '/request-access', icon: ShieldCheck },
  { label: 'ขอพัฒนาระบบ', helper: 'เสนอแก้ไขหรือพัฒนาโปรแกรม', path: '/request-change', icon: ClipboardCheck },
]

const normalizeSearch = (value) => String(value || '').trim().toLocaleLowerCase('th')

const CenterPortal = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  useEffect(() => { const previousTitle = document.title; document.title = 'App Center | VAVA PACK'; return () => { document.title = previousTitle } }, [])
  const filteredSystems = useMemo(() => { const query = normalizeSearch(searchTerm); return SYSTEMS.filter((system) => !query || normalizeSearch(`${system.title} ${system.group} ${system.description} ${system.keywords}`).includes(query)) }, [searchTerm])
  const formattedDate = useMemo(() => new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()), [])
  const openPath = (path) => window.location.assign(path)

  return <div className="center-portal">
    {sidebarOpen && <button className="cp-backdrop" type="button" aria-label="ปิดเมนู" onClick={() => setSidebarOpen(false)} />}
    <aside className={`cp-sidebar${sidebarOpen ? ' is-open' : ''}`}>
      <div className="cp-brand"><img src="/vava-pack-logo.png" alt="VAVA PACK" /><span><strong>VAVA PACK</strong><small>APP CENTER</small></span><button type="button" onClick={() => setSidebarOpen(false)} aria-label="ปิดเมนู"><X /></button></div>
      <nav className="cp-nav" aria-label="เมนูหลัก">
        <span className="cp-nav-label">เมนู</span>
        <button type="button" className="cp-nav-item is-active"><LayoutDashboard /><span>ภาพรวมระบบ</span></button>
        <span className="cp-nav-label cp-nav-systems">ระบบงาน</span>
        {SYSTEMS.map((system) => { const Icon = system.icon; return <button key={system.id} type="button" className="cp-nav-item" onClick={() => openPath(system.path)}><Icon /><span>{system.title}</span><ChevronRight /></button> })}
      </nav>
      <div className="cp-sidebar-help"><span className="cp-help-icon"><Headphones /></span><strong>ต้องการความช่วยเหลือ?</strong><p>ติดต่อทีม IT Helpdesk</p><button type="button" onClick={() => openPath(toItHelpdeskPath('/contact-it'))}>ติดต่อ IT</button></div>
      <div className="cp-sidebar-footer"><span>VAVA PACK CO., LTD.</span><small>Internal Systems</small></div>
    </aside>

    <div className="cp-workspace">
      <header className="cp-topbar">
        <button type="button" className="cp-menu" onClick={() => setSidebarOpen(true)} aria-label="เปิดเมนู"><Menu /></button>
        <label className="cp-top-search"><Search /><input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="ค้นหาระบบหรือบริการ..." />{searchTerm && <button type="button" onClick={() => setSearchTerm('')} aria-label="ล้างคำค้นหา"><X /></button>}</label>
        <div className="cp-top-actions"><span>{formattedDate}</span><ThemePicker /><button type="button" className="cp-profile" onClick={() => openPath(toItHelpdeskPath('/contact-it'))}><span>IT</span><span><strong>IT Helpdesk</strong><small>ศูนย์ช่วยเหลือ</small></span></button></div>
      </header>

      <main className="cp-main">
        <div className="cp-page-heading"><div><span>APP CENTER</span><h1>ภาพรวมระบบงาน</h1><p>เลือกเข้าสู่ระบบหรือเริ่มบริการที่ใช้บ่อยได้จากหน้านี้</p></div><span className="cp-status"><i /> ทุกระบบพร้อมใช้งาน</span></div>

        <section className="cp-stats" aria-label="สรุประบบ">
          <article><span className="cp-stat-icon is-indigo"><LayoutDashboard /></span><span><small>ระบบทั้งหมด</small><strong>{SYSTEMS.length}</strong><em>ระบบ</em></span></article>
          <article><span className="cp-stat-icon is-green"><ChartNoAxesCombined /></span><span><small>พร้อมใช้งาน</small><strong>{SYSTEMS.length}</strong><em>100%</em></span></article>
          <article><span className="cp-stat-icon is-amber"><ClipboardCheck /></span><span><small>บริการทางลัด</small><strong>{QUICK_ACTIONS.length}</strong><em>รายการ</em></span></article>
          <article><span className="cp-stat-icon is-blue"><CalendarDays /></span><span><small>อัปเดตล่าสุด</small><strong className="cp-stat-date">วันนี้</strong><em>{formattedDate}</em></span></article>
        </section>

        <div className="cp-content-grid">
          <section className="cp-panel cp-systems-panel">
            <div className="cp-panel-head"><div><h2>ระบบงานทั้งหมด</h2><p>{searchTerm ? `พบ ${filteredSystems.length} ระบบจากการค้นหา` : 'ระบบภายในสำหรับพนักงานทุกแผนก'}</p></div><span>{filteredSystems.length} ระบบ</span></div>
            {filteredSystems.length > 0 ? <div className="cp-system-grid">{filteredSystems.map((system) => { const Icon = system.icon; return <button key={system.id} type="button" className={`cp-system-card is-${system.tone}`} onClick={() => openPath(system.path)}><span className="cp-system-icon"><Icon /></span><span className="cp-system-copy"><small>{system.group}</small><strong>{system.title}</strong><span>{system.description}</span></span><span className="cp-system-open"><ArrowRight /></span></button> })}</div> : <div className="cp-empty"><Search /><strong>ไม่พบระบบที่ค้นหา</strong><button type="button" onClick={() => setSearchTerm('')}>แสดงทั้งหมด</button></div>}
          </section>

          <section className="cp-panel cp-quick-panel">
            <div className="cp-panel-head"><div><h2>บริการที่ใช้บ่อย</h2><p>เริ่มรายการได้ทันที</p></div></div>
            <div className="cp-quick-list">{QUICK_ACTIONS.map((action) => { const Icon = action.icon; return <button key={action.path} type="button" onClick={() => openPath(toItHelpdeskPath(action.path))}><span><Icon /></span><span><strong>{action.label}</strong><small>{action.helper}</small></span><ChevronRight /></button> })}</div>
            <div className="cp-hr-services"><span>HR CENTER</span><strong>บริการธุรการ</strong><div><span><Building2 /> แจ้งซ่อม</span><span><CalendarDays /> จองห้อง</span><span><CarFront /> จองรถ</span></div></div>
          </section>
        </div>
      </main>
    </div>
  </div>
}

export default CenterPortal
