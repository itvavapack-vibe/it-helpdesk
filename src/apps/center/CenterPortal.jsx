import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ArrowUpRight, Building2, CalendarDays, CarFront, ClipboardCheck, FileText, Headphones, LayoutGrid, Search, SearchX, ShieldCheck, Users, Wrench, X } from 'lucide-react'
import ThemePicker from '@/shared/system-ui/ThemePicker'
import { HR_PATH, IT_HELPDESK_BASE_PATH, SECRETARY_PATH, toItHelpdeskPath } from '@/config/appPaths'
import './center-portal.css'

const SYSTEMS = [
  { id: 'it-helpdesk', group: 'เทคโนโลยีสารสนเทศ', title: 'IT Helpdesk', description: 'แจ้งซ่อม ขอใช้งานระบบ ขอพัฒนาโปรแกรม และติดต่อเจ้าหน้าที่ไอที', detail: 'ศูนย์บริการงาน IT สำหรับพนักงานทุกสาขา', icon: Headphones, path: IT_HELPDESK_BASE_PATH, tone: 'indigo', keywords: 'it helpdesk แจ้งซ่อม user โปรแกรม ติดต่อไอที ทรัพย์สิน pm' },
  { id: 'hr', group: 'ทรัพยากรบุคคลและธุรการ', title: 'HR Center', description: 'ระบบแจ้งซ่อมธุรการ ระบบจองห้องประชุม และระบบจองรถธุรการ', detail: 'บริการงานอาคาร สถานที่ ห้องประชุม และรถส่วนกลาง', icon: Users, path: HR_PATH, tone: 'emerald', keywords: 'hr center ธุรการ อาคาร แจ้งซ่อม ห้องประชุม จองรถ' },
  { id: 'secretary', group: 'งานเลขานุการ', title: 'Secretary Center', description: 'รับส่งเอกสาร นัดหมาย หนังสือภายในและภายนอก และงานประสานงาน', detail: 'ติดตามและจัดการงานเอกสารจากจุดเดียว', icon: FileText, path: SECRETARY_PATH, tone: 'amber', keywords: 'secretary เลขานุการ เอกสาร หนังสือ นัดหมาย ประสานงาน' },
]

const QUICK_ACTIONS = [
  { id: 'report', label: 'แจ้งซ่อม IT', helper: 'แจ้งปัญหาอุปกรณ์หรือระบบ', path: '/report-issue', icon: Wrench },
  { id: 'track', label: 'ติดตามงานซ่อม', helper: 'ตรวจสถานะด้วยเลขที่เอกสาร', path: '/track-repair', icon: Search },
  { id: 'access', label: 'ขอ User และสิทธิ์', helper: 'ขอเข้าใช้งานระบบของบริษัท', path: '/request-access', icon: ShieldCheck },
  { id: 'change', label: 'ขอพัฒนาระบบ', helper: 'เสนอแก้ไขหรือพัฒนาโปรแกรม', path: '/request-change', icon: ClipboardCheck },
]

const HR_SERVICES = [{ label: 'แจ้งซ่อมธุรการ', icon: Building2 }, { label: 'จองห้องประชุม', icon: CalendarDays }, { label: 'จองรถธุรการ', icon: CarFront }]
const normalizeSearch = (value) => String(value || '').trim().toLocaleLowerCase('th')

