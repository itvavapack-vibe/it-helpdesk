import { ArrowRight, Building2, CalendarDays, Car, ClipboardPlus, Search, Wrench } from 'lucide-react'

const ActionCard = ({ icon: Icon, title, description, actionLabel, onClick, tone, ready = false }) => (
  <button type="button" onClick={onClick} className="group flex w-full items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-700">
    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="h-6 w-6" /></span>
    <span className="min-w-0 flex-1">
      <span className="flex flex-wrap items-center gap-2"><strong className="text-base text-slate-900 dark:text-white">{title}</strong><small className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ready ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}>{ready ? 'พร้อมใช้งาน' : 'กำลังเตรียมพัฒนา'}</small></span>
      <span className="mt-1 block text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</span>
      <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-indigo-600 dark:text-indigo-300">{actionLabel}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
    </span>
  </button>
)

const FacilitiesPublicHome = ({ onNavigate }) => (
  <div className="space-y-6">
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="grid items-center gap-8 p-6 sm:p-8 xl:grid-cols-12 xl:p-10">
        <div className="xl:col-span-7">
          <p className="text-xs font-bold tracking-wide text-indigo-600 dark:text-indigo-300">VAVA PACK · EMPLOYEE SERVICES</p>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight text-slate-900 dark:text-white sm:text-4xl">HR Center</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-500 dark:text-slate-400">ศูนย์รวมบริการงานธุรการสำหรับพนักงาน ทั้งการแจ้งซ่อม การจองห้องประชุม และการจองรถธุรการ</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => onNavigate('request')} className="app-primary-button inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold text-white"><ClipboardPlus className="h-5 w-5" />แจ้งซ่อมธุรการ</button>
            <button type="button" onClick={() => onNavigate('tracking')} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200"><Search className="h-5 w-5" />ติดตามสถานะ</button>
          </div>
        </div>
        <div className="xl:col-span-5">
          <div className="relative mx-auto max-w-md rounded-xl border border-indigo-100 bg-indigo-50 p-6 dark:border-indigo-900/60 dark:bg-indigo-950/30">
            <span className="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-950"><Building2 className="h-10 w-10" /></span>
            <div className="mt-6 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-white bg-white p-3 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900"><Wrench className="mx-auto h-6 w-6 text-rose-500" /><strong className="mt-2 block text-xs text-slate-800 dark:text-white">แจ้งซ่อม</strong></div>
              <div className="rounded-xl border border-white bg-white p-3 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900"><CalendarDays className="mx-auto h-6 w-6 text-sky-500" /><strong className="mt-2 block text-xs text-slate-800 dark:text-white">จองห้อง</strong></div>
              <div className="rounded-xl border border-white bg-white p-3 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900"><Car className="mx-auto h-6 w-6 text-emerald-500" /><strong className="mt-2 block text-xs text-slate-800 dark:text-white">จองรถ</strong></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
      <div className="mb-5"><h2 className="text-xl font-bold text-slate-900 dark:text-white">ระบบใน HR Center</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">เลือกบริการงานธุรการที่ต้องการ</p></div>
      <div className="grid gap-4 lg:grid-cols-3">
        <ActionCard icon={ClipboardPlus} title="ระบบแจ้งซ่อมธุรการ" description="แจ้งซ่อม แจ้งปัญหา แจ้งติดตั้ง และติดตามสถานะงาน" actionLabel="เข้าใช้งานระบบ" onClick={() => onNavigate('request')} tone="bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300" ready />
        <ActionCard icon={CalendarDays} title="ระบบจองห้องประชุม" description="ตรวจสอบห้องว่างและจองห้องประชุมภายในบริษัท" actionLabel="ดูรายละเอียด" onClick={() => onNavigate('meeting')} tone="bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300" />
        <ActionCard icon={Car} title="ระบบจองรถธุรการ" description="ส่งคำขอใช้รถและติดตามสถานะการจัดรถธุรการ" actionLabel="ดูรายละเอียด" onClick={() => onNavigate('vehicle')} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300" />
      </div>
    </section>
  </div>
)

export default FacilitiesPublicHome
