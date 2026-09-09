import { useCallback, useEffect, useMemo, useState } from 'react';
import { DoorClosed, DoorOpen, Eye, RefreshCw, SearchX, Server, ShieldCheck } from 'lucide-react';
import { mysql } from '../../mysqlClient';
import { SystemDataTable, SystemDetailDrawer, SystemPageHeader, SystemStatCard, SystemStatusBadge } from '../system-ui';

const STATUS_META = {
    Pending_Approval: ['รออนุมัติ', 'warning'],
    Approved: ['อยู่ในห้อง', 'info'],
    Exited: ['ออกจากห้องแล้ว', 'success'],
};
const formatDateTime = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

export default function TailAdminServerRoomPage({ query, onOpenLegacy }) {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('all');
    const [selected, setSelected] = useState(null);

    const loadLogs = useCallback(async () => {
        setLoading(true);
        setError('');
        const { data, error: loadError } = await mysql.from('controlled_area_logs')
            .select('id,entry_date,department,full_name,entry_time,reason,status,approved_by,approved_role,approved_at,exit_time,exited_by,exited_role,created_at')
            .order('entry_time', { ascending: false });
        if (loadError) {
            setError(loadError.message || 'โหลดข้อมูลห้อง Server ไม่สำเร็จ');
            setLogs([]);
        } else setLogs(data || []);
        setLoading(false);
    }, []);
    useEffect(() => { loadLogs(); }, [loadLogs]);

    const counts = useMemo(() => ({
        pending: logs.filter((item) => item.status === 'Pending_Approval').length,
        approved: logs.filter((item) => item.status === 'Approved').length,
        exited: logs.filter((item) => item.status === 'Exited').length,
    }), [logs]);
    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return logs.filter((item) => status === 'all' || item.status === status)
            .filter((item) => !needle || [item.full_name, item.department, item.reason, item.approved_by, item.exited_by].some((value) => String(value || '').toLowerCase().includes(needle)));
    }, [logs, query, status]);
    const columns = [
        { key: 'name', label: 'ผู้ขอเข้า', render: (item) => <div className="tap-cell-stack"><strong>{item.full_name || '-'}</strong><span>{item.department || '-'}</span></div> },
        { key: 'reason', label: 'เหตุผล', render: (item) => <span className="tap-request-detail">{item.reason || '-'}</span> },
        { key: 'entry', label: 'เวลาเข้า', render: (item) => formatDateTime(item.entry_time || item.entry_date) },
        { key: 'status', label: 'สถานะ', render: (item) => <SystemStatusBadge tone={(STATUS_META[item.status] || STATUS_META.Pending_Approval)[1]}>{(STATUS_META[item.status] || [item.status])[0]}</SystemStatusBadge> },
        { key: 'approved', label: 'ผู้อนุมัติ', render: (item) => <div className="tap-cell-stack"><strong>{item.approved_by || '-'}</strong><span>{formatDateTime(item.approved_at)}</span></div> },
        { key: 'exit', label: 'เวลาออก', render: (item) => formatDateTime(item.exit_time) },
        { key: 'action', label: '', render: (item) => <button type="button" className="tap-row-action" title="ดูรายละเอียด" onClick={() => setSelected(item)}><Eye size={18} /></button> },
    ];

    return <>
        <SystemPageHeader breadcrumb="IT Helpdesk / Controlled Area" title="ห้อง Server" meta="ติดตามการเข้าออกพื้นที่ควบคุม" actions={<div className="tap-page-actions"><button type="button" className="tap-secondary-button" disabled={loading} onClick={loadLogs}><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> รีเฟรช</button><button type="button" className="tap-primary-button" onClick={onOpenLegacy}><Server size={17} /> เปิดหน้าเดิม</button></div>} />
        <section className="tap-request-summary tap-user-summary">
            <button type="button" className={`tap-stat-filter ${status === 'Pending_Approval' ? 'is-selected' : ''}`} onClick={() => setStatus(status === 'Pending_Approval' ? 'all' : 'Pending_Approval')}><SystemStatCard icon={ShieldCheck} label="รออนุมัติ" value={counts.pending.toLocaleString('th-TH')} detail="คำขอเข้าพื้นที่" tone="amber" /></button>
            <button type="button" className={`tap-stat-filter ${status === 'Approved' ? 'is-selected' : ''}`} onClick={() => setStatus(status === 'Approved' ? 'all' : 'Approved')}><SystemStatCard icon={DoorOpen} label="อยู่ในห้อง" value={counts.approved.toLocaleString('th-TH')} detail="อนุมัติและยังไม่ออก" tone="blue" /></button>
            <button type="button" className={`tap-stat-filter ${status === 'Exited' ? 'is-selected' : ''}`} onClick={() => setStatus(status === 'Exited' ? 'all' : 'Exited')}><SystemStatCard icon={DoorClosed} label="ออกจากห้องแล้ว" value={counts.exited.toLocaleString('th-TH')} detail="บันทึกเวลาออกครบแล้ว" tone="green" /></button>
        </section>
        <section className="tap-card tap-issue-list">
            <div className="tap-issue-toolbar"><div className="tap-toolbar-title"><Server size={20} /><div><h2>ประวัติการเข้าออก</h2><p>แสดง {filtered.length.toLocaleString('th-TH')} จาก {logs.length.toLocaleString('th-TH')} รายการ</p></div></div><div className="tap-filter-controls"><label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">ทุกสถานะ</option><option value="Pending_Approval">รออนุมัติ</option><option value="Approved">อยู่ในห้อง</option><option value="Exited">ออกจากห้องแล้ว</option></select></label></div></div>
            {error && <div className="tap-inline-error">{error}</div>}
            <SystemDataTable columns={columns} rows={filtered} loading={loading} minWidth={1120} empty={<div className="tap-no-results"><SearchX size={25} /><strong>ไม่พบประวัติการเข้าออก</strong><span>ลองเปลี่ยนคำค้นหาหรือสถานะ</span></div>} />
        </section>
        <SystemDetailDrawer open={Boolean(selected)} title={selected?.full_name || 'รายละเอียดการเข้าออก'} eyebrow="พื้นที่ควบคุม: ห้อง Server" onClose={() => setSelected(null)} footer={<><button type="button" onClick={() => setSelected(null)}>ปิด</button><button type="button" className="tap-primary-button" onClick={onOpenLegacy}>ดำเนินการในหน้าเดิม</button></>}>
            {selected && <><div className="tap-detail-status"><Server size={19} /><div><span>สถานะปัจจุบัน</span><strong>{(STATUS_META[selected.status] || [selected.status])[0]}</strong></div></div><dl>
                <div><dt>ชื่อผู้ขอเข้า</dt><dd>{selected.full_name || '-'}</dd></div><div><dt>แผนก</dt><dd>{selected.department || '-'}</dd></div>
                <div className="full"><dt>เหตุผล</dt><dd>{selected.reason || '-'}</dd></div><div><dt>เวลาเข้า</dt><dd>{formatDateTime(selected.entry_time || selected.entry_date)}</dd></div><div><dt>เวลาออก</dt><dd>{formatDateTime(selected.exit_time)}</dd></div>
                <div><dt>ผู้อนุมัติ</dt><dd>{selected.approved_by || '-'}</dd></div><div><dt>เวลาอนุมัติ</dt><dd>{formatDateTime(selected.approved_at)}</dd></div><div><dt>ผู้บันทึกออก</dt><dd>{selected.exited_by || '-'}</dd></div>
            </dl></>}
        </SystemDetailDrawer>
    </>;
}
