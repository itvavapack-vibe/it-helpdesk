import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { AlertCircle, BarChart3, CalendarDays, CheckCircle2, ClipboardList, Clock3, Monitor, PieChart as PieChartIcon, RefreshCw, TrendingUp, UserCheck, Users } from 'lucide-react';
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

const CHANGE_REQUEST_STATUS_GROUPS = [
    { name: 'รอดำเนินการ', statuses: ['Pending', 'Pending_IT', 'Pending_IT_Manager'], color: '#f59e0b' },
    { name: 'กำลังดำเนินการ', statuses: ['In_Progress', 'In_Development', 'Pending_User_Acceptance'], color: '#6366f1' },
    { name: 'ปิดจบ', statuses: ['Completed'], color: '#059669' },
    { name: 'ยกเลิก / ไม่อนุมัติ', statuses: ['Rejected', 'Cancelled'], color: '#f43f5e' },
];

const MONTH_OPTIONS = [
    'มกราคม',
    'กุมภาพันธ์',
    'มีนาคม',
    'เมษายน',
    'พฤษภาคม',
    'มิถุนายน',
    'กรกฎาคม',
    'สิงหาคม',
    'กันยายน',
    'ตุลาคม',
    'พฤศจิกายน',
    'ธันวาคม',
];

const ISSUE_BREAKDOWN_VIEWS = [
    { id: 'category', label: 'หมวดหมู่' },
    { id: 'department', label: 'แผนก' },
    { id: 'staff', label: 'เจ้าหน้าที่รับงาน' },
];

const getItemDate = (item) => {
    const rawDate = item?.createdAt || item?.created_at || item?.date;
    const date = rawDate ? new Date(rawDate) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
};

const isInSelectedPeriod = (item, filter) => {
    const date = getItemDate(item);
    if (!date) return false;
    const year = date.getFullYear();
    if (year !== Number(filter.year)) return false;
    if (filter.type === 'year') return true;
    if (filter.type === 'quarter') {
        return Math.floor(date.getMonth() / 3) + 1 === Number(filter.quarter);
    }
    return date.getMonth() + 1 === Number(filter.month);
};

const getAvailableYears = (...collections) => {
    const years = new Set([new Date().getFullYear()]);
    collections.flat().forEach((item) => {
        const date = getItemDate(item);
        if (date) years.add(date.getFullYear());
    });
    return Array.from(years).sort((a, b) => b - a);
};

const getPeriodLabel = (filter) => {
    if (filter.type === 'year') return `ปี ${Number(filter.year) + 543}`;
    if (filter.type === 'quarter') return `ไตรมาส ${filter.quarter} / ${Number(filter.year) + 543}`;
    return `${MONTH_OPTIONS[Number(filter.month) - 1]} ${Number(filter.year) + 543}`;
};

const getIssueEffectiveStatus = (issue) => (
    issue?.status === 'Closed' || issue?.userCloseSign || issue?.userClosedAt
        ? 'Closed'
        : issue?.status || 'Pending'
);

