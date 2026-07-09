import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Monitor, RefreshCw, AlertCircle, Search, X, Tag, FileSpreadsheet, QrCode, Clock, Upload, Copy, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import * as XLSX from 'xlsx';
import { withGlpiSession, getComputers, getUsers, getComputerDetail, extractIpAddresses } from '../glpiClient';
import { mysql } from '../mysqlClient';
import { notifyGlpiSync } from '../telegramNotify';

const mapAssetRowToComputer = (row) => ({ ...row, id: row.glpi_id });

const isActiveComputer = (c) => String(c.states_id || '').toLowerCase() === 'active';

const FINAL_REPAIR_STATUSES = new Set(['Resolved', 'Closed', 'Cancelled']);

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

const AssetInventory = ({ issues = [] }) => {
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

    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState(null);

    const loadAssetsFromMysql = useCallback(async () => {
        const { data, error } = await mysql.from('assets').select('*').order('name');
        if (error) throw new Error(error);
        return (data || []).map(mapAssetRowToComputer).filter(isActiveComputer);
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            </div>

            {/* Header Area */}
            <div className="flex flex-col gap-3">
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
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
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
            </div>

            {/* Warning (MySQL cache when GLPI unavailable) */}
            {warning && (
                <div className="glass-card rounded-xl p-4 flex items-center gap-3 border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm">
                    <Clock className="w-5 h-5 flex-shrink-0" />
                    <p>{warning}</p>
                </div>
            )}

            {/* Error */}
            {error && (
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
                isLoading && !error && (
                    <div className="glass-card rounded-3xl p-16 flex flex-col items-center gap-4">
                        <div className="w-10 h-10 border-4 border-indigo-200 dark:border-indigo-900 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin" />
                        <p className="text-sm text-slate-500 dark:text-slate-400 animate-pulse">กำลังดึงข้อมูลจาก GLPI...</p>
                    </div>
                )
            }

            {/* Computer Grid */}
            {
                !isLoading && !error && (
                    <>
                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                            {filtered.length === 0 ? (
                                <div className="col-span-full glass-card rounded-2xl p-12 text-center text-slate-400 dark:text-slate-500">ไม่พบข้อมูลที่ค้นหา</div>
                            ) : filtered.map(computer => {
                                const openIssues = getOpenIssues(computer);
                                const allIssues = getAssetIssues(computer);
                                const isRepairing = openIssues.length > 0;
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
                                        <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                                            <span className="text-xs text-slate-400">ประวัติซ่อม: <span className="font-semibold text-slate-600 dark:text-slate-300">{allIssues.length} ครั้ง</span></span>
                                            <button
                                                onClick={e => { e.stopPropagation(); setQrComputer(computer); }}
                                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-indigo-100 dark:bg-slate-700 dark:hover:bg-indigo-900/40 text-slate-500 hover:text-indigo-600 transition-colors"
                                                title="แสดง QR Code">
                                                <QrCode className="w-4 h-4" />
                                            </button>
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
                selectedComputer && (() => {
                    const assetIssues = getAssetIssues(selectedComputer);
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
