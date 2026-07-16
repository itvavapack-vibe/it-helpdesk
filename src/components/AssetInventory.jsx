import React, { Suspense, lazy, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Monitor, RefreshCw, AlertCircle, Search, X, Tag, FileSpreadsheet, QrCode, Clock, Upload, Copy, Check, ClipboardCheck, BarChart3, FileText, Save, Printer, Download } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import { withGlpiSession, getComputers, getUsers, getComputerDetail, extractIpAddresses } from '../glpiClient';
import { mysql } from '../mysqlClient';

const AssetPmDashboardCharts = lazy(() => import('./AssetPmDashboardCharts'));
import { notifyGlpiSync } from '../telegramNotify';

const mapAssetRowToComputer = (row) => ({ ...row, id: row.glpi_id });

const isActiveComputer = (c) => String(c.states_id || '').toLowerCase() === 'active';

const FINAL_REPAIR_STATUSES = new Set(['Resolved', 'Closed', 'Cancelled']);

const PM_CHECKLIST = [
    { id: 'external_cleaning', label: 'ตรวจสภาพภายนอกและทำความสะอาดตัวเครื่อง' },
    { id: 'power_cable', label: 'ตรวจสายไฟ ปลั๊ก และอุปกรณ์จ่ายไฟ' },
    { id: 'monitor_keyboard_mouse', label: 'ตรวจจอภาพ แป้นพิมพ์ และเมาส์' },
    { id: 'cpu_ram_storage', label: 'ตรวจ CPU, RAM และพื้นที่จัดเก็บข้อมูล' },
    { id: 'os_update', label: 'ตรวจระบบปฏิบัติการและ Windows Update' },
    { id: 'antivirus', label: 'ตรวจ Antivirus และความปลอดภัยพื้นฐาน' },
    { id: 'network', label: 'ตรวจ Network / Internet / IP Address' },
    { id: 'software', label: 'ตรวจโปรแกรมใช้งานหลักและ License ที่เกี่ยวข้อง' },
    { id: 'backup_disk', label: 'ตรวจพื้นที่ Disk และคำแนะนำการสำรองข้อมูล' },
    { id: 'performance', label: 'ทดสอบการทำงานโดยรวมหลัง PM' },
];

const PM_STATUS_LABELS = {
    Pass: 'ปกติ',
    Watch: 'เฝ้าระวัง',
    Fail: 'ต้องแก้ไข',
};

const PM_STATUS_STYLES = {
    Pass: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
    Watch: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200',
    Fail: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200',
};

const createDefaultPmChecklist = () => Object.fromEntries(
    PM_CHECKLIST.map((item) => [item.id, { status: 'Pass', note: '' }])
);

const toMonthKey = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 7);
};

const getMonthLabel = (monthKey) => {
    if (!monthKey) return '-';
    const [year, month] = monthKey.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('th-TH', { month: 'short', year: 'numeric' });
};

const getRecentMonthOptions = (count = 12) => {
    const options = [];
    const cursor = new Date();
    cursor.setDate(1);
    for (let index = 0; index < count; index += 1) {
        const value = cursor.toISOString().slice(0, 7);
        options.push({ value, label: getMonthLabel(value) });
        cursor.setMonth(cursor.getMonth() - 1);
    }
    return options;
};

const isOpenRepairIssue = (issue) => (
    !FINAL_REPAIR_STATUSES.has(issue?.status) &&
    !issue?.userCloseSign &&
    !issue?.userClosedAt
);

async function batchDeleteIn(table, column, ids) {
    const chunkSize = 80;
    for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const { error } = await mysql.from(table).delete().in(column, chunk);
        if (error) throw new Error(typeof error === 'string' ? error : error.message || String(error));
    }
}