const SummaryCard = ({ icon: Icon, title, value, detail, color, cardClassName = '', iconClassName = 'text-white' }) => (
    <div className={`glass-card rounded-3xl p-5 shadow-sm ${cardClassName}`}>
        <div className="flex items-start justify-between gap-4">
            <div>
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{title}</p>
                <p className="mt-2 text-3xl font-black text-slate-800 dark:text-white">{value}</p>
                <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">{detail}</p>
            </div>
            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl shadow-lg ${color}`}>
                <Icon className={`h-5 w-5 ${iconClassName}`} />
            </div>
        </div>
    </div>
);

const MetricCard = ({ title, value, icon: Icon, iconColor = 'text-indigo-500' }) => (
    <div className="rounded-2xl border border-slate-100 bg-white/60 p-4 dark:border-slate-700 dark:bg-slate-800/40">
        <div className="flex items-center justify-between gap-3">
            <p className="text-[0.7rem] font-semibold text-slate-500 dark:text-slate-400">{title}</p>
            <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
        <p className="mt-2 text-xs font-black text-slate-800 dark:text-white">{value}</p>
    </div>
);

const AssetMetricCard = ({ title, value, detail, icon: Icon, iconColor = 'text-sky-500' }) => (
    <div className="rounded-2xl border border-slate-100 bg-white/70 p-4 shadow-sm shadow-slate-200/40 dark:border-slate-700 dark:bg-slate-800/50 dark:shadow-none">
        <div className="flex items-center justify-between gap-3">
            <p className="text-base font-semibold text-slate-500 dark:text-slate-400">{title}</p>
            <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
        <p className="mt-2 text-lg font-black text-slate-800 dark:text-white">{value}</p>
        {detail && <p className="mt-1 text-xs font-medium text-slate-400 dark:text-slate-500">{detail}</p>}
    </div>
);

const AssetSourceCard = ({ title, total, items, iconColor, accentClass }) => (
    <div className={`h-full rounded-3xl border p-5 shadow-sm ${accentClass}`}>
        <div className="mb-4 flex items-center justify-between gap-3">
            <div>
                <p className="text-sm font-bold text-slate-500 dark:text-slate-300">{title}</p>
                <p className="mt-1 text-3xl font-black text-slate-900 dark:text-white">{total}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/75 shadow-sm dark:bg-slate-900/50">
                <Monitor className={`h-6 w-6 ${iconColor}`} />
            </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {items.length === 0 ? (
                <div className="col-span-full rounded-2xl bg-white/70 p-3 text-center text-sm font-semibold text-slate-400 dark:bg-slate-900/35">
                    ไม่มีข้อมูลประเภท
                </div>
            ) : items.map((item, index) => (
                <div key={item.name} className={`rounded-2xl p-3 text-center ${getTypeTone(index)}`}>
                    <p className="truncate text-[0.7rem] font-bold text-slate-400" title={item.name}>{item.name}</p>
                    <p className="mt-1 text-xl font-black text-slate-800 dark:text-white">{item.count}</p>
                </div>
            ))}
        </div>
    </div>
);

const groupRequestStatusData = (items, { excludeStatuses = [], excludeGroupNames = [], groups = REQUEST_STATUS_GROUPS } = {}) => groups
    .filter(group => !excludeGroupNames.includes(group.name))
    .map(group => ({
    name: group.name,
    count: items.filter((request) => {
        const status = request.status || 'Pending';
        return !excludeStatuses.includes(status) && group.statuses.includes(status);
    }).length,
    color: group.color
}));

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

const isSourceType = (asset, type) => {
    const source = String(asset?.autoupdatesystems_id || '').toLowerCase();
    if (type === 'buy') return source.includes('buy') || source.includes('ซื้อ');
    if (type === 'rent') return source.includes('rent') || source.includes('เช่า');
    return false;
};

const getComputerCategory = (asset) => {
    const text = [
        asset?.computertypes_id,
        asset?.computermodels_id,
        asset?.name,
    ].filter(Boolean).join(' ').toLowerCase();

    if (/all[\s-]?in[\s-]?one|aio|all in one/.test(text)) return 'allInOne';
    if (/notebook|laptop|nb/.test(text)) return 'notebook';
    if (/\bpc\b|desktop|computer|คอม/.test(text)) return 'pc';
    return 'other';
};

const getAssetTypeLabel = (asset) => (
    String(asset?.computertypes_id || '').trim() ||
    ({
        pc: 'PC',
        notebook: 'Notebook',
        allInOne: 'All InOne',
        other: 'ไม่ระบุประเภท',
    }[getComputerCategory(asset)])
);

const addTypeCount = (summary, asset) => {
    const type = getAssetTypeLabel(asset);
    summary[type] = (summary[type] || 0) + 1;
    return summary;
};

const toSortedTypeItems = (summary) => Object.entries(summary)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

const getTypeTone = (index) => ([
    'bg-sky-50/90 text-sky-900 ring-1 ring-sky-100 dark:bg-sky-950/30 dark:text-sky-100 dark:ring-sky-900/50',
    'bg-violet-50/90 text-violet-900 ring-1 ring-violet-100 dark:bg-violet-950/30 dark:text-violet-100 dark:ring-violet-900/50',
    'bg-emerald-50/90 text-emerald-900 ring-1 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-100 dark:ring-emerald-900/50',
    'bg-amber-50/90 text-amber-900 ring-1 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-100 dark:ring-amber-900/50',
    'bg-rose-50/90 text-rose-900 ring-1 ring-rose-100 dark:bg-rose-950/30 dark:text-rose-100 dark:ring-rose-900/50',
    'bg-cyan-50/90 text-cyan-900 ring-1 ring-cyan-100 dark:bg-cyan-950/30 dark:text-cyan-100 dark:ring-cyan-900/50',
][index % 6]);

const getAssetBranch = (asset) => {
    const location = String(asset?.locations_id || '').toUpperCase();
    if (/VAVA[\s-]?1/.test(location)) return 'VAVA1';
    if (/VAVA[\s-]?2/.test(location)) return 'VAVA2';
    if (/VAVA[\s-]?3/.test(location)) return 'VAVA3';
    return 'อื่นๆ';
};

const IssueStatistics = ({ issues = [] }) => {
    const [accessRequests, setAccessRequests] = useState([]);
    const [changeRequests, setChangeRequests] = useState([]);
    const [assets, setAssets] = useState([]);
    const [isLoadingDetails, setIsLoadingDetails] = useState(true);
    const [detailsError, setDetailsError] = useState('');
    const [issueBreakdownView, setIssueBreakdownView] = useState('category');
    const now = new Date();
    const [dateFilter, setDateFilter] = useState({
        type: 'month',
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        quarter: Math.floor(now.getMonth() / 3) + 1,
    });

    const fetchDetails = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setIsLoadingDetails(true);
        setDetailsError('');

        const [accessResult, changeResult, assetResult] = await Promise.all([
            mysql.from('access_requests').select('id, status, department, created_at'),
            mysql.from('change_requests').select('id, status, request_category, created_at'),
            mysql.from('assets').select('glpi_id, name, users_id, locations_id, computermodels_id, computertypes_id, states_id, autoupdatesystems_id')
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

    const availableYears = useMemo(
        () => getAvailableYears(issues, accessRequests, changeRequests),
        [issues, accessRequests, changeRequests],
    );

    const filteredIssues = useMemo(
        () => issues.filter(issue => isInSelectedPeriod(issue, dateFilter)),
        [issues, dateFilter],
    );

    const filteredAccessRequests = useMemo(
        () => accessRequests.filter(request => isInSelectedPeriod(request, dateFilter)),
        [accessRequests, dateFilter],
    );

    const filteredChangeRequests = useMemo(
        () => changeRequests.filter(request => isInSelectedPeriod(request, dateFilter)),
        [changeRequests, dateFilter],
    );

    const statusData = useMemo(() => {
        const counts = { Pending: 0, 'In Progress': 0, Resolved: 0, Closed: 0 };
        filteredIssues.forEach(issue => {
            const effectiveStatus = getIssueEffectiveStatus(issue);
            if (counts[effectiveStatus] !== undefined) counts[effectiveStatus]++;
        });
        return [
            { name: 'รอดำเนินการ', value: counts.Pending, color: '#f59e0b' },
            { name: 'กำลังแก้ไข', value: counts['In Progress'], color: '#6366f1' },
            { name: 'เสร็จสิ้น', value: counts.Resolved, color: '#10b981' },
            { name: 'ปิดจบ', value: counts.Closed, color: '#059669' },
        ].filter(item => item.value > 0);
    }, [filteredIssues]);

    const categoryData = useMemo(() => {
        const counts = {};
        filteredIssues.forEach(issue => {
            const category = issue.category || 'อื่นๆ';
            counts[category] = (counts[category] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
    }, [filteredIssues]);

    const departmentData = useMemo(() => {
        const counts = {};
        filteredIssues.forEach(issue => {
            const department = issue.department || 'ไม่ระบุแผนก';
            counts[department] = (counts[department] || 0) + 1;
        });
        return Object.entries(counts)
            .filter(([name]) => DEPARTMENTS.includes(name) || name === 'ไม่ระบุแผนก')
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
    }, [filteredIssues]);

    const staffWorkloadData = useMemo(() => {
        const summary = {};
        filteredIssues.forEach((issue) => {
            const name = String(issue.assignedAdmin || '').trim() || 'ยังไม่มีผู้รับงาน';
            if (!summary[name]) {
                summary[name] = {
                    name,
                    total: 0,
                    pending: 0,
                    inProgress: 0,
                    resolved: 0,
                    closed: 0,
                    open: 0,
                };
            }

            const effectiveStatus = getIssueEffectiveStatus(issue);
            summary[name].total += 1;
            if (effectiveStatus === 'Pending') summary[name].pending += 1;
            if (effectiveStatus === 'In Progress') summary[name].inProgress += 1;
            if (effectiveStatus === 'Resolved') summary[name].resolved += 1;
            if (effectiveStatus === 'Closed') summary[name].closed += 1;
            if (!['Resolved', 'Closed'].includes(effectiveStatus)) summary[name].open += 1;
        });

        return Object.values(summary)
            .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'th-TH'));
    }, [filteredIssues]);

    const topStaffWorkloadData = useMemo(() => staffWorkloadData.slice(0, 10), [staffWorkloadData]);

    const allRequests = useMemo(() => [...filteredAccessRequests, ...filteredChangeRequests], [filteredAccessRequests, filteredChangeRequests]);

    const accessRequestStatusData = useMemo(
        () => groupRequestStatusData(filteredAccessRequests, { excludeStatuses: ['Pending_User_Acknowledgement'] }),
        [filteredAccessRequests],
    );
    const changeRequestStatusData = useMemo(
        () => groupRequestStatusData(filteredChangeRequests, { groups: CHANGE_REQUEST_STATUS_GROUPS }),
        [filteredChangeRequests],
    );

    const accessDepartmentData = useMemo(() => {
        const counts = {};
        filteredAccessRequests.forEach((request) => {
            const department = request.department || 'ไม่ระบุแผนก';
            counts[department] = (counts[department] || 0) + 1;
        });
        return Object.entries(counts)
            .filter(([name]) => DEPARTMENTS.includes(name) || name === 'ไม่ระบุแผนก')
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    }, [filteredAccessRequests]);

    const requestCategoryData = useMemo(() => {
        const counts = { 'พัฒนาโปรแกรม': 0, 'พัฒนาสื่อ': 0 };
        filteredChangeRequests.forEach(request => {
            const category = request.request_category;
            if (!category || category === 'ไม่ระบุประเภท') return;
            counts[category] = (counts[category] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .filter(item => item.count > 0);
    }, [filteredChangeRequests]);

    const activeAssets = useMemo(() => assets.filter(asset => String(asset.states_id || '').toLowerCase() === 'active'), [assets]);
    const assignedAssets = useMemo(() => activeAssets.filter(asset => String(asset.users_id || '').trim()), [activeAssets]);
    const assetSourceSummary = useMemo(() => ({
        buy: activeAssets.filter(asset => isSourceType(asset, 'buy')).length,
        rent: activeAssets.filter(asset => isSourceType(asset, 'rent')).length,
    }), [activeAssets]);
    const assetSourceTypeSummary = useMemo(() => activeAssets.reduce((summary, asset) => {
        const source = isSourceType(asset, 'buy') ? 'buy' : isSourceType(asset, 'rent') ? 'rent' : null;
        if (source) addTypeCount(summary[source], asset);
        return summary;
    }, { buy: {}, rent: {} }), [activeAssets]);
    const assetSourceTypeItems = useMemo(() => ({
        buy: toSortedTypeItems(assetSourceTypeSummary.buy),
        rent: toSortedTypeItems(assetSourceTypeSummary.rent),
    }), [assetSourceTypeSummary]);
    const assetTypeSummary = useMemo(() => activeAssets.reduce((summary, asset) => {
        addTypeCount(summary, asset);
        return summary;
    }, {}), [activeAssets]);
    const assetTypeItems = useMemo(() => toSortedTypeItems(assetTypeSummary), [assetTypeSummary]);
    const branchAssetSummary = useMemo(() => {
        const branches = ['VAVA1', 'VAVA2', 'VAVA3'];
        return branches.map((branch) => {
            const branchAssets = activeAssets.filter(asset => getAssetBranch(asset) === branch);
            return branchAssets.reduce((summary, asset) => {
                addTypeCount(summary.types, asset);
                summary.total += 1;
                return summary;
            }, { branch, total: 0, types: {} });
        });
    }, [activeAssets]);
    const branchPieData = useMemo(() => branchAssetSummary
        .map((item, index) => ({
            name: item.branch,
            value: item.total,
            color: ['#0ea5e9', '#8b5cf6', '#10b981'][index] || '#94a3b8',
        }))
        .filter(item => item.value > 0), [branchAssetSummary]);

    const pendingIssueCount = filteredIssues.filter(issue => issue.status === 'Pending').length;
    const inProgressIssueCount = filteredIssues.filter(issue => issue.status === 'In Progress').length;
    const closedIssueCount = filteredIssues.filter(issue => issue.status === 'Closed' || issue.userCloseSign || issue.userClosedAt).length;
    const resolvedIssueCount = filteredIssues.filter(issue => issue.status === 'Resolved' && !issue.userCloseSign && !issue.userClosedAt).length;
    const openIssueCount = filteredIssues.filter(issue => !['Resolved', 'Closed'].includes(issue.status) && !issue.userCloseSign && !issue.userClosedAt).length;
    const assignedIssueCount = filteredIssues.filter(issue => String(issue.assignedAdmin || '').trim()).length;
    const unassignedIssueCount = filteredIssues.length - assignedIssueCount;
    const activeStaffCount = staffWorkloadData.filter(item => item.name !== 'ยังไม่มีผู้รับงาน').length;
    const pendingAccessRequestCount = accessRequestStatusData[0]?.count || 0;
    const completedAccessRequestCount = accessRequestStatusData[2]?.count || 0;
    const pendingChangeRequestCount = changeRequestStatusData[0]?.count || 0;
    const closedChangeRequestCount = changeRequestStatusData.find(item => item.name === 'ปิดจบ')?.count || 0;
    const softwareChangeRequestCount = requestCategoryData.find(item => item.name === 'พัฒนาโปรแกรม')?.count || 0;
    const mediaChangeRequestCount = requestCategoryData.find(item => item.name === 'พัฒนาสื่อ')?.count || 0;
    const pendingRequestCount = pendingAccessRequestCount + pendingChangeRequestCount;
    const periodLabel = getPeriodLabel(dateFilter);

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="glass-card rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)]">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 shadow-lg shadow-orange-100 dark:bg-orange-900/50 dark:text-orange-300 dark:shadow-orange-950/30">
                            <TrendingUp className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="bg-gradient-to-r from-indigo-700 to-violet-700 bg-clip-text text-xl font-bold text-transparent dark:from-indigo-400 dark:to-violet-400">Dashboard</h2>
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">รายงานการแจ้งซ่อม คำร้องขอสิทธิ์ พัฒนา และทรัพย์สินแผนกเทคโนโลยีสารสนเทศ</p>
                        </div>
                    </div>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/70 p-2 dark:border-slate-700 dark:bg-slate-800/60">
                            <CalendarDays className="h-4 w-4 text-indigo-500" />
                            <select
                                value={dateFilter.type}
                                onChange={(event) => setDateFilter((previous) => ({ ...previous, type: event.target.value }))}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 outline-none transition focus:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                            >
                                <option value="month">รายเดือน</option>
                                <option value="quarter">รายไตรมาส</option>
                                <option value="year">รายปี</option>
                            </select>
                            {dateFilter.type === 'month' && (
                                <select
                                    value={dateFilter.month}
                                    onChange={(event) => setDateFilter((previous) => ({ ...previous, month: Number(event.target.value) }))}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 outline-none transition focus:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                >
                                    {MONTH_OPTIONS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
                                </select>
                            )}
                            {dateFilter.type === 'quarter' && (
                                <select
                                    value={dateFilter.quarter}
                                    onChange={(event) => setDateFilter((previous) => ({ ...previous, quarter: Number(event.target.value) }))}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 outline-none transition focus:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                >
                                    {[1, 2, 3, 4].map((quarter) => <option key={quarter} value={quarter}>ไตรมาส {quarter}</option>)}
                                </select>
                            )}
                            <select
                                value={dateFilter.year}
                                onChange={(event) => setDateFilter((previous) => ({ ...previous, year: Number(event.target.value) }))}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 outline-none transition focus:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                            >
                                {availableYears.map((year) => <option key={year} value={year}>{year + 543}</option>)}
                            </select>
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
            </div>

            {detailsError && (
                <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {detailsError}
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <SummaryCard icon={AlertCircle} title="แจ้งซ่อม" value={filteredIssues.length} detail={`${periodLabel} / ค้างดำเนินการ ${openIssueCount} รายการ`} color="bg-gradient-to-br from-orange-500 to-amber-500" />
                <SummaryCard
                    icon={ClipboardList}
                    title="ใบคำร้อง"
                    value={allRequests.length}
                    detail={`${periodLabel} / รอดำเนินการ ${pendingRequestCount} รายการ`}
                    color="bg-violet-100 ring-1 ring-violet-200 dark:bg-violet-900/40 dark:ring-violet-700"
                    iconClassName="text-violet-700 dark:text-violet-200"
                    cardClassName="border border-violet-100/80 bg-violet-50/60 dark:border-violet-900/50 dark:bg-violet-950/20"
                />
                <SummaryCard icon={Monitor} title="ทรัพย์สิน" value={activeAssets.length} detail={`มีผู้ใช้งาน ${assignedAssets.length} เครื่อง`} color="bg-gradient-to-br from-sky-500 to-cyan-500" />
            </div>

            <section className="space-y-4">
                <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">รายงานการแจ้งซ่อม</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">สถานะ หมวดหมู่ และแผนกที่แจ้งปัญหาเข้ามาในช่วง {periodLabel}</p>
                </div>
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <div className="glass-card rounded-3xl p-6 shadow-sm">
                        <div className="mb-6 flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-indigo-500" />
                            <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100">สถานะงานแจ้งซ่อม</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                            <MetricCard title="ทั้งหมด" value={filteredIssues.length} icon={AlertCircle} iconColor="text-orange-500" />
                            <MetricCard title="รอดำเนินการ" value={pendingIssueCount} icon={Clock3} iconColor="text-amber-500" />
                            <MetricCard title="กำลังแก้ไข" value={inProgressIssueCount} icon={RefreshCw} iconColor="text-indigo-500" />
                            <MetricCard title="เสร็จสิ้น" value={resolvedIssueCount} icon={CheckCircle2} iconColor="text-emerald-500" />
                            <MetricCard title="ปิดจบ" value={closedIssueCount} icon={CheckCircle2} iconColor="text-teal-600" />
                        </div>
                        {statusData.length === 0 ? <EmptyChart message="ยังไม่มีรายการแจ้งซ่อม" /> : (
                            <div className="mt-6 h-72 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={statusData} margin={{ top: 20, right: 20, left: -20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} allowDecimals={false} />
                                        <RechartsTooltip cursor={{ fill: '#f1f5f9', opacity: 0.4 }} contentStyle={{ borderRadius: '12px', border: 'none' }} />
                                        <Bar dataKey="value" name="จำนวนแจ้งซ่อม" radius={[6, 6, 0, 0]} maxBarSize={50}>
                                            {statusData.map(entry => <Cell key={entry.name} fill={entry.color} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    <div className="glass-card rounded-3xl p-6 shadow-sm">
                        <div className="mb-6 flex flex-col gap-4">
                            <div className="flex items-center gap-2">
                                <BarChart3 className="h-5 w-5 text-violet-500" />
                                <div>
                                    <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100">มุมมองสถิติการแจ้งซ่อม</h4>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">เลือกสลับข้อมูลที่ต้องการดู</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-900/60">
                                {ISSUE_BREAKDOWN_VIEWS.map((view) => (
                                    <button
                                        key={view.id}
                                        type="button"
                                        onClick={() => setIssueBreakdownView(view.id)}
                                        className={`rounded-xl px-2 py-2 text-xs font-bold transition-colors sm:text-sm ${
                                            issueBreakdownView === view.id
                                                ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-300'
                                                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                                        }`}
                                    >
                                        {view.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {issueBreakdownView === 'category' && (categoryData.length === 0 ? <EmptyChart message="ยังไม่มีข้อมูลหมวดหมู่แจ้งซ่อม" /> : (
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
                        ))}
                        {issueBreakdownView === 'department' && (departmentData.length === 0 ? <EmptyChart message="ยังไม่มีข้อมูลแผนกที่แจ้งซ่อม" /> : (
                            <div className="h-72 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={departmentData} layout="vertical" margin={{ top: 5, right: 30, left: 70, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" opacity={0.5} />
                                        <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} allowDecimals={false} />
                                        <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 12, fontWeight: 500 }} width={120} />
                                        <RechartsTooltip cursor={{ fill: '#f1f5f9', opacity: 0.4 }} contentStyle={{ borderRadius: '12px', border: 'none' }} />
                                        <Bar dataKey="count" name="จำนวนแจ้งซ่อม" radius={[0, 6, 6, 0]} barSize={28}>
                                            {departmentData.map((entry, index) => <Cell key={entry.name} fill={index === 0 ? '#10b981' : '#6ee7b7'} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ))}
                        {issueBreakdownView === 'staff' && (staffWorkloadData.length === 0 ? <EmptyChart message="ยังไม่มีข้อมูลเจ้าหน้าที่รับงาน" /> : (
                            <div className="space-y-4">
                                <div className="grid grid-cols-3 gap-2">
                                    <MetricCard title="เจ้าหน้าที่รับงาน" value={activeStaffCount} icon={Users} iconColor="text-cyan-500" />
                                    <MetricCard title="รับงานแล้ว" value={assignedIssueCount} icon={UserCheck} iconColor="text-emerald-500" />
                                    <MetricCard title="ยังไม่ระบุผู้รับงาน" value={unassignedIssueCount} icon={AlertCircle} iconColor="text-amber-500" />
                                </div>
                                <div className="h-80 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={topStaffWorkloadData} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" opacity={0.5} />
                                            <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} allowDecimals={false} />
                                            <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 12, fontWeight: 500 }} width={140} />
                                            <RechartsTooltip cursor={{ fill: '#f1f5f9', opacity: 0.4 }} contentStyle={{ borderRadius: '12px', border: 'none' }} />
                                            <Legend />
                                            <Bar dataKey="pending" stackId="status" name="รอดำเนินการ" fill="#f59e0b" />
                                            <Bar dataKey="inProgress" stackId="status" name="กำลังแก้ไข" fill="#6366f1" />
                                            <Bar dataKey="resolved" stackId="status" name="เสร็จสิ้น" fill="#10b981" />
                                            <Bar dataKey="closed" stackId="status" name="ปิดจบ" fill="#059669" radius={[0, 6, 6, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        ))}
                    </div>

                </div>
            </section>

            <section className="space-y-4">
                <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">รายงานคำร้อง</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">ภาพรวมการร้องขอสิทธิ์และคำร้องขอพัฒนาในช่วง {periodLabel}</p>
                </div>
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <div className="glass-card rounded-3xl p-6 shadow-sm">
                        <div className="mb-5 flex items-center gap-2">
                            <UserCheck className="h-5 w-5 text-sky-500" />
                            <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100">คำร้องขอสิทธิ์</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <MetricCard title="ทั้งหมด" value={filteredAccessRequests.length} icon={UserCheck} iconColor="text-sky-500" />
                            <MetricCard title="รอดำเนินการ" value={pendingAccessRequestCount} icon={Clock3} iconColor="text-amber-500" />
                            <MetricCard title="เสร็จสิ้น" value={completedAccessRequestCount} icon={CheckCircle2} iconColor="text-emerald-500" />
                            <MetricCard title="ยกเลิก / ไม่อนุมัติ" value={accessRequestStatusData[3]?.count || 0} icon={AlertCircle} iconColor="text-rose-500" />
                        </div>
                        <div className="mt-6 h-72 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={accessRequestStatusData} margin={{ top: 20, right: 20, left: -20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} allowDecimals={false} />
                                    <RechartsTooltip cursor={{ fill: '#f1f5f9', opacity: 0.4 }} contentStyle={{ borderRadius: '12px', border: 'none' }} />
                                    <Bar dataKey="count" name="จำนวนคำร้องขอสิทธิ์" radius={[6, 6, 0, 0]} maxBarSize={50}>
                                        {accessRequestStatusData.map(entry => <Cell key={entry.name} fill={entry.color} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="mt-8">
                            <div className="mb-4 flex items-center gap-2">
                                <Users className="h-5 w-5 text-sky-500" />
                                <h5 className="text-base font-bold text-slate-800 dark:text-slate-100">คำร้องขอสิทธิ์ตามแผนก</h5>
                            </div>
                            {accessDepartmentData.length === 0 ? <EmptyChart message="ยังไม่มีข้อมูลแผนกของคำร้องขอสิทธิ์" /> : (
                                <div className="h-72 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={accessDepartmentData} layout="vertical" margin={{ top: 5, right: 30, left: 70, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" opacity={0.5} />
                                            <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} allowDecimals={false} />
                                            <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 12, fontWeight: 500 }} width={120} />
                                            <RechartsTooltip cursor={{ fill: '#f1f5f9', opacity: 0.4 }} contentStyle={{ borderRadius: '12px', border: 'none' }} />
                                            <Bar dataKey="count" name="จำนวนคำร้องขอสิทธิ์" radius={[0, 6, 6, 0]} barSize={28}>
                                                {accessDepartmentData.map((entry, index) => <Cell key={entry.name} fill={index === 0 ? '#0ea5e9' : '#7dd3fc'} />)}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="glass-card rounded-3xl p-6 shadow-sm">
                        <div className="mb-5 flex items-center gap-2">
                            <ClipboardList className="h-5 w-5 text-violet-500" />
                            <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100">คำร้องขอพัฒนาระบบ</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <MetricCard title="ทั้งหมด" value={filteredChangeRequests.length} icon={ClipboardList} iconColor="text-violet-500" />
                            <MetricCard title="รอดำเนินการ" value={pendingChangeRequestCount} icon={Clock3} iconColor="text-amber-500" />
                            <MetricCard title="ปิดจบ" value={closedChangeRequestCount} icon={CheckCircle2} iconColor="text-teal-600" />
                            <MetricCard title="ยกเลิก / ไม่อนุมัติ" value={changeRequestStatusData.find(item => item.name === 'ยกเลิก / ไม่อนุมัติ')?.count || 0} icon={AlertCircle} iconColor="text-rose-500" />
                        </div>
                        <div className="mt-6 h-72 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={changeRequestStatusData} margin={{ top: 20, right: 20, left: -20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} allowDecimals={false} />
                                    <RechartsTooltip cursor={{ fill: '#f1f5f9', opacity: 0.4 }} contentStyle={{ borderRadius: '12px', border: 'none' }} />
                                    <Bar dataKey="count" name="จำนวนคำร้องขอพัฒนา" radius={[6, 6, 0, 0]} maxBarSize={50}>
                                        {changeRequestStatusData.map(entry => <Cell key={entry.name} fill={entry.color} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="mt-8">
                            <div className="mb-4 flex items-center gap-2">
                                <BarChart3 className="h-5 w-5 text-violet-500" />
                                <h5 className="text-base font-bold text-slate-800 dark:text-slate-100">ประเภทคำร้องขอพัฒนา</h5>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <MetricCard title="พัฒนาโปรแกรม" value={softwareChangeRequestCount} icon={ClipboardList} iconColor="text-violet-500" />
                                <MetricCard title="พัฒนาสื่อ" value={mediaChangeRequestCount} icon={BarChart3} iconColor="text-fuchsia-500" />
                            </div>
                            {requestCategoryData.length === 0 ? <EmptyChart message="ยังไม่มีประเภทคำร้องขอพัฒนา" /> : (
                                <div className="mt-6 h-72 w-full">
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
                </div>
            </section>

            <section className="space-y-4">
                <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">ทรัพย์สินด้าน Computer</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">สรุปเครื่องที่ Sync จาก GLPI และสถานะการใช้งาน</p>
                </div>
                <div className="glass-card space-y-6 rounded-3xl p-6 shadow-sm">
                    <div className="rounded-3xl border border-slate-100 bg-white/70 p-5 shadow-sm shadow-slate-200/40 dark:border-slate-700 dark:bg-slate-800/50 dark:shadow-none">
                        <div className="mb-4 flex items-center gap-2">
                            <PieChartIcon className="h-4 w-4 text-sky-500" />
                            <p className="text-base font-bold text-slate-700 dark:text-slate-200">ทรัพย์สินแยกตามสาขา</p>
                        </div>
                        {branchPieData.length === 0 ? <EmptyChart message="ยังไม่มีข้อมูลทรัพย์สินตามสาขา" /> : (
                            <div className="h-80 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={branchPieData} cx="50%" cy="50%" innerRadius={72} outerRadius={110} paddingAngle={5} dataKey="value">
                                            {branchPieData.map(entry => <Cell key={entry.name} fill={entry.color} />)}
                                        </Pie>
                                        <RechartsTooltip content={<ChartTooltip />} />
                                        <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                        <div className="h-full rounded-3xl border border-slate-100 bg-white/70 p-5 shadow-sm shadow-slate-200/40 dark:border-slate-700 dark:bg-slate-800/50 dark:shadow-none">
                            <div className="mb-4 flex items-center gap-2">
                                <Monitor className="h-4 w-4 text-emerald-500" />
                                <p className="text-base font-bold text-slate-700 dark:text-slate-200">สรุปคอมพิวเตอร์ตามแหล่งที่มา</p>
                            </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <AssetMetricCard title="เครื่อง Active" value={activeAssets.length} icon={Monitor} iconColor="text-sky-500" />
                            <AssetMetricCard title="มีผู้ใช้งาน" value={assignedAssets.length} icon={UserCheck} iconColor="text-emerald-500" />
                            <AssetMetricCard title="ยังไม่ระบุผู้ใช้" value={activeAssets.length - assignedAssets.length} icon={Users} iconColor="text-slate-500" />
                        </div>
                        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                            <AssetSourceCard
                                title="คอมพิวเตอร์ซื้อ"
                                total={assetSourceSummary.buy}
                                items={assetSourceTypeItems.buy}
                                iconColor="text-emerald-500"
                                accentClass="border-emerald-100 bg-gradient-to-br from-emerald-50/90 to-white dark:border-emerald-900/50 dark:from-emerald-950/30 dark:to-slate-900/40"
                            />
                            <AssetSourceCard
                                title="คอมพิวเตอร์เช่า"
                                total={assetSourceSummary.rent}
                                items={assetSourceTypeItems.rent}
                                iconColor="text-indigo-500"
                                accentClass="border-indigo-100 bg-gradient-to-br from-indigo-50/90 to-white dark:border-indigo-900/50 dark:from-indigo-950/30 dark:to-slate-900/40"
                            />
                        </div>
                    </div>

                        <div className="h-full rounded-3xl border border-slate-100 bg-white/70 p-5 shadow-sm shadow-slate-200/40 dark:border-slate-700 dark:bg-slate-800/50 dark:shadow-none">
                            <div className="mb-4 flex items-center gap-2">
                                <Monitor className="h-4 w-4 text-sky-500" />
                                <p className="text-base font-bold text-slate-700 dark:text-slate-200">สรุปประเภทเครื่องตามสาขา</p>
                            </div>
                            <div className="grid gap-3">
                                {branchAssetSummary.map((item) => (
                                    <div key={item.branch} className="rounded-2xl border border-slate-100 bg-slate-50/90 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                                        <div className="mb-2 flex items-center justify-between gap-3">
                                            <span className="text-sm font-black text-slate-700 dark:text-slate-200">{item.branch}</span>
                                            <span className="text-sm font-black text-sky-600 dark:text-sky-300">รวม {item.total}</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3">
                                            {toSortedTypeItems(item.types).map((typeItem, index) => (
                                                <div key={typeItem.name} className={`rounded-xl px-2 py-2 shadow-sm dark:shadow-none ${getTypeTone(index)}`}>
                                                    <p className="truncate text-[0.7rem] font-semibold text-slate-400" title={typeItem.name}>{typeItem.name}</p>
                                                    <p className="text-base font-black text-slate-800 dark:text-white">{typeItem.count}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 dark:border-sky-900/50 dark:bg-sky-950/30">
                                    <div className="mb-2 flex items-center justify-between gap-3">
                                        <span className="text-sm font-black text-sky-700 dark:text-sky-200">รวมทุกสาขา</span>
                                        <span className="text-sm font-black text-sky-700 dark:text-sky-200">รวม {activeAssets.length}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3">
                                        {assetTypeItems.map((typeItem, index) => (
                                            <div key={typeItem.name} className={`rounded-xl px-2 py-2 shadow-sm dark:shadow-none ${getTypeTone(index)}`}>
                                                <p className="truncate text-[0.7rem] font-semibold text-slate-400" title={typeItem.name}>{typeItem.name}</p>
                                                <p className="text-base font-black text-slate-800 dark:text-white">{typeItem.count}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default IssueStatistics;