const CenterPortal = () => {
  const [searchTerm, setSearchTerm] = useState('')
  useEffect(() => { const previousTitle = document.title; document.title = 'App Center | VAVA PACK'; return () => { document.title = previousTitle } }, [])
  const filteredSystems = useMemo(() => { const query = normalizeSearch(searchTerm); return SYSTEMS.filter((system) => !query || normalizeSearch(`${system.title} ${system.group} ${system.description} ${system.keywords}`).includes(query)) }, [searchTerm])
  const formattedDate = useMemo(() => new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()), [])
  const openPath = (path) => window.location.assign(path)

  return <div className="center-portal">
    <header className="center-nav">
      <button type="button" className="center-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="กลับด้านบน"><img src="/vava-pack-logo.png" width="469" height="346" alt="VAVA PACK" /><span><strong>VAVA PACK</strong><small>APP CENTER</small></span></button>
      <div className="center-nav-actions"><span className="center-date">{formattedDate}</span><ThemePicker /><button type="button" className="center-contact" onClick={() => openPath(toItHelpdeskPath('/contact-it'))}><Headphones aria-hidden="true" /><span>ติดต่อ IT</span></button></div>
    </header>

    <main className="center-main">
      <section className="center-intro" aria-labelledby="center-title">
        <div className="center-intro-copy"><span className="center-kicker"><LayoutGrid aria-hidden="true" /> INTERNAL WORKSPACE</span><h1 id="center-title">ทุกระบบงาน<br />เริ่มต้นที่นี่</h1><p>เลือกบริการที่ต้องการ ระบบจะพาคุณไปยังแบบฟอร์มหรือหน้าจัดการที่เกี่ยวข้องทันที</p></div>
        <label className="center-search"><span>ค้นหาระบบหรือบริการ</span><span className="center-search-control"><Search aria-hidden="true" /><input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="เช่น แจ้งซ่อม, ขอ User, จองห้อง" />{searchTerm && <button type="button" onClick={() => setSearchTerm('')} aria-label="ล้างคำค้นหา"><X aria-hidden="true" /></button>}</span><small>ค้นหาได้จากชื่อระบบและบริการภายใน</small></label>
      </section>

      {filteredSystems.length > 0 ? <section className="center-directory" aria-label="ระบบงานภายใน">
        {filteredSystems.map((system) => { const Icon = system.icon; return <button key={system.id} type="button" className={`center-system-card is-${system.tone}`} onClick={() => openPath(system.path)}>
          <span className="center-card-topline"><span className="center-system-icon"><Icon aria-hidden="true" /></span><span className="center-live"><i /> พร้อมใช้งาน</span></span>
          <span className="center-system-group">{system.group}</span><strong>{system.title}</strong><span className="center-system-description">{system.description}</span>
          {system.id === 'hr' && <span className="center-service-row">{HR_SERVICES.map(({ label, icon: ServiceIcon }) => <span key={label} title={label}><ServiceIcon aria-hidden="true" /></span>)}</span>}
          <span className="center-system-footer"><span>{system.detail}</span><span className="center-system-link">เข้าสู่ระบบ <ArrowRight aria-hidden="true" /></span></span>
        </button> })}
      </section> : <section className="center-empty" aria-live="polite"><SearchX aria-hidden="true" /><h2>ไม่พบระบบที่ค้นหา</h2><p>ลองค้นหาด้วยคำอื่น หรือกลับไปดูระบบทั้งหมด</p><button type="button" onClick={() => setSearchTerm('')}>แสดงระบบทั้งหมด</button></section>}

      {!searchTerm && <section className="center-quick" aria-labelledby="quick-title">
        <div className="center-section-heading"><span>บริการที่ใช้บ่อย</span><h2 id="quick-title">เริ่มงานได้ทันที</h2><p>ไม่ต้องเข้าหน้าหลักของระบบก่อน</p></div>
        <div className="center-quick-list">{QUICK_ACTIONS.map((action, index) => { const Icon = action.icon; return <button key={action.id} type="button" onClick={() => openPath(toItHelpdeskPath(action.path))}><span className="center-quick-number">0{index + 1}</span><span className="center-quick-icon"><Icon aria-hidden="true" /></span><span><strong>{action.label}</strong><small>{action.helper}</small></span><ArrowUpRight className="center-quick-arrow" aria-hidden="true" /></button> })}</div>
      </section>}
    </main>
    <footer className="center-footer"><span>VAVA PACK</span><span>Internal Systems Center</span><span>สำหรับการใช้งานภายในบริษัท</span></footer>
  </div>
}

export default CenterPortal
