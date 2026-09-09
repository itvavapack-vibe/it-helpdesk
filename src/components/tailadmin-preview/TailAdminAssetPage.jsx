import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Building2, Eye, Laptop, MonitorCog, PackageCheck, RefreshCw, RotateCcw,
    SearchX, ShoppingCart, Wrench,
} from 'lucide-react';
import { mysql } from '../../mysqlClient';
import { getAssetBranchKey, getAssetBranchLabel } from '../../utils/assetBranch';
import {
    SystemDataTable, SystemDetailDrawer, SystemPageHeader, SystemStatCard,
    SystemStatusBadge,
} from '../system-ui';

const isActive = (asset) => String(asset?.states_id || '').trim().toLowerCase() === 'active';
const sourceType = (asset) => {
    const value = String(asset?.autoupdatesystems_id || '').toLowerCase();
    if (value.includes('rent') || value.includes('เช่า')) return 'rent';
    if (value.includes('buy') || value.includes('ซื้อ')) return 'buy';
    return 'other';
};
const valueOf = (asset, ...keys) => keys.map((key) => asset?.[key]).find(Boolean) || '-';

export default function TailAdminAssetPage({ issues = [], query, onOpenLegacy }) {
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [source, setSource] = useState('all');
    const [branch, setBranch] = useState('all');
    const [selected, setSelected] = useState(null);
    const [page, setPage] = useState(1);
    const pageSize = 12;

    const loadAssets = useCallback(async () => {
        setLoading(true);
        setError('');
        const { data, error: loadError } = await mysql.from('assets').select('*').order('name');
        if (loadError) {
            setError(typeof loadError === 'string' ? loadError : loadError.message || 'โหลดข้อมูลไม่สำเร็จ');
            setAssets([]);
        } else {
            setAssets((data || []).filter(isActive));
        }
        setLoading(false);
    }, []);
    useEffect(() => { loadAssets(); }, [loadAssets]);

    const getAssetIssues = useCallback((asset) => issues.filter((issue) => (
        (issue.assetId && String(issue.assetId) === String(asset.glpi_id))
        || (issue.assetName && asset.name && issue.assetName.toLowerCase() === asset.name.toLowerCase())
    )), [issues]);
    const getOpenIssues = useCallback((asset) => getAssetIssues(asset).filter((issue) => (
        !['Resolved', 'Closed', 'Cancelled'].includes(issue.status)
        && !issue.userCloseSign
        && !issue.userClosedAt
    )), [getAssetIssues]);
    const branchOptions = useMemo(() => [...new Set(assets.map((asset) => getAssetBranchKey(asset.locations_id)))], [assets]);
    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return assets.filter((asset) => source === 'all' || sourceType(asset) === source)
            .filter((asset) => branch === 'all' || getAssetBranchKey(asset.locations_id) === branch)
            .filter((asset) => !needle || [
                asset.name, asset.serial, asset.otherserial, asset.users_id,
                asset.locations_id, asset.computermodels_id, asset.operatingsystems_id,
            ].some((value) => String(value || '').toLowerCase().includes(needle)));
    }, [assets, branch, query, source]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
    useEffect(() => setPage(1), [branch, query, source]);
    useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

    const buyCount = assets.filter((asset) => sourceType(asset) === 'buy').length;
    const rentCount = assets.filter((asset) => sourceType(asset) === 'rent').length;
    const repairingCount = assets.filter((asset) => getOpenIssues(asset).length > 0).length;
    const columns = [
        { key: 'name', label: 'ชื่อเครื่อง', render: (asset) => <div className="tap-asset-name"><span><MonitorCog size={17} /></span><div><strong>{valueOf(asset, 'name')}</strong><small>{valueOf(asset, 'serial')}</small></div></div> },
        { key: 'code', label: 'รหัสทรัพย์สิน', render: (asset) => <strong>{sourceType(asset) === 'rent' ? 'เครื่องเช่า' : valueOf(asset, 'otherserial')}</strong> },
        { key: 'model', label: 'รุ่น / ระบบปฏิบัติการ', render: (asset) => <div className="tap-cell-stack"><strong>{valueOf(asset, 'computermodels_id')}</strong><span>{valueOf(asset, 'operatingsystems_id')}</span></div> },
        { key: 'user', label: 'ผู้ใช้งาน', render: (asset) => <div className="tap-cell-stack"><strong>{valueOf(asset, 'users_id')}</strong><span>{valueOf(asset, 'groups_id')}</span></div> },
        { key: 'location', label: 'ที่ตั้ง / สาขา', render: (asset) => <div className="tap-cell-stack"><strong>{valueOf(asset, 'locations_id')}</strong><span>{getAssetBranchLabel(getAssetBranchKey(asset.locations_id))}</span></div> },
        { key: 'source', label: 'แหล่งที่มา', render: (asset) => <SystemStatusBadge tone={sourceType(asset) === 'rent' ? 'info' : sourceType(asset) === 'buy' ? 'success' : 'neutral'}>{sourceType(asset) === 'rent' ? 'เครื่องเช่า' : sourceType(asset) === 'buy' ? 'ซื้อขาด' : 'ไม่ระบุ'}</SystemStatusBadge> },
        { key: 'repair', label: 'งานซ่อม', render: (asset) => getOpenIssues(asset).length ? <SystemStatusBadge tone="warning">กำลังซ่อม {getOpenIssues(asset).length}</SystemStatusBadge> : <SystemStatusBadge tone="success">พร้อมใช้งาน</SystemStatusBadge> },
        { key: 'action', label: '', render: (asset) => <button type="button" className="tap-row-action" title="ดูรายละเอียด" onClick={() => setSelected(asset)}><Eye size={18} /></button> },
    ];

    return (
        <>
            <SystemPageHeader
                breadcrumb="IT Helpdesk / Computer Management"
                title="ข้อมูลคอมพิวเตอร์"
                className="tap-issue-heading"
                actions={<div className="tap-page-actions"><button type="button" className="tap-secondary-button" disabled={loading} onClick={loadAssets}><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> รีเฟรช</button><button type="button" className="tap-primary-button" onClick={onOpenLegacy}><Wrench size={17} /> เปิดหน้าเดิม</button></div>}
            />
            <section className="tap-asset-summary">
                <SystemStatCard icon={MonitorCog} label="เครื่อง Active" value={assets.length.toLocaleString('th-TH')} detail="ข้อมูลจาก GLPI + MySQL" tone="blue" />
                <SystemStatCard icon={ShoppingCart} label="ซื้อขาด" value={buyCount.toLocaleString('th-TH')} detail="ทรัพย์สินบริษัท" tone="green" />
                <SystemStatCard icon={Laptop} label="เครื่องเช่า" value={rentCount.toLocaleString('th-TH')} detail="ไม่แสดงรหัสทรัพย์สิน" tone="amber" />
                <SystemStatCard icon={Wrench} label="กำลังซ่อม" value={repairingCount.toLocaleString('th-TH')} detail="มีงานที่ยังไม่ปิด" tone="red" />
            </section>
            <section className="tap-card tap-issue-list">
                <div className="tap-issue-toolbar">
                    <div className="tap-toolbar-title"><PackageCheck size={20} /><div><h2>รายการคอมพิวเตอร์</h2><p>แสดง {filtered.length.toLocaleString('th-TH')} จาก {assets.length.toLocaleString('th-TH')} เครื่อง</p></div></div>
                    <div className="tap-filter-controls">
                        <label><select value={source} onChange={(event) => setSource(event.target.value)}><option value="all">ทุกแหล่งที่มา</option><option value="buy">ซื้อขาด</option><option value="rent">เครื่องเช่า</option><option value="other">ไม่ระบุ</option></select></label>
                        <label><Building2 size={16} /><select value={branch} onChange={(event) => setBranch(event.target.value)}><option value="all">ทุกสาขา</option>{branchOptions.map((item) => <option key={item} value={item}>{getAssetBranchLabel(item)}</option>)}</select></label>
                        {(source !== 'all' || branch !== 'all') && <button type="button" className="tap-reset-button" title="ล้างตัวกรอง" onClick={() => { setSource('all'); setBranch('all'); }}><RotateCcw size={17} /></button>}
                    </div>
                </div>
                {error && <div className="tap-inline-error">{error}</div>}
                <SystemDataTable
                    columns={columns}
                    rows={rows}
                    rowKey={(asset) => asset.glpi_id}
                    loading={loading}
                    minWidth={1220}
                    empty={<div className="tap-no-results"><SearchX size={25} /><strong>ไม่พบคอมพิวเตอร์</strong><span>ลองเปลี่ยนคำค้นหาหรือตัวกรอง</span></div>}
                />
                <footer className="tap-pagination"><span>หน้า {page} จาก {totalPages}</span><div><button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>ก่อนหน้า</button><button type="button" disabled={page === totalPages} onClick={() => setPage((value) => value + 1)}>ถัดไป</button></div></footer>
            </section>
            <SystemDetailDrawer
                open={Boolean(selected)}
                title={valueOf(selected, 'name')}
                eyebrow="รายละเอียดคอมพิวเตอร์"
                onClose={() => setSelected(null)}
                footer={<><button type="button" onClick={() => setSelected(null)}>ปิด</button><button type="button" className="tap-primary-button" onClick={onOpenLegacy}>เปิดหน้าเดิม</button></>}
            >
                {selected && <>
                    <div className="tap-detail-status"><MonitorCog size={19} /><div><span>สถานะจาก GLPI</span><strong>{valueOf(selected, 'states_id')}</strong></div></div>
                    <dl>
                        <div><dt>รหัสทรัพย์สิน</dt><dd>{sourceType(selected) === 'rent' ? 'เครื่องเช่า' : valueOf(selected, 'otherserial')}</dd></div>
                        <div><dt>Serial Number</dt><dd>{valueOf(selected, 'serial')}</dd></div>
                        <div><dt>ประเภท</dt><dd>{valueOf(selected, 'computertypes_id')}</dd></div>
                        <div><dt>รุ่น</dt><dd>{valueOf(selected, 'computermodels_id')}</dd></div>
                        <div><dt>ผู้ใช้งาน</dt><dd>{valueOf(selected, 'users_id')}</dd></div>
                        <div><dt>กลุ่ม</dt><dd>{valueOf(selected, 'groups_id')}</dd></div>
                        <div className="full"><dt>ที่ตั้ง</dt><dd>{valueOf(selected, 'locations_id')}</dd></div>
                        <div className="full"><dt>ระบบปฏิบัติการ</dt><dd>{valueOf(selected, 'operatingsystems_id')}</dd></div>
                        <div><dt>ประวัติซ่อม</dt><dd>{getAssetIssues(selected).length} ครั้ง</dd></div>
                        <div><dt>งานที่ยังไม่ปิด</dt><dd>{getOpenIssues(selected).length} รายการ</dd></div>
                        <div className="full"><dt>หมายเหตุ</dt><dd>{valueOf(selected, 'comment')}</dd></div>
                    </dl>
                </>}
            </SystemDetailDrawer>
        </>
    );
}
