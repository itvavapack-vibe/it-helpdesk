import { useMemo, useState } from 'react'
import { Building2, X } from 'lucide-react'
import { getAllAssetBranches, getAssetBranchKey } from '../utils/assetBranch'

const parseRecords = (value) => {
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const formatDate = (value) => value ? new Date(value).toLocaleDateString('th-TH') : '-'

const AssetPmApprovalReport = ({ batch, onClose }) => {
  const records = useMemo(() => parseRecords(batch?.records_json), [batch?.records_json])
  const branches = useMemo(() => getAllAssetBranches().map((branch) => ({
    ...branch,
    records: records.filter((record) => getAssetBranchKey(record.location_name) === branch.key),
  })), [records])
  const [selectedBranch, setSelectedBranch] = useState(() => branches.find((branch) => branch.records.length)?.key || 'VAVA1')
  const activeBranch = branches.find((branch) => branch.key === selectedBranch) || branches[0]

  return (
    <div className="fixed inset-0 z-[180] flex items-start justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5">
      <div className="w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-800">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">รายงานการตรวจเช็คคอมพิวเตอร์ PM (FMIT08)</h3>
            <p className="mt-1 text-sm text-slate-500">PM-{batch.report_year}-{String(batch.id).padStart(4, '0')} · {batch.record_count || records.length} รายการ</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="ปิด"><X className="h-5 w-5" /></button>
        </header>

        <div className="max-h-[calc(100dvh-8rem)] overflow-auto p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap gap-2">
            {branches.map((branch) => (
              <button key={branch.key} type="button" onClick={() => setSelectedBranch(branch.key)} disabled={!branch.records.length} className={`rounded-lg border px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-35 ${selectedBranch === branch.key ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{branch.label} ({branch.records.length})</button>
            ))}
          </div>

          <article className="mx-auto min-h-[190mm] w-[277mm] bg-white p-[8mm] text-black shadow-xl">
            <div className="mb-5 text-center">
              <div className="flex items-center justify-center gap-3"><img src="/vava-pack-logo.png" alt="VAVA PACK" className="h-9 object-contain" /><strong className="text-[18px]">บริษัท วาวา แพค จำกัด</strong></div>
              <h4 className="mt-2 text-[18px] font-bold">ใบบันทึกผลการตรวจเช็คคอมพิวเตอร์ (FMIT 08)</h4>
              <p className="mt-1 text-[13px]">{activeBranch.label} · ประจำปี {Number(batch.report_year).toLocaleString('th-TH', { useGrouping: false })}</p>
            </div>

            <table className="w-full border-collapse text-[11px]">
              <thead><tr className="bg-slate-100 text-center"><th className="border border-black p-2">ลำดับ</th><th className="border border-black p-2">ชื่อเครื่อง</th><th className="border border-black p-2">รหัสทรัพย์สิน / Serial</th><th className="border border-black p-2">ผู้ใช้งาน</th><th className="border border-black p-2">สถานที่</th><th className="border border-black p-2">วันที่ PM</th><th className="border border-black p-2">ผลตรวจ</th></tr></thead>
              <tbody>
                {activeBranch.records.map((record, index) => <tr key={record.id || `${record.asset_glpi_id}-${index}`}><td className="border border-black p-2 text-center">{index + 1}</td><td className="border border-black p-2 font-semibold">{record.asset_name || '-'}</td><td className="border border-black p-2">{record.asset_code || record.serial || '-'}</td><td className="border border-black p-2">{record.user_name || '-'}</td><td className="border border-black p-2">{record.location_name || '-'}</td><td className="border border-black p-2 text-center">{formatDate(record.pm_date)}</td><td className="border border-black p-2 text-center">{record.overall_status === 'Pass' ? 'ผ่าน' : record.overall_status === 'Fail' ? 'ไม่ผ่าน' : '-'}</td></tr>)}
                {!activeBranch.records.length && <tr><td colSpan={7} className="border border-black p-8 text-center text-slate-500">ไม่มีรายการ PM ของสาขานี้</td></tr>}
              </tbody>
            </table>

            <div className="mt-12 grid grid-cols-2 gap-20 text-center text-[12px]">
              <div><div className="flex h-[18mm] items-end justify-center border-b border-dotted border-black">{batch.inspector_signature && <img src={batch.inspector_signature} alt="ลายเซ็นผู้ทำ PM" className="h-[17mm] max-w-[58mm] object-contain" />}</div><div className="mt-2">ผู้ตรวจสอบ: {batch.inspector_name || '-'}</div><div className="mt-2">{batch.inspector_position || 'เจ้าหน้าที่ Hardware'}</div><div className="mt-2">วันที่ {formatDate(batch.created_at)}</div></div>
              <div><div className="flex h-[18mm] items-end justify-center border-b border-dotted border-black">{batch.manager_signature && <img src={batch.manager_signature} alt="ลายเซ็นผู้จัดการ" className="h-[17mm] max-w-[58mm] object-contain" />}</div><div className="mt-2">ผู้อนุมัติ: {batch.manager_name || '-'}</div><div className="mt-2">{batch.manager_position || 'ผู้จัดการแผนกเทคโนโลยีสารสนเทศและ ERP'}</div><div className="mt-2">วันที่ {formatDate(batch.manager_date)}</div></div>
            </div>

            <div className="mt-10 flex items-center gap-3 text-[10px] text-slate-600"><Building2 className="h-3.5 w-3.5" /><span>Revision No : 03</span><span>Date of Issue : 03.04.26</span></div>
          </article>
        </div>
      </div>
    </div>
  )
}

export default AssetPmApprovalReport
