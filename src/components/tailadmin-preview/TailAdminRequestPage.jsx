import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardPenLine, Eye, FileKey2, RefreshCw, SearchX, Wrench } from 'lucide-react';
import { mysql } from '../../mysqlClient';
import { canHandleChangeRequestCategory, normalizeRoleValue } from '../../config/roles';
import { SystemDataTable, SystemDetailDrawer, SystemPageHeader, SystemStatCard, SystemStatusBadge } from '../system-ui';

const ACCESS_LABELS = {
    Pending: 'ร้องขอ', Pending_Manager: 'ผู้จัดการของผู้แจ้ง', Pending_IT: 'รับแจ้ง',
    Pending_IT_Supervisor: 'หัวหน้าแผนก', Pending_IT_Manager: 'ผู้จัดการ',
    Pending_User_Acknowledgement: 'ผู้แจ้งรับทราบ', Approved: 'อนุมัติแล้ว',
    Completed: 'เสร็จสิ้น', Rejected: 'ไม่อนุมัติ', Cancelled: 'ยกเลิก',
};
const CHANGE_LABELS = {
    Pending_IT: 'รับแจ้ง', Pending_IT_Manager: 'ผู้จัดการ', In_Progress: 'รอดำเนินการ',
    In_Development: 'กำลังดำเนินการ', Pending_User_Acceptance: 'รอผู้แจ้งรับทราบ',
    Completed: 'ปิดจบ', Rejected: 'ไม่อนุมัติ', Cancelled: 'ยกเลิก',
};
const statusTone = (status) => {
    if (['Completed', 'Approved'].includes(status)) return 'success';
    if (['Rejected', 'Cancelled'].includes(status)) return 'danger';
    if (['In_Progress', 'In_Development'].includes(status)) return 'info';
    return 'warning';
};
const normalizeSystems = (value) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try { return JSON.parse(value) || {}; } catch { return {}; }
};
const SYSTEM_LABELS = {
    userComputer: 'User Computer', email: 'E-Mail', dataAll: 'Data All', vpn: 'VPN',
    allWeb: 'All Web', wms: 'WMS', msDynamics365: 'MS Dynamics365', cyberHrm: 'Cyber HRM',
};
const formatSystems = (request) => {
    const systems = normalizeSystems(request.systems);
    const labels = Object.entries(systems).filter(([key, enabled]) => enabled && key !== 'other').map(([key]) => SYSTEM_LABELS[key] || key);
    if (systems.other) labels.push(request.other_system_details || 'อื่น ๆ');
    return labels.length ? labels.join(', ') : '-';
};
const formatDate = (value) => {
    const date = new Date(value || 0);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('th-TH');
};

