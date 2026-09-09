import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, CalendarDays, ChevronRight, ClipboardList, Eye, RefreshCw, RotateCcw, SearchX } from 'lucide-react';
import { SystemDataTable, SystemDetailDrawer, SystemPageHeader, SystemStatusBadge } from '../components/system-ui';
import { secretaryGetDepartmentOverview } from './secretaryApi';
import { formatSecretaryDate, SECRETARY_BRANCH_OPTIONS, SECRETARY_DEPARTMENT_OPTIONS, SECRETARY_IMPACTS } from './secretaryConstants';

const STATUS_META = {
  Pending: ['รอดำเนินการ', 'danger'],
  In_Progress: ['กำลังดำเนินการ', 'warning'],
};

export default function SecretaryOverviewPreview({ globalQuery = '' }) {
  const [overview, setOverview] = useState({ summary: {}, departments: [] });
  const [issues, setIssues] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [branch, setBranch] = useState('');
  const [departmentQuery, setDepartmentQuery] = useState('');
  const [showAllDepartments, setShowAllDepartments] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async () => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setError('วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น');
      return;
    }
    setLoading(true); setError(''); setSelectedDepartment(''); setIssues([]);
    try {
      const data = await secretaryGetDepartmentOverview('', { from: dateFrom, to: dateTo, branch });
      setOverview({ summary: data?.summary || {}, departments: Array.isArray(data?.departments) ? data.departments : [] });
    } catch (requestError) { setError(requestError.message || 'โหลดแผนผังภาพรวมไม่สำเร็จ'); }
    finally { setLoading(false); }
  }, [branch, dateFrom, dateTo]);
  useEffect(() => { loadOverview(); }, [loadOverview]);

  const departments = useMemo(() => {
    const dynamic = new Map(overview.departments.map((item) => [item.department, item]));
    const needle = `${globalQuery} ${departmentQuery}`.trim().toLocaleLowerCase('th');
    return [...new Set([...SECRETARY_DEPARTMENT_OPTIONS, ...dynamic.keys()])]
      .map((name) => dynamic.get(name) || { department: name, open_count: 0, pending_count: 0, in_progress_count: 0 })
      .filter((item) => (showAllDepartments || Number(item.open_count || 0) > 0) && (!needle || item.department.toLocaleLowerCase('th').includes(needle)))
      .sort((a, b) => Number(b.open_count || 0) - Number(a.open_count || 0) || a.department.localeCompare(b.department, 'th'));
  }, [departmentQuery, globalQuery, overview.departments, showAllDepartments]);

  const selectDepartment = async (name) => {
    setSelectedDepartment(name); setIssues([]); setDetailLoading(true); setError('');
    try {
      const data = await secretaryGetDepartmentOverview(name, { from: dateFrom, to: dateTo, branch });
      setIssues(Array.isArray(data?.issues) ? data.issues : []);
    } catch (requestError) { setError(requestError.message || 'โหลดรายการของแผนกไม่สำเร็จ'); }
    finally { setDetailLoading(false); }
  };
  const columns = [
    { key: 'number', label: 'เลขที่เอกสาร', render: (item) => <strong className="tap-mono-value">{item.issue_number || '-'}</strong> },
    { key: 'title', label: 'รายการปัญหา', render: (item) => <div className="tap-cell-stack"><strong>{item.title || '-'}</strong><span>{item.category || '-'}</span></div> },
    { key: 'reporter', label: 'ผู้แจ้ง', render: (item) => item.reporter_name || '-' },
    { key: 'damage', label: 'มูลค่าความเสียหาย', render: (item) => `${Number(item.damage_value || 0).toLocaleString('th-TH')} บาท` },
    { key: 'status', label: 'สถานะ', render: (item) => <SystemStatusBadge tone={(STATUS_META[item.status] || ['', 'neutral'])[1]}>{(STATUS_META[item.status] || [item.status || '-'])[0]}</SystemStatusBadge> },
    { key: 'expected', label: 'วันที่คาดว่าจะแล้วเสร็จ', render: (item) => formatSecretaryDate(item.expected_completion_date) },
    { key: 'created', label: 'วันที่แจ้ง', render: (item) => formatSecretaryDate(item.created_at) },
    { key: 'action', label: '', render: (item) => <button type="button" className="tap-row-action" title="ดูประวัติและรายละเอียด" onClick={() => setSelectedIssue(item)}><Eye size={18} /></button> },
  ];

  return <>
    <SystemPageHeader breadcrumb="Secretary Center / Dashboard" title="แผนผังภาพรวม" meta="รายการที่ยังไม่เสร็จสิ้นแยกตามแผนก" actions={<button type="button" className="tap-secondary-button" disabled={loading} onClick={loadOverview}><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> รีเฟรช</button>} />
    <section className="tap-card tap-overview-filter"><div className="tap-filter-controls tap-overview-controls">
      <label><CalendarDays size={16} /><input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} aria-label="วันที่เริ่มต้น" /></label>
      <label><input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} aria-label="วันที่สิ้นสุด" /></label>
      <label><select value={branch} onChange={(event) => setBranch(event.target.value)}><option value="">ทุกสาขา</option>{SECRETARY_BRANCH_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="tap-overview-search"><input value={departmentQuery} onChange={(event) => setDepartmentQuery(event.target.value)} placeholder="ค้นหาแผนก" /></label>
      {(dateFrom || dateTo || branch || departmentQuery) && <button type="button" className="tap-reset-button" title="ล้างตัวกรอง" onClick={() => { setDateFrom(''); setDateTo(''); setBranch(''); setDepartmentQuery(''); }}><RotateCcw size={17} /></button>}
      <button type="button" className="tap-primary-button" onClick={() => setShowAllDepartments((current) => !current)}><ClipboardList size={17} /> {showAllDepartments ? 'แสดงเฉพาะแผนกที่มีรายการค้าง' : 'ดูรายการทุกแผนก'}</button>
    </div></section>
    {error && <div className="tap-inline-error tap-overview-error">{error}</div>}
    <section className="tap-overview-grid" aria-busy={loading}>{departments.map((item) => {
      const open = Number(item.open_count || 0);
      return <button key={item.department} type="button" className={`tap-overview-department ${open ? 'has-open' : 'is-clear'} ${selectedDepartment === item.department ? 'is-selected' : ''}`} onClick={() => selectDepartment(item.department)}><span className="tap-overview-building"><Building2 size={17} /></span>{open > 0 && <b>{open}</b>}<strong>{item.department}</strong><span className="tap-overview-counts">รอ {Number(item.pending_count || 0)} · กำลังทำ {Number(item.in_progress_count || 0)}</span><span className="tap-overview-action">ดูรายการทั้งหมด <ChevronRight size={14} /></span></button>;
    })}{!loading && !departments.length && <div className="tap-overview-empty">ไม่มีแผนกที่มีรายการยังไม่เสร็จสิ้นตามตัวกรองที่เลือก</div>}</section>
    {selectedDepartment && <section className="tap-card tap-issue-list tap-overview-list"><div className="tap-issue-toolbar"><div className="tap-toolbar-title"><Building2 size={20} /><div><h2>{selectedDepartment}</h2><p>รายการที่ยังไม่เสร็จสิ้น {issues.length.toLocaleString('th-TH')} รายการ</p></div></div></div><SystemDataTable columns={columns} rows={issues} loading={detailLoading} minWidth={1160} empty={<div className="tap-no-results"><SearchX size={25} /><strong>ไม่มีรายการค้าง</strong><span>แผนกนี้ไม่มีรายการที่ยังไม่เสร็จสิ้นในช่วงที่เลือก</span></div>} /></section>}
    <SystemDetailDrawer open={Boolean(selectedIssue)} title={selectedIssue?.issue_number || selectedIssue?.title || 'รายละเอียดปัญหา'} eyebrow={selectedDepartment || 'Secretary Issue'} onClose={() => setSelectedIssue(null)} footer={<button type="button" onClick={() => setSelectedIssue(null)}>ปิด</button>}>
      {selectedIssue && <><div className="tap-detail-status"><Building2 size={19} /><div><span>สถานะ</span><strong>{(STATUS_META[selectedIssue.status] || [selectedIssue.status])[0]}</strong></div></div><dl><div><dt>แผนก</dt><dd>{selectedIssue.department || '-'}</dd></div><div><dt>สาขา</dt><dd>{selectedIssue.branch || '-'}</dd></div><div><dt>ผู้แจ้ง</dt><dd>{selectedIssue.reporter_name || '-'}</dd></div><div><dt>ผลกระทบ</dt><dd>{SECRETARY_IMPACTS[selectedIssue.impact_level]?.label || selectedIssue.impact_level || '-'}</dd></div><div className="full"><dt>หัวข้อ</dt><dd>{selectedIssue.title || '-'}</dd></div><div className="full"><dt>รายละเอียด</dt><dd>{selectedIssue.description || '-'}</dd></div><div><dt>มูลค่าความเสียหาย</dt><dd>{Number(selectedIssue.damage_value || 0).toLocaleString('th-TH')} บาท</dd></div><div><dt>คาดว่าจะแล้วเสร็จ</dt><dd>{formatSecretaryDate(selectedIssue.expected_completion_date)}</dd></div><div className="full"><dt>ผลการดำเนินการ</dt><dd>{selectedIssue.resolution_note || '-'}</dd></div></dl></>}
    </SystemDetailDrawer>
  </>;
}
