import { useMemo, useState } from 'react';
import {
    ArrowRightLeft, CircleGauge, ClipboardCheck, ClipboardList, FileCheck2, FileKey2,
    MessageCircle, MonitorCog, PackageOpen, Server, UserCog, UsersRound, Wrench,
} from 'lucide-react';
import {
    Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
    Tooltip, XAxis, YAxis,
} from 'recharts';
import {
    SystemAppShell, SystemPageHeader, SystemStatCard, SystemStatusBadge,
} from '@/shared/system-ui';
import TailAdminIssuePage from './TailAdminIssuePage';
import TailAdminAssetPage from './TailAdminAssetPage';
import TailAdminAssetStatusPage from './TailAdminAssetStatusPage';
import TailAdminPmPage from './TailAdminPmPage';
import TailAdminRequestPage from './TailAdminRequestPage';
import TailAdminEmployeePage from './TailAdminEmployeePage';
import TailAdminUserPage from './TailAdminUserPage';
import TailAdminApprovalPage from './TailAdminApprovalPage';
import TailAdminServerRoomPage from './TailAdminServerRoomPage';
import TailAdminChatPage from './TailAdminChatPage';
import { canManageAdminUsers } from '../../config/roles';
import './tailadmin-preview.css';

const STATUS_META = {
    Pending: ['รอดำเนินการ', 'warning'],
    'In Progress': ['กำลังแก้ไข', 'info'],
    Resolved: ['เสร็จสิ้น', 'success'],
    Closed: ['ปิดจบ', 'neutral'],
};
const effectiveStatus = (issue) => issue?.status === 'Closed' || issue?.userCloseSign || issue?.userClosedAt ? 'Closed' : issue?.status || 'Pending';
const formatDate = (value) => {
    const date = new Date(value || 0);
    return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }).format(date);
};

