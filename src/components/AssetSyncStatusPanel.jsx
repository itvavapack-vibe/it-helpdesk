import { CheckCircle2, Clock3, RefreshCw, TriangleAlert } from 'lucide-react'

const formatDateTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '-'
    : date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function AssetSyncStatusPanel({ status, loading }) {
  const state = loading || status?.status === 'Running'
    ? 'Running'
    : status?.status || 'Idle'
  const details = status?.details || {}
  const meta = {
    Success: { icon: CheckCircle2, label: 'Sync สำเร็จ', className: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200' },
    Failed: { icon: TriangleAlert, label: 'Sync ไม่สำเร็จ', className: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200' },
    Running: { icon: RefreshCw, label: 'กำลัง Sync จาก GLPI', className: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200' },
    Idle: { icon: Clock3, label: 'รอการ Sync', className: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200' },
  }[state]
  const Icon = meta.icon

  return (
    <div className={`mt-4 rounded-xl border px-4 py-3 ${meta.className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${state === 'Running' ? 'animate-spin' : ''}`} />
          <div>
            <div className="text-sm font-bold">{meta.label}</div>
            {state === 'Success' && (
              <div className="mt-1 text-xs leading-5 opacity-90">
                Active {Number(status.total_items || 0).toLocaleString('th-TH')} เครื่อง · เพิ่ม {Number(status.added_items || 0).toLocaleString('th-TH')} · เปลี่ยนแปลง {Number(status.updated_items || 0).toLocaleString('th-TH')} · นำออก {Number(status.removed_items || 0).toLocaleString('th-TH')}
                {Number(details.transferEvents || 0) > 0 && ` · โอนย้าย ${Number(details.transferEvents).toLocaleString('th-TH')}`}
              </div>
            )}
            {state === 'Failed' && <div className="mt-1 text-xs leading-5 opacity-90">{status.error_message || 'ไม่สามารถเชื่อมต่อ GLPI ได้'}</div>}
            {state === 'Running' && <div className="mt-1 text-xs opacity-90">ระบบกำลังดึงและบันทึกข้อมูลบนเซิร์ฟเวอร์</div>}
          </div>
        </div>
        <div className="text-right text-[11px] leading-5 opacity-80">
          <div>ล่าสุด: {formatDateTime(status?.completed_at)}</div>
          <div>รอบถัดไป: {formatDateTime(status?.next_run_at)}</div>
        </div>
      </div>
    </div>
  )
}