const AssetInventory = ({ issues = [], view = 'inventory' }) => {
    const [computers, setComputers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedComputer, setSelectedComputer] = useState(null);
    const [qrComputer, setQrComputer] = useState(null);
    const [warning, setWarning] = useState(null);
    const [sourceFilter, setSourceFilter] = useState('all'); // all, buy, rent, buyrent
    const [ipAddresses, setIpAddresses] = useState([]);
    const [ipLoading, setIpLoading] = useState(false);
    const [copiedIp, setCopiedIp] = useState(null);
    const [pmRecords, setPmRecords] = useState([]);
    const [pmWarning, setPmWarning] = useState('');
    const [pmComputer, setPmComputer] = useState(null);
    const [pmReportRecord, setPmReportRecord] = useState(null);
    const [pmMonth, setPmMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [pmForm, setPmForm] = useState(() => ({
        pmDate: new Date().toISOString().slice(0, 10),
        inspectorName: '',
        nextDueDate: '',
        overallStatus: 'Pass',
        checklist: createDefaultPmChecklist(),
        note: '',
    }));
    const pmReportRef = useRef(null);
    const isPmView = view === 'pm';

    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState(null);

    const loadAssetsFromMysql = useCallback(async () => {
        const { data, error } = await mysql.from('assets').select('*').order('name');
        if (error) throw new Error(error);
        return (data || []).map(mapAssetRowToComputer).filter(isActiveComputer);
    }, []);

    const loadPmRecords = useCallback(async ({ silent = false } = {}) => {
        try {
            const { data, error } = await mysql
                .from('asset_pm_records')
                .select('*')
                .order('pm_date', { ascending: false })
                .limit(1000);
            if (error) throw new Error(error);
            setPmRecords(data || []);
            setPmWarning('');
        } catch (err) {
            console.warn('Load PM records failed:', err);
            setPmRecords([]);
            if (!silent) {
                setPmWarning('ยังไม่พบตาราง PM กรุณารัน migration asset_pm_records ก่อนใช้งานจริง');
            }
        }
    }, []);

    const fetchComputers = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setWarning(null);

        let mysqlAssets = [];
        try {
            mysqlAssets = await loadAssetsFromMysql();
            if (mysqlAssets.length > 0) {
                setComputers(mysqlAssets);
            }
        } catch (mysqlErr) {
            console.warn('โหลดทรัพย์สินจาก MySQL ไม่สำเร็จ:', mysqlErr);
        }

        try {
            const data = await withGlpiSession(getComputers);
            const all = Array.isArray(data) ? data : [];
            const active = all.filter(isActiveComputer);
            console.log('GLPI active computers:', active.length, '/', all.length);
            setComputers(active);
            setWarning(null);
        } catch {
            if (mysqlAssets.length > 0) {
                setComputers(mysqlAssets);
                setWarning('ใช้ข้อมูลจาก MySQL (เชื่อมต่อ GLPI ไม่ได้ในขณะนี้ — กด Sync หลังเข้า Office ได้)');
            } else {
                setError('ไม่สามารถเชื่อมต่อ GLPI ได้ และยังไม่มีข้อมูลใน MySQL (กรุณา Sync จาก GLPI ครั้งแรก)');
            }
        } finally {
            setIsLoading(false);
        }
    }, [loadAssetsFromMysql]);

    useEffect(() => { fetchComputers(); }, [fetchComputers]);
    useEffect(() => { loadPmRecords(); }, [loadPmRecords]);

    // Core sync logic
    const performSync = useCallback(async (showSuccessAlert = false) => {
        if (computers.length === 0) return;
        
        // Prevent multiple simultaneous syncs
        if (isSyncing) return;
        
        setIsSyncing(true);
        try {
            const stats = {
                assetsAdded: 0, assetsUpdated: 0, assetsDeleted: 0,
                usersAdded: 0, usersUpdated: 0, usersDeleted: 0
            };

            // 1. Sync Assets (Computers)
            const rows = computers.map(c => ({
                glpi_id: c.id,
                name: c.name || '',
                serial: c.serial || null,
                otherserial: c.otherserial || null,
                users_id: c.users_id || null,
                locations_id: c.locations_id || null,
                computermodels_id: c.computermodels_id || null,
                computertypes_id: c.computertypes_id || null,
                states_id: c.states_id || null,
                autoupdatesystems_id: c.autoupdatesystems_id || null,
            }));
            
            // Fetch existing assets to calculate added/updated stats
            const { data: existingAssets } = await mysql.from('assets').select('glpi_id, updated_at');
            const existingAssetIds = new Set(existingAssets?.map(a => a.glpi_id) || []);
            
            let currentAssetsAdded = 0;
            let currentAssetsUpdated = 0;
            
            rows.forEach(r => {
                if (existingAssetIds.has(r.glpi_id)) currentAssetsUpdated++;
                else currentAssetsAdded++;
            });
            
            stats.assetsAdded = currentAssetsAdded;
            stats.assetsUpdated = currentAssetsUpdated;

            const { error: assetUpsertError } = await mysql.from('assets').upsert(rows, { onConflict: 'glpi_id' });
            if (assetUpsertError) throw new Error(assetUpsertError);

            // --- ลบข้อมูลเครื่องเก่าที่ถูกลบออกจาก GLPI ไปแล้ว ---
            if (existingAssets) {
                const currentGlpiIds = new Set(rows.map(r => r.glpi_id));
                const staleAssetIds = existingAssets.filter(a => !currentGlpiIds.has(a.glpi_id)).map(a => a.glpi_id);
                if (staleAssetIds.length > 0) {
                    await batchDeleteIn('assets', 'glpi_id', staleAssetIds);
                    stats.assetsDeleted = staleAssetIds.length;
                }
            }

            // 2. Sync Users
            const usersData = await withGlpiSession(getUsers);
            
            // ข้อมูล owner จากเครื่องทั้งหมด
            const assetUserIds = new Set(computers.map(c => c.users_id).filter(Boolean));

            const activeUsers = (usersData || []).filter(u => {
                const name = u.formattedName || u.name;
                const isValidName = name && name.trim() !== '' && !name.toLowerCase().includes('admin');
                const hasComputer = assetUserIds.has(u.name); // เช็คว่ามีเครื่องไหม
                
                return isValidName && hasComputer;
            });

            // หา Local Users (ชื่อที่มีในเครื่อง แต่ไม่มีในระบบ User ของ GLPI)
            const glpiUsernames = new Set((usersData || []).map(u => u.name));
            let localUserCounter = -1000;
            const extraLocalUsers = [];

            for (const assetUser of assetUserIds) {
                if (!glpiUsernames.has(assetUser) && !assetUser.toLowerCase().includes('admin')) {
                    extraLocalUsers.push({
                        id: localUserCounter--, // ใช้ ID ติดลบสำหรับ Local Users
                        name: assetUser,
                        realname: assetUser,
                        firstname: '',
                        formattedName: assetUser
                    });
                }
            }

            const allSyncUsers = [...activeUsers, ...extraLocalUsers];

            const { data: existingUsers } = await mysql.from('glpi_users').select('id');
            const existingUserIds = new Set(existingUsers?.map(u => u.id) || []);

            let currentUsersAdded = 0;
            let currentUsersUpdated = 0;

            if (allSyncUsers.length > 0) {
                const userRows = allSyncUsers.map(u => ({
                    id: u.id,
                    name: u.name || '',
                    realname: u.realname || null,
                    firstname: u.firstname || null,
                    formattedName: u.formattedName || u.name || '',
                }));
                
                userRows.forEach(u => {
                    if (existingUserIds.has(u.id)) currentUsersUpdated++;
                    else currentUsersAdded++;
                });
                
                stats.usersAdded = currentUsersAdded;
                stats.usersUpdated = currentUsersUpdated;

                const { error: userError } = await mysql.from('glpi_users').upsert(userRows, { onConflict: 'id' });
                if (userError) throw new Error(userError);
            }

            // --- ลบข้อมูล User เก่าที่ไม่มีเครื่องหรือถูกลบออกจาก GLPI ไปแล้ว ---
            if (existingUsers) {
                const currentUserIds = new Set(allSyncUsers.map(u => u.id));
                const staleUserIds = existingUsers.filter(u => !currentUserIds.has(u.id)).map(u => u.id);
                if (staleUserIds.length > 0) {
                    await batchDeleteIn('glpi_users', 'id', staleUserIds);
                    stats.usersDeleted = staleUserIds.length;
                }
            }

            // Send Telegram Notification if there were any structural changes
            if (stats.assetsAdded > 0 || stats.assetsDeleted > 0 || stats.usersAdded > 0 || stats.usersDeleted > 0) {
                await notifyGlpiSync(stats).catch(console.error);
            }

            if (showSuccessAlert) {
                setSyncResult({ type: 'success', stats, time: new Date() });
                // Clear after 10 seconds
                setTimeout(() => setSyncResult(null), 10000);
            } else if (stats.assetsAdded > 0 || stats.assetsDeleted > 0 || stats.usersAdded > 0 || stats.usersDeleted > 0) {
                // Auto Sync พบว่ามีการเปลี่ยนแปลง
                setSyncResult({ type: 'info', stats, time: new Date() });
                setTimeout(() => setSyncResult(null), 10000);
            }
            console.log(`Sync → MySQL: ${rows.length} assets, ${allSyncUsers.length} users`);
        } catch (err) {
            console.error('Sync to MySQL failed:', err);
            if (showSuccessAlert) {
                setSyncResult({ type: 'error', message: err.message || String(err), time: new Date() });
                setTimeout(() => setSyncResult(null), 10000);
            }
        } finally {
            setIsSyncing(false);
        }
    }, [computers, isSyncing]);

    // Auto-sync effect
    useEffect(() => {
        // Only run auto-sync if we successfully loaded data from GLPI (no error/warning)
        // and we have computers to sync
        if (computers.length > 0 && !error && !warning) {
            // Initial auto-sync 3 seconds after loading to not block UI
            const initialTimer = setTimeout(() => {
                performSync(false);
            }, 3000);

            // Periodic auto-sync every 2 hours
            const periodicTimer = setInterval(() => {
                performSync(false);
            }, 2 * 60 * 60 * 1000);

            return () => {
                clearTimeout(initialTimer);
                clearInterval(periodicTimer);
            };
        }
    }, [computers.length, error, warning, performSync]);

    // Cross-reference: หา issues ของแต่ละเครื่อง
    const getAssetIssues = useCallback((computer) => {
        return issues.filter(i =>
            (i.assetId && String(i.assetId) === String(computer.id)) ||
            (i.assetName && computer.name && i.assetName.toLowerCase() === computer.name.toLowerCase())
        );
    }, [issues]);

    const getOpenIssues = useCallback((computer) => {
        return getAssetIssues(computer).filter(isOpenRepairIssue);
    }, [getAssetIssues]);

    // Stats
    const stats = useMemo(() => {
        const repairing = computers.filter(c => getOpenIssues(c).length > 0).length;
        const assetIssueCounts = computers.map(c => ({
            name: c.name,
            count: getAssetIssues(c).length
        })).sort((a, b) => b.count - a.count);
        const topAsset = assetIssueCounts[0]?.count > 0 ? assetIssueCounts[0] : null;
        return { total: computers.length, repairing, topAsset };
    }, [computers, getOpenIssues, getAssetIssues]);

    const formatUpdateSourceTEXT = (source) => {
        if (!source) return '-';
        const str = String(source).toLowerCase();
        if (str.includes('buy') || str.includes('ซื้อ')) return 'ซื้อขาด (Buy)';
        if (str.includes('rent') || str.includes('เช่า')) return 'เช่า (Rental)';
        return source;
    };

    const isSourceMatch = (source, filterType) => {
        const sourceStr = String(source || '').toLowerCase();
        if (filterType === 'all') return true;
        if (filterType === 'buy') return sourceStr.includes('buy') || sourceStr.includes('ซื้อ');
        if (filterType === 'rent') return sourceStr.includes('rent') || sourceStr.includes('เช่า');
        if (filterType === 'buyrent') return sourceStr.includes('buy') || sourceStr.includes('ซื้อ') || sourceStr.includes('rent') || sourceStr.includes('เช่า');
        return false;
    };

    const isBuyComputer = useCallback((computer) => isSourceMatch(computer?.autoupdatesystems_id, 'buy'), []);

    const getComputerPmRecords = useCallback((computer) => {
        return pmRecords.filter((record) => String(record.asset_glpi_id) === String(computer?.id));
    }, [pmRecords]);

    const getLatestPmRecord = useCallback((computer) => getComputerPmRecords(computer)[0] || null, [getComputerPmRecords]);

    const getPmStatusBadge = (status) => (
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${PM_STATUS_STYLES[status] || PM_STATUS_STYLES.Pass}`}>
            {PM_STATUS_LABELS[status] || status || '-'}
        </span>
    );

    const openPmForm = (computer) => {
        const latestRecord = getLatestPmRecord(computer);
        const lastInspector = latestRecord?.inspector_name || '';
        const nextDue = new Date();
        nextDue.setMonth(nextDue.getMonth() + 6);
        setPmComputer(computer);
        setPmForm({
            pmDate: new Date().toISOString().slice(0, 10),
            inspectorName: lastInspector,
            nextDueDate: nextDue.toISOString().slice(0, 10),
            overallStatus: 'Pass',
            checklist: createDefaultPmChecklist(),
            note: '',
        });
    };

    const updatePmChecklist = (itemId, field, value) => {
        setPmForm((current) => ({
            ...current,
            checklist: {
                ...current.checklist,
                [itemId]: {
                    ...(current.checklist[itemId] || { status: 'Pass', note: '' }),
                    [field]: value,
                },
            },
        }));
    };

    const pmDashboard = useMemo(() => {
        const buyComputers = computers.filter(isBuyComputer);
        const latestByAssetId = new Map();
        pmRecords.forEach((record) => {
            const key = String(record.asset_glpi_id);
            if (!latestByAssetId.has(key)) latestByAssetId.set(key, record);
        });
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const latestBuyRecords = buyComputers
            .map((computer) => latestByAssetId.get(String(computer.id)))
            .filter(Boolean);
        const dueRecords = latestBuyRecords.filter((record) => {
            if (!record.next_due_date) return false;
            const dueDate = new Date(record.next_due_date);
            dueDate.setHours(0, 0, 0, 0);
            return dueDate <= today;
        });
        const issueRecords = latestBuyRecords.filter((record) => record.overall_status === 'Watch' || record.overall_status === 'Fail');
        return {
            buyTotal: buyComputers.length,
            checked: latestBuyRecords.length,
            neverChecked: buyComputers.length - latestBuyRecords.length,
            due: dueRecords.length,
            issue: issueRecords.length,
            latest: pmRecords[0] || null,
        };
    }, [computers, isBuyComputer, pmRecords]);

    const pmMonthOptions = useMemo(() => getRecentMonthOptions(12), []);

    const selectedMonthRecords = useMemo(() => (
        pmRecords.filter((record) => toMonthKey(record.pm_date) === pmMonth)
    ), [pmMonth, pmRecords]);

    const pmMonthlyTrend = useMemo(() => {
        const months = getRecentMonthOptions(6).reverse();
        return months.map(({ value, label }) => {
            const records = pmRecords.filter((record) => toMonthKey(record.pm_date) === value);
            return {
                month: label,
                total: records.length,
                Pass: records.filter((record) => record.overall_status === 'Pass').length,
                Watch: records.filter((record) => record.overall_status === 'Watch').length,
                Fail: records.filter((record) => record.overall_status === 'Fail').length,
            };
        });
    }, [pmRecords]);

    const pmStatusChartData = useMemo(() => (
        ['Pass', 'Watch', 'Fail'].map((status) => ({
            name: PM_STATUS_LABELS[status],
            value: selectedMonthRecords.filter((record) => record.overall_status === status).length,
            status,
        }))
    ), [selectedMonthRecords]);

    const pmInspectorChartData = useMemo(() => {
        const counts = new Map();
        selectedMonthRecords.forEach((record) => {
            const name = record.inspector_name || 'ไม่ระบุ';
            counts.set(name, (counts.get(name) || 0) + 1);
        });
        return Array.from(counts.entries())
            .map(([name, total]) => ({ name, total }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 6);
    }, [selectedMonthRecords]);

    const pmMonthSummary = useMemo(() => {
        const pass = selectedMonthRecords.filter((record) => record.overall_status === 'Pass').length;
        const watch = selectedMonthRecords.filter((record) => record.overall_status === 'Watch').length;
        const fail = selectedMonthRecords.filter((record) => record.overall_status === 'Fail').length;
        return {
            total: selectedMonthRecords.length,
            pass,
            watch,
            fail,
            monthLabel: getMonthLabel(pmMonth),
        };
    }, [pmMonth, selectedMonthRecords]);

    const filtered = computers.filter(c => {
        const matchesSearch = (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (c.serial || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (c.otherserial || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (c.users_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (c.locations_id || '').toLowerCase().includes(searchTerm.toLowerCase());
            
        const matchesSource = isSourceMatch(c.autoupdatesystems_id, sourceFilter);
        
        return matchesSearch && matchesSource;
    });

    const filterCounts = useMemo(() => {
        let buy = 0;
        let rent = 0;
        computers.forEach(c => {
            if (isSourceMatch(c.autoupdatesystems_id, 'buy')) buy++;
            else if (isSourceMatch(c.autoupdatesystems_id, 'rent')) rent++;
        });
        return { all: computers.length, buy, rent, buyrent: buy + rent };
    }, [computers]);

    const exportToExcel = () => {
        const data = filtered.map(c => ({
            'ชื่อเครื่อง': c.name || '-',
            'รหัสทรัพย์สิน': c.otherserial || '-',
            'Serial Number': c.serial || '-',
            'รุ่น': c.computermodels_id || '-',
            'แหล่งที่มา': formatUpdateSourceTEXT(c.autoupdatesystems_id),
            'ผู้ใช้งาน': c.users_id || '-',
            'ตำแหน่ง': c.locations_id || '-',
            'OS': c.operatingsystems_id || '-',
            'สถานะ': c.states_id || '-',
            'กำลังซ่อม': getOpenIssues(c).length > 0 ? 'ใช่' : 'ไม่',
            'ประวัติซ่อม (ครั้ง)': getAssetIssues(c).length,
            'หมายเหตุ': c.comment || '-',
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'ทรัพย์สิน IT');
        XLSX.writeFile(wb, `Asset_Inventory_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const savePmRecord = async () => {
        if (!pmComputer) return;
        if (!pmForm.inspectorName.trim()) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณาระบุชื่อผู้ตรวจเช็ค', 'warning');
            return;
        }
        if (!pmForm.pmDate) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณาระบุวันที่ตรวจเช็ค PM', 'warning');
            return;
        }

        const payload = {
            asset_glpi_id: pmComputer.id,
            asset_name: pmComputer.name || '',
            asset_code: pmComputer.otherserial || '',
            serial: pmComputer.serial || '',
            user_name: pmComputer.users_id || '',
            location_name: pmComputer.locations_id || '',
            source_type: formatUpdateSourceTEXT(pmComputer.autoupdatesystems_id),
            pm_date: pmForm.pmDate,
            inspector_name: pmForm.inspectorName.trim(),
            overall_status: pmForm.overallStatus,
            checklist_json: JSON.stringify(pmForm.checklist),
            note: pmForm.note || '',
            next_due_date: pmForm.nextDueDate || null,
        };

        try {
            const { data, error } = await mysql.from('asset_pm_records').insert([payload]).select('*');
            if (error) throw new Error(error);
            const savedRecord = Array.isArray(data) ? data[0] : null;
            await loadPmRecords({ silent: true });
            setPmComputer(null);
            if (savedRecord) setPmReportRecord(savedRecord);
            Swal.fire('บันทึกแล้ว', 'บันทึกผลตรวจ PM และสร้างรายงาน FMIT08 แล้ว', 'success');
        } catch (error) {
            console.error('Save PM record failed:', error);
            Swal.fire('บันทึกไม่สำเร็จ', 'กรุณาตรวจสอบว่ารัน migration asset_pm_records แล้ว', 'error');
        }
    };

    const handleDownloadPmReport = async () => {
        if (!pmReportRef.current) return;
        try {
            const canvas = await html2canvas(pmReportRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
            const imageData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imageData, 'PNG', 0, 0, pdfWidth, Math.min(pdfHeight, pdf.internal.pageSize.getHeight()));
            pdf.save(`FMIT08_PM_${pmReportRecord?.asset_name || pmReportRecord?.asset_glpi_id || Date.now()}.pdf`);
        } catch (error) {
            console.error('Download PM report failed:', error);
            Swal.fire('Error', 'ไม่สามารถสร้าง PDF รายงาน PM ได้', 'error');
        }
    };

    const handlePrintPmReport = () => {
        if (!pmReportRef.current) return;
        const printFrame = document.createElement('iframe');
        printFrame.setAttribute('title', 'พิมพ์รายงาน FMIT08');
        printFrame.style.position = 'fixed';
        printFrame.style.right = '0';
        printFrame.style.bottom = '0';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = '0';
        document.body.appendChild(printFrame);
        const cleanup = () => printFrame.remove();
        const printDocument = printFrame.contentDocument;
        if (!printDocument) {
            cleanup();
            return;
        }
        printDocument.open();
        printDocument.write(`
            <!doctype html>
            <html>
                <head>
                    <title>FMIT08 PM Report</title>
                    <style>
                        @page { size: A4 portrait; margin: 10mm; }
                        * { box-sizing: border-box; }
                        body { margin: 0; font-family: Arial, sans-serif; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    </style>
                </head>
                <body>${pmReportRef.current.outerHTML}</body>
            </html>
        `);
        printDocument.close();
        const printWindow = printFrame.contentWindow;
        if (!printWindow) {
            cleanup();
            return;
        }
        printWindow.onafterprint = cleanup;
        printWindow.focus();
        printWindow.print();
        setTimeout(cleanup, 1500);
    };

    const getPmReportChecklist = (record) => {
        try {
            return JSON.parse(record?.checklist_json || '{}');
        } catch {
            return {};
        }
    };

    const getQrUrl = (computer) => {
        const base = `${window.location.origin}/report-issue`;
        return `${base}?assetId=${computer.id}&assetName=${encodeURIComponent(computer.name || '')}`;
    };

    const syncToMysql = async () => {
        await performSync(true);
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Stats Cards */}
            {!isPmView && <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                    { label: 'เครื่องทั้งหมด (Active)', value: stats.total, color: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:!border-indigo-700/50 dark:!bg-indigo-950/60 dark:!text-indigo-200', dot: 'bg-indigo-500 dark:bg-indigo-300' },
                    { label: 'กำลังซ่อม', value: stats.repairing, color: 'bg-amber-50 text-amber-700 border-amber-200 dark:!border-amber-700/50 dark:!bg-amber-950/60 dark:!text-amber-200', dot: 'bg-amber-500 dark:bg-amber-300' },
                    { label: 'แจ้งซ่อมบ่อยสุด', value: stats.topAsset ? `${stats.topAsset.name} (${stats.topAsset.count} ครั้ง)` : '-', color: 'bg-rose-50 text-rose-700 border-rose-200 dark:!border-rose-700/50 dark:!bg-rose-950/60 dark:!text-rose-200', dot: 'bg-rose-500 dark:bg-rose-300' },
                ].map(s => (
                    <div key={s.label} className={`glass-card rounded-2xl p-4 border ${s.color}`}>
                        <div className="flex items-center gap-2 mb-1">
                            <span className={`w-2 h-2 rounded-full ${s.dot}`}></span>
                            <span className="text-xs font-semibold uppercase tracking-wide opacity-70">{s.label}</span>
                        </div>
                        <p className="text-2xl font-bold">{s.value}</p>
                    </div>
                ))}
            </div>}

            {/* PM Dashboard */}
            {isPmView && <div className="space-y-5">
                <div className="overflow-hidden rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-teal-50 p-5 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-800 dark:to-sky-950/50">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-200">
                            <BarChart3 className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white">Dashboard การตรวจเช็คคอมพิวเตอร์ PM</h3>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">แสดงสถานะ PM ของเครื่องประเภท Buy และประวัติรายงาน FMIT08 ล่าสุด</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            value={pmMonth}
                            onChange={(event) => setPmMonth(event.target.value)}
                            className="input-modern !w-auto !py-2 text-sm font-bold"
                        >
                            {pmMonthOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={() => loadPmRecords()}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white/80 px-3 py-2 text-sm font-bold text-sky-700 transition hover:bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200 dark:hover:bg-sky-900/60"
                        >
                            <RefreshCw className="h-4 w-4" />
                            รีเฟรช PM
                        </button>
                    </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
                    {[
                        ['เครื่อง Buy', pmDashboard.buyTotal, 'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200'],
                        ['ตรวจแล้ว', pmDashboard.checked, 'border-sky-100 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200'],
                        ['ยังไม่เคย PM', pmDashboard.neverChecked, 'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200'],
                        ['ครบกำหนด', pmDashboard.due, 'border-orange-100 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-200'],
                        ['พบประเด็น', pmDashboard.issue, 'border-rose-100 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200'],
                    ].map(([label, value, className]) => (
                        <div key={label} className={`rounded-2xl border p-3 ${className}`}>
                            <div className="text-xs font-bold uppercase tracking-wide opacity-75">{label}</div>
                            <div className="mt-1 text-2xl font-black">{value}</div>
                        </div>
                    ))}
                </div>
                {pmDashboard.latest && (
                    <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/40 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <span className="font-bold text-slate-700 dark:text-slate-200">PM ล่าสุด:</span>
                            <span className="ml-2 text-slate-600 dark:text-slate-300">{pmDashboard.latest.asset_name || '-'} วันที่ {new Date(pmDashboard.latest.pm_date).toLocaleDateString('th-TH')}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setPmReportRecord(pmDashboard.latest)}
                            className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-sky-700 shadow-sm transition hover:bg-sky-50 dark:bg-slate-800 dark:text-sky-200 dark:hover:bg-slate-700"
                        >
                            <FileText className="h-4 w-4" />
                            เปิดรายงานล่าสุด
                        </button>
                    </div>
                )}
                {pmWarning && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                        {pmWarning}
                    </div>
                )}
                </div>

                <Suspense fallback={<div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-400 shadow-sm dark:border-slate-700 dark:bg-slate-800">กำลังโหลดกราฟ PM...</div>}>
                    <AssetPmDashboardCharts
                        pmMonthlyTrend={pmMonthlyTrend}
                        pmStatusChartData={pmStatusChartData}
                        pmInspectorChartData={pmInspectorChartData}
                        pmMonthSummary={pmMonthSummary}
                        selectedMonthRecords={selectedMonthRecords}
                        getPmStatusBadge={getPmStatusBadge}
                        onOpenReport={setPmReportRecord}
                    />
                </Suspense>
            </div>}

            {/* Header Area */}
            {!isPmView && <div className="flex flex-col gap-3">
                <div className="glass-card rounded-3xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center">
                            <Monitor className="w-6 h-6 text-sky-600 dark:text-sky-300" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 dark:text-white">ทรัพย์สิน IT</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400">GLPI + MySQL · {computers.length} เครื่อง (Active)</p>
                        </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <button onClick={syncToMysql} disabled={isLoading || isSyncing || computers.length === 0}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-700 rounded-full hover:bg-violet-50 dark:hover:bg-violet-900/40 transition-all disabled:opacity-40">
                            <Upload className={`w-4 h-4 ${isSyncing ? 'animate-bounce' : ''}`} />
                            {isSyncing ? 'กำลัง Sync...' : 'Sync → MySQL'}
                        </button>
                        <button onClick={exportToExcel} disabled={isLoading || computers.length === 0}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700 rounded-full hover:bg-emerald-50 dark:hover:bg-emerald-900/40 transition-all disabled:opacity-40">
                            <FileSpreadsheet className="w-4 h-4" /> Excel
                        </button>
                        <button onClick={fetchComputers} disabled={isLoading}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-900/40 transition-all disabled:opacity-50">
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> รีเฟรช
                        </button>
                    </div>
                </div>

                {/* Sync Result Box */}
                {syncResult && (
                    <div className={`p-4 rounded-xl border flex justify-between items-start animate-fade-in ${
                        syncResult.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-700 dark:!border-rose-700/50 dark:!bg-rose-950/60 dark:!text-rose-200' :
                        syncResult.type === 'info' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:!border-indigo-700/50 dark:!bg-indigo-950/60 dark:!text-indigo-200' :
                        'bg-emerald-50 border-emerald-200 text-emerald-700 dark:!border-emerald-700/50 dark:!bg-emerald-950/60 dark:!text-emerald-200'
                    }`}>
                        <div className="flex gap-3">
                            <RefreshCw className={`w-5 h-5 flex-shrink-0 mt-0.5 ${syncResult.type === 'success' ? 'text-emerald-500' : 'text-indigo-500'}`} />
                            <div>
                                <h4 className="font-bold text-sm">
                                    {syncResult.type === 'error' ? 'Sync ไม่สำเร็จ' : syncResult.type === 'info' ? 'Auto-Sync ทำงาน' : 'ซิงค์ข้อมูลสำเร็จล่าสุด'}
                                    <span className="font-normal text-xs opacity-70 ml-2">({syncResult.time.toLocaleTimeString()})</span>
                                </h4>
                                {syncResult.type === 'error' ? (
                                    <p className="text-xs mt-1">{syncResult.message}</p>
                                ) : (
                                    <div className="text-xs mt-1.5 space-y-0.5 opacity-90">
                                        <p>💻 <b>คอมพิวเตอร์:</b> เพิ่ม <span className="font-semibold text-emerald-600">{syncResult.stats.assetsAdded}</span> | ลบ <span className="font-semibold text-rose-500">{syncResult.stats.assetsDeleted}</span> | อัปเดต {syncResult.stats.assetsUpdated}</p>
                                        <p>👤 <b>ผู้ใช้งาน:</b> เพิ่ม <span className="font-semibold text-emerald-600">{syncResult.stats.usersAdded}</span> | ลบ <span className="font-semibold text-rose-500">{syncResult.stats.usersDeleted}</span> | อัปเดต {syncResult.stats.usersUpdated}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                        <button onClick={() => setSyncResult(null)} className="text-slate-400 hover:text-slate-600 p-1">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>}

            {/* Search and Filters */}
            {!isPmView && <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />
                    <input type="text" placeholder="ค้นหาชื่อเครื่อง, Serial, รหัสทรัพย์สิน, ผู้ใช้..."
                        value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                        style={{ paddingLeft: '2.5rem' }} className="w-full input-modern" />
                    {searchTerm && (
                        <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
                
                {/* Source Filter Capsules */}
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-auto">
                        <button 
                        onClick={() => setSourceFilter('buyrent')}
                        className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${sourceFilter === 'buyrent' ? 'bg-violet-500 text-white shadow-sm shadow-violet-200 dark:shadow-none' : 'text-slate-500 hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-400'}`}
                    >
                        🧩 เช่า+ซื้อ <span className={`text-xs px-2 py-0.5 rounded-full ${sourceFilter === 'buyrent' ? 'bg-violet-600 text-violet-50 dark:!bg-violet-950/70 dark:!text-violet-100' : 'bg-violet-100 text-violet-700 dark:!bg-violet-950/60 dark:!text-violet-200'}`}>{filterCounts.buyrent}</span>
                    </button>
                    <button 
                        onClick={() => setSourceFilter('buy')}
                        className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${sourceFilter === 'buy' ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-200 dark:shadow-none' : 'text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400'}`}
                    >
                        💰 ซื้อขาด <span className={`text-xs px-2 py-0.5 rounded-full ${sourceFilter === 'buy' ? 'bg-emerald-600 text-emerald-50 dark:!bg-emerald-950/70 dark:!text-emerald-100' : 'bg-emerald-100 text-emerald-700 dark:!bg-emerald-950/60 dark:!text-emerald-200'}`}>{filterCounts.buy}</span>
                    </button>
                    <button 
                        onClick={() => setSourceFilter('rent')}
                        className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${sourceFilter === 'rent' ? 'bg-indigo-500 text-white shadow-sm shadow-indigo-200 dark:shadow-none' : 'text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400'}`}
                    >
                        🤝 เช่า <span className={`text-xs px-2 py-0.5 rounded-full ${sourceFilter === 'rent' ? 'bg-indigo-600 text-indigo-50 dark:!bg-indigo-950/70 dark:!text-indigo-100' : 'bg-indigo-100 text-indigo-700 dark:!bg-indigo-950/60 dark:!text-indigo-200'}`}>{filterCounts.rent}</span>
                    </button>
                </div>
            </div>}

            {/* Warning (MySQL cache when GLPI unavailable) */}
            {!isPmView && warning && (
                <div className="glass-card rounded-xl p-4 flex items-center gap-3 border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm">
                    <Clock className="w-5 h-5 flex-shrink-0" />
                    <p>{warning}</p>
                </div>
            )}

            {/* Error */}
            {!isPmView && error && (
                <div className="glass-card rounded-2xl p-6 flex items-start gap-4 border border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-900/20">
                    <AlertCircle className="w-6 h-6 text-rose-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold text-rose-700 dark:text-rose-400">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>
                        <p className="text-sm text-rose-600 dark:text-rose-300 mt-1">{error}</p>
                    </div>
                </div>
            )}

            {/* Loading */}
            {
                !isPmView && isLoading && !error && (
                    <div className="glass-card rounded-3xl p-16 flex flex-col items-center gap-4">
                        <div className="w-10 h-10 border-4 border-indigo-200 dark:border-indigo-900 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin" />
                        <p className="text-sm text-slate-500 dark:text-slate-400 animate-pulse">กำลังดึงข้อมูลจาก GLPI...</p>
                    </div>
                )
            }

            {/* Computer Grid */}
            {
                !isPmView && !isLoading && !error && (
                    <>
                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                            {filtered.length === 0 ? (
                                <div className="col-span-full glass-card rounded-2xl p-12 text-center text-slate-400 dark:text-slate-500">ไม่พบข้อมูลที่ค้นหา</div>
                            ) : filtered.map(computer => {
                                const openIssues = getOpenIssues(computer);
                                const allIssues = getAssetIssues(computer);
                                const isRepairing = openIssues.length > 0;
                                const isBuy = isBuyComputer(computer);
                                const latestPmRecord = getLatestPmRecord(computer);
                                return (
                                    <div key={computer.id}
                                        onClick={() => {
                                            setSelectedComputer(computer);
                                            // Fetch IP address
                                            setIpAddresses([]);
                                            setIpLoading(true);
                                            withGlpiSession(async (token) => {
                                                const detail = await getComputerDetail(token, computer.id);
                                                return extractIpAddresses(detail);
                                            }).then(ips => setIpAddresses(ips)).catch(() => setIpAddresses([])).finally(() => setIpLoading(false));
                                        }}
                                        className={`glass-card rounded-2xl p-5 cursor-pointer hover:shadow-lg transition-all duration-200 group relative ${isRepairing ? 'border-amber-300 dark:border-amber-700 border' : 'hover:border-indigo-200 dark:hover:border-indigo-700'}`}>
                                        {/* กำลังซ่อม badge */}
                                        {isRepairing && (
                                            <div className="absolute -top-2 -right-2 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1">
                                                🔧 กำลังซ่อม
                                            </div>
                                        )}
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isRepairing ? 'bg-amber-50 dark:!bg-amber-950/60' : 'bg-indigo-50 dark:!bg-indigo-950/60 group-hover:bg-indigo-100 dark:group-hover:!bg-indigo-900/70'}`}>
                                                    <Monitor className={`w-5 h-5 ${isRepairing ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-600 dark:text-indigo-400'}`} />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-800 dark:text-white text-sm leading-tight">{computer.name || 'ไม่มีชื่อ'}</p>
                                                    <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">{computer.serial || '-'}</p>
                                                </div>
                                            </div>
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-emerald-100 text-emerald-700 border-emerald-200 dark:!border-emerald-700/50 dark:!bg-emerald-950/60 dark:!text-emerald-200">● Active</span>
                                        </div>
                                        <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                                            {computer.otherserial && (
                                                <div className="flex items-center gap-1.5">
                                                    <Tag className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                                    <span>รหัสทรัพย์สิน: <span className="font-medium text-slate-700 dark:text-slate-300 font-mono">{computer.otherserial}</span></span>
                                                </div>
                                            )}
                                            {computer.users_id && (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0"></span>
                                                    <span>ผู้ใช้: <span className="font-medium text-slate-700 dark:text-slate-300">{computer.users_id}</span></span>
                                                </div>
                                            )}
                                            {computer.locations_id && (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0"></span>
                                                    <span>ตำแหน่ง: <span className="font-medium text-slate-700 dark:text-slate-300">{computer.locations_id}</span></span>
                                                </div>
                                            )}
                                        </div>
                                        {/* ประวัติซ่อม + QR button */}
                                        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-700">
                                            <div className="mb-2 flex items-center justify-between gap-2">
                                                <span className="text-xs text-slate-400">ประวัติซ่อม: <span className="font-semibold text-slate-600 dark:text-slate-300">{allIssues.length} ครั้ง</span></span>
                                                {latestPmRecord && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); setPmReportRecord(latestPmRecord); }}
                                                        className="text-xs font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-300"
                                                    >
                                                        PM ล่าสุด {new Date(latestPmRecord.pm_date).toLocaleDateString('th-TH')}
                                                    </button>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-end gap-2">
                                                {isBuy && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); openPmForm(computer); }}
                                                        className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs font-bold text-sky-700 transition-colors hover:bg-sky-100 dark:bg-sky-950/50 dark:text-sky-200 dark:hover:bg-sky-900/70"
                                                        title="ตรวจเช็คคอมพิวเตอร์ PM"
                                                    >
                                                        <ClipboardCheck className="w-4 h-4" />
                                                        PM
                                                    </button>
                                                )}
                                                <button
                                                    onClick={e => { e.stopPropagation(); setQrComputer(computer); }}
                                                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-indigo-100 dark:bg-slate-700 dark:hover:bg-indigo-900/40 text-slate-500 hover:text-indigo-600 transition-colors"
                                                    title="แสดง QR Code">
                                                    <QrCode className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <p className="text-xs text-center text-slate-400 dark:text-slate-500">แสดง {filtered.length} จาก {computers.length} เครื่อง</p>
                    </>
                )
            }

            {/* Detail + Repair History Modal */}
            {
                !isPmView && selectedComputer && (() => {
                    const assetIssues = getAssetIssues(selectedComputer);
                    const assetPmRecords = getComputerPmRecords(selectedComputer);
                    return (
                        <div className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center overflow-y-auto p-3 sm:p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
                            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-white/20 dark:border-slate-700 max-h-[calc(100dvh-1.5rem)] flex flex-col">
                                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-indigo-50/50 dark:bg-indigo-900/20 flex justify-between items-center shrink-0">
                                    <div className="flex items-center gap-2">
                                        <Monitor className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                        <h3 className="font-bold text-indigo-950 dark:text-indigo-100">{selectedComputer.name || 'รายละเอียด'}</h3>
                                    </div>
                                    <button onClick={() => setSelectedComputer(null)} className="text-slate-400 hover:text-rose-500 transition-colors">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                                <div className="p-6 space-y-3 overflow-y-auto flex-1">
                                    {/* Computer Details */}
                                    {[
                                        { label: 'รหัสทรัพย์สิน', value: selectedComputer.otherserial },
                                        { label: 'Serial Number', value: selectedComputer.serial },
                                        { label: 'รุ่น', value: selectedComputer.computermodels_id },
                                        { label: 'ประเภท', value: selectedComputer.computertypes_id },
                                        { label: 'ผู้ใช้งาน', value: selectedComputer.users_id },
                                        { label: 'ตำแหน่ง', value: selectedComputer.locations_id },
                                        { label: 'OS', value: selectedComputer.operatingsystems_id },
                                    ].filter(r => r.value).map(row => (
                                        <div key={row.label} className="flex justify-between items-start text-sm">
                                            <span className="text-slate-500 dark:text-slate-400 font-medium">{row.label}</span>
                                            <span className="text-slate-800 dark:text-slate-200 font-semibold text-right max-w-[60%]">{row.value}</span>
                                        </div>
                                    ))}

                                    {/* IP Address */}
                                    <div className="flex justify-between items-start text-sm">
                                        <span className="text-slate-500 dark:text-slate-400 font-medium">IP Address</span>
                                        <span className="text-right max-w-[60%]">
                                            {ipLoading ? (
                                                <span className="text-slate-400 dark:text-slate-500 text-xs animate-pulse">กำลังดึง IP...</span>
                                            ) : ipAddresses.length > 0 ? (
                                                <span className="flex flex-col items-end gap-1">
                                                    {ipAddresses.map((ip, i) => (
                                                        <span key={i} className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200 font-mono bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-xs">
                                                            {ip}
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    navigator.clipboard.writeText(ip);
                                                                    setCopiedIp(ip);
                                                                    setTimeout(() => setCopiedIp(null), 1500);
                                                                }}
                                                                className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                                                title="คัดลอก IP"
                                                            >
                                                                {copiedIp === ip ? (
                                                                    <Check className="w-3 h-3 text-emerald-500" />
                                                                ) : (
                                                                    <Copy className="w-3 h-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
                                                                )}
                                                            </button>
                                                        </span>
                                                    ))}
                                                </span>
                                            ) : (
                                                <span className="text-slate-400 dark:text-slate-500 text-xs">ไม่พบข้อมูล IP</span>
                                            )}
                                        </span>
                                    </div>


                                    {/* Update Source (แหล่งที่มา) */}
                                    {selectedComputer.autoupdatesystems_id && (
                                        <div className="flex justify-between items-start text-sm pt-2 border-t border-slate-100 dark:border-slate-700/50 mt-2">
                                            <span className="text-slate-500 dark:text-slate-400 font-medium">แหล่งที่มา (Update Source)</span>
                                            {(() => {
                                                const source = String(selectedComputer.autoupdatesystems_id).toLowerCase();
                                                const isBuy = source.includes('buy') || source.includes('ซื้อ');
                                                const isRent = source.includes('rent') || source.includes('เช่า');
                                                return (
                                                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${isBuy ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:!border-emerald-700/50 dark:!bg-emerald-950/60 dark:!text-emerald-200' : isRent ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:!border-indigo-700/50 dark:!bg-indigo-950/60 dark:!text-indigo-200' : 'bg-slate-100 text-slate-700 border-slate-200 dark:!border-slate-600/70 dark:!bg-slate-800 dark:!text-slate-200'}`}>
                                                        {isBuy ? '💰 ซื้อขาด (Buy)' : isRent ? '🤝 เช่า (Rental)' : selectedComputer.autoupdatesystems_id}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                    )}

                                    {/* Comment */}
                                    {selectedComputer.comment && (
                                        <div className="pt-2">
                                            <span className="text-slate-500 dark:text-slate-400 font-medium text-sm block mb-1">หมายเหตุ (Comment)</span>
                                            <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700 rounded-lg p-3 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                                                {selectedComputer.comment}
                                            </div>
                                        </div>
                                    )}

                                    {isBuyComputer(selectedComputer) && (
                                        <div className="pt-4 mt-2 border-t border-slate-100 dark:border-slate-700">
                                            <div className="mb-3 flex items-center justify-between gap-2">
                                                <h4 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                                                    <ClipboardCheck className="w-4 h-4 text-sky-500" /> ประวัติ PM ({assetPmRecords.length} ครั้ง)
                                                </h4>
                                                <button
                                                    type="button"
                                                    onClick={() => openPmForm(selectedComputer)}
                                                    className="rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700 transition hover:bg-sky-100 dark:bg-sky-950/50 dark:text-sky-200 dark:hover:bg-sky-900/70"
                                                >
                                                    ตรวจ PM
                                                </button>
                                            </div>
                                            {assetPmRecords.length === 0 ? (
                                                <p className="text-sm text-slate-400 text-center py-4">ยังไม่มีประวัติ PM</p>
                                            ) : (
                                                <div className="space-y-2 max-h-40 overflow-y-auto">
                                                    {assetPmRecords.slice(0, 5).map((record) => (
                                                        <button
                                                            key={record.id}
                                                            type="button"
                                                            onClick={() => setPmReportRecord(record)}
                                                            className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-left text-xs transition hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:bg-sky-950/30"
                                                        >
                                                            <span>
                                                                <span className="font-bold text-slate-700 dark:text-slate-200">{new Date(record.pm_date).toLocaleDateString('th-TH')}</span>
                                                                <span className="ml-2 text-slate-400">โดย {record.inspector_name || '-'}</span>
                                                            </span>
                                                            {getPmStatusBadge(record.overall_status)}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Repair History */}
                                    <div className="pt-4 mt-2 border-t border-slate-100 dark:border-slate-700">
                                        <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-amber-500" /> ประวัติการซ่อม ({assetIssues.length} ครั้ง)
                                        </h4>
                                        {assetIssues.length === 0 ? (
                                            <p className="text-sm text-slate-400 text-center py-4">ยังไม่มีประวัติการซ่อม</p>
                                        ) : (
                                            <div className="space-y-2 max-h-52 overflow-y-auto">
                                                {assetIssues.map(issue => {
                                                    const getIssueStatusStyle = (status) => {
                                                        if (status === 'Closed') return 'bg-sky-50 border-sky-200 text-sky-700 dark:!border-sky-700/50 dark:!bg-sky-950/60 dark:!text-sky-200';
                                                        if (status === 'Resolved') return 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:!border-emerald-700/50 dark:!bg-emerald-950/60 dark:!text-emerald-200';
                                                        if (status === 'External Repair') return 'bg-violet-50 border-violet-200 text-violet-700 dark:!border-violet-700/50 dark:!bg-violet-950/60 dark:!text-violet-200';
                                                        if (status === 'Waiting for Parts') return 'bg-pink-50 border-pink-200 text-pink-700 dark:!border-pink-700/50 dark:!bg-pink-950/60 dark:!text-pink-200';
                                                        if (status === 'Cancelled') return 'bg-slate-100 border-slate-200 text-slate-700 dark:!border-slate-600/70 dark:!bg-slate-800 dark:!text-slate-200';
                                                        return 'bg-amber-50 border-amber-200 text-amber-700 dark:!border-amber-700/50 dark:!bg-amber-950/60 dark:!text-amber-200';
                                                    };
                                                    
                                                    const getIssueStatusText = (status) => {
                                                        if (status === 'Closed') return '✅ ปิดจบ';
                                                        if (status === 'Resolved') return '✅ เสร็จสิ้น';
                                                        if (status === 'In Progress') return '🔧 กำลังแก้ไข';
                                                        if (status === 'External Repair') return '⚠️ ส่งซ่อมภายนอก';
                                                        if (status === 'Waiting for Parts') return '⏳ รออะไหล่';
                                                        if (status === 'Cancelled') return '❌ ยกเลิก';
                                                        return '⏳ รอดำเนินการ';
                                                    };

                                                    return (
                                                        <div key={issue.id} className={`p-3 rounded-xl text-xs border ${getIssueStatusStyle(issue.status)}`}>
                                                            <div className="flex justify-between items-center mb-1">
                                                                <span className="font-bold">{issue.id}</span>
                                                                <span className="font-semibold">
                                                                    {getIssueStatusText(issue.status)}
                                                                </span>
                                                            </div>
                                                            <p className="text-slate-600 dark:text-slate-300 line-clamp-2">{issue.description}</p>
                                                            {issue.assignedAdmin && <p className="text-slate-400 mt-0.5">👤 {issue.assignedAdmin}</p>}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()
            }

            {/* PM Check Modal */}
            {pmComputer && (
                <div className="fixed inset-0 z-[130] flex items-start justify-center overflow-y-auto bg-slate-900/60 p-3 backdrop-blur-sm sm:items-center sm:p-4">
                    <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-sky-50/70 px-5 py-4 dark:border-slate-700 dark:bg-sky-950/30">
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-200">
                                    <ClipboardCheck className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">การตรวจเช็คคอมพิวเตอร์ PM (FMIT08)</h3>
                                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{pmComputer.name || '-'} · {pmComputer.otherserial || pmComputer.serial || '-'}</p>
                                </div>
                            </div>
                            <button type="button" onClick={() => setPmComputer(null)} className="text-slate-400 transition hover:text-rose-500">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="max-h-[calc(100dvh-11rem)] overflow-y-auto p-5">
                            <div className="grid gap-3 md:grid-cols-4">
                                <label className="space-y-1">
                                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">วันที่ตรวจ PM</span>
                                    <input type="date" value={pmForm.pmDate} onChange={(event) => setPmForm((current) => ({ ...current, pmDate: event.target.value }))} className="input-modern w-full !py-2 text-sm" />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">ผู้ตรวจเช็ค</span>
                                    <input type="text" value={pmForm.inspectorName} onChange={(event) => setPmForm((current) => ({ ...current, inspectorName: event.target.value }))} className="input-modern w-full !py-2 text-sm" placeholder="ชื่อผู้ตรวจ" />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">นัด PM ครั้งถัดไป</span>
                                    <input type="date" value={pmForm.nextDueDate} onChange={(event) => setPmForm((current) => ({ ...current, nextDueDate: event.target.value }))} className="input-modern w-full !py-2 text-sm" />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">ผลโดยรวม</span>
                                    <select value={pmForm.overallStatus} onChange={(event) => setPmForm((current) => ({ ...current, overallStatus: event.target.value }))} className="input-modern w-full !py-2 text-sm">
                                        <option value="Pass">ปกติ</option>
                                        <option value="Watch">เฝ้าระวัง</option>
                                        <option value="Fail">ต้องแก้ไข</option>
                                    </select>
                                </label>
                            </div>

                            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                                        <tr>
                                            <th className="w-12 px-3 py-3 text-center">#</th>
                                            <th className="px-3 py-3">รายการตรวจเช็ค</th>
                                            <th className="w-36 px-3 py-3">ผลตรวจ</th>
                                            <th className="w-[34%] px-3 py-3">หมายเหตุ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                                        {PM_CHECKLIST.map((item, index) => {
                                            const value = pmForm.checklist[item.id] || { status: 'Pass', note: '' };
                                            return (
                                                <tr key={item.id} className="align-top">
                                                    <td className="px-3 py-3 text-center text-xs font-bold text-slate-400">{index + 1}</td>
                                                    <td className="px-3 py-3 font-medium text-slate-700 dark:text-slate-200">{item.label}</td>
                                                    <td className="px-3 py-3">
                                                        <select value={value.status} onChange={(event) => updatePmChecklist(item.id, 'status', event.target.value)} className="input-modern w-full !py-1.5 text-xs">
                                                            <option value="Pass">ปกติ</option>
                                                            <option value="Watch">เฝ้าระวัง</option>
                                                            <option value="Fail">ต้องแก้ไข</option>
                                                        </select>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <input type="text" value={value.note || ''} onChange={(event) => updatePmChecklist(item.id, 'note', event.target.value)} className="input-modern w-full !py-1.5 text-xs" placeholder="ระบุหมายเหตุถ้ามี" />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <label className="mt-4 block space-y-1">
                                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">สรุป/ข้อเสนอแนะเพิ่มเติม</span>
                                <textarea value={pmForm.note} onChange={(event) => setPmForm((current) => ({ ...current, note: event.target.value }))} className="input-modern min-h-24 w-full text-sm" placeholder="สรุปผล PM หรือสิ่งที่ต้องติดตามต่อ" />
                            </label>
                        </div>
                        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-900/40 sm:flex-row sm:justify-end">
                            <button type="button" onClick={() => setPmComputer(null)} className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                                ยกเลิก
                            </button>
                            <button type="button" onClick={savePmRecord} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-sky-700">
                                <Save className="h-4 w-4" />
                                บันทึกและสร้างรายงาน FMIT08
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* PM Report Modal */}
            {pmReportRecord && (() => {
                const checklist = getPmReportChecklist(pmReportRecord);
                return (
                    <div className="fixed inset-0 z-[130] flex items-start justify-center overflow-y-auto bg-slate-900/60 p-3 backdrop-blur-sm sm:p-4">
                        <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-white/20 bg-slate-100 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                            <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">รายงานการตรวจเช็คคอมพิวเตอร์ PM (FMIT08)</h3>
                                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{pmReportRecord.asset_name || '-'} · วันที่ {new Date(pmReportRecord.pm_date).toLocaleDateString('th-TH')}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" onClick={handleDownloadPmReport} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-indigo-700">
                                        <Download className="h-4 w-4" />
                                        ดาวน์โหลด PDF
                                    </button>
                                    <button type="button" onClick={handlePrintPmReport} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-700">
                                        <Printer className="h-4 w-4" />
                                        พิมพ์
                                    </button>
                                    <button type="button" onClick={() => setPmReportRecord(null)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600">
                                        ปิด
                                    </button>
                                </div>
                            </div>
                            <div className="max-h-[calc(100dvh-8rem)] overflow-auto p-4">
                                <div ref={pmReportRef} className="mx-auto w-[210mm] min-h-[297mm] bg-white p-[12mm] text-slate-900 shadow-xl">
                                    <div className="border border-slate-900">
                                        <div className="grid grid-cols-[1fr_160px] border-b border-slate-900">
                                            <div className="p-3 text-center">
                                                <div className="text-lg font-bold">แบบฟอร์มตรวจเช็ค PM เครื่องคอมพิวเตอร์</div>
                                                <div className="text-sm font-semibold">Preventive Maintenance Checklist (FMIT08)</div>
                                            </div>
                                            <div className="border-l border-slate-900 p-2 text-xs leading-relaxed">
                                                <div><b>Document No.</b> FMIT08</div>
                                                <div><b>วันที่พิมพ์</b> {new Date().toLocaleDateString('th-TH')}</div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-slate-900 p-3 text-xs">
                                            <div><b>ชื่อเครื่อง:</b> {pmReportRecord.asset_name || '-'}</div>
                                            <div><b>รหัสทรัพย์สิน:</b> {pmReportRecord.asset_code || '-'}</div>
                                            <div><b>Serial Number:</b> {pmReportRecord.serial || '-'}</div>
                                            <div><b>ผู้ใช้งาน:</b> {pmReportRecord.user_name || '-'}</div>
                                            <div><b>สถานที่:</b> {pmReportRecord.location_name || '-'}</div>
                                            <div><b>ประเภท:</b> {pmReportRecord.source_type || '-'}</div>
                                            <div><b>วันที่ตรวจ PM:</b> {new Date(pmReportRecord.pm_date).toLocaleDateString('th-TH')}</div>
                                            <div><b>ตรวจครั้งถัดไป:</b> {pmReportRecord.next_due_date ? new Date(pmReportRecord.next_due_date).toLocaleDateString('th-TH') : '-'}</div>
                                        </div>
                                        <table className="w-full border-collapse text-xs">
                                            <thead>
                                                <tr className="bg-slate-100">
                                                    <th className="w-10 border-b border-r border-slate-900 p-1.5">ลำดับ</th>
                                                    <th className="border-b border-r border-slate-900 p-1.5">รายการตรวจเช็ค</th>
                                                    <th className="w-24 border-b border-r border-slate-900 p-1.5">ผลตรวจ</th>
                                                    <th className="w-56 border-b border-slate-900 p-1.5">หมายเหตุ</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {PM_CHECKLIST.map((item, index) => {
                                                    const value = checklist[item.id] || {};
                                                    return (
                                                        <tr key={item.id}>
                                                            <td className="border-r border-slate-900 p-1.5 text-center">{index + 1}</td>
                                                            <td className="border-r border-slate-900 p-1.5">{item.label}</td>
                                                            <td className="border-r border-slate-900 p-1.5 text-center">{PM_STATUS_LABELS[value.status] || '-'}</td>
                                                            <td className="p-1.5">{value.note || '-'}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        <div className="grid grid-cols-[1fr_180px] border-t border-slate-900 text-xs">
                                            <div className="min-h-20 p-3">
                                                <b>สรุป/ข้อเสนอแนะ:</b>
                                                <div className="mt-1 whitespace-pre-wrap">{pmReportRecord.note || '-'}</div>
                                            </div>
                                            <div className="border-l border-slate-900 p-3 text-center">
                                                <div className="mb-8"><b>ผลโดยรวม:</b> {PM_STATUS_LABELS[pmReportRecord.overall_status] || '-'}</div>
                                                <div className="border-t border-slate-700 pt-1">{pmReportRecord.inspector_name || '-'}</div>
                                                <div>ผู้ตรวจเช็ค</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-2 text-left text-[10px] text-slate-500">หมายเหตุ: รายงานนี้สร้างจากระบบ IT Helpdesk สำหรับบันทึกการตรวจเช็ค PM เครื่องคอมพิวเตอร์ประเภท Buy</div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* QR Code Modal */}
            {
                qrComputer && (
                    <div className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center overflow-y-auto p-3 sm:p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm max-h-[calc(100dvh-1.5rem)] overflow-y-auto border border-white/20 dark:border-slate-700">
                            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-indigo-50/50 dark:bg-indigo-900/20 flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <QrCode className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                    <h3 className="font-bold text-indigo-950 dark:text-indigo-100">QR Code แจ้งซ่อม</h3>
                                </div>
                                <button onClick={() => setQrComputer(null)} className="text-slate-400 hover:text-rose-500 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-6 flex flex-col items-center gap-4">
                                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{qrComputer.name}</p>
                                <div className="p-4 bg-white rounded-2xl shadow-inner border border-slate-100">
                                    <QRCodeSVG value={getQrUrl(qrComputer)} size={200} level="M"
                                        imageSettings={{ src: '', height: 0, width: 0, excavate: false }} />
                                </div>
                                <p className="text-xs text-slate-400 text-center">สแกน QR นี้เพื่อเปิดฟอร์มแจ้งซ่อม<br />พร้อมเลือกเครื่องนี้อัตโนมัติ</p>
                                {isBuyComputer(qrComputer) && (
                                    <button
                                        onClick={() => {
                                            const nextComputer = qrComputer;
                                            setQrComputer(null);
                                            openPmForm(nextComputer);
                                        }}
                                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
                                    >
                                        <ClipboardCheck className="h-4 w-4" />
                                        ตรวจเช็คคอมพิวเตอร์ PM
                                    </button>
                                )}
                                <button onClick={() => window.print()} className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-colors">
                                    🖨️ พิมพ์ QR Code
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default AssetInventory;
