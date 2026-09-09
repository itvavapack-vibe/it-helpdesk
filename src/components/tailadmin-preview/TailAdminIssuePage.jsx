import { useEffect, useMemo, useState } from 'react';
import {
    ChevronLeft, ChevronRight, CircleAlert, Eye, Filter,
    ListFilter, RotateCcw, SearchX, Wrench,
} from 'lucide-react';
import { SystemDetailDrawer, SystemPageHeader, SystemStatusBadge } from '../system-ui';

const STATUS_META = {
    Pending: ['รอดำเนินการ', 'warning'],
    'In Progress': ['กำลังแก้ไข', 'info'],
    Resolved: ['เสร็จสิ้น', 'success'],
    Closed: ['ปิดจบ', 'neutral'],
};
const effectiveStatus = (issue) => (
    issue?.status === 'Closed' || issue?.userCloseSign || issue?.userClosedAt
        ? 'Closed'
        : issue?.status || 'Pending'
);
const valueOf = (issue, ...keys) => keys.map((key) => issue?.[key]).find(Boolean) || '-';
const formatDate = (value, withTime = false) => {
    const date = new Date(value || 0);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('th-TH', {
        day: '2-digit', month: 'short', year: 'numeric',
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    }).format(date);
};

export default function TailAdminIssuePage({ issues, query, isLoading, onOpenLegacy }) {
    const [status, setStatus] = useState('all');
    const [department, setDepartment] = useState('all');
    const [page, setPage] = useState(1);
    const [selectedIssue, setSelectedIssue] = useState(null);
    const pageSize = 12;
    const departments = useMemo(() => [...new Set(issues.map((issue) => issue.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th')), [issues]);
    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return [...issues]
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
            .filter((issue) => status === 'all' || effectiveStatus(issue) === status)
            .filter((issue) => department === 'all' || issue.department === department)
            .filter((issue) => !needle || [
                issue.document_no, issue.ticket_no, issue.name, issue.department,
                issue.problem, issue.category, issue.repairDetails,
            ].some((value) => String(value || '').toLowerCase().includes(needle)));
    }, [department, issues, query, status]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

    useEffect(() => setPage(1), [query, status, department]);
    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const resetFilters = () => {
        setStatus('all');
        setDepartment('all');
    };

    return (
        <>
            <SystemPageHeader
                breadcrumb="IT Helpdesk / งานแจ้งซ่อม"
                title="งานแจ้งซ่อม"
                className="tap-issue-heading"
                actions={<button type="button" className="tap-primary-button" onClick={onOpenLegacy}><Wrench size={17} /> เปิดหน้าจัดการงาน</button>}
            />

            <section className="tap-issue-summary">
                {[
                    ['งานทั้งหมด', issues.length, 'all'],
                    ['รอดำเนินการ', issues.filter((item) => effectiveStatus(item) === 'Pending').length, 'warning'],
                    ['กำลังแก้ไข', issues.filter((item) => effectiveStatus(item) === 'In Progress').length, 'info'],
                    ['เสร็จสิ้นและปิดจบ', issues.filter((item) => ['Resolved', 'Closed'].includes(effectiveStatus(item))).length, 'success'],
                ].map(([label, value, tone]) => <article key={label} className="tap-card tap-issue-stat"><span className={tone} /><div><p>{label}</p><strong>{value.toLocaleString('th-TH')}</strong></div></article>)}
            </section>

            <section className="tap-card tap-issue-list">
                <div className="tap-issue-toolbar">
                    <div className="tap-toolbar-title"><ListFilter size={20} /><div><h2>รายการแจ้งซ่อม</h2><p>พบ {filtered.length.toLocaleString('th-TH')} รายการ</p></div></div>
                    <div className="tap-filter-controls">
                        <label><Filter size={16} /><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">ทุกสถานะ</option><option value="Pending">รอดำเนินการ</option><option value="In Progress">กำลังแก้ไข</option><option value="Resolved">เสร็จสิ้น</option><option value="Closed">ปิดจบ</option></select></label>
                        <label><select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="all">ทุกแผนก</option>{departments.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                        {(status !== 'all' || department !== 'all') && <button type="button" className="tap-reset-button" onClick={resetFilters} title="ล้างตัวกรอง"><RotateCcw size={17} /></button>}
                    </div>
                </div>
                <div className="tap-table-scroll">
                    <table className="tap-issue-table">
                        <thead><tr><th>เลขที่เอกสาร</th><th>ผู้แจ้ง</th><th>ปัญหา</th><th>หมวดหมู่</th><th>ผู้รับงาน</th><th>วันที่แจ้ง</th><th>สถานะ</th><th><span className="sr-only">ดู</span></th></tr></thead>
                        <tbody>
                            {rows.map((issue, index) => {
                                const issueStatus = effectiveStatus(issue);
                                const meta = STATUS_META[issueStatus] || STATUS_META.Pending;
                                return <tr key={issue.id || index}>
                                    <td><strong>{valueOf(issue, 'document_no', 'ticket_no', 'doc_no')}</strong></td>
                                    <td><b>{valueOf(issue, 'name', 'reporter_name')}</b><span>{valueOf(issue, 'department')}</span></td>
                                    <td><b className="tap-problem">{valueOf(issue, 'problem', 'issue', 'description')}</b></td>
                                    <td>{valueOf(issue, 'category')}</td>
                                    <td>{valueOf(issue, 'assignee_name', 'assignedTo', 'technician', 'adminName')}</td>
                                    <td>{formatDate(valueOf(issue, 'created_at', 'createdAt', 'date'))}</td>
                                    <td><SystemStatusBadge tone={meta[1]}>{meta[0]}</SystemStatusBadge></td>
                                    <td><button type="button" className="tap-row-action" title="ดูรายละเอียด" onClick={() => setSelectedIssue(issue)}><Eye size={18} /></button></td>
                                </tr>;
                            })}
                            {!isLoading && !rows.length && <tr><td colSpan="8"><div className="tap-no-results"><SearchX size={25} /><strong>ไม่พบรายการ</strong><span>ลองเปลี่ยนคำค้นหาหรือตัวกรอง</span></div></td></tr>}
                            {isLoading && <tr><td colSpan="8" className="tap-empty">กำลังโหลดข้อมูล...</td></tr>}
                        </tbody>
                    </table>
                </div>
                <footer className="tap-pagination">
                    <span>หน้า {page} จาก {totalPages}</span>
                    <div>
                        <button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={17} /> ก่อนหน้า</button>
                        <button type="button" disabled={page === totalPages} onClick={() => setPage((value) => value + 1)}>ถัดไป <ChevronRight size={17} /></button>
                    </div>
                </footer>
            </section>

            <SystemDetailDrawer
                open={Boolean(selectedIssue)}
                title={valueOf(selectedIssue, 'document_no', 'ticket_no', 'doc_no')}
                onClose={() => setSelectedIssue(null)}
                footer={<><button type="button" onClick={() => setSelectedIssue(null)}>ปิด</button><button type="button" className="tap-primary-button" onClick={onOpenLegacy}>เปิดหน้าจัดการงาน</button></>}
            >
                {selectedIssue && <>
                        <div className="tap-detail-status"><CircleAlert size={19} /><div><span>สถานะปัจจุบัน</span><strong>{(STATUS_META[effectiveStatus(selectedIssue)] || STATUS_META.Pending)[0]}</strong></div></div>
                        <dl>
                            <div><dt>ผู้แจ้ง</dt><dd>{valueOf(selectedIssue, 'name', 'reporter_name')}</dd></div>
                            <div><dt>แผนก</dt><dd>{valueOf(selectedIssue, 'department')}</dd></div>
                            <div><dt>หมวดหมู่</dt><dd>{valueOf(selectedIssue, 'category')}</dd></div>
                            <div><dt>วันที่แจ้ง</dt><dd>{formatDate(valueOf(selectedIssue, 'created_at', 'createdAt', 'date'), true)}</dd></div>
                            <div className="full"><dt>รายละเอียดปัญหา</dt><dd>{valueOf(selectedIssue, 'problem', 'issue', 'description')}</dd></div>
                            <div className="full"><dt>ผลการดำเนินการ</dt><dd>{valueOf(selectedIssue, 'repairDetails', 'resolution', 'action_result')}</dd></div>
                        </dl>
                </>}
            </SystemDetailDrawer>
        </>
    );
}
