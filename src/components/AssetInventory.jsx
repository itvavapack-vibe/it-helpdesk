import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Monitor, RefreshCw, AlertCircle, Search, X, Tag, FileSpreadsheet, QrCode, Clock, Upload } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import * as XLSX from 'xlsx';
import { withGlpiSession, getComputers, getUsers } from '../glpiClient';
import { supabase } from '../supabaseClient';

const AssetInventory = ({ issues = [] }) => {
    const [computers, setComputers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedComputer, setSelectedComputer] = useState(null);
    const [qrComputer, setQrComputer] = useState(null);
    const [warning, setWarning] = useState(null);
    const [sourceFilter, setSourceFilter] = useState('all'); // all, buy, rent

    const [isSyncing, setIsSyncing] = useState(false);

    const fetchComputers = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setWarning(null);
        try {
            const data = await withGlpiSession(getComputers);
            const all = Array.isArray(data) ? data : [];
            const active = all.filter(c => {
                const state = String(c.states_id || '').toLowerCase();
                return !state.includes('deactive') && !state.includes('inactive') && !state.includes('จำหน่าย');
            });
            setComputers(active.length > 0 ? active : all);
        } catch {
            // GLPI เข้าไม่ได้ → fallback ดึงจาก Supabase
            try {
                const { data: cached } = await supabase.from('assets').select('*').order('name');
                if (cached && cached.length > 0) {
                    // แปลง field ให้ตรงกับ GLPI format
                    setComputers(cached.map(c => ({ ...c, id: c.glpi_id })));
                    setWarning('ใช้ข้อมูลอัปเดตล่าสุดจากระบบคลาวด์ (ไม่สามารถเชื่อมต่อ GLPI Studio ได้ในขณะนี้)');
                } else {
                    setError('ไม่สามารถเชื่อมต่อ GLPI ได้ และยังไม่มีข้อมูลในระบบ (กรุณาให้ Admin กด Sync ขณะอยู่ใน Office)');
                }
            } catch {
                setError('ไม่สามารถเชื่อมต่อ GLPI และ Supabase ได้');
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchComputers(); }, [fetchComputers]);

    // Cross-reference: หา issues ของแต่ละเครื่อง
    const getAssetIssues = useCallback((computer) => {
        return issues.filter(i =>
            (i.assetId && String(i.assetId) === String(computer.id)) ||
            (i.assetName && computer.name && i.assetName.toLowerCase() === computer.name.toLowerCase())
        );
    }, [issues]);

    const getOpenIssues = useCallback((computer) => {
        return getAssetIssues(computer).filter(i => i.status !== 'Resolved');
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
        if (filterType === 'all') return true;
        
        const sourceStr = String(source || '').toLowerCase();
        if (filterType === 'buy') return sourceStr.includes('buy') || sourceStr.includes('ซื้อ');
        if (filterType === 'rent') return sourceStr.includes('rent') || sourceStr.includes('เช่า');
        
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
        return { all: computers.length, buy, rent };
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
        const base = window.location.origin + window.location.pathname;
        return `${base}?assetId=${computer.id}&assetName=${encodeURIComponent(computer.name || '')}`;
    };

    const syncToSupabase = async () => {
        if (computers.length === 0) return;
        setIsSyncing(true);
        try {
            // 1. Sync Assets (Computers)
            const rows = computers.map(c => ({
                glpi_id: c.id,
                name: c.name || '',
                serial: c.serial || null,
                otherserial: c.otherserial || null,
                users_id: c.users_id || null,
                locations_id: c.locations_id || null,
                computermodels_id: c.computermodels_id || null,
                states_id: c.states_id || null,
            }));
            const { error } = await supabase.from('assets').upsert(rows, { onConflict: 'glpi_id' });
            if (error) throw error;

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

            if (allSyncUsers.length > 0) {
                const userRows = allSyncUsers.map(u => ({
                    id: u.id,
                    name: u.name || '',
                    realname: u.realname || null,
                    firstname: u.firstname || null,
                    formattedName: u.formattedName || u.name || '',
                }));
                const { error: userError } = await supabase.from('glpi_users').upsert(userRows, { onConflict: 'id' });
                if (userError) throw userError;
            }

            import('sweetalert2').then(({ default: Swal }) => {
                Swal.fire({ 
                    icon: 'success', 
                    title: `Sync สำเร็จ!`, 
                    text: `อัปโหลด ${rows.length} เครื่อง และผู้ใช้ ${allSyncUsers.length} รายชื่อไปยัง Supabase แล้ว`, 
                    timer: 3000, 
                    showConfirmButton: false 
                });
            });
        } catch (err) {
            import('sweetalert2').then(({ default: Swal }) => {
                Swal.fire({ icon: 'error', title: 'Sync ไม่สำเร็จ', text: err.message });
            });
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                    { label: 'เครื่องทั้งหมด (Active)', value: stats.total, color: 'bg-indigo-50 text-indigo-700 border-indigo-200', dot: 'bg-indigo-500' },
                    { label: 'กำลังซ่อม', value: stats.repairing, color: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
                    { label: 'แจ้งซ่อมบ่อยสุด', value: stats.topAsset ? `${stats.topAsset.name} (${stats.topAsset.count} ครั้ง)` : '-', color: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
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

            {/* Header */}
            <div className="glass-card rounded-3xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                        <Monitor className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 dark:text-white">ทรัพย์สิน IT</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">ข้อมูลจาก GLPI · {computers.length} เครื่อง</p>
                    </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={syncToSupabase} disabled={isLoading || isSyncing || computers.length === 0}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-700 rounded-full hover:bg-violet-50 dark:hover:bg-violet-900/40 transition-all disabled:opacity-40">
                        <Upload className={`w-4 h-4 ${isSyncing ? 'animate-bounce' : ''}`} />
                        {isSyncing ? 'กำลัง Sync...' : 'Sync → Supabase'}
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
                        onClick={() => setSourceFilter('all')}
                        className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${sourceFilter === 'all' ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
                    >
                        ทั้งหมด <span className="bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300 text-xs px-2 py-0.5 rounded-full">{filterCounts.all}</span>
                    </button>
                    <button 
                        onClick={() => setSourceFilter('buy')}
                        className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${sourceFilter === 'buy' ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-200 dark:shadow-none' : 'text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400'}`}
                    >
                        💰 ซื้อขาด <span className={`text-xs px-2 py-0.5 rounded-full ${sourceFilter === 'buy' ? 'bg-emerald-600 text-emerald-50' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'}`}>{filterCounts.buy}</span>
                    </button>
                    <button 
                        onClick={() => setSourceFilter('rent')}
                        className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${sourceFilter === 'rent' ? 'bg-indigo-500 text-white shadow-sm shadow-indigo-200 dark:shadow-none' : 'text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400'}`}
                    >
                        🤝 เช่า <span className={`text-xs px-2 py-0.5 rounded-full ${sourceFilter === 'rent' ? 'bg-indigo-600 text-indigo-50' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'}`}>{filterCounts.rent}</span>
                    </button>
                </div>
            </div>

            {/* Warning (Supabase Fallback) */}
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
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {filtered.length === 0 ? (
                                <div className="col-span-full glass-card rounded-2xl p-12 text-center text-slate-400 dark:text-slate-500">ไม่พบข้อมูลที่ค้นหา</div>
                            ) : filtered.map(computer => {
                                const openIssues = getOpenIssues(computer);
                                const allIssues = getAssetIssues(computer);
                                const isRepairing = openIssues.length > 0;
                                return (
                                    <div key={computer.id}
                                        onClick={() => setSelectedComputer(computer)}
                                        className={`glass-card rounded-2xl p-5 cursor-pointer hover:shadow-lg transition-all duration-200 group relative ${isRepairing ? 'border-amber-300 dark:border-amber-700 border' : 'hover:border-indigo-200 dark:hover:border-indigo-700'}`}>
                                        {/* กำลังซ่อม badge */}
                                        {isRepairing && (
                                            <div className="absolute -top-2 -right-2 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1">
                                                🔧 กำลังซ่อม
                                            </div>
                                        )}
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isRepairing ? 'bg-amber-50 dark:bg-amber-900/40' : 'bg-indigo-50 dark:bg-indigo-900/40 group-hover:bg-indigo-100'}`}>
                                                    <Monitor className={`w-5 h-5 ${isRepairing ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-600 dark:text-indigo-400'}`} />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-800 dark:text-white text-sm leading-tight">{computer.name || 'ไม่มีชื่อ'}</p>
                                                    <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">{computer.serial || '-'}</p>
                                                </div>
                                            </div>
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-emerald-100 text-emerald-700 border-emerald-200">● Active</span>
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
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
                            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-white/20 dark:border-slate-700 max-h-[90vh] flex flex-col">
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

                                    {/* Update Source (แหล่งที่มา) */}
                                    {selectedComputer.autoupdatesystems_id && (
                                        <div className="flex justify-between items-start text-sm pt-2 border-t border-slate-100 dark:border-slate-700/50 mt-2">
                                            <span className="text-slate-500 dark:text-slate-400 font-medium">แหล่งที่มา (Update Source)</span>
                                            {(() => {
                                                const source = String(selectedComputer.autoupdatesystems_id).toLowerCase();
                                                const isBuy = source.includes('buy') || source.includes('ซื้อ');
                                                const isRent = source.includes('rent') || source.includes('เช่า');
                                                return (
                                                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${isBuy ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400 dark:border-emerald-800' : isRent ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-400 dark:border-indigo-800' : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'}`}>
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
                                                        if (status === 'Resolved') return 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-600';
                                                        if (status === 'External Repair') return 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-violet-600';
                                                        if (status === 'Waiting for Parts') return 'bg-pink-50 dark:bg-pink-900/20 border-pink-200 dark:border-pink-800 text-pink-600';
                                                        if (status === 'Cancelled') return 'bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-800 text-slate-600';
                                                        return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-600';
                                                    };
                                                    
                                                    const getIssueStatusText = (status) => {
                                                        if (status === 'Resolved') return '✅ เสร็จสิ้น';
                                                        if (status === 'In Progress') return '🔧 กำลังแก้ไข';
                                                        if (status === 'External Repair') return '⚠️ ส่งซ่อมภายนอก';
                                                        if (status === 'Waiting for Parts') return '⏳ รออะไหล่';
                                                        if (status === 'Cancelled') return '❌ ยกเลิก';
                                                        return '⏳ รอดำเนินการ';
                                                    };

                                                    return (
                                                        <div key={issue.id} className={`p-3 rounded-xl text-xs border ${getIssueStatusStyle(issue.status).split('text-')[0]}`}>
                                                            <div className="flex justify-between items-center mb-1">
                                                                <span className="font-bold text-slate-700 dark:text-slate-200">{issue.id}</span>
                                                                <span className={`font-semibold ${getIssueStatusStyle(issue.status).match(/text-[a-z]+-[0-9]+/)?.[0] || 'text-amber-600'}`}>
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
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-white/20 dark:border-slate-700">
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
