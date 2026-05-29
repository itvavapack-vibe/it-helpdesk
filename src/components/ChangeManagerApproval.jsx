import React, { useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import Swal from 'sweetalert2';
import { CheckCircle, Code, Loader2, XCircle } from 'lucide-react';
import { mysql } from '../mysqlClient';
import { getChangeRequestTypeLabel } from '../config/changeRequestTypes';

const toMysqlDateTime = (value = new Date()) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const pad = (num) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const ChangeManagerApproval = ({ requestId }) => {
    const signatureRef = useRef(null);
    const [requestData, setRequestData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [formData, setFormData] = useState({
        managerName: '',
        managerPosition: ''
    });

    useEffect(() => {
        const fetchRequest = async () => {
            if (!requestId) {
                setIsLoading(false);
                return;
            }

            try {
                const { data, error } = await mysql
                    .from('change_requests')
                    .select('*')
                    .eq('id', requestId)
                    .single();

                if (error) throw error;
                setRequestData(data);
                setFormData({
                    managerName: data.manager_name || '',
                    managerPosition: data.manager_position || ''
                });
            } catch (error) {
                console.error('Error fetching change request:', error);
                Swal.fire('ไม่พบคำร้อง', 'ลิงก์อาจไม่ถูกต้อง หรือคำร้องถูกลบไปแล้ว', 'error');
            } finally {
                setIsLoading(false);
            }
        };

        fetchRequest();
    }, [requestId]);

    const handleAction = async (action) => {
        if (!requestData || isProcessing) return;

        const isApprove = action === 'approve';
        if (!formData.managerName.trim() || !formData.managerPosition.trim()) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณาระบุชื่อและตำแหน่งผู้อนุมัติ', 'warning');
            return;
        }
        if (!signatureRef.current || signatureRef.current.isEmpty()) {
            Swal.fire('ยังไม่ได้ลงนาม', 'กรุณาเซ็นชื่อก่อนยืนยันรายการ', 'warning');
            return;
        }

        const confirm = await Swal.fire({
            title: isApprove ? 'ยืนยันอนุมัติคำร้อง?' : 'ยืนยันไม่อนุมัติคำร้อง?',
            text: `เลขที่เอกสาร ${requestData.ticket_number || requestData.id}`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: isApprove ? '#10b981' : '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: isApprove ? 'อนุมัติ' : 'ไม่อนุมัติ',
            cancelButtonText: 'ยกเลิก'
        });

        if (!confirm.isConfirmed) return;

        setIsProcessing(true);
        try {
            const signData = signatureRef.current.getCanvas().toDataURL('image/png');
            const nextStatus = isApprove ? 'Pending_IT' : 'Rejected';
            const { error } = await mysql
                .from('change_requests')
                .update({
                    status: nextStatus,
                    manager_name: formData.managerName.trim(),
                    manager_position: formData.managerPosition.trim(),
                    manager_sign: signData,
                    manager_date: toMysqlDateTime()
                })
                .eq('id', requestData.id);

            if (error) throw error;

            setRequestData((prev) => ({
                ...prev,
                status: nextStatus,
                manager_name: formData.managerName.trim(),
                manager_position: formData.managerPosition.trim(),
                manager_sign: signData,
                manager_date: toMysqlDateTime()
            }));
            Swal.fire('บันทึกสำเร็จ', isApprove ? 'ส่งคำร้องไปยังฝ่าย IT แล้ว' : 'บันทึกการไม่อนุมัติแล้ว', 'success');
        } catch (error) {
            console.error('Error updating change request approval:', error);
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center gap-3 text-slate-500">
                <Loader2 className="h-6 w-6 animate-spin" />
                กำลังโหลดข้อมูลคำร้อง...
            </div>
        );
    }

    if (!requestData) {
        return (
            <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-slate-100 bg-white p-10 text-center shadow-xl dark:border-slate-700 dark:bg-slate-800">
                <XCircle className="mx-auto mb-4 h-16 w-16 text-red-500" />
                <h3 className="mb-2 text-xl font-bold text-slate-800 dark:text-white">ไม่พบคำร้อง</h3>
                <p className="text-slate-500 dark:text-slate-400">ลิงก์อาจไม่ถูกต้อง หรือคำร้องถูกลบไปแล้ว</p>
            </div>
        );
    }

    const isPendingManager = requestData.status === 'Pending_Manager';

    return (
        <div className="mx-auto mt-6 max-w-3xl animate-slide-up space-y-6">
            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-xl shadow-slate-200/50 dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-900/50 sm:p-8">
                <div className="mb-8 flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
                        <Code className="h-7 w-7" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">พิจารณาอนุมัติคำร้องพัฒนาโปรแกรม</h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">FMIT 15 สำหรับหัวหน้างานหรือผู้อนุมัติ</p>
                    </div>
                </div>

                {!isPendingManager && (
                    <div className={`mb-6 flex items-center gap-3 rounded-xl border p-4 font-bold ${
                        requestData.status === 'Rejected'
                            ? 'border-red-200 bg-red-50 text-red-700'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    }`}>
                        {requestData.status === 'Rejected' ? <XCircle className="h-6 w-6" /> : <CheckCircle className="h-6 w-6" />}
                        รายการนี้ได้รับการดำเนินการแล้ว
                    </div>
                )}

                <div className="mb-6 rounded-2xl border border-slate-100 bg-slate-50 p-5 text-sm dark:border-slate-700 dark:bg-slate-900/50">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <span className="block text-xs font-semibold text-slate-400">เลขที่เอกสาร</span>
                            <div className="mt-1 font-bold text-emerald-700">{requestData.ticket_number || '-'}</div>
                        </div>
                        <div>
                            <span className="block text-xs font-semibold text-slate-400">ผู้ร้องขอ</span>
                            <div className="mt-1 font-medium text-slate-800 dark:text-slate-100">{requestData.requester_name || '-'}</div>
                        </div>
                        <div>
                            <span className="block text-xs font-semibold text-slate-400">แผนก</span>
                            <div className="mt-1 font-medium text-slate-800 dark:text-slate-100">{requestData.department || '-'}</div>
                        </div>
                        <div>
                            <span className="block text-xs font-semibold text-slate-400">ประเภทคำร้อง</span>
                            <div className="mt-1 font-medium text-slate-800 dark:text-slate-100">{getChangeRequestTypeLabel(requestData.req_type)}</div>
                        </div>
                    </div>
                    <div className="mt-4">
                        <span className="block text-xs font-semibold text-slate-400">รายละเอียด</span>
                        <p className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-200">{requestData.details || '-'}</p>
                    </div>
                    <div className="mt-4">
                        <span className="block text-xs font-semibold text-slate-400">เหตุผล</span>
                        <p className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-200">{requestData.reason || '-'}</p>
                    </div>
                </div>

                {isPendingManager && (
                    <div className="space-y-5">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <input
                                className="input-modern"
                                value={formData.managerName}
                                onChange={(event) => setFormData((prev) => ({ ...prev, managerName: event.target.value }))}
                                placeholder="ชื่อผู้อนุมัติ"
                            />
                            <input
                                className="input-modern"
                                value={formData.managerPosition}
                                onChange={(event) => setFormData((prev) => ({ ...prev, managerPosition: event.target.value }))}
                                placeholder="ตำแหน่ง"
                            />
                        </div>

                        <div>
                            <div className="mb-2 flex items-center justify-between">
                                <label className="text-sm font-bold text-slate-700 dark:text-slate-200">ลายเซ็นผู้อนุมัติ</label>
                                <button type="button" className="text-sm font-semibold text-red-500" onClick={() => signatureRef.current?.clear()}>
                                    ล้างลายเซ็น
                                </button>
                            </div>
                            <div className="h-44 overflow-hidden rounded-2xl border-2 border-dashed border-emerald-200 bg-white shadow-inner dark:border-emerald-800 dark:bg-slate-900">
                                <SignatureCanvas ref={signatureRef} penColor="black" canvasProps={{ className: 'w-full h-full' }} />
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 border-t border-slate-100 pt-6 dark:border-slate-700 sm:flex-row">
                            <button
                                type="button"
                                onClick={() => handleAction('reject')}
                                disabled={isProcessing}
                                className="flex-1 rounded-xl border border-red-200 bg-white px-4 py-3 font-bold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-900/20"
                            >
                                ไม่อนุมัติ
                            </button>
                            <button
                                type="button"
                                onClick={() => handleAction('approve')}
                                disabled={isProcessing}
                                className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white shadow-lg shadow-emerald-200/50 transition-colors hover:bg-emerald-700 disabled:opacity-50"
                            >
                                {isProcessing ? 'กำลังบันทึก...' : 'อนุมัติและส่งต่อ IT'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChangeManagerApproval;
