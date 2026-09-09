import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Eye, Laptop, MonitorCheck, PackageX, RefreshCw, SearchX, Wrench } from 'lucide-react';
import { mysql } from '../../mysqlClient';
import { ASSET_STATUS, getAssetStatusLabel } from '../../utils/assetStatus';
import { SystemDataTable, SystemDetailDrawer, SystemPageHeader, SystemStatCard, SystemStatusBadge } from '@/shared/system-ui';

const ACTIVE = 'Active';
const eventTime = (item) => new Date(item?.event_date || item?.updated_at || item?.created_at || 0).getTime() || 0;
const isRent = (value) => /rent|เช่า/i.test(String(value || ''));
const assetCode = (item) => isRent(item.source_type || item.autoupdatesystems_id) ? 'เครื่องเช่า' : item.asset_code || item.otherserial || '-';
const formatDate = (value) => {
    const date = new Date(value || 0);
    return Number.isNaN(date.getTime())
        ? '-'
        : date.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
};
const latestPerAsset = (rows) => {
    const map = new Map();
    [...rows].sort((a, b) => eventTime(b) - eventTime(a)).forEach((row) => {
        const key = String(row.asset_glpi_id);
        if (!map.has(key)) map.set(key, row);
    });
    return [...map.values()];
};
const statusMeta = (status) => ({
    [ACTIVE]: ['ใช้งาน', 'neutral'],
    [ASSET_STATUS.NEW]: ['เครื่องใหม่', 'success'],
    [ASSET_STATUS.TRANSFERRED]: ['โอนย้าย', 'info'],
    [ASSET_STATUS.DISPOSED]: ['ตัดจำหน่าย', 'danger'],
}[status] || [getAssetStatusLabel(status), 'neutral']);

