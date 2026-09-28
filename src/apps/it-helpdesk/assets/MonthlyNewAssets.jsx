import { useMemo } from 'react'
import { getMonthlyNewAssetCounts } from '@/utils/assetStatus'

const monthNames = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

export default function MonthlyNewAssets({ history, year, years, onYearChange, selectedMonth, onSelectMonth, loading }) {
  const counts = useMemo(() => getMonthlyNewAssetCounts(history, year), [history, year])
  return (
    <section aria-label="เครื่องใหม่แยกตามเดือน" className="mb-5 rounded-xl border border-slate-200 bg-white p-5 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold">เครื่องใหม่แยกตามเดือน · ปี {Number(year) + 543}</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">เฉพาะสถานะ New · นับเครื่องไม่ซ้ำในแต่ละเดือนตามวันที่ในประวัติ · กดเดือนเพื่อดูรายการ</p>
        </div>
        <select aria-label="ปีสำหรับสรุปเครื่องใหม่รายเดือน" value={year} onChange={(event) => onYearChange(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800">
          {years.map((item) => <option key={item} value={item}>ปี {Number(item) + 543}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6" aria-busy={loading}>
        {monthNames.map((name, index) => {
          const month = String(index + 1).padStart(2, '0')
          const selected = month === selectedMonth
          return <button key={month} type="button" disabled={loading} aria-pressed={selected} onClick={() => onSelectMonth(month)} className={`rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-50 ${selected ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950' : 'border-slate-200 hover:border-emerald-400 dark:border-slate-600'}`}>
            <span className="block text-xs text-slate-500 dark:text-slate-400">{name}</span>
            <span className="mt-1 block text-lg font-bold">{loading ? '…' : counts[index].toLocaleString('th-TH')} <span className="text-xs font-normal">เครื่อง</span></span>
          </button>
        })}
      </div>
    </section>
  )
}
