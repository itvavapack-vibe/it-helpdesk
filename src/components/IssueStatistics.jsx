import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { AlertCircle, BarChart3, CheckCircle2, ClipboardList, Clock3, Monitor, PieChart as PieChartIcon, RefreshCw, TrendingUp, UserCheck, Users } from 'lucide-react';
import { mysql } from '../mysqlClient';

const CATEGORIES = [
    'แก้ไขปัญหาด้าน Software D365',
    'ติดตั้งและแก้ไขปัญหาด้าน Hardware',
    'ซ่อมบำรุงอุปกรณ์ต่อพ่วง Hardware & Network',
    'ประชุม/อบรม/สัมนา',
    'งานอื่น ๆ',
    'กล้องวงจรปิด',
    'แก้ไขปัญหาด้าน Printer',
    'ติดตั้งและแก้ปัญหาด้าน Software ทั่วไป',
    'แก้ไขปัญหาด้านอีเมล'
];

const DEPARTMENTS = [
    'แอดมิน', 'บุคคลและธุรการ', 'วิศวกรรม', 'การตลาดและขาย (ในประเทศ)',
    'การตลาดและขาย (ต่างประเทศ)', 'แอดมินการตลาด', 'บัญชี', 'การเงิน',
    'จัดซื้อ', 'เทคโนโลยีสารสนเทศ และ ERP', 'วางแผน', 'ฝ่ายผลิต',
    'ตรวจสอบคุณภาพ', 'ควบคุมคุณภาพ', 'บริหารระบบ และ จป.', 'ออกแบบ',
    'วิจัยและพัฒนาผลิตภัณฑ์', 'คลังพัสดุและจัดส่ง', 'ตรวจสอบ', 'ซ่อมบำรุง',
    'สำนักกรรมการ', 'อื่นๆ'
];

const REQUEST_STATUS_GROUPS = [
    { name: 'รอดำเนินการ', statuses: ['Pending', 'Pending_Manager', 'Pending_IT', 'Pending_IT_Supervisor', 'Pending_IT_Manager'], color: '#f59e0b' },
    { name: 'กำลังดำเนินการ', statuses: ['In_Progress', 'In_Development', 'Pending_User_Acceptance'], color: '#6366f1' },
    { name: 'เสร็จสิ้น', statuses: ['Approved', 'Completed'], color: '#10b981' },
    { name: 'ยกเลิก / ไม่อนุมัติ', statuses: ['Rejected', 'Cancelled'], color: '#f43f5e' }
];