export default function TailAdminAssetStatusPage({ query, onOpenLegacy }) {
    const [history, setHistory] = useState([]);
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [warning, setWarning] = useState('');
    const [status, setStatus] = useState(ACTIVE);
    const [year, setYear] = useState(String(new Date().getFullYear()));
    const [month, setMonth] = useState('all');
    const [selected, setSelected] = useState(null);
    const [page, setPage] = useState(1);
    const pageSize = 12;
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [historyResult, assetResult] = await Promise.all([
                mysql.from('asset_status_history').select('*').order('event_date', { ascending: false }).limit(5000),
                mysql.from('assets').select('*').order('name'),
            ]);
            const nextHistory = Array.isArray(historyResult?.data) ? historyResult.data : [];
            const nextAssets = Array.isArray(assetResult?.data)
                ? assetResult.data.filter((asset) => String(asset?.states_id || '').trim().toLowerCase() === 'active')
                : [];
            setHistory(nextHistory);
            setAssets(nextAssets);
            if (historyResult?.error || assetResult?.error) {
                const messages = [historyResult?.error, assetResult?.error]
                    .filter(Boolean)
                    .map((value) => typeof value === 'string' ? value : value.message)
                    .filter(Boolean);
                setWarning(messages.join(' · ') || 'โหลดข้อมูลได้ไม่ครบ กรุณารีเฟรชอีกครั้ง');
            } else setWarning('');
        } catch (loadError) {
            setHistory([]);
            setAssets([]);
            setWarning(loadError?.message || 'ไม่สามารถโหลดข้อมูลทรัพย์สินคอมพิวเตอร์ได้');
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { loadData(); }, [loadData]);
    const activeRows = useMemo(() => assets.map((asset) => ({
        ...asset, id: `active-${asset.glpi_id}`, asset_glpi_id: asset.glpi_id,
        asset_name: asset.name, asset_code: asset.otherserial, user_name: asset.users_id,
        location_name: asset.locations_id, group_name: asset.groups_id,
        source_type: asset.autoupdatesystems_id, event_date: asset.updated_at, status: ACTIVE,
    })), [assets]);
    const years = useMemo(() => [...new Set([String(new Date().getFullYear()), ...history.map((item) => String(new Date(item.event_date).getFullYear())).filter((item) => item !== 'NaN')])].sort((a, b) => Number(b) - Number(a)), [history]);
    const periodRows = useMemo(() => history.filter((item) => {
        const date = new Date(item.event_date);
        return String(date.getFullYear()) === year && (month === 'all' || String(date.getMonth() + 1).padStart(2, '0') === month);
    }), [history, month, year]);
    const grouped = useMemo(() => ({
        [ASSET_STATUS.NEW]: latestPerAsset(periodRows.filter((item) => item.status === ASSET_STATUS.NEW)),
        [ASSET_STATUS.TRANSFERRED]: latestPerAsset(periodRows.filter((item) => item.status === ASSET_STATUS.TRANSFERRED)),
        [ASSET_STATUS.DISPOSED]: latestPerAsset(periodRows.filter((item) => item.status === ASSET_STATUS.DISPOSED)),
    }), [periodRows]);
    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const sourceRows = status === ACTIVE ? activeRows : grouped[status] || [];
        return sourceRows.filter((item) => !needle || [
            item.asset_name, item.asset_code, item.serial, item.user_name, item.location_name,
            item.group_name, item.previous_location_name, item.previous_group_name,
        ].some((value) => String(value || '').toLowerCase().includes(needle)));
    }, [activeRows, grouped, query, status]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
    useEffect(() => setPage(1), [month, query, status, year]);
    useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
    const machineHistory = useMemo(() => selected ? history.filter((item) => Number(item.asset_glpi_id) === Number(selected.asset_glpi_id)).sort((a, b) => eventTime(b) - eventTime(a)) : [], [history, selected]);
    const cards = [
        [ACTIVE, 'เครื่อง Active', activeRows.length, Laptop, 'blue'],
        [ASSET_STATUS.NEW, 'เครื่องใหม่', grouped[ASSET_STATUS.NEW].length, MonitorCheck, 'green'],
        [ASSET_STATUS.TRANSFERRED, 'โอนย้าย', grouped[ASSET_STATUS.TRANSFERRED].length, ArrowRightLeft, 'blue'],
        [ASSET_STATUS.DISPOSED, 'ตัดจำหน่าย', grouped[ASSET_STATUS.DISPOSED].length, PackageX, 'red'],
    ];
    const columns = [
        { key: 'code', label: 'รหัสทรัพย์สิน', render: (item) => <div className="tap-cell-stack"><strong>{assetCode(item)}</strong><span>GLPI #{item.asset_glpi_id}</span></div> },
        { key: 'asset', label: 'เครื่องคอมพิวเตอร์', render: (item) => <div className="tap-cell-stack"><strong>{item.asset_name || '-'}</strong><span>Serial: {item.serial || '-'}</span></div> },
        { key: 'user', label: 'ผู้ใช้งาน', render: (item) => item.user_name || item.previous_user_name || '-' },
        { key: 'location', label: 'ที่ตั้ง / กรุ๊ป', render: (item) => <div className="tap-cell-stack"><strong>{item.location_name || item.previous_location_name || '-'}</strong><span>{item.group_name || item.previous_group_name || '-'}</span></div> },
        { key: 'change', label: 'การเปลี่ยนแปลง', render: (item) => item.status === ASSET_STATUS.TRANSFERRED ? <div className="tap-change-detail"><span>{item.previous_location_name || '-'} → {item.location_name || '-'}</span><span>{item.previous_group_name || '-'} → {item.group_name || '-'}</span></div> : item.status === ASSET_STATUS.DISPOSED ? 'ไม่อยู่ใน Active จาก GLPI' : item.status === ASSET_STATUS.NEW ? 'เพิ่มเครื่องจาก GLPI' : 'ข้อมูล Active ปัจจุบัน' },
        { key: 'date', label: 'วันที่ / สถานะ', render: (item) => { const meta = statusMeta(item.status); return <div className="tap-cell-stack"><strong>{formatDate(item.event_date)}</strong><SystemStatusBadge tone={meta[1]}>{meta[0]}</SystemStatusBadge></div>; } },
        { key: 'action', label: '', render: (item) => <button type="button" className="tap-row-action" onClick={() => setSelected(item)} title="ดูรายละเอียด"><Eye size={18} /></button> },
    ];
    return <>
        <SystemPageHeader breadcrumb="IT Helpdesk / Computer Management" title="ทรัพย์สินคอมพิวเตอร์" className="tap-issue-heading" actions={<div className="tap-page-actions"><button type="button" className="tap-secondary-button" disabled={loading} onClick={loadData}><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> รีเฟรช</button><button type="button" className="tap-primary-button" onClick={onOpenLegacy}><Wrench size={17} /> เปิดหน้าเดิม</button></div>} />
        <section className="tap-asset-summary">{cards.map(([id, label, value, Icon, tone]) => <button type="button" key={id} onClick={() => setStatus(id)} className={`tap-stat-filter ${status === id ? 'is-selected' : ''}`}><SystemStatCard icon={Icon} label={label} value={value.toLocaleString('th-TH')} detail={id === ACTIVE ? 'ปัจจุบัน' : `ปี ${Number(year) + 543}`} tone={tone} /></button>)}</section>
        <section className="tap-card tap-issue-list">
            <div className="tap-issue-toolbar"><div className="tap-toolbar-title"><ArrowRightLeft size={20} /><div><h2>รายการสถานะทรัพย์สิน</h2><p>พบ {filtered.length.toLocaleString('th-TH')} รายการ</p></div></div><div className="tap-filter-controls"><label><select value={month} disabled={status === ACTIVE} onChange={(event) => setMonth(event.target.value)}><option value="all">ทุกเดือน</option>{Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((item) => <option key={item} value={item}>{new Date(2026, Number(item) - 1, 1).toLocaleDateString('th-TH', { month: 'long' })}</option>)}</select></label><label><select value={year} disabled={status === ACTIVE} onChange={(event) => setYear(event.target.value)}>{years.map((item) => <option key={item} value={item}>ปี {Number(item) + 543}</option>)}</select></label></div></div>
            {warning && <div className="tap-inline-error">{warning}</div>}
            <SystemDataTable columns={columns} rows={rows} rowKey="id" loading={loading} minWidth={1120} empty={<div className="tap-no-results"><SearchX size={25} /><strong>ไม่พบข้อมูล</strong><span>ลองเปลี่ยนช่วงเวลาหรือคำค้นหา</span></div>} />
            <footer className="tap-pagination"><span>หน้า {page} จาก {totalPages}</span><div><button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>ก่อนหน้า</button><button type="button" disabled={page === totalPages} onClick={() => setPage((value) => value + 1)}>ถัดไป</button></div></footer>
        </section>
        <SystemDetailDrawer open={Boolean(selected)} title={selected?.asset_name || '-'} eyebrow={`${assetCode(selected)} · GLPI #${selected?.asset_glpi_id || '-'}`} onClose={() => setSelected(null)} footer={<><button type="button" onClick={() => setSelected(null)}>ปิด</button><button type="button" className="tap-primary-button" onClick={onOpenLegacy}>เปิดหน้าเดิม</button></>}>
            {selected && <><div className="tap-detail-status"><ArrowRightLeft size={19} /><div><span>สถานะ</span><strong>{statusMeta(selected.status)[0]}</strong></div></div><dl><div><dt>Serial Number</dt><dd>{selected.serial || '-'}</dd></div><div><dt>ผู้ใช้งาน</dt><dd>{selected.user_name || selected.previous_user_name || '-'}</dd></div><div className="full"><dt>ที่ตั้งปัจจุบัน</dt><dd>{selected.location_name || '-'}</dd></div><div className="full"><dt>กรุ๊ปปัจจุบัน</dt><dd>{selected.group_name || '-'}</dd></div></dl><div className="tap-history-list"><h3>ประวัติสถานะ</h3>{machineHistory.map((item) => { const meta = statusMeta(item.status); return <div key={item.id}><span>{formatDate(item.event_date)}</span><SystemStatusBadge tone={meta[1]}>{meta[0]}</SystemStatusBadge><p>{item.status === ASSET_STATUS.TRANSFERRED ? `${item.previous_location_name || '-'} → ${item.location_name || '-'}` : meta[0]}</p></div>; })}</div></>}
        </SystemDetailDrawer>
    </>;
}
