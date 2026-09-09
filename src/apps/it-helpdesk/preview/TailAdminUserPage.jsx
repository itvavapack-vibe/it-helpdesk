import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, KeyRound, LockKeyhole, RefreshCw, SearchX, ShieldCheck, UserCog, UsersRound } from 'lucide-react';
import { mysql } from '@/mysqlClient';
import { ROLE_LABELS, normalizeRoleValue } from '@/config/roles';
import { SystemDataTable, SystemDetailDrawer, SystemPageHeader, SystemStatCard, SystemStatusBadge } from '@/shared/system-ui';

const formatDateTime = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

export default function TailAdminUserPage({ query, onOpenLegacy }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [role, setRole] = useState('all');
    const [selected, setSelected] = useState(null);

    const loadUsers = useCallback(async () => {
        setLoading(true);
        setError('');
        const { data, error: loadError } = await mysql.from('admins')
            .select('id, username, name, role, failed_login_attempts, locked_at, password_changed_at, created_at')
            .order('username');
        if (loadError) {
            setError(loadError.message || 'โหลดข้อมูลผู้ใช้งานไม่สำเร็จ');
            setUsers([]);
        } else setUsers(data || []);
        setLoading(false);
    }, []);
    useEffect(() => { loadUsers(); }, [loadUsers]);

    const roles = useMemo(() => [...new Set(users.map((item) => normalizeRoleValue(item.role)))], [users]);
    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return users.filter((item) => role === 'all' || normalizeRoleValue(item.role) === role)
            .filter((item) => !needle || [item.username, item.name, ROLE_LABELS[normalizeRoleValue(item.role)]].some((value) => String(value || '').toLowerCase().includes(needle)));
    }, [query, role, users]);
    const locked = users.filter((item) => Boolean(item.locked_at)).length;
    const superAdmins = users.filter((item) => normalizeRoleValue(item.role) === 'superadmin').length;
    const columns = [
        { key: 'username', label: 'Username', render: (item) => <div className="tap-user-identity"><span>{String(item.name || item.username || '?').slice(0, 1).toUpperCase()}</span><div><strong>{item.username || '-'}</strong><small>{item.name || '-'}</small></div></div> },
        { key: 'role', label: 'สิทธิ์', render: (item) => <SystemStatusBadge tone={normalizeRoleValue(item.role) === 'superadmin' ? 'info' : 'neutral'}>{ROLE_LABELS[normalizeRoleValue(item.role)] || item.role || '-'}</SystemStatusBadge> },
        { key: 'security', label: 'สถานะความปลอดภัย', render: (item) => item.locked_at ? <SystemStatusBadge tone="danger">ถูกล็อก</SystemStatusBadge> : <SystemStatusBadge tone="success">พร้อมใช้งาน</SystemStatusBadge> },
        { key: 'failed', label: 'เข้าสู่ระบบผิด', render: (item) => Number(item.failed_login_attempts || 0).toLocaleString('th-TH') },
        { key: 'created', label: 'สร้างเมื่อ', render: (item) => formatDateTime(item.created_at) },
        { key: 'action', label: '', render: (item) => <button type="button" className="tap-row-action" title="ดูรายละเอียด" onClick={() => setSelected(item)}><Eye size={18} /></button> },
    ];

    return <>
        <SystemPageHeader breadcrumb="IT Helpdesk / Administration" title="จัดการผู้ใช้งาน" meta="แสดงข้อมูลบัญชีและสิทธิ์การเข้าถึง" actions={<div className="tap-page-actions"><button type="button" className="tap-secondary-button" disabled={loading} onClick={loadUsers}><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> รีเฟรช</button><button type="button" className="tap-primary-button" onClick={onOpenLegacy}><UserCog size={17} /> เปิดหน้าเดิม</button></div>} />
        <section className="tap-request-summary tap-user-summary">
            <SystemStatCard icon={UsersRound} label="บัญชีทั้งหมด" value={users.length.toLocaleString('th-TH')} detail="บัญชีผู้ดูแลระบบ" tone="blue" />
            <SystemStatCard icon={ShieldCheck} label="Super Admin" value={superAdmins.toLocaleString('th-TH')} detail="สิทธิ์จัดการผู้ใช้งาน" tone="green" />
            <SystemStatCard icon={LockKeyhole} label="บัญชีถูกล็อก" value={locked.toLocaleString('th-TH')} detail="ต้องตรวจสอบก่อนใช้งาน" tone="red" />
        </section>
        <section className="tap-card tap-issue-list">
            <div className="tap-issue-toolbar"><div className="tap-toolbar-title"><UserCog size={20} /><div><h2>บัญชีผู้ใช้งาน</h2><p>แสดง {filtered.length.toLocaleString('th-TH')} จาก {users.length.toLocaleString('th-TH')} บัญชี</p></div></div><div className="tap-filter-controls"><label><ShieldCheck size={16} /><select value={role} onChange={(event) => setRole(event.target.value)}><option value="all">ทุกสิทธิ์</option>{roles.map((item) => <option key={item} value={item}>{ROLE_LABELS[item] || item}</option>)}</select></label></div></div>
            {error && <div className="tap-inline-error">{error}</div>}
            <SystemDataTable columns={columns} rows={filtered} loading={loading} minWidth={980} empty={<div className="tap-no-results"><SearchX size={25} /><strong>ไม่พบบัญชีผู้ใช้งาน</strong><span>ลองเปลี่ยนคำค้นหาหรือสิทธิ์</span></div>} />
        </section>
        <SystemDetailDrawer open={Boolean(selected)} title={selected?.name || selected?.username || 'รายละเอียดบัญชี'} eyebrow={`Username: ${selected?.username || '-'}`} onClose={() => setSelected(null)} footer={<><button type="button" onClick={() => setSelected(null)}>ปิด</button><button type="button" className="tap-primary-button" onClick={onOpenLegacy}>จัดการในหน้าเดิม</button></>}>
            {selected && <><div className="tap-detail-status"><KeyRound size={19} /><div><span>สิทธิ์การใช้งาน</span><strong>{ROLE_LABELS[normalizeRoleValue(selected.role)] || selected.role || '-'}</strong></div></div><dl>
                <div><dt>ชื่อผู้ใช้งาน</dt><dd>{selected.username || '-'}</dd></div><div><dt>ชื่อแสดงผล</dt><dd>{selected.name || '-'}</dd></div>
                <div><dt>สถานะบัญชี</dt><dd>{selected.locked_at ? 'ถูกล็อก' : 'พร้อมใช้งาน'}</dd></div><div><dt>เข้าสู่ระบบผิด</dt><dd>{Number(selected.failed_login_attempts || 0).toLocaleString('th-TH')} ครั้ง</dd></div>
                <div><dt>เปลี่ยนรหัสผ่านล่าสุด</dt><dd>{formatDateTime(selected.password_changed_at)}</dd></div><div><dt>วันที่สร้างบัญชี</dt><dd>{formatDateTime(selected.created_at)}</dd></div>
            </dl></>}
        </SystemDetailDrawer>
    </>;
}