const SummaryCard = ({ icon: Icon, title, value, detail, color }) => (
    <div className="glass-card rounded-3xl p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
            <div>
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{title}</p>
                <p className="mt-2 text-3xl font-black text-slate-800 dark:text-white">{value}</p>
                <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">{detail}</p>
            </div>
            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-lg ${color}`}>
                <Icon className="h-5 w-5" />
            </div>
        </div>
    </div>
);

const MetricCard = ({ title, value, icon: Icon, iconColor = 'text-indigo-500' }) => (
    <div className="rounded-2xl border border-slate-100 bg-white/60 p-4 dark:border-slate-700 dark:bg-slate-800/40">
        <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{title}</p>
            <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
        <p className="mt-2 text-2xl font-black text-slate-800 dark:text-white">{value}</p>
    </div>
);

const EmptyChart = ({ message }) => (
    <div className="flex h-72 items-center justify-center text-center text-sm font-medium text-slate-400 dark:text-slate-500">
        {message}
    </div>
);

const ChartTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const item = payload[0];
    return (
        <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-800">
            <p className="font-medium text-slate-800 dark:text-slate-200">{item.name}</p>
            <p className="mt-1 text-sm font-bold" style={{ color: item.payload.color }}>
                {item.value} รายการ
            </p>
        </div>
    );
};

const IssueStatistics = ({ issues = [] }) => {
    const [accessRequests, setAccessRequests] = useState([]);
    const [changeRequests, setChangeRequests] = useState([]);
    const [assets, setAssets] = useState([]);
    const [isLoadingDetails, setIsLoadingDetails] = useState(true);
    const [detailsError, setDetailsError] = useState('');

    const fetchDetails = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setIsLoadingDetails(true);
        setDetailsError('');

        const [accessResult, changeResult, assetResult] = await Promise.all([
            mysql.from('access_requests').select('id, status'),
            mysql.from('change_requests').select('id, status, request_category'),
            mysql.from('assets').select('glpi_id, name, users_id, states_id')
        ]);

        const errors = [accessResult.error, changeResult.error, assetResult.error].filter(Boolean);
        if (errors.length > 0) {
            setDetailsError('โหลดข้อมูลบางส่วนไม่สำเร็จ กรุณากดรีเฟรชอีกครั้ง');
        }

        if (!accessResult.error) setAccessRequests(accessResult.data || []);
        if (!changeResult.error) setChangeRequests(changeResult.data || []);
        if (!assetResult.error) setAssets(assetResult.data || []);
        setIsLoadingDetails(false);
    }, []);

    useEffect(() => {
        fetchDetails();
        const intervalId = setInterval(() => fetchDetails({ silent: true }), 30000);
        return () => clearInterval(intervalId);
    }, [fetchDetails]);

    const statusData = useMemo(() => {
        const counts = { Pending: 0, 'In Progress': 0, Resolved: 0 };
        issues.forEach(issue => {
            if (counts[issue.status] !== undefined) counts[issue.status]++;
        });
        return [
            { name: 'รอดำเนินการ', value: counts.Pending, color: '#f59e0b' },
            { name: 'กำลังแก้ไข', value: counts['In Progress'], color: '#6366f1' },
            { name: 'เสร็จสิ้น', value: counts.Resolved, color: '#10b981' }
        ].filter(item => item.value > 0);
    }, [issues]);

    const categoryData = useMemo(() => {
        const counts = {};
        issues.forEach(issue => {
            const category = issue.category || 'อื่นๆ';
            counts[category] = (counts[category] || 0) + 1;
        });
        return Object.entries(counts)
            .filter(([name]) => CATEGORIES.includes(name) || name === 'อื่นๆ')
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    }, [issues]);

    const departmentData = useMemo(() => {
        const counts = {};
        issues.forEach(issue => {
            const department = issue.department || 'ไม่ระบุแผนก';
            counts[department] = (counts[department] || 0) + 1;
        });
        return Object.entries(counts)
            .filter(([name]) => DEPARTMENTS.includes(name) || name === 'ไม่ระบุแผนก')
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
    }, [issues]);

    const allRequests = useMemo(() => [...accessRequests, ...changeRequests], [accessRequests, changeRequests]);

    const requestStatusData = useMemo(() => REQUEST_STATUS_GROUPS.map(group => ({
        name: group.name,
        count: allRequests.filter(request => group.statuses.includes(request.status || 'Pending')).length,
        color: group.color
    })), [allRequests]);

    const requestCategoryData = useMemo(() => {
        const counts = { 'พัฒนาโปรแกรม': 0, 'พัฒนาสื่อ': 0, 'ไม่ระบุประเภท': 0 };
        changeRequests.forEach(request => {
            const category = request.request_category || 'ไม่ระบุประเภท';
            counts[category] = (counts[category] || 0) + 1;
        });
        return Object.entries(counts).map(([name, count]) => ({ name, count }));
    }, [changeRequests]);

    const activeAssets = useMemo(() => assets.filter(asset => String(asset.states_id || '').toLowerCase() === 'active'), [assets]);
    const assignedAssets = useMemo(() => activeAssets.filter(asset => String(asset.users_id || '').trim()), [activeAssets]);
    const assetsWithOpenIssues = useMemo(() => {
        const openIssueAssetIds = new Set(
            issues
                .filter(issue => issue.status !== 'Resolved' && issue.assetId)
                .map(issue => String(issue.assetId))
        );
        return activeAssets.filter(asset => openIssueAssetIds.has(String(asset.glpi_id))).length;
    }, [activeAssets, issues]);
    const assetAssignmentData = useMemo(() => [
        { name: 'มีผู้ใช้งาน', value: assignedAssets.length, color: '#0ea5e9' },
        { name: 'ยังไม่ระบุผู้ใช้งาน', value: activeAssets.length - assignedAssets.length, color: '#cbd5e1' }
    ].filter(item => item.value > 0), [activeAssets.length, assignedAssets.length]);

    const openIssueCount = issues.filter(issue => issue.status !== 'Resolved').length;
    const pendingRequestCount = requestStatusData[0]?.count || 0;
    const completedRequestCount = requestStatusData[2]?.count || 0;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="glass-card rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)]">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 shadow-lg shadow-orange-100 dark:bg-orange-900/50 dark:text-orange-300 dark:shadow-orange-950/30">
                            <TrendingUp className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="bg-gradient-to-r from-indigo-700 to-violet-700 bg-clip-text text-xl font-bold text-transparent dark:from-indigo-400 dark:to-violet-400">สถิติภาพรวมระบบ</h2>
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">รายละเอียดแจ้งซ่อม ใบคำร้อง และทรัพย์สิน</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => fetchDetails()}
                        disabled={isLoadingDetails}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-2 text-sm font-bold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
                    >
                        <RefreshCw className={`h-4 w-4 ${isLoadingDetails ? 'animate-spin' : ''}`} />
                        รีเฟรชข้อมูล
                    </button>
                </div>
            </div>

            {detailsError && (
                <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {detailsError}
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <SummaryCard icon={AlertCircle} title="แจ้งซ่อม" value={issues.length} detail={`ค้างดำเนินการ ${openIssueCount} รายการ`} color="bg-gradient-to-br from-orange-500 to-amber-500" />
                <SummaryCard icon={ClipboardList} title="ใบคำร้อง" value={allRequests.length} detail={`รอดำเนินการ ${pendingRequestCount} รายการ`} color="bg-gradient-to-br from-indigo-500 to-violet-500" />
                <SummaryCard icon={Monitor} title="ทรัพย์สิน" value={activeAssets.length} detail={`มีผู้ใช้งาน ${assignedAssets.length} เครื่อง`} color="bg-gradient-to-br from-sky-500 to-cyan-500" />
            </div>

            <section className="space-y-4">
                <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">แจ้งซ่อม</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">สถานะ หมวดหมู่ และแผนกที่แจ้งปัญหาเข้ามา</p>
                </div>
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <div className="glass-card rounded-3xl p-6 shadow-sm">
                        <div className="mb-6 flex items-center gap-2">
                            <PieChartIcon className="h-5 w-5 text-indigo-500" />
                            <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100">สัดส่วนสถานะงาน</h4>
                        </div>
                        {statusData.length === 0 ? <EmptyChart message="ยังไม่มีรายการแจ้งซ่อม" /> : (
                            <div className="h-72 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={statusData} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={5} dataKey="value">
                                            {statusData.map(entry => <Cell key={entry.name} fill={entry.color} />)}
                                        </Pie>
                                        <RechartsTooltip content={<ChartTooltip />} />
                                        <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    <div className="glass-card rounded-3xl p-6 shadow-sm">
                        <div className="mb-6 flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-violet-500" />
                            <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100">ปัญหาที่พบบ่อย</h4>
                        </div>
                        {categoryData.length === 0 ? <EmptyChart message="ยังไม่มีข้อมูลหมวดหมู่แจ้งซ่อม" /> : (
                            <div className="h-72 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={categoryData} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} allowDecimals={false} />
                                        <RechartsTooltip cursor={{ fill: '#f1f5f9', opacity: 0.4 }} contentStyle={{ borderRadius: '12px', border: 'none' }} />
                                        <Bar dataKey="count" name="จำนวน (ครั้ง)" radius={[6, 6, 0, 0]} maxBarSize={50}>
                                            {categoryData.map((entry, index) => <Cell key={entry.name} fill={index === 0 ? '#6366f1' : '#a78bfa'} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    <div className="glass-card rounded-3xl p-6 shadow-sm xl:col-span-2">
                        <div className="mb-6 flex items-center gap-2">
                            <Users className="h-5 w-5 text-emerald-500" />
                            <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100">Top 5 แผนกที่แจ้งซ่อมบ่อยที่สุด</h4>
                        </div>
                        {departmentData.length === 0 ? <EmptyChart message="ยังไม่มีข้อมูลแผนกที่แจ้งซ่อม" /> : (
                            <div className="h-72 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={departmentData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" opacity={0.5} />
                                        <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} allowDecimals={false} />
                                        <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 13, fontWeight: 500 }} />
                                        <RechartsTooltip cursor={{ fill: '#f1f5f9', opacity: 0.4 }} contentStyle={{ borderRadius: '12px', border: 'none' }} />
                                        <Bar dataKey="count" name="จำนวน (ครั้ง)" radius={[0, 6, 6, 0]} barSize={32}>
                                            {departmentData.map((entry, index) => <Cell key={entry.name} fill={index === 0 ? '#10b981' : '#6ee7b7'} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            <section className="space-y-4">
                <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">ใบคำร้อง</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">ภาพรวมการร้องขอสิทธิ์และคำร้องขอพัฒนา</p>
                </div>
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <div className="glass-card rounded-3xl p-6 shadow-sm">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <MetricCard title="ร้องขอสิทธิ์" value={accessRequests.length} icon={UserCheck} iconColor="text-sky-500" />
                            <MetricCard title="ขอพัฒนา" value={changeRequests.length} icon={ClipboardList} iconColor="text-violet-500" />
                            <MetricCard title="รอดำเนินการ" value={pendingRequestCount} icon={Clock3} iconColor="text-amber-500" />
                            <MetricCard title="เสร็จสิ้น" value={completedRequestCount} icon={CheckCircle2} iconColor="text-emerald-500" />
                        </div>
                        <div className="mt-6 h-72 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={requestStatusData} margin={{ top: 20, right: 20, left: -20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} allowDecimals={false} />
                                    <RechartsTooltip cursor={{ fill: '#f1f5f9', opacity: 0.4 }} contentStyle={{ borderRadius: '12px', border: 'none' }} />
                                    <Bar dataKey="count" name="จำนวนใบคำร้อง" radius={[6, 6, 0, 0]} maxBarSize={50}>
                                        {requestStatusData.map(entry => <Cell key={entry.name} fill={entry.color} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="glass-card rounded-3xl p-6 shadow-sm">
                        <div className="mb-6 flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-violet-500" />
                            <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100">ประเภทคำร้องขอพัฒนา</h4>
                        </div>
                        {changeRequests.length === 0 ? <EmptyChart message="ยังไม่มีคำร้องขอพัฒนา" /> : (
                            <div className="h-72 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={requestCategoryData} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} allowDecimals={false} />
                                        <RechartsTooltip cursor={{ fill: '#f1f5f9', opacity: 0.4 }} contentStyle={{ borderRadius: '12px', border: 'none' }} />
                                        <Bar dataKey="count" name="จำนวนคำร้อง" fill="#8b5cf6" radius={[6, 6, 0, 0]} maxBarSize={70} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            <section className="space-y-4">
                <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">ทรัพย์สิน</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">สรุปเครื่องที่ Sync จาก GLPI และสถานะการใช้งาน</p>
                </div>
                <div className="glass-card grid grid-cols-1 gap-6 rounded-3xl p-6 shadow-sm lg:grid-cols-[1fr_1.2fr]">
                    <div className="grid grid-cols-2 gap-3">
                        <MetricCard title="เครื่อง Active" value={activeAssets.length} icon={Monitor} iconColor="text-sky-500" />
                        <MetricCard title="มีผู้ใช้งาน" value={assignedAssets.length} icon={UserCheck} iconColor="text-emerald-500" />
                        <MetricCard title="ยังไม่ระบุผู้ใช้" value={activeAssets.length - assignedAssets.length} icon={Users} iconColor="text-slate-500" />
                        <MetricCard title="มีงานซ่อมค้าง" value={assetsWithOpenIssues} icon={AlertCircle} iconColor="text-amber-500" />
                    </div>
                    {assetAssignmentData.length === 0 ? <EmptyChart message="ยังไม่มีข้อมูลทรัพย์สิน" /> : (
                        <div className="h-72 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={assetAssignmentData} cx="50%" cy="50%" innerRadius={65} outerRadius={95} paddingAngle={5} dataKey="value">
                                        {assetAssignmentData.map(entry => <Cell key={entry.name} fill={entry.color} />)}
                                    </Pie>
                                    <RechartsTooltip content={<ChartTooltip />} />
                                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
};

export default IssueStatistics;
