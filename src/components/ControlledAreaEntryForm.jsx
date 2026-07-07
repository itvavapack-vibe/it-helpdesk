import React, { useEffect, useMemo, useState } from 'react';
import { Clock, DoorOpen, Save, Server, UserRound } from 'lucide-react';
import Swal from 'sweetalert2';
import { mysql } from '../mysqlClient';
import { toMysqlDateTime } from '../utils/dateTime';

const formatDateTime = (value) => {
    const date = new Date(value);
    return date.toLocaleString('th-TH', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const ControlledAreaEntryForm = () => {
    const [form, setForm] = useState({
        department: '',
        fullName: '',
        reason: '',
    });
    const [entryAt, setEntryAt] = useState(() => new Date());
    const [isSubmitting, setIsSubmitting] = useState(false);

    const displayDateTime = useMemo(() => formatDateTime(entryAt), [entryAt]);

    useEffect(() => {
        const intervalId = setInterval(() => setEntryAt(new Date()), 30000);
        return () => clearInterval(intervalId);
    }, []);

    const handleChange = (field, value) => {
        setForm((current) => ({ ...current, [field]: value }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        const department = form.department.trim();
        const fullName = form.fullName.trim();
        const reason = form.reason.trim();

        if (!department || !fullName || !reason) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอกหน่วยงาน ชื่อนามสกุล และเหตุผลในการเข้า', 'warning');
            return;
        }

        setIsSubmitting(true);
        const now = new Date();
        setEntryAt(now);

        try {
            const entryTime = toMysqlDateTime(now);
            const { error } = await mysql.from('controlled_area_logs').insert([{
                entry_date: entryTime.slice(0, 10),
                department,
                full_name: fullName,
                entry_time: entryTime,
                reason,
                status: 'Pending_Approval',
            }]);

            if (error) throw error;

            setForm({ department: '', fullName: '', reason: '' });
            window.dispatchEvent(new Event('server-room:refresh'));
            Swal.fire('บันทึกแล้ว', 'ส่งข้อมูลการเข้าพื้นที่ควบคุมเพื่อรออนุมัติแล้ว', 'success');
        } catch (error) {
            console.error('Error saving controlled area entry:', error);
            Swal.fire('Error', 'ไม่สามารถบันทึกข้อมูลได้ กรุณาตรวจสอบตาราง controlled_area_logs', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="mx-auto max-w-3xl space-y-6 animate-fade-in pb-10">
            <div className="rounded-3xl border border-cyan-100 bg-white p-5 shadow-sm dark:border-cyan-900/40 dark:bg-slate-800 sm:p-6">
                <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-cyan-100 p-3 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300">
                        <Server className="h-6 w-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 dark:text-white">บันทึกการเข้า-ออก พื้นที่ควบคุม</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">กรอกข้อมูลเพื่อแจ้งขอเข้าพื้นที่ควบคุม</p>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                        <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">วันที่ / เวลา ปัจจุบัน</label>
                        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
                            <Clock className="h-4 w-4 text-cyan-600" />
                            {displayDateTime}
                        </div>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">เวลาเข้า</label>
                        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
                            <DoorOpen className="h-4 w-4 text-emerald-600" />
                            {entryAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">หน่วยงาน</label>
                        <input className="input-modern w-full" value={form.department} onChange={(event) => handleChange('department', event.target.value)} />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">ชื่อนามสกุล</label>
                        <div className="relative">
                            <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input className="input-modern w-full !pl-9" value={form.fullName} onChange={(event) => handleChange('fullName', event.target.value)} />
                        </div>
                    </div>
                    <div className="md:col-span-2">
                        <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">เหตุผลในการเข้า</label>
                        <textarea className="input-modern w-full" rows="4" value={form.reason} onChange={(event) => handleChange('reason', event.target.value)} />
                    </div>
                </div>
                <div className="mt-5 flex justify-end">
                    <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-2.5 font-semibold text-white shadow-md transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60">
                        <Save className="h-4 w-4" />
                        {isSubmitting ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ControlledAreaEntryForm;
