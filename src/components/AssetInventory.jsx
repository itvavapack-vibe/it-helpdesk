import React, { useState, useEffect, useCallback } from 'react';
import { Monitor, RefreshCw, AlertCircle, Search, X, Tag } from 'lucide-react';
import { withGlpiSession, getComputers } from '../glpiClient';

const AssetInventory = () => {
    const [computers, setComputers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedComputer, setSelectedComputer] = useState(null);

    const fetchComputers = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await withGlpiSession(getComputers);
            const all = Array.isArray(data) ? data : [];
            // filter ออก Deactive (GLPI ใช้ states_id แทน is_active)
            const active = all.filter(c => {
                const state = String(c.states_id || '').toLowerCase();
                return !state.includes('deactive') && !state.includes('inactive') && !state.includes('จำหน่าย');
            });
            setComputers(active.length > 0 ? active : all);
        } catch (err) {
            setError(err.message || 'ไม่สามารถเชื่อมต่อ GLPI ได้');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchComputers();
    }, [fetchComputers]);

    const filtered = computers.filter(c =>
        (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.serial || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.otherserial || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.users_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.locations_id || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    // is_active: 1 = Active (เขียว), 0 = Deactive (แดง)
    const getStatusBadge = (isActive, stateLabel) => {
        if (isActive === 1 || isActive === true) {
            return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-emerald-100 text-emerald-700 border-emerald-200">● Active</span>;
        }
        if (isActive === 0 || isActive === false) {
            return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-red-100 text-red-700 border-red-200">● Deactive</span>;
        }
        // fallback: แสดง states_id label
        if (stateLabel) {
            return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-slate-100 text-slate-600 border-slate-200">{stateLabel}</span>;
        }
        return null;
    };


    return (
        <div className="space-y-6 animate-fade-in">
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
                <button
                    onClick={fetchComputers}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-900/40 transition-all disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    รีเฟรช
                </button>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />
                <input
                    type="text"
                    placeholder="ค้นหาชื่อเครื่อง, Serial, รหัสทรัพย์สิน, ผู้ใช้..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{ paddingLeft: '2.5rem' }}
                    className="w-full input-modern"
                />
                {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Error State */}
            {error && (
                <div className="glass-card rounded-2xl p-6 flex items-start gap-4 border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/20">
                    <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold text-red-700 dark:text-red-400">เชื่อมต่อ GLPI ไม่ได้</p>
                        <p className="text-sm text-red-600 dark:text-red-300 mt-1">{error}</p>
                        <p className="text-xs text-red-500 dark:text-red-400 mt-2">
                            ⚠️ ระบบนี้ทำงานได้เฉพาะในเครือข่าย Office เท่านั้น (192.168.x.x)
                        </p>
                    </div>
                </div>
            )}

            {/* Loading State */}
            {isLoading && !error && (
                <div className="glass-card rounded-3xl p-16 flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-indigo-200 dark:border-indigo-900 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin" />
                    <p className="text-sm text-slate-500 dark:text-slate-400 animate-pulse">กำลังดึงข้อมูลจาก GLPI...</p>
                </div>
            )}

            {/* Computer Grid */}
            {!isLoading && !error && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {filtered.length === 0 ? (
                            <div className="col-span-full glass-card rounded-2xl p-12 text-center text-slate-400 dark:text-slate-500">
                                ไม่พบข้อมูลที่ค้นหา
                            </div>
                        ) : filtered.map(computer => (
                            <div
                                key={computer.id}
                                onClick={() => setSelectedComputer(computer)}
                                className="glass-card rounded-2xl p-5 cursor-pointer hover:shadow-lg hover:border-indigo-200 dark:hover:border-indigo-700 transition-all duration-200 group"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 flex items-center justify-center group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/60 transition-colors">
                                            <Monitor className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-800 dark:text-white text-sm leading-tight">{computer.name || 'ไม่มีชื่อ'}</p>
                                            <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">{computer.serial || '-'}</p>
                                        </div>
                                    </div>
                                    {getStatusBadge(computer.is_active, computer.states_id)}
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
                                    {computer.computermodels_id && (
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0"></span>
                                            <span>รุ่น: <span className="font-medium text-slate-700 dark:text-slate-300">{computer.computermodels_id}</span></span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-center text-slate-400 dark:text-slate-500">
                        แสดง {filtered.length} จาก {computers.length} เครื่อง
                    </p>
                </>
            )}

            {/* Detail Modal */}
            {selectedComputer && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-white/20 dark:border-slate-700">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-indigo-50/50 dark:bg-indigo-900/20 flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <Monitor className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                <h3 className="font-bold text-indigo-950 dark:text-indigo-100">{selectedComputer.name || 'รายละเอียด'}</h3>
                            </div>
                            <button onClick={() => setSelectedComputer(null)} className="text-slate-400 hover:text-rose-500 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-3">
                            {[
                                { label: 'รหัสทรัพย์สิน', value: selectedComputer.otherserial },
                                { label: 'Serial Number', value: selectedComputer.serial },
                                { label: 'รุ่น', value: selectedComputer.computermodels_id },
                                { label: 'ประเภท', value: selectedComputer.computertypes_id },
                                { label: 'ผู้ใช้งาน', value: selectedComputer.users_id },
                                { label: 'ตำแหน่ง', value: selectedComputer.locations_id },
                                { label: 'OS', value: selectedComputer.operatingsystems_id },
                                { label: 'หมายเหตุ', value: selectedComputer.comment },
                            ].filter(r => r.value).map(row => (
                                <div key={row.label} className="flex justify-between items-start text-sm">
                                    <span className="text-slate-500 dark:text-slate-400 font-medium">{row.label}</span>
                                    <span className="text-slate-800 dark:text-slate-200 font-semibold text-right max-w-[60%]">{row.value}</span>
                                </div>
                            ))}
                            <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-100 dark:border-slate-700">
                                <span className="text-slate-500 dark:text-slate-400 font-medium">สถานะ</span>
                                {getStatusBadge(selectedComputer.is_active, selectedComputer.states_id)}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AssetInventory;
