import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Eye, FileKey2, FileText, RefreshCw, SearchX, Server, Wrench } from 'lucide-react';
import { mysql } from '../../mysqlClient';
import { APPROVAL_QUEUE_STATUS_BY_ROLE, canApproveServerRoomEntry, normalizeRoleValue, visibleQueueStatuses } from '../../config/roles';
import { SystemDataTable, SystemDetailDrawer, SystemPageHeader, SystemStatCard, SystemStatusBadge } from '../system-ui';

const TYPE_META = {
    access: ['ขอผู้ใช้งานระบบ', FileKey2, 'info'],
    change: ['ขอพัฒนาระบบ', Wrench, 'success'],
    server_room: ['เข้าห้อง Server', Server, 'warning'],
    asset_pm: ['รายงาน PM', ClipboardCheck, 'neutral'],
};
const STATUS_LABELS = {
    Pending_IT_Supervisor: 'รอหัวหน้าแผนก',
    Pending_IT_Manager: 'รอผู้จัดการ',
    Pending_Approval: 'รออนุมัติ',
};
const formatDateTime = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

export default function TailAdminApprovalPage({ query, currentAdmin, onOpenLegacy }) {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [type, setType] = useState('all');
    const [selected, setSelected] = useState(null);
    const role = normalizeRoleValue(currentAdmin?.role);

    const loadDocuments = useCallback(async () => {
        setLoading(true);
        setError('');
        const statuses = visibleQueueStatuses(role, APPROVAL_QUEUE_STATUS_BY_ROLE);
        const empty = Promise.resolve({ data: [], error: null });
        const [accessResult, changeResult, serverResult, pmResult] = await Promise.all([
            statuses.length ? mysql.from('access_requests').select('id,ticket_number,name_th,department,request_details,other_system_details,status,created_at').in('status', statuses).order('created_at', { ascending: false }) : empty,
            statuses.length ? mysql.from('change_requests').select('id,ticket_number,requester_name,department,details,status,created_at').in('status', statuses).not('status', 'Pending_IT_Supervisor').order('created_at', { ascending: false }) : empty,
            canApproveServerRoomEntry(role) ? mysql.from('controlled_area_logs').select('id,entry_date,department,full_name,entry_time,reason,status,created_at').eq('status', 'Pending_Approval').order('entry_time', { ascending: false }) : empty,
            statuses.includes('Pending_IT_Manager') ? mysql.from('asset_pm_report_batches').select('id,report_year,record_count,inspector_name,inspector_position,status,created_at').eq('status', 'Pending_IT_Manager').order('created_at', { ascending: false }) : empty,
        ]);
        const failed = [accessResult, changeResult, serverResult, pmResult].find((result) => result.error);
        if (failed) {
            setError(failed.error?.message || 'โหลดกล่องอนุมัติไม่สำเร็จ');
            setDocuments([]);
        } else {
            setDocuments([
                ...(accessResult.data || []).map((item) => ({ ...item, key: `access-${item.id}`, type: 'access', ticket: item.ticket_number, requester: item.name_th, details: item.request_details || item.other_system_details })),
                ...(changeResult.data || []).map((item) => ({ ...item, key: `change-${item.id}`, type: 'change', ticket: item.ticket_number, requester: item.requester_name })),
                ...(serverResult.data || []).map((item) => ({ ...item, key: `server-${item.id}`, type: 'server_room', ticket: `SERVER-${item.id}`, requester: item.full_name, details: item.reason, created_at: item.entry_time || item.created_at })),
                ...(pmResult.data || []).map((item) => ({ ...item, key: `pm-${item.id}`, type: 'asset_pm', ticket: `PM-${item.report_year || item.id}`, requester: item.inspector_name, department: 'เทคโนโลยีสารสนเทศ และ ERP', details: `รายงาน PM ${item.record_count || 0} เครื่อง` })),
            ].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)));
        }
        setLoading(false);
    }, [role]);
    useEffect(() => { loadDocuments(); }, [loadDocuments]);

    const counts = useMemo(() => Object.fromEntries(Object.keys(TYPE_META).map((key) => [key, documents.filter((item) => item.type === key).length])), [documents]);
    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return documents.filter((item) => type === 'all' || item.type === type)
            .filter((item) => !needle || [item.ticket, item.requester, item.department, item.details].some((value) => String(value || '').toLowerCase().includes(needle)));
    }, [documents, query, type]);
    const columns = [
        { key: 'type', label: 'ประเภท', render: (item) => { const [label, Icon, tone] = TYPE_META[item.type]; return <div className="tap-doc-type"><span><Icon size={16} /></span><SystemStatusBadge tone={tone}>{label}</SystemStatusBadge></div>; } },
        { key: 'ticket', label: 'เลขที่เอกสาร', render: (item) => <strong className="tap-mono-value">{item.ticket || '-'}</strong> },
        { key: 'requester', label: 'ผู้ขอ / แผนก', render: (item) => <div className="tap-cell-stack"><strong>{item.requester || '-'}</strong><span>{item.department || '-'}</span></div> },
        { key: 'details', label: 'รายละเอียด', render: (item) => <span className="tap-request-detail">{item.details || '-'}</span> },
        { key: 'created', label: 'วันที่ส่ง', render: (item) => formatDateTime(item.created_at) },
        { key: 'status', label: 'ขั้นตอน', render: (item) => <SystemStatusBadge tone="warning">{STATUS_LABELS[item.status] || item.status || 'รออนุมัติ'}</SystemStatusBadge> },
        { key: 'action', label: '', render: (item) => <button type="button" className="tap-row-action" title="ดูรายละเอียด" onClick={() => setSelected(item)}><Eye size={18} /></button> },
    ];

    return <>
        <SystemPageHeader breadcrumb="IT Helpdesk / Approval" title="กล่องอนุมัติ" meta="รวมเอกสารที่รอลงนามตามสิทธิ์ของคุณ" actions={<div className="tap-page-actions"><button type="button" className="tap-secondary-button" disabled={loading} onClick={loadDocuments}><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> รีเฟรช</button><button type="button" className="tap-primary-button" onClick={onOpenLegacy}><FileText size={17} /> เปิดหน้าเดิม</button></div>} />
        <section className="tap-request-summary">{Object.entries(TYPE_META).map(([key, [label, Icon]], index) => <button key={key} type="button" className={`tap-stat-filter ${type === key ? 'is-selected' : ''}`} onClick={() => setType(type === key ? 'all' : key)}><SystemStatCard icon={Icon} label={label} value={(counts[key] || 0).toLocaleString('th-TH')} detail="เอกสารรอดำเนินการ" tone={['blue', 'green', 'amber', 'red'][index]} /></button>)}</section>
        <section className="tap-card tap-issue-list">
            <div className="tap-issue-toolbar"><div className="tap-toolbar-title"><ClipboardCheck size={20} /><div><h2>รายการรออนุมัติ</h2><p>แสดง {filtered.length.toLocaleString('th-TH')} จาก {documents.length.toLocaleString('th-TH')} รายการ</p></div></div><div className="tap-filter-controls"><label><select value={type} onChange={(event) => setType(event.target.value)}><option value="all">ทุกประเภท</option>{Object.entries(TYPE_META).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}</select></label></div></div>
            {error && <div className="tap-inline-error">{error}</div>}
            <SystemDataTable columns={columns} rows={filtered} rowKey="key" loading={loading} minWidth={1170} empty={<div className="tap-no-results"><SearchX size={25} /><strong>ไม่พบเอกสารรออนุมัติ</strong><span>ไม่มีคิวตามสิทธิ์นี้ หรือลองเปลี่ยนตัวกรอง</span></div>} />
        </section>
        <SystemDetailDrawer open={Boolean(selected)} title={selected?.ticket || 'รายละเอียดเอกสาร'} eyebrow={(TYPE_META[selected?.type] || ['เอกสาร'])[0]} onClose={() => setSelected(null)} footer={<><button type="button" onClick={() => setSelected(null)}>ปิด</button><button type="button" className="tap-primary-button" onClick={onOpenLegacy}>ตรวจสอบและลงนามในหน้าเดิม</button></>}>
            {selected && <><div className="tap-detail-status"><ClipboardCheck size={19} /><div><span>ขั้นตอนปัจจุบัน</span><strong>{STATUS_LABELS[selected.status] || selected.status || 'รออนุมัติ'}</strong></div></div><dl>
                <div><dt>เลขที่เอกสาร</dt><dd>{selected.ticket || '-'}</dd></div><div><dt>ประเภท</dt><dd>{TYPE_META[selected.type][0]}</dd></div>
                <div><dt>ผู้ขอ</dt><dd>{selected.requester || '-'}</dd></div><div><dt>แผนก</dt><dd>{selected.department || '-'}</dd></div><div className="full"><dt>รายละเอียด</dt><dd>{selected.details || '-'}</dd></div><div><dt>วันที่ส่ง</dt><dd>{formatDateTime(selected.created_at)}</dd></div>
            </dl></>}
        </SystemDetailDrawer>
    </>;
}
