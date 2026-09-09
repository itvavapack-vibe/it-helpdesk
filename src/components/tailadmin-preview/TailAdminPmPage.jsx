import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, CalendarCheck, Eye, MonitorCheck, RefreshCw, SearchX, Send, Wrench } from 'lucide-react';
import { mysql } from '../../mysqlClient';
import { getAllAssetBranches, getAssetBranchKey } from '../../utils/assetBranch';
import { SystemDataTable, SystemDetailDrawer, SystemPageHeader, SystemStatCard, SystemStatusBadge } from '@/shared/system-ui';

const isBuy = (asset) => /buy|ซื้อ/i.test(String(asset?.autoupdatesystems_id || ''));
const formatDate = (value) => {
    const date = new Date(value || 0);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('th-TH');
};
const pmMeta = (status) => status === 'Pass' ? ['ผ่าน', 'success'] : status === 'Fail' ? ['ไม่ผ่าน', 'danger'] : ['รอตรวจครบ', 'warning'];

export default function TailAdminPmPage({ query, onOpenLegacy }) {
    const [assets, setAssets] = useState([]);
    const [records, setRecords] = useState([]);
    const [batches, setBatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [year, setYear] = useState(String(new Date().getFullYear()));
    const [branch, setBranch] = useState('all');
    const [selected, setSelected] = useState(null);
    const loadData = useCallback(async () => {
        setLoading(true);
        const [assetResult, recordResult, batchResult] = await Promise.all([
            mysql.from('assets').select('*').eq('states_id', 'Active').order('name'),
            mysql.from('asset_pm_records').select('*').order('pm_date', { ascending: false }).limit(2000),
            mysql.from('asset_pm_report_batches').select('*').order('created_at', { ascending: false }).limit(100),
        ]);
        setAssets((assetResult.data || []).filter(isBuy));
        setRecords(recordResult.data || []);
        setBatches(batchResult.data || []);
        setLoading(false);
    }, []);
    useEffect(() => { loadData(); }, [loadData]);
    const years = useMemo(() => [...new Set([String(new Date().getFullYear()), ...records.map((item) => String(new Date(item.pm_date).getFullYear())).filter((item) => item !== 'NaN')])].sort((a, b) => Number(b) - Number(a)), [records]);
    const selectedRecords = useMemo(() => records.filter((item) => String(new Date(item.pm_date).getFullYear()) === year).filter((item) => branch === 'all' || getAssetBranchKey(item.location_name) === branch).filter((item) => {
        const needle = query.trim().toLowerCase();
        return !needle || [item.asset_name, item.asset_code, item.serial, item.user_name, item.location_name, item.inspector_name].some((value) => String(value || '').toLowerCase().includes(needle));
    }), [branch, query, records, year]);
    const latestByAsset = useMemo(() => {
        const map = new Map();
        records.forEach((item) => { if (!map.has(String(item.asset_glpi_id))) map.set(String(item.asset_glpi_id), item); });
        return map;
    }, [records]);
    const checked = assets.filter((asset) => latestByAsset.has(String(asset.glpi_id))).length;
    const due = assets.filter((asset) => {
        const record = latestByAsset.get(String(asset.glpi_id));
        return record?.next_due_date && new Date(record.next_due_date) <= new Date();
    }).length;
    const failed = [...latestByAsset.values()].filter((item) => item.overall_status === 'Fail').length;
    const pendingBatch = batches.filter((item) => item.status === 'Pending_IT_Manager').length;
    const branches = getAllAssetBranches().map((item) => ({ ...item, count: selectedRecords.filter((record) => getAssetBranchKey(record.location_name) === item.key).length }));
    const columns = [
        { key: 'asset', label: 'เครื่องคอมพิวเตอร์', render: (item) => <div className="tap-asset-name"><span><MonitorCheck size={17} /></span><div><strong>{item.asset_name || '-'}</strong><small>{item.asset_code || item.serial || '-'}</small></div></div> },
        { key: 'branch', label: 'สาขา / ที่ตั้ง', render: (item) => <div className="tap-cell-stack"><strong>{branches.find((branchItem) => branchItem.key === getAssetBranchKey(item.location_name))?.label || 'อื่น ๆ'}</strong><span>{item.location_name || '-'}</span></div> },
        { key: 'date', label: 'วันที่ PM', render: (item) => <div className="tap-cell-stack"><strong>{formatDate(item.pm_date)}</strong><span>ครั้งถัดไป {formatDate(item.next_due_date)}</span></div> },
        { key: 'inspector', label: 'ผู้ทำ PM', render: (item) => item.inspector_name || '-' },
        { key: 'status', label: 'ผลตรวจ', render: (item) => { const meta = pmMeta(item.overall_status); return <SystemStatusBadge tone={meta[1]}>{meta[0]}</SystemStatusBadge>; } },
        { key: 'action', label: '', render: (item) => <button type="button" className="tap-row-action" onClick={() => setSelected(item)} title="ดูรายละเอียด"><Eye size={18} /></button> },
    ];
    return <>
        <SystemPageHeader breadcrumb="IT Helpdesk / Computer Management" title="การทำ PM" className="tap-issue-heading" actions={<div className="tap-page-actions"><button type="button" className="tap-secondary-button" disabled={loading} onClick={loadData}><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> รีเฟรช</button><button type="button" className="tap-primary-button" onClick={onOpenLegacy}><Wrench size={17} /> เปิดหน้าเดิม</button></div>} />
        <section className="tap-pm-summary">
            <SystemStatCard icon={MonitorCheck} label="เครื่องซื้อขาด" value={assets.length.toLocaleString('th-TH')} detail="เครื่อง Active ที่ต้อง PM" tone="blue" />
            <SystemStatCard icon={CalendarCheck} label="ตรวจแล้ว" value={checked.toLocaleString('th-TH')} detail={`ยังไม่เคย PM ${Math.max(0, assets.length - checked)}`} tone="green" />
            <SystemStatCard icon={RefreshCw} label="ครบกำหนด" value={due.toLocaleString('th-TH')} detail="ถึงกำหนด PM ครั้งถัดไป" tone="amber" />
            <SystemStatCard icon={Wrench} label="พบประเด็น" value={failed.toLocaleString('th-TH')} detail="ผลตรวจไม่ผ่าน" tone="red" />
            <SystemStatCard icon={Send} label="รอผู้จัดการอนุมัติ" value={pendingBatch.toLocaleString('th-TH')} detail="ชุดรายงานที่ส่งแล้ว" tone="blue" />
        </section>
        <section className="tap-pm-branches">{branches.map((item) => <button type="button" key={item.key} className={`tap-card tap-branch-card ${branch === item.key ? 'is-selected' : ''}`} onClick={() => setBranch(branch === item.key ? 'all' : item.key)}><Building2 size={20} /><div><strong>{item.label}</strong><span>{item.count} รายการในปีที่เลือก</span></div></button>)}</section>
        <section className="tap-card tap-issue-list">
            <div className="tap-issue-toolbar"><div className="tap-toolbar-title"><CalendarCheck size={20} /><div><h2>รายการ PM</h2><p>พบ {selectedRecords.length.toLocaleString('th-TH')} รายการ</p></div></div><div className="tap-filter-controls"><label><select value={year} onChange={(event) => setYear(event.target.value)}>{years.map((item) => <option key={item} value={item}>ปี {Number(item) + 543}</option>)}</select></label></div></div>
            <SystemDataTable columns={columns} rows={selectedRecords} rowKey="id" loading={loading} minWidth={900} empty={<div className="tap-no-results"><SearchX size={25} /><strong>ยังไม่มีรายการ PM</strong><span>ลองเปลี่ยนปี สาขา หรือคำค้นหา</span></div>} />
        </section>
        <SystemDetailDrawer open={Boolean(selected)} title={selected?.asset_name || '-'} eyebrow="รายงาน PM" onClose={() => setSelected(null)} footer={<><button type="button" onClick={() => setSelected(null)}>ปิด</button><button type="button" className="tap-primary-button" onClick={onOpenLegacy}>เปิดรายงานหน้าเดิม</button></>}>
            {selected && <><div className="tap-detail-status"><CalendarCheck size={19} /><div><span>ผลตรวจ</span><strong>{pmMeta(selected.overall_status)[0]}</strong></div></div><dl><div><dt>วันที่ PM</dt><dd>{formatDate(selected.pm_date)}</dd></div><div><dt>กำหนดครั้งถัดไป</dt><dd>{formatDate(selected.next_due_date)}</dd></div><div><dt>ผู้ทำ PM</dt><dd>{selected.inspector_name || '-'}</dd></div><div><dt>ผู้ใช้งานเครื่อง</dt><dd>{selected.user_name || '-'}</dd></div><div className="full"><dt>ที่ตั้ง</dt><dd>{selected.location_name || '-'}</dd></div><div className="full"><dt>หมายเหตุ</dt><dd>{selected.note || '-'}</dd></div></dl></>}
        </SystemDetailDrawer>
    </>;
}