export default function TailAdminDashboardPreview({ issues = [], currentAdmin, isLoading = false, onNavigate, onOpenCenter }) {
    const [query, setQuery] = useState('');
    const [page, setPage] = useState('stats');
    const summary = useMemo(() => {
        const result = { Pending: 0, 'In Progress': 0, Resolved: 0, Closed: 0 };
        issues.forEach((issue) => {
            const status = effectiveStatus(issue);
            result[status] = (result[status] || 0) + 1;
        });
        return result;
    }, [issues]);
    const monthlyData = useMemo(() => {
        const now = new Date();
        return Array.from({ length: 12 }, (_, index) => {
            const date = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1);
            return {
                month: new Intl.DateTimeFormat('th-TH', { month: 'short' }).format(date),
                count: issues.filter((issue) => {
                    const created = new Date(issue.created_at || issue.createdAt || issue.date || 0);
                    return created.getMonth() === date.getMonth() && created.getFullYear() === date.getFullYear();
                }).length,
            };
        });
    }, [issues]);
    const statusData = useMemo(() => [
        { name: 'รอดำเนินการ', value: summary.Pending, color: '#f79009' },
        { name: 'กำลังแก้ไข', value: summary['In Progress'], color: '#465fff' },
        { name: 'เสร็จสิ้น', value: summary.Resolved, color: '#12b76a' },
        { name: 'ปิดจบ', value: summary.Closed, color: '#667085' },
    ], [summary]);
    const rows = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return [...issues].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).filter((issue) => !needle || [
            issue.document_no, issue.ticket_no, issue.name, issue.department, issue.problem, issue.category,
        ].some((value) => String(value || '').toLowerCase().includes(needle))).slice(0, 7);
    }, [issues, query]);
    const openCount = summary.Pending + summary['In Progress'];
    const completed = summary.Resolved + summary.Closed;
    const completionRate = issues.length ? Math.round((completed / issues.length) * 100) : 0;
    const navItems = [
        { id: 'stats', label: 'แดชบอร์ด', icon: CircleGauge },
        { id: 'issues', label: 'งานแจ้งซ่อม', icon: ClipboardList, badge: openCount },
        { id: 'assets', label: 'ข้อมูลคอมพิวเตอร์', icon: MonitorCog },
        { id: 'asset_status', label: 'ทรัพย์สินคอมพิวเตอร์', icon: ArrowRightLeft },
        { id: 'asset_pm', label: 'การทำ PM', icon: ClipboardCheck },
        { id: 'access_requests', label: 'ขอผู้ใช้งานระบบ', icon: FileKey2 },
        { id: 'change_requests', label: 'ขอพัฒนาระบบ', icon: Wrench },
        { id: 'approved_documents', label: 'กล่องอนุมัติ', icon: FileCheck2 },
        { id: 'server_room', label: 'ห้อง Server', icon: Server },
        { id: 'it_chat', label: 'แชทติดต่อ IT', icon: MessageCircle },
        { id: 'employees', label: 'พนักงาน', icon: UsersRound },
        ...(canManageAdminUsers(currentAdmin?.role) ? [{ id: 'users', label: 'จัดการผู้ใช้งาน', icon: UserCog }] : []),
    ];
    const handleNavigate = (id) => {
        if (['stats', 'issues', 'assets', 'asset_status', 'asset_pm', 'access_requests', 'change_requests', 'approved_documents', 'server_room', 'it_chat', 'employees', 'users'].includes(id)) setPage(id);
        else onNavigate?.(id);
    };

    return (
        <SystemAppShell
            navItems={navItems}
            activePage={page}
            onNavigate={handleNavigate}
            onOpenCenter={onOpenCenter}
            onExit={() => onNavigate?.('stats')}
            query={query}
            onQueryChange={setQuery}
            searchPlaceholder="ค้นหาเลขที่เอกสาร ผู้แจ้ง หรือปัญหา..."
            currentUser={currentAdmin}
            notificationCount={openCount}
            notificationItems={[
                { label: 'งานรอดำเนินการ', value: summary.Pending },
                { label: 'งานกำลังแก้ไข', value: summary['In Progress'] },
            ]}
        >
            {page === 'issues' ? (
                <TailAdminIssuePage issues={issues} query={query} isLoading={isLoading} onOpenLegacy={() => onNavigate?.('issues')} />
            ) : page === 'assets' ? (
                <TailAdminAssetPage issues={issues} query={query} onOpenLegacy={() => onNavigate?.('assets')} />
            ) : page === 'asset_status' ? (
                <TailAdminAssetStatusPage query={query} onOpenLegacy={() => onNavigate?.('asset_status')} />
            ) : page === 'asset_pm' ? (
                <TailAdminPmPage query={query} onOpenLegacy={() => onNavigate?.('asset_pm')} />
            ) : page === 'access_requests' ? (
                <TailAdminRequestPage type="access" query={query} currentAdmin={currentAdmin} onOpenLegacy={() => onNavigate?.('access_requests')} />
            ) : page === 'change_requests' ? (
                <TailAdminRequestPage type="change" query={query} currentAdmin={currentAdmin} onOpenLegacy={() => onNavigate?.('change_requests')} />
            ) : page === 'approved_documents' ? (
                <TailAdminApprovalPage query={query} currentAdmin={currentAdmin} onOpenLegacy={() => onNavigate?.('approved_documents')} />
            ) : page === 'server_room' ? (
                <TailAdminServerRoomPage query={query} onOpenLegacy={() => onNavigate?.('server_room')} />
            ) : page === 'it_chat' ? (
                <TailAdminChatPage query={query} currentAdmin={currentAdmin} onOpenLegacy={() => onNavigate?.('it_chat')} />
            ) : page === 'employees' ? (
                <TailAdminEmployeePage query={query} onOpenLegacy={() => onNavigate?.('employees')} />
            ) : page === 'users' && canManageAdminUsers(currentAdmin?.role) ? (
                <TailAdminUserPage query={query} onOpenLegacy={() => onNavigate?.('users')} />
            ) : (
                <>
                    <SystemPageHeader
                        breadcrumb="IT Helpdesk / Dashboard"
                        title="แดชบอร์ด"
                        meta={`อัปเดตล่าสุด ${new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}`}
                    />
                    <section className="tap-dashboard-grid">
                        <div className="tap-primary-column">
                            <div className="tap-metrics-grid">
                                <SystemStatCard icon={ClipboardList} label="งานทั้งหมด" value={issues.length.toLocaleString('th-TH')} detail="ทุกรายการ" tone="blue" />
                                <SystemStatCard icon={PackageOpen} label="งานที่ยังไม่ปิด" value={openCount.toLocaleString('th-TH')} detail={`${summary.Pending} งานใหม่`} tone="amber" />
                            </div>
                            <article className="tap-card tap-chart-card">
                                <div className="tap-card-heading"><div><h2>งานแจ้งซ่อมรายเดือน</h2><p>จำนวนรายการย้อนหลัง 12 เดือน</p></div><span>12 เดือน</span></div>
                                <div className="tap-chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={monthlyData} margin={{ top: 12, right: 8, left: -22 }}>
                                    <defs><linearGradient id="tapAreaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#465fff" stopOpacity={0.28} /><stop offset="95%" stopColor="#465fff" stopOpacity={0} /></linearGradient></defs>
                                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="currentColor" className="tap-chart-grid" />
                                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#98a2b3', fontSize: 12 }} />
                                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#98a2b3', fontSize: 12 }} />
                                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e4e7ec' }} />
                                    <Area type="monotone" dataKey="count" name="จำนวนงาน" stroke="#465fff" strokeWidth={2.5} fill="url(#tapAreaGradient)" />
                                </AreaChart></ResponsiveContainer></div>
                            </article>
                        </div>
                        <article className="tap-card tap-target-card">
                            <div className="tap-card-heading"><div><h2>ภาพรวมสถานะงาน</h2><p>สัดส่วนงานทั้งหมด</p></div></div>
                            <div className="tap-donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={statusData} dataKey="value" nameKey="name" innerRadius={78} outerRadius={98} paddingAngle={3} stroke="none">{statusData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="tap-donut-center"><strong>{completionRate}%</strong><span>ดำเนินการแล้ว</span></div></div>
                            <div className="tap-status-legend">{statusData.map((item) => <div key={item.name}><i style={{ background: item.color }} /><p>{item.name}<strong>{item.value.toLocaleString('th-TH')}</strong></p></div>)}</div>
                            <div className="tap-target-note"><PackageOpen size={19} /><p><strong>{completed} งาน</strong><span>เสร็จสิ้นหรือปิดจบแล้ว</span></p></div>
                        </article>
                        <article className="tap-card tap-table-card">
                            <div className="tap-card-heading"><div><h2>งานแจ้งซ่อมล่าสุด</h2><p>{query ? `ผลการค้นหา “${query}”` : 'รายการที่มีการแจ้งเข้ามาล่าสุด'}</p></div><button type="button" onClick={() => setPage('issues')}>ดูทั้งหมด</button></div>
                            <div className="tap-table-scroll"><table><thead><tr><th>เลขที่เอกสาร</th><th>ผู้แจ้ง / แผนก</th><th>รายละเอียด</th><th>วันที่แจ้ง</th><th>สถานะ</th></tr></thead><tbody>
                                {rows.map((issue, index) => {
                                    const status = effectiveStatus(issue);
                                    const meta = STATUS_META[status] || STATUS_META.Pending;
                                    return <tr key={issue.id || index}><td><strong>{issue.document_no || issue.ticket_no || issue.doc_no || `#${issue.id || index + 1}`}</strong></td><td><b>{issue.name || issue.reporter_name || '-'}</b><span>{issue.department || '-'}</span></td><td><b className="tap-problem">{issue.problem || issue.description || issue.category || '-'}</b><span>{issue.category || '-'}</span></td><td>{formatDate(issue.created_at || issue.createdAt || issue.date)}</td><td><SystemStatusBadge tone={meta[1]}>{meta[0]}</SystemStatusBadge></td></tr>;
                                })}
                                {!isLoading && !rows.length && <tr><td colSpan="5" className="tap-empty">ไม่พบข้อมูลที่ค้นหา</td></tr>}
                                {isLoading && <tr><td colSpan="5" className="tap-empty">กำลังโหลดข้อมูล...</td></tr>}
                            </tbody></table></div>
                        </article>
                    </section>
                </>
            )}
        </SystemAppShell>
    );
}
