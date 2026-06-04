import React, { useState, useEffect, useRef } from 'react';
import { mysql } from '../mysqlClient';
import { Key, CheckCircle, Clock } from 'lucide-react';
import Swal from 'sweetalert2';
import SignatureCanvas from 'react-signature-canvas';
import { toMysqlDateTime } from '../utils/dateTime';

const ITManagerApproval = ({ requestId, onBack }) => {
    const [request, setRequest] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const signatureRef = useRef(null);

    useEffect(() => {
        if (!requestId) return;

        const fetchRequest = async () => {
            setIsLoading(true);
            try {
                const { data, error } = await mysql
                    .from('access_requests')
                    .select('*')
                    .eq('id', requestId)
                    .single();

                if (error) throw error;
                setRequest(data);

                if (data.status === 'Completed') {
                    Swal.fire('ข้อมูลได้รับการลงนามแล้ว', 'คำร้องนี้ได้ถูกดำเนินการและลงนามปิดงานโดยหัวหน้า IT แล้ว', 'info');
                }
            } catch (error) {
                console.error('Error fetching request for IT Manager approval:', error);
                Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลคำร้อง กรุณาตรวจสอบลิงก์อีกครั้ง', 'error');
            } finally {
                setIsLoading(false);
            }
        };

        fetchRequest();
    }, [requestId]);

    const handleApprove = async () => {
        if (signatureRef.current.isEmpty()) {
            return Swal.fire({
                icon: 'warning',
                title: 'กรุณาลงนาม',
                text: 'กรุณาเซ็นชื่อเพื่ออนุมัติปิดงานในส่วนของหัวหน้าแผนก IT',
                confirmButtonColor: '#4f46e5'
            });
        }

        const signData = signatureRef.current.getCanvas().toDataURL('image/png');

        try {
            const { error } = await mysql
                .from('access_requests')
                .update({
                    status: 'Pending_User_Acknowledgement',
                    it_manager_sign: signData,
                    it_manager_date: toMysqlDateTime()
                })
                .eq('id', requestId);

            if (error) throw error;
            
            Swal.fire('สำเร็จ', 'บันทึกลายเซ็นและส่งต่อให้ผู้แจ้งรับทราบเรียบร้อยแล้ว', 'success').then(() => {
                if(onBack) onBack();
            });
        } catch (error) {
            console.error('Error saving approval:', error);
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        }
    };

    if (isLoading) {
         return (
             <div className="flex flex-col justify-center items-center py-20 animate-fade-in w-full">
                 <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                 <p className="mt-4 text-slate-500 font-medium">กำลังโหลดข้อมูลคำร้อง...</p>
             </div>
         );
    }

    if (!request) {
        return (
            <div className="bg-white dark:bg-slate-800 p-10 rounded-2xl text-center border border-slate-100 dark:border-slate-700 max-w-lg mx-auto mt-10 shadow-sm animate-fade-in">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">ไม่พบข้อมูล</h3>
                <p className="text-slate-500 dark:text-slate-400 mb-6">ลิงก์อาจไม่ถูกต้อง หรือคำร้องถูกลบไปแล้ว</p>
                {onBack && (
                     <button onClick={onBack} className="px-6 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 font-bold rounded-xl transition-colors">
                         กลับสู่หน้าหลัก
                     </button>
                )}
            </div>
        );
    }

    const { status, name_th, department, ticket_number, request_details, it_staff_name, action_result } = request;

    if (status === 'Completed' || status === 'Rejected') {
        return (
             <div className="bg-white dark:bg-slate-800 p-10 rounded-2xl text-center border border-slate-100 dark:border-slate-700 max-w-lg mx-auto mt-10 shadow-sm animate-fade-in">
                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">รายการนี้ดำเนินการเสร็จสิ้นแล้ว</h3>
                <p className="text-slate-500 dark:text-slate-400 mb-6">คุณได้ทำการลงนาม หรือคำร้องนี้ถูกปิดไปแล้ว</p>
                {onBack && (
                     <button onClick={onBack} className="px-6 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 font-bold rounded-xl transition-colors">
                         กลับสู่หน้าหลัก
                     </button>
                )}
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6 animate-slide-up mt-6">
            <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 xl:p-8 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 border border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-4 mb-8">
                     <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-900/50 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                         <Key className="w-7 h-7" />
                     </div>
                     <div>
                         <h2 className="text-2xl font-bold text-slate-800 dark:text-white">ลงนามหัวหน้าแผนก IT</h2>
                         <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                             ตรวจสอบผลการปฏิบัติงานและลงนามเพื่อปิดงาน
                         </p>
                     </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 p-5 rounded-2xl mb-6 border border-slate-100 dark:border-slate-700">
                     <div className="grid grid-cols-1 xl:grid-cols-2 gap-y-4 gap-x-6">
                          <div>
                              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 block">ผู้ขอสิทธิ์</span>
                              <div className="font-medium text-slate-800 dark:text-white mt-1">{name_th}</div>
                          </div>
                          <div>
                              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 block">แผนก/ฝ่าย</span>
                              <div className="font-medium text-slate-800 dark:text-white mt-1">{department}</div>
                          </div>
                          {ticket_number && (
                              <div>
                                  <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 block">เลขที่อ้างอิง</span>
                                  <div className="font-medium text-slate-800 dark:text-white mt-1">{ticket_number}</div>
                              </div>
                          )}
                          <div>
                              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 block">รายละเอียดการร้องขอ</span>
                              <div className="font-medium text-slate-800 dark:text-white mt-1 line-clamp-2">{request_details || '-'}</div>
                          </div>
                     </div>
                </div>

                <div className="bg-purple-50 dark:bg-purple-900/20 p-5 rounded-2xl mb-8 border border-purple-100 dark:border-purple-800/30">
                     <h3 className="font-bold text-purple-800 dark:text-purple-300 mb-4 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" /> ส่วนของผู้ปฏิบัติงาน IT
                     </h3>
                     <div className="grid grid-cols-1 xl:grid-cols-2 gap-y-4 gap-x-6">
                          <div>
                              <span className="text-xs font-semibold text-purple-400/80 block">ชื่อผู้รับแจ้ง</span>
                              <div className="font-medium text-purple-900 dark:text-purple-200 mt-1">{it_staff_name || '-'}</div>
                          </div>
                          <div>
                              <span className="text-xs font-semibold text-purple-400/80 block">ผลการดำเนินการ</span>
                              <div className="font-medium text-purple-900 dark:text-purple-200 mt-1">{action_result || '-'}</div>
                          </div>
                     </div>
                </div>

                <div className="mb-8">
                     <div className="flex justify-between items-center mb-3 text-slate-800 dark:text-white">
                         <label className="font-bold text-base flex items-center gap-2">
                             <Clock className="w-5 h-5 text-indigo-500" />
                             ลายเซ็นหัวหน้า IT
                         </label>
                         <button 
                             onClick={() => signatureRef.current.clear()}
                             className="text-sm font-bold text-red-500 hover:text-red-600 transition-colors bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-lg"
                         >
                             ล้างลายเซ็น
                         </button>
                     </div>
                     <div className="border-2 border-dashed border-indigo-200 dark:border-indigo-800 rounded-2xl bg-white dark:bg-slate-900 relative h-[250px] shadow-inner overflow-hidden group">
                         <SignatureCanvas 
                             ref={signatureRef} 
                             penColor="black"
                             canvasProps={{ className: 'w-full h-full xl-signature' }}
                         />
                         <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-indigo-500/5">
                            <span className="bg-white/90 dark:bg-slate-800/90 text-indigo-600 dark:text-indigo-400 font-bold px-4 py-2 rounded-full text-sm shadow-sm">
                                เซ็นชื่อในกรอบนี้
                            </span>
                         </div>
                     </div>
                </div>

                <div className="pt-6 border-t border-slate-100 dark:border-slate-700 flex gap-4">
                     {onBack && (
                         <button 
                             onClick={onBack}
                             className="px-6 py-4 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-white font-bold rounded-xl transition-colors flex-1"
                         >
                             ยกเลิก
                         </button>
                     )}
                     <button 
                         onClick={handleApprove}
                         className={(onBack ? "flex-[2]" : "w-full") + " py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition-all hover:shadow-indigo-600/50 hover:-translate-y-0.5"}
                     >
                         ลงนามและปิดงาน
                     </button>
                </div>
            </div>
        </div>
    );
};

export default ITManagerApproval;
