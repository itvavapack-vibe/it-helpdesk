import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    BriefcaseBusiness, CalendarDays, Eye, MoveRight, RefreshCw, RotateCcw,
    SearchX, UserMinus, UserPlus, UsersRound,
} from 'lucide-react';
import { mysql } from '../../mysqlClient';
import {
    SystemDataTable, SystemDetailDrawer, SystemPageHeader, SystemStatCard,
    SystemStatusBadge,
} from '@/shared/system-ui';

const STATUS = {
    ACTIVE: 'ทำงาน',
    RESIGNED: 'ลาออก',
    TRANSFERRED: 'โอนย้าย',
};

const formatDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('th-TH', {
        day: '2-digit', month: 'short', year: 'numeric',
    }).format(date);
};

const getStatusMeta = (status) => {
    if (status === STATUS.RESIGNED) return ['ลาออก', 'danger'];
    if (status === STATUS.TRANSFERRED) return ['โอนย้าย', 'info'];
    return ['ทำงาน', 'success'];
};

export default function TailAdminEmployeePage({ query, onOpenLegacy }) {
    const [employees, setEmployees] = useState([]);
    const [transfers, setTransfers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('all');
    const [department, setDepartment] = useState('all');
    const [year, setYear] = useState(String(new Date().getFullYear()));
    const [selected, setSelected] = useState(null);
    const [page, setPage] = useState(1);
    const pageSize = 12;

    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');
        const [employeeResult, transferResult] = await Promise.all([
            mysql.from('employees').select('*').order('emp_id'),
            mysql.from('employee_transfers').select('*').order('transfer_date', { ascending: false }),
        ]);
        if (employeeResult.error) {
            setError(employeeResult.error.message || 'โหลดข้อมูลพนักงานไม่สำเร็จ');
            setEmployees([]);
        } else {
            setEmployees(employeeResult.data || []);
        }
        setTransfers(transferResult.error ? [] : transferResult.data || []);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const departments = useMemo(() => [...new Set(employees.map((item) => item.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th')), [employees]);
    const years = useMemo(() => {
        const values = new Set([new Date().getFullYear()]);
        employees.forEach((item) => [item.start_date, item.end_date, item.transfer_date].forEach((value) => {
            const parsed = new Date(value || 0);
            if (!Number.isNaN(parsed.getTime())) values.add(parsed.getFullYear());
        }));
        transfers.forEach((item) => {
            const parsed = new Date(item.transfer_date || 0);
            if (!Number.isNaN(parsed.getTime())) values.add(parsed.getFullYear());
        });
        return [...values].sort((a, b) => b - a);
    }, [employees, transfers]);
    const employeeTransfers = useCallback((employee) => transfers.filter((item) => String(item.emp_id || '').trim() === String(employee?.emp_id || '').trim()), [transfers]);
    const hasEventInYear = useCallback((employee, targetStatus) => {
        if (year === 'all') return employee.status === targetStatus;
        if (targetStatus === STATUS.ACTIVE) return employee.status === STATUS.ACTIVE && (!employee.start_date || new Date(employee.start_date).getFullYear() <= Number(year));
        if (targetStatus === STATUS.RESIGNED) return employee.status === STATUS.RESIGNED && new Date(employee.end_date || 0).getFullYear() === Number(year);
        return new Date(employee.transfer_date || 0).getFullYear() === Number(year)
            || employeeTransfers(employee).some((item) => new Date(item.transfer_date || 0).getFullYear() === Number(year));
    }, [employeeTransfers, year]);

    const stats = useMemo(() => ({
        total: employees.length,
        active: employees.filter((item) => hasEventInYear(item, STATUS.ACTIVE)).length,
        resigned: employees.filter((item) => hasEventInYear(item, STATUS.RESIGNED)).length,
        transferred: employees.filter((item) => hasEventInYear(item, STATUS.TRANSFERRED)).length,
    }), [employees, hasEventInYear]);
    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return employees.filter((item) => status === 'all' || hasEventInYear(item, status))
            .filter((item) => department === 'all' || item.department === department)
            .filter((item) => !needle || [
                item.emp_id, item.name_th, item.name_en, item.department, item.position,
                item.transfer_department, item.transfer_position,
            ].some((value) => String(value || '').toLowerCase().includes(needle)));
    }, [department, employees, hasEventInYear, query, status]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
    useEffect(() => setPage(1), [department, query, status, year]);
    useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

    const columns = [
        { key: 'emp_id', label: 'รหัสพนักงาน', render: (item) => <strong className="tap-mono-value">{item.emp_id || '-'}</strong> },
        { key: 'name', label: 'ชื่อพนักงาน', render: (item) => <div className="tap-cell-stack"><strong>{item.name_th || '-'}</strong><span>{item.name_en || '-'}</span></div> },
        { key: 'department', label: 'แผนก', render: (item) => item.department || '-' },
        { key: 'position', label: 'ตำแหน่ง', render: (item) => item.position || '-' },
        { key: 'start_date', label: 'วันที่เริ่มงาน', render: (item) => formatDate(item.start_date) },
        { key: 'status', label: 'สถานะ', render: (item) => { const meta = getStatusMeta(item.status); return <SystemStatusBadge tone={meta[1]}>{meta[0]}</SystemStatusBadge>; } },
        { key: 'action', label: '', render: (item) => <button type="button" className="tap-row-action" title="ดูรายละเอียด" onClick={() => setSelected(item)}><Eye size={18} /></button> },
    ];
    const selectedTransfers = selected ? employeeTransfers(selected) : [];

    return (
        <>
            <SystemPageHeader
                breadcrumb="IT Helpdesk / Employee"
                title="พนักงาน"
                meta="ข้อมูลพนักงานและประวัติการโอนย้าย"
                actions={<div className="tap-page-actions"><button type="button" className="tap-secondary-button" disabled={loading} onClick={loadData}><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> รีเฟรช</button><button type="button" className="tap-primary-button" onClick={onOpenLegacy}><BriefcaseBusiness size={17} /> เปิดหน้าเดิม</button></div>}
            />
            <section className="tap-asset-summary">
                <SystemStatCard icon={UsersRound} label="พนักงานทั้งหมด" value={stats.total.toLocaleString('th-TH')} detail="ข้อมูลพนักงานในระบบ" tone="blue" />
                <SystemStatCard icon={UserPlus} label="ทำงานประจำปี" value={stats.active.toLocaleString('th-TH')} detail={`ตามปี ${year === 'all' ? 'ทั้งหมด' : Number(year) + 543}`} tone="green" />
                <SystemStatCard icon={UserMinus} label="ลาออกประจำปี" value={stats.resigned.toLocaleString('th-TH')} detail="อิงวันที่ลาออก" tone="red" />
                <SystemStatCard icon={MoveRight} label="โอนย้ายประจำปี" value={stats.transferred.toLocaleString('th-TH')} detail="อิงประวัติการโอนย้าย" tone="amber" />
            </section>
            <section className="tap-card tap-issue-list">
                <div className="tap-issue-toolbar">
                    <div className="tap-toolbar-title"><UsersRound size={20} /><div><h2>รายชื่อพนักงาน</h2><p>แสดง {filtered.length.toLocaleString('th-TH')} จาก {employees.length.toLocaleString('th-TH')} คน</p></div></div>
                    <div className="tap-filter-controls">
                        <label><CalendarDays size={16} /><select value={year} onChange={(event) => setYear(event.target.value)}><option value="all">ทุกปี</option>{years.map((item) => <option key={item} value={item}>{item + 543}</option>)}</select></label>
                        <label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">ทุกสถานะ</option><option value={STATUS.ACTIVE}>ทำงาน</option><option value={STATUS.RESIGNED}>ลาออก</option><option value={STATUS.TRANSFERRED}>โอนย้าย</option></select></label>
                        <label><select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="all">ทุกแผนก</option>{departments.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                        {(year !== String(new Date().getFullYear()) || status !== 'all' || department !== 'all') && <button type="button" className="tap-reset-button" title="ล้างตัวกรอง" onClick={() => { setYear(String(new Date().getFullYear())); setStatus('all'); setDepartment('all'); }}><RotateCcw size={17} /></button>}
                    </div>
                </div>
                {error && <div className="tap-inline-error">{error}</div>}
                <SystemDataTable columns={columns} rows={rows} loading={loading} minWidth={1040} empty={<div className="tap-no-results"><SearchX size={25} /><strong>ไม่พบข้อมูลพนักงาน</strong><span>ลองเปลี่ยนคำค้นหาหรือตัวกรอง</span></div>} />
                <footer className="tap-pagination"><span>หน้า {page} จาก {totalPages}</span><div><button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>ก่อนหน้า</button><button type="button" disabled={page === totalPages} onClick={() => setPage((value) => value + 1)}>ถัดไป</button></div></footer>
            </section>
            <SystemDetailDrawer
                open={Boolean(selected)}
                title={selected?.name_th || selected?.emp_id || 'รายละเอียดพนักงาน'}
                eyebrow={`พนักงาน ${selected?.emp_id || ''}`}
                onClose={() => setSelected(null)}
                footer={<><button type="button" onClick={() => setSelected(null)}>ปิด</button><button type="button" className="tap-primary-button" onClick={onOpenLegacy}>เปิดหน้าเดิม</button></>}
            >
                {selected && <>
                    <div className="tap-detail-status"><UsersRound size={19} /><div><span>สถานะพนักงาน</span><strong>{getStatusMeta(selected.status)[0]}</strong></div></div>
                    <dl>
                        <div><dt>ชื่อภาษาไทย</dt><dd>{selected.name_th || '-'}</dd></div>
                        <div><dt>ชื่อภาษาอังกฤษ</dt><dd>{selected.name_en || '-'}</dd></div>
                        <div><dt>แผนกปัจจุบัน</dt><dd>{selected.department || '-'}</dd></div>
                        <div><dt>ตำแหน่งปัจจุบัน</dt><dd>{selected.position || '-'}</dd></div>
                        <div><dt>วันที่เริ่มงาน</dt><dd>{formatDate(selected.start_date)}</dd></div>
                        <div><dt>วันที่ลาออก</dt><dd>{formatDate(selected.end_date)}</dd></div>
                    </dl>
                    <section className="tap-detail-section">
                        <h3>ประวัติการโอนย้าย</h3>
                        {selectedTransfers.length ? <div className="tap-timeline">{selectedTransfers.map((item, index) => <article key={item.id || index}><i /><div><strong>{formatDate(item.transfer_date)}</strong><p>{item.from_department || '-'} / {item.from_position || '-'}</p><span><MoveRight size={14} /> {item.to_department || '-'} / {item.to_position || '-'}</span></div></article>)}</div> : <p className="tap-muted-copy">ยังไม่มีประวัติการโอนย้าย</p>}
                    </section>
                </>}
            </SystemDetailDrawer>
        </>
    );
}
