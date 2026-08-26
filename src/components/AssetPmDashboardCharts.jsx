import { Building2, CalendarDays, FileText } from 'lucide-react';

const AssetPmDashboardCharts = ({
    pmPeriodSummary,
    selectedYearRecords,
    branchSummaries,
    getPmStatusBadge,
    onOpenReport,
    onOpenBranchReport,
}) => (
    <div className="space-y-5">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">สรุปเครื่องที่ทำ PM แยกตามสาขา</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">แสดงเครื่องและวันที่ PM ในปีที่เลือก</p>
                </div>
                <Building2 className="h-5 w-5 text-indigo-500" />
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {branchSummaries.map((branch) => (
                    <section key={branch.key} className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/45">
                        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-3 py-3 dark:border-slate-700">
                            <div className="min-w-0">
                                <h4 className="text-sm font-bold leading-5 text-slate-800 dark:text-slate-100">{branch.label}</h4>
                                <p className="mt-1 text-xs text-slate-500">{branch.records.length} เครื่อง</p>
                            </div>
                            <button type="button" onClick={() => onOpenBranchReport(branch.key)} disabled={!branch.records.length} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-indigo-200 bg-white text-indigo-600 shadow-sm hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-35 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300" title={`เปิดรายงาน ${branch.label}`} aria-label={`เปิดรายงาน ${branch.label}`}><FileText className="h-4 w-4" /></button>
                        </div>
                        <div className="max-h-44 space-y-1.5 overflow-y-auto p-2.5">
                            {branch.records.length ? branch.records.map((record) => (
                                <button key={record.id} type="button" onClick={() => onOpenReport(record)} className="flex w-full items-start justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-left shadow-sm hover:ring-1 hover:ring-sky-200 dark:bg-slate-800 dark:hover:ring-sky-800">
                                    <span className="min-w-0"><strong className="block truncate text-xs text-slate-700 dark:text-slate-200">{record.asset_name || '-'}</strong><span className="mt-0.5 block truncate text-[11px] text-slate-400">{record.asset_code || record.serial || '-'}</span></span>
                                    <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400"><CalendarDays className="h-3 w-3" />{new Date(record.pm_date).toLocaleDateString('th-TH')}</span>
                                </button>
                            )) : <div className="py-7 text-center text-xs text-slate-400">ยังไม่มีรายการ PM</div>}
                        </div>
                    </section>
                ))}
            </div>
        </div>

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
    </div>
);

export default AssetPmDashboardCharts;
