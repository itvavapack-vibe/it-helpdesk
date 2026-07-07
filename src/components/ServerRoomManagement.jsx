import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Clock, DoorClosed, DoorOpen, RefreshCw, Search, Server, ShieldCheck } from 'lucide-react';
import Swal from 'sweetalert2';
import { mysql } from '../mysqlClient';
import { canApproveServerRoomEntry, canExitServerRoomEntry, normalizeRoleValue } from '../config/roles';
import { toMysqlDateTime } from '../utils/dateTime';

const STATUS_LABELS = {
    Pending_Approval: 'รออนุมัติ',
    Approved: 'อนุมัติแล้ว',
    Exited: 'ออกห้องแล้ว',
};

const STATUS_STYLES = {
    Pending_Approval: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300',
    Approved: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-300',
    Exited: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300',
};

const formatDateTime = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('th-TH', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const formatDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('th-TH');
};

const ServerRoomManagement = ({ currentAdmin }) => {
    const [logs, setLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSavingId, setIsSavingId] = useState(null);
    const currentRole = normalizeRoleValue(currentAdmin?.role);
    const canApprove = canApproveServerRoomEntry(currentRole);
    const canExit = canExitServerRoomEntry(currentRole);

    const fetchLogs = async ({ silent = false } = {}) => {
        if (!silent) setIsLoading(true);
        try {
            const { data, error } = await mysql
                .from('controlled_area_logs')
                .select('id,entry_date,department,full_name,entry_time,reason,status,approved_by,approved_role,approved_at,exit_time,exited_by,exited_role,created_at')
                .order('entry_time', { ascending: false });

            if (error) throw error;
            setLogs(data || []);
        } catch (error) {
            console.error('Error loading controlled area logs:', error);
            if (!silent) Swal.fire('Error', 'ไม่สามารถโหลดข้อมูลห้องเซิร์ฟเวอร์ได้', 'error');
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
        const intervalId = setInterval(() => {
            if (document.visibilityState === 'visible') fetchLogs({ silent: true });
        }, 10000);
        const handleRefresh = () => fetchLogs({ silent: true });
        window.addEventListener('server-room:refresh', handleRefresh);
        return () => {
            clearInterval(intervalId);
            window.removeEventListener('server-room:refresh', handleRefresh);
        };
    }, []);

    const filteredLogs = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        if (!keyword) return logs;
        return logs.filter((log) => [
            log.department,
            log.full_name,
            log.reason,
            log.status,
            STATUS_LABELS[log.status],
            log.approved_by,
            log.exited_by,
        ].filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword)));
    }, [logs, searchTerm]);

    const handleApprove = async (log) => {
        if (!canApprove || log.status !== 'Pending_Approval') return;
        const result = await Swal.fire({
            title: 'ยืนยันอนุมัติการเข้าห้อง?',
            text: `${log.full_name} (${log.department})`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'อนุมัติ',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#0891b2',
        });
        if (!result.isConfirmed) return;

        const updatePayload = {
            status: 'Approved',
            approved_by: currentAdmin?.name || currentAdmin?.username || '',
            approved_role: currentRole,
            approved_at: toMysqlDateTime(),
        };

        setIsSavingId(log.id);
        try {
            const { error } = await mysql.from('controlled_area_logs').update(updatePayload).eq('id', log.id);
            if (error) throw error;
            setLogs((current) => current.map((item) => (item.id === log.id ? { ...item, ...updatePayload } : item)));
            window.dispatchEvent(new Event('server-room:refresh'));
            Swal.fire('อนุมัติแล้ว', 'บันทึกการอนุมัติการเข้าห้องแล้ว', 'success');
        } catch (error) {
            console.error('Error approving server room entry:', error);
            Swal.fire('Error', 'ไม่สามารถบันทึกการอนุมัติได้', 'error');
        } finally {
            setIsSavingId(null);
        }
    };

    const handleExit = async (log) => {
        if (!canExit || log.status !== 'Approved') return;
        const result = await Swal.fire({
            title: 'บันทึกเวลาออกห้อง?',
            text: `${log.full_name} (${log.department})`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'บันทึกออกห้อง',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#059669',
        });
        if (!result.isConfirmed) return;

        const updatePayload = {
            status: 'Exited',
            exit_time: toMysqlDateTime(),
            exited_by: currentAdmin?.name || currentAdmin?.username || '',
            exited_role: currentRole,
        };

        setIsSavingId(log.id);
        try {
            const { error } = await mysql.from('controlled_area_logs').update(updatePayload).eq('id', log.id);
            if (error) throw error;
            setLogs((current) => current.map((item) => (item.id === log.id ? { ...item, ...updatePayload } : item)));
            window.dispatchEvent(new Event('server-room:refresh'));
            Swal.fire('บันทึกแล้ว', 'บันทึกเวลาออกจากห้องเซิร์ฟเวอร์แล้ว', 'success');
        } catch (error) {
            console.error('Error saving server room exit:', error);
            Swal.fire('Error', 'ไม่สามารถบันทึกเวลาออกได้', 'error');
        } finally {
            setIsSavingId(null);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="rounded-2xl border border-cyan-100 bg-white p-5 shadow-sm dark:border-cyan-900/40 dark:bg-slate-800">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-cyan-100 p-2.5 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300">
                            <Server className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 dark:text-white">ห้องเซิร์ฟเวอร์</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400">อนุมัติการเข้าพื้นที่ควบคุมและบันทึกเวลาออก</p>
                        </div>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input className="input-modern w-full !pl-9 sm:w-72" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="ค้นหาชื่อ หน่วยงาน เหตุผล..." />
                        </div>
                        <button type="button" onClick={() => fetchLogs()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                            <RefreshCw className="h-4 w-4" />
                            รีเฟรช
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {[
                    ['Pending_Approval', 'รออนุมัติ', ShieldCheck],
                    ['Approved', 'อยู่ในห้อง', DoorOpen],
                    ['Exited', 'ออกห้องแล้ว', DoorClosed],
                ].map(([status, label, Icon]) => (
                    <div key={status} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                        <div className="flex items-center justify-between">
                            <span className={`rounded-xl p-2 ${STATUS_STYLES[status]}`}>
                                <Icon className="h-5 w-5" />
                            </span>
                            <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                                {logs.filter((log) => log.status === status).length}
                            </span>
                        </div>
                        <div className="mt-3 text-sm font-bold text-slate-600 dark:text-slate-300">{label}</div>
                    </div>
                ))}
            </div>

            {isLoading ? (
                <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-800">กำลังโหลดข้อมูล...</div>
            ) : filteredLogs.length === 0 ? (
                <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-slate-400 dark:border-slate-700 dark:bg-slate-800">ไม่พบข้อมูลการเข้าพื้นที่ควบคุม</div>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1100px] text-left">
                            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                                <tr>
                                    <th className="p-4">วันที่ / เวลาเข้า</th>
                                    <th className="p-4">ผู้เข้า / หน่วยงาน</th>
                                    <th className="p-4">เหตุผล</th>
                                    <th className="p-4">สถานะ</th>
                                    <th className="p-4">อนุมัติ</th>
                                    <th className="p-4">เวลาออก</th>
                                    <th className="p-4 text-right">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                                {filteredLogs.map((log) => (
                                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                                        <td className="p-4 align-top">
                                            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{formatDate(log.entry_date)}</div>
                                            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                                                <Clock className="h-3.5 w-3.5" />
                                                {formatDateTime(log.entry_time)}
                                            </div>
                                        </td>
                                        <td className="p-4 align-top">
                                            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{log.full_name || '-'}</div>
                                            <div className="mt-1 text-xs text-slate-500">{log.department || '-'}</div>
                                        </td>
                                        <td className="p-4 align-top">
                                            <div className="max-w-md text-sm leading-relaxed text-slate-600 dark:text-slate-300">{log.reason || '-'}</div>
                                        </td>
                                        <td className="p-4 align-top whitespace-nowrap">
                                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[log.status] || STATUS_STYLES.Pending_Approval}`}>
                                                {STATUS_LABELS[log.status] || log.status || '-'}
                                            </span>
                                        </td>
                                        <td className="p-4 align-top">
                                            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{log.approved_by || '-'}</div>
                                            <div className="mt-1 text-xs text-slate-500">{formatDateTime(log.approved_at)}</div>
                                        </td>
                                        <td className="p-4 align-top">
                                            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{formatDateTime(log.exit_time)}</div>
                                            <div className="mt-1 text-xs text-slate-500">{log.exited_by || ''}</div>
                                        </td>
                                        <td className="p-4 align-top text-right">
                                            <div className="flex justify-end gap-2">
                                                {canApprove && log.status === 'Pending_Approval' && (
                                                    <button type="button" disabled={isSavingId === log.id} onClick={() => handleApprove(log)} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-600 hover:text-white disabled:opacity-50">
                                                        <CheckCircle className="h-4 w-4" />
                                                        อนุมัติ
                                                    </button>
                                                )}
                                                {canExit && log.status === 'Approved' && (
                                                    <button type="button" disabled={isSavingId === log.id} onClick={() => handleExit(log)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-600 hover:text-white disabled:opacity-50">
                                                        <DoorClosed className="h-4 w-4" />
                                                        ออกห้อง
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ServerRoomManagement;
