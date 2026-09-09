import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardList, Eye, LayoutDashboard, Network, RefreshCw, SearchX, Users } from 'lucide-react';
import { CENTER_PATH, SECRETARY_PATH } from '../config/appPaths';
import { SystemAppShell, SystemDataTable, SystemDetailDrawer, SystemPageHeader, SystemStatCard, SystemStatusBadge } from '../components/system-ui';
import '../components/tailadmin-preview/tailadmin-preview.css';
import { secretaryGetDashboard, secretaryListIssues } from './secretaryApi';
import { formatSecretaryDate, isSecretaryReceiverRole, isSecretarySuperAdmin, SECRETARY_IMPACTS, SECRETARY_ROLE_LABELS, SECRETARY_STATUS } from './secretaryConstants';
import SecretaryOverviewPreview from './SecretaryOverviewPreview';

const STATUS_META = {
  Pending: ['รอดำเนินการ', 'danger'],
  In_Progress: ['กำลังดำเนินการ', 'warning'],
  Completed: ['เสร็จสิ้น', 'success'],
  Cancelled: ['ยกเลิก', 'neutral'],
};

export default function SecretaryTailAdminPreview({ auth }) {
  const [page, setPage] = useState(isSecretaryReceiverRole(auth?.role) ? 'dashboard' : 'tracking');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [days, setDays] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [dashboardData, issueData] = await Promise.all([
        isSecretaryReceiverRole(auth?.role) ? secretaryGetDashboard(days) : Promise.resolve(null),
        secretaryListIssues({ limit: 1000 }),
      ]);
      setDashboard(dashboardData);
      setIssues(issueData || []);
    } catch (requestError) {
      setError(requestError.message || 'โหลดข้อมูล Secretary ไม่สำเร็จ');
    } finally { setLoading(false); }
  }, [auth?.role, days]);
  useEffect(() => { loadData(); }, [loadData]);

  const summary = dashboard?.summary || {
    total: issues.length,
    pending: issues.filter((item) => item.status === 'Pending').length,
    in_progress: issues.filter((item) => item.status === 'In_Progress').length,
    completed: issues.filter((item) => item.status === 'Completed').length,
    cancelled: issues.filter((item) => item.status === 'Cancelled').length,
  };
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return issues.filter((item) => status === 'all' || item.status === status)
      .filter((item) => !needle || [item.issue_number, item.reporter_name, item.department, item.branch, item.title, item.category].some((value) => String(value || '').toLowerCase().includes(needle)));
  }, [issues, query, status]);
  const openCount = summary.pending + summary.in_progress;
  const navItems = [
    ...(isSecretaryReceiverRole(auth?.role) ? [
      { id: 'dashboard', label: 'แดชบอร์ด', icon: LayoutDashboard },
      { id: 'overview', label: 'แผนผังภาพรวม', icon: Network, badge: openCount },
      { id: 'issues', label: 'รายการปัญหา', icon: ClipboardList, badge: openCount },
    ] : []),
    { id: 'tracking', label: 'ติดตามสถานะ', icon: ClipboardList },
    ...(isSecretarySuperAdmin(auth?.role) ? [{ id: 'users', label: 'จัดการผู้ใช้งาน', icon: Users }] : []),
  ];
  const handleNavigate = (id) => {
    if (['dashboard', 'overview', 'issues', 'tracking'].includes(id)) setPage(id);
    else window.location.assign(`${SECRETARY_PATH}`);
  };
  const columns = [
    { key: 'number', label: 'เลขที่เอกสาร', render: (item) => <strong className="tap-mono-value">{item.issue_number || '-'}</strong> },
    { key: 'reporter', label: 'ผู้แจ้ง / แผนก', render: (item) => <div className="tap-cell-stack"><strong>{item.reporter_name || '-'}</strong><span>{item.department || '-'}</span></div> },
    { key: 'branch', label: 'สาขา', render: (item) => item.branch || '-' },
    { key: 'title', label: 'ปัญหา', render: (item) => <div className="tap-cell-stack"><strong>{item.title || '-'}</strong><span>{item.category || '-'}</span></div> },
    { key: 'damage', label: 'มูลค่าความเสียหาย', render: (item) => Number(item.damage_value || item.damage_amount || 0).toLocaleString('th-TH') },
    { key: 'expected', label: 'คาดว่าจะแล้วเสร็จ', render: (item) => formatSecretaryDate(item.expected_completion_date) },
    { key: 'status', label: 'สถานะ', render: (item) => <SystemStatusBadge tone={(STATUS_META[item.status] || ['-', 'neutral'])[1]}>{(STATUS_META[item.status] || [item.status || '-'])[0]}</SystemStatusBadge> },
    { key: 'action', label: '', render: (item) => <button type="button" className="tap-row-action" title="ดูรายละเอียด" onClick={() => setSelected(item)}><Eye size={18} /></button> },
  ];

  return <SystemAppShell
    navItems={navItems} activePage={page} onNavigate={handleNavigate}
    onOpenCenter={() => window.location.assign(CENTER_PATH)} onExit={() => window.location.assign(SECRETARY_PATH)}
    query={query} onQueryChange={setQuery} searchPlaceholder="ค้นหาเลขที่เอกสาร ผู้แจ้ง แผนก สาขา หรือปัญหา..."
    currentUser={{ name: auth?.name, username: auth?.username, role: SECRETARY_ROLE_LABELS[auth?.role] || auth?.role }}
    notificationCount={openCount} notificationItems={[{ label: 'รอดำเนินการ', value: summary.pending }, { label: 'กำลังดำเนินการ', value: summary.in_progress }]}
  >
    {page === 'overview' ? <SecretaryOverviewPreview globalQuery={query} /> : page === 'dashboard' ? <>
      <SystemPageHeader breadcrumb="Secretary Center / Executive" title="แดชบอร์ดรายงานปัญหา" meta="ภาพรวมเพื่อรายงานผู้บริหาร" actions={<div className="tap-page-actions"><label className="tap-standalone-select"><select value={days} onChange={(event) => setDays(event.target.value)}><option value="">ข้อมูลทั้งหมด</option><option value="30">30 วันล่าสุด</option><option value="90">90 วันล่าสุด</option><option value="365">1 ปีล่าสุด</option></select></label><button type="button" className="tap-secondary-button" disabled={loading} onClick={loadData}><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> รีเฟรช</button></div>} />
      {error && <div className="tap-inline-error tap-chat-error">{error}</div>}
      <section className="tap-secretary-summary">
        <SystemStatCard icon={ClipboardList} label="รายการทั้งหมด" value={summary.total.toLocaleString('th-TH')} detail="ทุกสถานะ" tone="blue" />
        <SystemStatCard icon={AlertCircle} label="รอดำเนินการ" value={summary.pending.toLocaleString('th-TH')} detail="ต้องเริ่มตรวจสอบ" tone="red" />
        <SystemStatCard icon={RefreshCw} label="กำลังดำเนินการ" value={summary.in_progress.toLocaleString('th-TH')} detail="อยู่ระหว่างแก้ไข" tone="amber" />
        <SystemStatCard icon={CheckCircle2} label="เสร็จสิ้น" value={summary.completed.toLocaleString('th-TH')} detail="ดำเนินการครบแล้ว" tone="green" />
      </section>
      <section className="tap-secretary-panels">
        <article className="tap-card tap-secretary-departments"><div className="tap-card-heading"><div><h2>แผนกที่แจ้งบ่อย</h2><p>จัดอันดับตามจำนวนรายการ</p></div></div><div>{(dashboard?.top_departments || []).map((item) => <button type="button" key={item.department} onClick={() => { setQuery(item.department); setPage('issues'); }}><span>{item.department}</span><div><i style={{ width: `${Math.max(6, item.count / Math.max(1, ...(dashboard?.top_departments || []).map((row) => row.count)) * 100)}%` }} /></div><strong>{item.count}</strong></button>)}</div></article>
        <article className="tap-card tap-secretary-recent"><div className="tap-card-heading"><div><h2>รายการล่าสุด</h2><p>ปัญหาที่แจ้งเข้ามาล่าสุด</p></div><button type="button" onClick={() => setPage('issues')}>ดูทั้งหมด</button></div><div>{(dashboard?.recent || issues.slice(0, 6)).slice(0, 6).map((item) => <button type="button" key={item.id} onClick={() => setSelected(item)}><div><strong>{item.title || '-'}</strong><span>{item.department || '-'} · {formatSecretaryDate(item.created_at)}</span></div><SystemStatusBadge tone={(STATUS_META[item.status] || ['', 'neutral'])[1]}>{(STATUS_META[item.status] || [item.status])[0]}</SystemStatusBadge></button>)}</div></article>
      </section>
    </> : <>
      <SystemPageHeader breadcrumb={`Secretary Center / ${page === 'tracking' ? 'Reporter' : 'Receiver'}`} title={page === 'tracking' ? 'ติดตามสถานะ' : 'รายการปัญหา'} meta={`แสดง ${filtered.length.toLocaleString('th-TH')} รายการ`} actions={<button type="button" className="tap-secondary-button" disabled={loading} onClick={loadData}><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> รีเฟรช</button>} />
      <section className="tap-card tap-issue-list"><div className="tap-issue-toolbar"><div className="tap-toolbar-title"><ClipboardList size={20} /><div><h2>รายการแจ้งปัญหา</h2><p>ข้อมูลตามสิทธิ์ของผู้ใช้งาน</p></div></div><div className="tap-filter-controls"><label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">ทุกสถานะ</option>{Object.entries(SECRETARY_STATUS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></label></div></div>{error && <div className="tap-inline-error">{error}</div>}<SystemDataTable columns={columns} rows={filtered} loading={loading} minWidth={1240} empty={<div className="tap-no-results"><SearchX size={25} /><strong>ไม่พบรายการปัญหา</strong><span>ลองเปลี่ยนคำค้นหาหรือสถานะ</span></div>} /></section>
    </>}
    <SystemDetailDrawer open={Boolean(selected)} title={selected?.issue_number || selected?.title || 'รายละเอียดปัญหา'} eyebrow="Secretary Issue" onClose={() => setSelected(null)} footer={<><button type="button" onClick={() => setSelected(null)}>ปิด</button><button type="button" className="tap-primary-button" onClick={() => window.location.assign(SECRETARY_PATH)}>ดำเนินการในหน้าเดิม</button></>}>
      {selected && <><div className="tap-detail-status"><ClipboardList size={19} /><div><span>สถานะปัจจุบัน</span><strong>{(STATUS_META[selected.status] || [selected.status])[0]}</strong></div></div><dl><div><dt>ผู้แจ้ง</dt><dd>{selected.reporter_name || '-'}</dd></div><div><dt>แผนก</dt><dd>{selected.department || '-'}</dd></div><div><dt>สาขา</dt><dd>{selected.branch || '-'}</dd></div><div><dt>ระดับผลกระทบ</dt><dd>{SECRETARY_IMPACTS[selected.impact_level]?.label || selected.impact_level || '-'}</dd></div><div className="full"><dt>หัวข้อ</dt><dd>{selected.title || '-'}</dd></div><div className="full"><dt>รายละเอียด</dt><dd>{selected.description || selected.details || '-'}</dd></div><div><dt>คาดว่าจะแล้วเสร็จ</dt><dd>{formatSecretaryDate(selected.expected_completion_date)}</dd></div><div><dt>มูลค่าความเสียหาย</dt><dd>{Number(selected.damage_value || selected.damage_amount || 0).toLocaleString('th-TH')} บาท</dd></div><div className="full"><dt>ผลการดำเนินการ</dt><dd>{selected.resolution_note || '-'}</dd></div></dl></>}
    </SystemDetailDrawer>
  </SystemAppShell>;
}
