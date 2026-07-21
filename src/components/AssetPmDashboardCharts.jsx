import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, FileText } from 'lucide-react';

const PM_CHART_COLORS = {
    Pass: '#10b981',
    Fail: '#f43f5e',
    total: '#0ea5e9',
};

const AssetPmDashboardCharts = ({
    pmMonthlyTrend,
    pmStatusChartData,
    pmInspectorChartData,
    pmMonthSummary,
    selectedMonthRecords,
    getPmStatusBadge,
    onOpenReport,
}) => (
    <>
        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                        <h3 className="font-bold text-slate-900 dark:text-white">แนวโน้ม PM 6 เดือนล่าสุด</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">ใช้ดูภาพรวมก่อนสรุปสิ้นเดือน</p>
                    </div>
                    <BarChart3 className="h-5 w-5 text-sky-500" />
                </div>
                <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={pmMonthlyTrend} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                            <RechartsTooltip />
                            <Legend />
                            <Line type="monotone" dataKey="total" name="รวม" stroke={PM_CHART_COLORS.total} strokeWidth={3} dot={{ r: 4 }} />
                            <Line type="monotone" dataKey="Pass" name="ผ่าน" stroke={PM_CHART_COLORS.Pass} strokeWidth={2} />
                            <Line type="monotone" dataKey="Fail" name="ไม่ผ่าน" stroke={PM_CHART_COLORS.Fail} strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div className="mb-4">
                    <h3 className="font-bold text-slate-900 dark:text-white">สรุปผลเดือน {pmMonthSummary.monthLabel}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">ตรวจแล้ว {pmMonthSummary.total} รายการ</p>
                </div>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={pmStatusChartData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={4}>
                                {pmStatusChartData.map((entry) => (
                                    <Cell key={entry.status} fill={PM_CHART_COLORS[entry.status]} />
                                ))}
                            </Pie>
                            <RechartsTooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center text-xs font-bold">
                    <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200">ผ่าน<br /><span className="text-lg">{pmMonthSummary.pass}</span></div>
                    <div className="rounded-xl bg-rose-50 p-2 text-rose-700 dark:bg-rose-950/50 dark:text-rose-200">ไม่ผ่าน<br /><span className="text-lg">{pmMonthSummary.fail}</span></div>
                </div>
            </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div className="mb-4">
                    <h3 className="font-bold text-slate-900 dark:text-white">ผลงาน PM แยกตามผู้ตรวจ</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">เดือน {pmMonthSummary.monthLabel}</p>
                </div>
                <div className="h-64">
                    {pmInspectorChartData.length === 0 ? (
                        <div className="flex h-full items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-400 dark:bg-slate-900/40">ยังไม่มีข้อมูล PM ในเดือนนี้</div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={pmInspectorChartData} layout="vertical" margin={{ top: 5, right: 20, left: 55, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                                <RechartsTooltip />
                                <Bar dataKey="total" name="จำนวน PM" fill={PM_CHART_COLORS.total} radius={[0, 8, 8, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                        <h3 className="font-bold text-slate-900 dark:text-white">รายการ PM เดือน {pmMonthSummary.monthLabel}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">คลิกเพื่อเปิดรายงาน FMIT08</p>
                    </div>
                    <FileText className="h-5 w-5 text-sky-500" />
                </div>
                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                    {selectedMonthRecords.length === 0 ? (
                        <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-400 dark:bg-slate-900/40">ยังไม่มีรายการ PM ในเดือนนี้</div>
                    ) : selectedMonthRecords.map((record) => (
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
    </>
);

export default AssetPmDashboardCharts;