export default function TailAdminRequestPage({ type, query, currentAdmin, onOpenLegacy }) {
    const isAccess = type === 'access';
    const table = isAccess ? 'access_requests' : 'change_requests';
    const labels = isAccess ? ACCESS_LABELS : CHANGE_LABELS;
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selected, setSelected] = useState(null);
    const [page, setPage] = useState(1);
    const pageSize = 12;
    const loadData = useCallback(async () => {
        setLoading(true);
        const { data, error: loadError } = await mysql.from(table).select('*').order('created_at', { ascending: false });
        if (loadError) {
            setError(`ไม่สามารถโหลดข้อมูล ${table} ได้`);
            setRequests([]);
        } else {
            const role = normalizeRoleValue(currentAdmin?.role);
            setRequests((data || []).filter((item) => isAccess || canHandleChangeRequestCategory(role, item)));
            setError('');
        }
        setLoading(false);
    }, [currentAdmin?.role, isAccess, table]);
    useEffect(() => { loadData(); }, [loadData]);
    const statuses = useMemo(() => [...new Set(requests.map((item) => item.status || (isAccess ? 'Pending_Manager' : 'Pending_IT')).filter(Boolean))], [isAccess, requests]);
    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return requests.filter((item) => status === 'all' || (item.status || 'Pending_Manager') === status).filter((item) => {
            const date = new Date(item.created_at);
            if (startDate && date < new Date(startDate)) return false;
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                if (date > end) return false;
            }
            return true;
        }).filter((item) => !needle || [
            item.ticket_number, item.name_th, item.employee_id, item.department,
            item.requester_name, item.request_category, item.details, item.description,
            item.request_details, item.reason, item.it_staff_name,
        ].some((value) => String(value || '').toLowerCase().includes(needle)));
    }, [endDate, query, requests, startDate, status]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
    useEffect(() => setPage(1), [endDate, query, startDate, status]);
    const doneCount = requests.filter((item) => ['Completed', 'Approved'].includes(item.status)).length;
    const cancelledCount = requests.filter((item) => ['Cancelled', 'Rejected'].includes(item.status)).length;
    const activeCount = requests.length - doneCount - cancelledCount;
    const columns = isAccess ? [
        { key: 'ticket', label: 'เลขที่เอกสาร', render: (item) => <div className="tap-cell-stack"><strong>{item.ticket_number || '-'}</strong><span>{formatDate(item.created_at)}</span></div> },
        { key: 'employee', label: 'รหัสพนักงาน', render: (item) => item.employee_id || '-' },
        { key: 'requester', label: 'ชื่อ / แผนก', render: (item) => <div className="tap-cell-stack"><strong>{item.name_th || '-'}</strong><span>{item.department || '-'}</span></div> },
        { key: 'systems', label: 'ระบบที่ขอสิทธิ์', render: (item) => <div className="tap-request-detail">{formatSystems(item)}</div> },
        { key: 'staff', label: 'ผู้ดำเนินการ', render: (item) => item.it_staff_name || '-' },
        { key: 'status', label: 'สถานะ', render: (item) => <SystemStatusBadge tone={statusTone(item.status)}>{labels[item.status] || item.status || 'ร้องขอ'}</SystemStatusBadge> },
        { key: 'action', label: '', render: (item) => <button type="button" className="tap-row-action" onClick={() => setSelected(item)}><Eye size={18} /></button> },
    ] : [
        { key: 'ticket', label: 'เลขที่เอกสาร', render: (item) => <div className="tap-cell-stack"><strong>{item.ticket_number || '-'}</strong><span>{formatDate(item.created_at)}</span></div> },
        { key: 'type', label: 'ประเภทคำร้อง', render: (item) => <div className="tap-cell-stack"><strong>{item.request_category || '-'}</strong><span>{item.req_type || '-'}</span></div> },
        { key: 'requester', label: 'ผู้ร้องขอ / แผนก', render: (item) => <div className="tap-cell-stack"><strong>{item.requester_name || '-'}</strong><span>{item.department || '-'}</span></div> },
        { key: 'details', label: 'รายละเอียด', render: (item) => <div className="tap-request-detail">{item.details || item.description || item.request_details || '-'}</div> },
        { key: 'staff', label: 'ผู้ดำเนินการ', render: (item) => item.it_staff_name || '-' },
        { key: 'status', label: 'สถานะ', render: (item) => <SystemStatusBadge tone={statusTone(item.status)}>{labels[item.status] || item.status || '-'}</SystemStatusBadge> },
        { key: 'action', label: '', render: (item) => <button type="button" className="tap-row-action" onClick={() => setSelected(item)}><Eye size={18} /></button> },
    ];
    const Icon = isAccess ? FileKey2 : ClipboardPenLine;
    return <>
        <SystemPageHeader breadcrumb={`IT Helpdesk / ${isAccess ? 'Access Request' : 'Change Request'}`} title={isAccess ? 'คำร้องขอสิทธิ์ใช้งานระบบ' : 'คำร้องขอพัฒนาระบบ'} className="tap-issue-heading" actions={<div className="tap-page-actions"><button type="button" className="tap-secondary-button" disabled={loading} onClick={loadData}><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> รีเฟรช</button><button type="button" className="tap-primary-button" onClick={onOpenLegacy}><Wrench size={17} /> เปิดหน้าเดิม</button></div>} />
        <section className="tap-request-summary">
            <SystemStatCard icon={Icon} label="คำร้องทั้งหมด" value={requests.length.toLocaleString('th-TH')} detail={isAccess ? 'แบบฟอร์ม FMIT 12' : 'แบบฟอร์ม FMIT 15'} tone="blue" />
            <SystemStatCard icon={RefreshCw} label="อยู่ระหว่างดำเนินการ" value={activeCount.toLocaleString('th-TH')} detail="ยังไม่ปิดจบ" tone="amber" />
            <SystemStatCard icon={Icon} label="เสร็จสิ้น" value={doneCount.toLocaleString('th-TH')} detail="อนุมัติหรือปิดจบแล้ว" tone="green" />
            <SystemStatCard icon={Icon} label="ยกเลิก / ไม่อนุมัติ" value={cancelledCount.toLocaleString('th-TH')} detail="รายการสิ้นสุด" tone="red" />
        </section>
        <section className="tap-card tap-issue-list">
            <div className="tap-issue-toolbar"><div className="tap-toolbar-title"><Icon size={20} /><div><h2>รายการคำร้อง</h2><p>พบ {filtered.length.toLocaleString('th-TH')} รายการ</p></div></div><div className="tap-filter-controls tap-request-filters"><label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">ทุกสถานะ</option>{statuses.map((item) => <option key={item} value={item}>{labels[item] || item}</option>)}</select></label><label><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} title="วันที่เริ่มต้น" /></label><label><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} title="วันที่สิ้นสุด" /></label></div></div>
            {error && <div className="tap-inline-error">{error}</div>}
            <SystemDataTable columns={columns} rows={rows} rowKey="id" loading={loading} minWidth={1050} empty={<div className="tap-no-results"><SearchX size={25} /><strong>ไม่พบคำร้อง</strong><span>ลองเปลี่ยนคำค้นหาหรือตัวกรอง</span></div>} />
            <footer className="tap-pagination"><span>หน้า {page} จาก {totalPages}</span><div><button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>ก่อนหน้า</button><button type="button" disabled={page === totalPages} onClick={() => setPage((value) => value + 1)}>ถัดไป</button></div></footer>
        </section>
        <SystemDetailDrawer open={Boolean(selected)} title={selected?.ticket_number || '-'} eyebrow={isAccess ? 'รายละเอียดคำร้องขอสิทธิ์' : 'รายละเอียดคำร้องขอพัฒนาระบบ'} onClose={() => setSelected(null)} footer={<><button type="button" onClick={() => setSelected(null)}>ปิด</button><button type="button" className="tap-primary-button" onClick={onOpenLegacy}>เปิดจัดการหน้าเดิม</button></>}>
            {selected && <><div className="tap-detail-status"><Icon size={19} /><div><span>สถานะปัจจุบัน</span><strong>{labels[selected.status] || selected.status || '-'}</strong></div></div><dl><div><dt>{isAccess ? 'ชื่อผู้ขอ' : 'ผู้ร้องขอ'}</dt><dd>{isAccess ? selected.name_th || '-' : selected.requester_name || '-'}</dd></div><div><dt>แผนก</dt><dd>{selected.department || '-'}</dd></div>{isAccess ? <><div><dt>รหัสพนักงาน</dt><dd>{selected.employee_id || '-'}</dd></div><div><dt>ตำแหน่ง</dt><dd>{selected.position || '-'}</dd></div><div className="full"><dt>ระบบที่ขอสิทธิ์</dt><dd>{formatSystems(selected)}</dd></div></> : <><div><dt>หมวดคำร้อง</dt><dd>{selected.request_category || '-'}</dd></div><div><dt>ประเภท</dt><dd>{selected.req_type || '-'}</dd></div></>}<div className="full"><dt>รายละเอียด</dt><dd>{selected.request_details || selected.details || selected.description || '-'}</dd></div><div className="full"><dt>ผลการดำเนินการ</dt><dd>{selected.action_result || selected.solution || '-'}</dd></div></dl></>}
        </SystemDetailDrawer>
    </>;
}
