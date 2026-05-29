import React, { useState, useEffect, useRef } from 'react';
import { mysql } from '../mysqlClient';
import Swal from 'sweetalert2';
import { CheckCircle, XCircle, ShieldCheck, FileText, User, Building2, Briefcase, Phone, LayoutGrid } from 'lucide-react';
import { notifyNewAccessRequest } from '../telegramNotify';
import SignatureCanvas from 'react-signature-canvas';
import { toMysqlDateTime } from '../utils/dateTime';

const ManagerApproval = ({ requestId }) => {
    const signatureRef = useRef(null);
    const [requestData, setRequestData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        const fetchRequest = async () => {
            if (!requestId) return;
            try {
                const { data, error } = await mysql
                    .from('access_requests')
                    .select('*')
                    .eq('id', requestId)
                    .single();

                if (error) throw error;
                setRequestData(data);
            } catch (error) {
                console.error("Error fetching request:", error);
                Swal.fire('Error', 'ไม่พบข้อมูลคำร้อง หรือลิงก์ไม่ถูกต้อง', 'error');
            } finally {
                setIsLoading(false);
            }
        };
        fetchRequest();
    }, [requestId]);

    const formatSystems = (systemsMap, otherDetails) => {
        if (!systemsMap) return '-';
        const labels = {
            userComputer: 'User PC', email: 'E-Mail', dataAll: 'Data All',
            vpn: 'VPN', allWeb: 'All Web', wms: 'WMS',
            msDynamics365: 'MS Dynamics', cyberHrm: 'Cyber HRM'
        };
        const requested = Object.keys(systemsMap).filter(k => systemsMap[k] && k !== 'other').map(k => labels[k]);
        if (systemsMap.other) requested.push(`อื่นๆ (${otherDetails})`);
        
        return requested.length > 0 ? requested.join(', ') : '-';
    };

    const handleAction = async (action) => {
        const isApprove = action === 'approve';
        const newStatus = isApprove ? 'Pending_IT' : 'Rejected';
        const actionText = isApprove ? 'อนุมัติ' : 'ไม่อนุมัติ';
        const confirmColor = isApprove ? '#10b981' : '#ef4444';

        if (isApprove && signatureRef.current && signatureRef.current.isEmpty()) {
            Swal.fire({
                icon: 'warning',
                title: 'กรุณาลงนาม',
                text: 'กรุณาเซ็นชื่อในช่อง "ลายมือชื่อผู้อนุมัติ" ก่อนทำการอนุมัติ',
                confirmButtonColor: '#4f46e5'
            });
            return;
        }

        const result = await Swal.fire({
            title: `ยืนยันการ${actionText}ขอสิทธิ์?`,
            text: `คุณต้องการ${actionText}คำร้องของ ${requestData?.name_th} ใช่หรือไม่?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: confirmColor,
            cancelButtonColor: '#64748b',
            confirmButtonText: `ยืนยันการ${actionText}`,
            cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed) {
            setIsProcessing(true);
            try {
                let updatePayload = { status: newStatus };
                if (isApprove) {
                    updatePayload.manager_sign = signatureRef.current.getCanvas().toDataURL('image/png');
                    updatePayload.manager_date = toMysqlDateTime();
                }

                const { error } = await mysql
                    .from('access_requests')
                    .update(updatePayload)
                    .eq('id', requestId);

                if (error) throw error;

                // Send Telegram to IT ONLY if approved
                if (isApprove) {
                    // map columns to original format
                    const formattedForTelegram = {
                        ticketNumber: requestData.ticket_number,
                        nameTh: requestData.name_th,
                        nameEn: requestData.name_en,
                        department: requestData.department,
                        position: requestData.position,
                        internalPhone: requestData.internal_phone,
                        systems: requestData.systems,
                        otherSystemDetails: requestData.other_system_details,
                        requestDetails: requestData.request_details
                    };
                    await notifyNewAccessRequest(formattedForTelegram);
                }

                setRequestData(prev => ({ ...prev, status: newStatus }));

                Swal.fire({
                    title: 'บันทึกข้อมูลสำเร็จ',
                    text: `คุณได้${actionText}คำร้องนี้เรียบร้อยแล้ว`,
                    icon: 'success',
                    confirmButtonColor: '#4f46e5'
                });

            } catch (error) {
                console.error("Action error:", error);
                Swal.fire('Error', 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่', 'error');
            } finally {
                setIsProcessing(false);
            }
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center min-h-[50vh]">
                <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!requestData) {
        return (
            <div className="max-w-xl mx-auto mt-10 bg-white dark:bg-slate-800 p-10 rounded-2xl text-center border border-slate-100 dark:border-slate-700 shadow-xl">
                <XCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">ไม่พบคำร้อง</h3>
                <p className="text-slate-500 dark:text-slate-400">ลิงก์อาจถูกยกเลิก หรือไอดีไม่ถูกต้อง</p>
            </div>
        );
    }

    const { status } = requestData;
    const isPendingManager = status === 'Pending_Manager';

    return (
        <div className="w-full max-w-3xl mx-auto pb-10">
            {/* Header Area */}
            <div className="text-center mb-8 animate-fade-in relative z-10 pt-4">
                <div className="inline-flex items-center justify-center p-3 sm:p-4 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-xl shadow-indigo-200/50 dark:shadow-indigo-900/30 mb-4 transform transition-all hover:scale-105 hover:rotate-3">
                    <ShieldCheck className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                </div>
                <h2 className="text-2xl xl:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-indigo-900 dark:from-white dark:to-indigo-300 mb-2 fit-text">
                    แจ้งพิจารณาอนุมัติคำร้องขอสิทธิ์
                </h2>
                <p className="text-slate-500 dark:text-slate-400 font-medium text-sm xl:text-base max-w-lg mx-auto fit-text">
                    สำหรับผู้จัดการ/หัวหน้างาน พิจารณาอนุมัติการขอใช้งานระบบ IT (FMIT 12)
                </p>
                <div className="w-24 h-1.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full mx-auto mt-6 opacity-80 mix-blend-multiply dark:mix-blend-screen"></div>
            </div>

            <div className="glass-card rounded-3xl p-4 sm:p-6 xl:p-8 animate-slide-up relative bg-white dark:bg-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-700">
                
                {/* Status Alert */}
                {!isPendingManager && (
                    <div className={`p-4 rounded-xl flex items-center gap-3 mb-6 font-bold ${
                        status === 'Rejected' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}>
                        {status === 'Rejected' ? <XCircle className="w-6 h-6" /> : <CheckCircle className="w-6 h-6" />}
                        <span>คำร้องนี้ได้รับการ {status === 'Rejected' ? 'ไม่อนุมัติ' : 'อนุมัติเรียบร้อยแล้ว (รอ IT ดำเนินการ)'}</span>
                    </div>
                )}

                {/* Details Section */}
                <div className="space-y-6">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                            <User className="w-5 h-5 text-indigo-500" /> ข้อมูลพนักงาน
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-900/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700/50">
                            <div>
                                <span className="text-xs font-semibold text-slate-400 block mb-1">เลขที่ใบแจ้ง</span>
                                <div className="text-sm font-bold bg-indigo-100 text-indigo-800 w-fit px-2 py-0.5 rounded uppercase">{requestData.ticket_number || '-'}</div>
                            </div>
                            <div>
                                <span className="text-xs font-semibold text-slate-400 block mb-1">ชื่อ-สกุล</span>
                                <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{requestData.name_th} <span className="text-slate-400 font-normal">({requestData.name_en || '-'})</span></div>
                            </div>
                            <div>
                                <span className="text-xs font-semibold text-slate-400 block mb-1 flex items-center gap-1"><Building2 className="w-3 h-3" /> แผนก</span>
                                <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{requestData.department}</div>
                            </div>
                            <div>
                                <span className="text-xs font-semibold text-slate-400 block mb-1 flex items-center gap-1"><Briefcase className="w-3 h-3" /> ตำแหน่ง</span>
                                <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{requestData.position}</div>
                            </div>
                            <div>
                                <span className="text-xs font-semibold text-slate-400 block mb-1 flex items-center gap-1"><Phone className="w-3 h-3" /> เบอร์ภายใน</span>
                                <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{requestData.internal_phone || '-'}</div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                            <LayoutGrid className="w-5 h-5 text-indigo-500" /> สิทธิ์ที่ร้องขอ
                        </h3>
                        <div className="bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/30 p-5 rounded-2xl text-sm font-semibold text-indigo-900 dark:text-indigo-200 leading-relaxed">
                            {formatSystems(requestData.systems, requestData.other_system_details)}
                        </div>
                        {requestData.request_details && (
                            <div className="mt-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800">
                                <span className="font-bold block mb-1 flex items-center gap-1"><FileText className="w-4 h-4 text-slate-400" /> เหตุผล/รายละเอียด:</span> 
                                {requestData.request_details}
                            </div>
                        )}
                    </div>
                </div>

                {/* Manager Actions */}
                {isPendingManager && (
                    <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-700">
                        {/* Signature section */}
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <span className="text-red-500">*</span> ลายมือชื่อผู้อนุมัติ (หัวหน้างาน/ผู้จัดการ)
                                </h3>
                                <button 
                                    type="button" 
                                    onClick={() => signatureRef.current.clear()}
                                    className="text-xs text-red-500 hover:text-red-600 font-semibold"
                                >
                                    ล้างลายเซ็น
                                </button>
                            </div>
                            <div className="border border-dashed border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900/50 overflow-hidden relative" style={{ height: '150px' }}>
                                <SignatureCanvas 
                                    ref={signatureRef} 
                                    penColor="black"
                                    canvasProps={{
                                        className: 'signature-canvas w-full h-full'
                                    }}
                                />
                                <div className="absolute bottom-2 right-4 text-slate-400 text-xs pointer-events-none opacity-50">
                                    เซ็นชื่อในกรอบนี้
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3">
                            <button
                                onClick={() => handleAction('reject')}
                                disabled={isProcessing}
                                className="flex-1 py-3 px-4 bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <XCircle className="w-5 h-5" /> ไม่อนุมัติ
                            </button>
                            <button
                                onClick={() => handleAction('approve')}
                                disabled={isProcessing}
                                className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-indigo-500/30 flex items-center justify-center gap-2 disabled:opacity-50 group"
                            >
                                <CheckCircle className="w-5 h-5 group-hover:scale-110 transition-transform" /> อนุมัติให้สิทธิ์ (ส่งเข้าแผนก IT)
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ManagerApproval;
