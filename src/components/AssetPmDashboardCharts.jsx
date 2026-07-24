import { FileText } from 'lucide-react';

const AssetPmDashboardCharts = ({
    pmPeriodSummary,
    selectedYearRecords,
    getPmStatusBadge,
    onOpenReport,
}) => (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 flex items-center justify-between gap-3">
            <div>
                <h3 className="font-bold text-slate-900 dark:text-white">รายการ PM ปี {Number(pmPeriodSummary.yearLabel).toLocaleString('th-TH', { useGrouping: false })}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">คลิกเพื่อเปิดรายงาน FMIT08</p>
            </div>
            <FileText className="h-5 w-5 text-sky-500" />
        </div>
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {selectedYearRecords.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-400 dark:bg-slate-900/40">ยังไม่มีรายการ PM ในปีนี้</div>
            ) : selectedYearRecords.map((record) => (
                <button
                    key={record.id}
                    type="button"
                    onClick={() => onOpenReport(record)}
                    className="flex w-full flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-left transition hover:border-sky-200 hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-sky-900 dark:hover:bg-sky-950/30 sm:flex-row sm:items-center sm:justify-between"
                >
                    <span>
                        <span className="block font-bold text-slate-800 dark:text-slate-100">{record.asset_name || '-'}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{new Date(record.pm_date).toLocaleDateString('th-TH')} โดย {record.inspector_name || '-'}</span>
                    </span>
                    {getPmStatusBadge(record.overall_status)}
                </button>
            ))}
        </div>
    </div>
);

export default AssetPmDashboardCharts;
