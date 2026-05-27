import React, { useState, useRef } from 'react';
import { Code, Save, LayoutGrid, AlertCircle, Briefcase, User, FileText, Printer } from 'lucide-react';
import Swal from 'sweetalert2';
import { mysql } from '../mysqlClient';
import SignatureCanvas from 'react-signature-canvas';
import Fmit15PdfPreview from './Fmit15PdfPreview';
import { Combobox } from './ui/combobox';
import { copyText } from '../utils/closeIssueLink';

const DEPARTMENTS = [
    'แอดมิน', 'บุคคลและธุรการ', 'วิศวกรรม', 'การตลาดและขาย (ในประเทศ)',
    'การตลาดและขาย (ต่างประเทศ)', 'แอดมินการตลาด', 'บัญชี', 'การเงิน',
    'จัดซื้อ', 'เทคโนโลยีสารสนเทศ และ ERP', 'วางแผน', 'ฝ่ายผลิต',
    'ตรวจสอบคุณภาพ', 'ควบคุมคุณภาพ', 'บริหารระบบ และ จป.', 'ออกแบบ',
    'วิจัยและพัฒนาผลิตภัณฑ์', 'คลังพัสดุและจัดส่ง', 'ตรวจสอบ', 'ซ่อมบำรุง',
    'สำนักกรรมการ', 'อื่นๆ'
];

const INITIAL_FORM_DATA = {
    reqType: '',
    reqTypeOther: '',
    employeeId: '',
    department: '',
    requestDetails: '',
    reason: '',
    requesterName: '',
    requesterPosition: ''
};

const ChangeRequestForm = ({ onCancel }) => {
    const signatureRef = useRef(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [signatureData, setSignatureData] = useState(null);
    const [formData, setFormData] = useState(INITIAL_FORM_DATA);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleTypeChange = (type) => {
        setFormData(prev => ({ ...prev, reqType: type }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Basic validation
        if (!formData.reqType || !formData.employeeId || !formData.requesterName || !formData.department || !formData.requesterPosition || !formData.requestDetails || !formData.reason) {
            Swal.fire({
                icon: 'warning',
                title: 'ข้อมูลไม่ครบถ้วน',
                text: 'กรุณากรอกข้อมูลที่มีเครื่องหมาย * ให้ครบทุกช่อง',
                confirmButtonColor: '#4f46e5'
            });
            return;
        }

        if (!/^\d{6}$/.test(formData.employeeId)) {
            Swal.fire({
                icon: 'warning',
                title: 'รหัสพนักงานไม่ถูกต้อง',
                text: 'กรุณากรอกรหัสพนักงาน 6 หลัก',
                confirmButtonColor: '#4f46e5'
            });
            return;
        }

        if (signatureRef.current.isEmpty()) {
            Swal.fire({
                icon: 'warning',
                title: 'กรุณาลงนาม',
                text: 'กรุณาเซ็นชื่อในช่อง "ลายมือชื่อผู้ร้องขอ" ก่อนกดยืนยัน',
                confirmButtonColor: '#4f46e5'
            });
            return;
        }

        const currentSignature = signatureRef.current.getCanvas().toDataURL('image/png');
        setSignatureData(currentSignature);
        setIsSubmitting(true);

        try {
            // Generate Ticket Number (ITC ddmmyy/xxx)
            const today = new Date();
            const startOfDay = new Date(today.setHours(0,0,0,0)).toISOString();
            const endOfDay = new Date(today.setHours(23,59,59,999)).toISOString();
            
            const { count } = await mysql
                .from('change_requests')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', startOfDay)
                .lte('created_at', endOfDay);
                
            const currDate = new Date(); // Need fresh date obj after setHours mutation
            const dd = String(currDate.getDate()).padStart(2, '0');
            const mm = String(currDate.getMonth() + 1).padStart(2, '0');
            const yy = String(currDate.getFullYear()).slice(-2);
            const sequenceNum = String((count || 0) + 1).padStart(3, '0');
            const generatedTicket = `ITC ${dd}${mm}${yy}/${sequenceNum}`;

            // Save to Supabase
            const { data: insertedData, error } = await mysql.from('change_requests').insert([{
                ticket_number: generatedTicket,
                req_type: formData.reqType,
                req_type_other: formData.reqTypeOther,
                employee_id: formData.employeeId,
                department: formData.department,
                details: formData.requestDetails,
                reason: formData.reason,
                requester_name: formData.requesterName,
                requester_position: formData.requesterPosition,
                requester_sign: currentSignature,
                status: 'Pending_Manager'
            }]).select();

            if (error) throw error;
            
            const reqId = insertedData[0].id;
            const approvalLink = `${window.location.origin}/?approveChangeReq=${reqId}`;

            Swal.fire({
                icon: 'success',
                title: 'สร้างใบคำร้องสำเร็จ!',
                html: `
                    <div style="text-align: left; font-size: 14px; margin-bottom: 10px;">
                        <p>เลขที่เอกสาร: <b>${generatedTicket}</b></p>
                        <p style="margin-top: 10px; color: #ef4444; font-weight: bold;">⚠️ สำคัญมาก:</p>
                        <p style="color: #4b5563; line-height: 1.5;">กรุณาคัดลอกลิงก์ด้านล่างนี้ ส่งให้ <b>ผู้อนุมัติ (หัวหน้างาน)</b> ของคุณเพื่อทำการอนุมัติ</p>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <input type="text" id="approval-link" value="${approvalLink}" readonly style="flex: 1; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 12px; background: #f8fafc;" />
                        <button onclick="navigator.clipboard.writeText(document.getElementById('approval-link').value); const btn = this; btn.innerText = 'คัดลอกแล้ว!'; btn.style.background = '#10b981';" style="padding: 10px 15px; background: #4f46e5; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: bold; transition: all 0.2s;">คัดลอกลิงก์</button>
                    </div>
                `,
                confirmButtonColor: '#10b981',
                confirmButtonText: 'คัดลอกลิงก์',
                showCancelButton: true,
                cancelButtonText: 'ปิดหน้าต่าง',
                allowOutsideClick: false,
                didOpen: () => {
                    const input = document.getElementById('approval-link');
                    input?.addEventListener('click', () => input.select());
                    const copyButton = input?.nextElementSibling;
                    copyButton?.addEventListener('click', async (event) => {
                        event.preventDefault();
                        await copyText(approvalLink);
                        copyButton.textContent = 'คัดลอกแล้ว!';
                        copyButton.style.background = '#10b981';
                    });
                },
                preConfirm: async () => {
                    await copyText(approvalLink);
                }
            }).then(() => {
                if (onCancel) {
                    onCancel();
                    return;
                }
                setFormData(INITIAL_FORM_DATA);
                setSignatureData(null);
                signatureRef.current?.clear();
            });
        } catch (error) {
            console.error('Error submitting form:', error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถส่งคำร้องได้ กรุณาตรวจสอบว่ามีตาราง change_requests ในฐานข้อมูลแล้ว หรือติดต่อ IT',
                confirmButtonColor: '#4f46e5'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="w-full max-w-4xl mx-auto pb-10">
            {/* Header Area */}
            <div className="text-center mb-8 animate-fade-in relative z-10 pt-4">
                <div className="inline-flex items-center justify-center p-3 sm:p-4 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-xl shadow-emerald-200/50 dark:shadow-emerald-900/30 mb-4 transform transition-all hover:scale-105 hover:rotate-3">
                    <Code className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-emerald-900 dark:from-white dark:to-emerald-300 mb-2">
                    ฟอร์มขอดำเนินการพัฒนาระบบ
                </h2>
                <p className="text-slate-500 dark:text-slate-400 font-medium text-sm sm:text-base max-w-lg mx-auto">
                    ใบคำร้องขอเปลี่ยนแปลงและพัฒนาระบบ (Change Request Form - FMIT 15)
                </p>
                <div className="w-24 h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full mx-auto mt-6 opacity-80 mix-blend-multiply dark:mix-blend-screen"></div>
            </div>

            <form onSubmit={handleSubmit} className="glass-card rounded-3xl p-6 sm:p-8 animate-slide-up relative bg-white dark:bg-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-700">
                
                {/* Requirement Type */}
                <div className="mb-8">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                        <LayoutGrid className="w-5 h-5 text-emerald-500" /> ความต้องการ <span className="text-red-500 text-sm font-normal ml-1">*</span>
                    </h3>
                    <div className="flex flex-wrap items-center gap-4">
                        {['add', 'remove', 'change'].map((type) => {
                            const labels = { add: 'เพิ่ม', remove: 'นำออก', change: 'เปลี่ยนแปลงแก้ไข' };
                            return (
                                <label key={type} className={`flex items-center gap-2 p-3 rounded-xl cursor-pointer border transition-all ${formData.reqType === type ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-medium' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-600'}`}>
                                    <input 
                                        type="radio" 
                                        name="reqType" 
                                        value={type}
                                        checked={formData.reqType === type}
                                        onChange={() => handleTypeChange(type)}
                                        className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-slate-300"
                                    />
                                    <span>{labels[type]}</span>
                                </label>
                            );
                        })}
                        {formData.reqType === 'change' && (
                            <input
                                type="text"
                                name="reqTypeOther"
                                value={formData.reqTypeOther}
                                onChange={handleChange}
                                placeholder="ระบุเพิ่มเติม..."
                                className="input-modern flex-1 min-w-[200px]"
                            />
                        )}
                    </div>
                </div>

                {/* Section 1: Requester Details */}
                <div className="mb-8 space-y-6">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                        <User className="w-5 h-5 text-emerald-500" /> ส่วนที่ 1 : ข้อมูลผู้ร้องขอเปลี่ยนแปลงระบบ
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                        <div className="space-y-1.5 md:col-span-1">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                รหัสพนักงาน <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                name="employeeId"
                                value={formData.employeeId}
                                onChange={handleChange}
                                maxLength="6"
                                className="input-modern w-full"
                                placeholder="เช่น 001234"
                            />
                        </div>

                        <div className="space-y-1.5 md:col-span-1">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                ชื่อผู้ร้องขอ <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                                    <User className="w-4 h-4" />
                                </span>
                                <input
                                    type="text"
                                    name="requesterName"
                                    value={formData.requesterName}
                                    onChange={handleChange}
                                    className="input-modern !pl-10 w-full"
                                    placeholder="นาย/นางสาว..."
                                />
                            </div>
                        </div>
                        
                        <div className="space-y-1.5 md:col-span-1">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                ตำแหน่ง <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                                    <Briefcase className="w-4 h-4" />
                                </span>
                                <input
                                    type="text"
                                    name="requesterPosition"
                                    value={formData.requesterPosition}
                                    onChange={handleChange}
                                    className="input-modern !pl-10 w-full"
                                    placeholder="ระบุตำแหน่ง..."
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5 md:col-span-1">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                แผนก/ฝ่าย ผู้ร้องขอ <span className="text-red-500">*</span>
                            </label>
                            <Combobox
                                options={DEPARTMENTS.map(dept => ({ label: dept, value: dept }))}
                                value={formData.department}
                                onValueChange={(value) => setFormData(prev => ({ ...prev, department: value }))}
                                placeholder="ระบุแผนก..."
                                searchPlaceholder="ค้นหาแผนก..."
                            />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-emerald-500"/> รายละเอียดของโปรเจ็กต์/ระบบที่ต้องการ <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                name="requestDetails"
                                value={formData.requestDetails}
                                onChange={handleChange}
                                className="input-modern w-full min-h-[100px] p-4 text-sm"
                                placeholder="Details of the Proposed Changes (รายละเอียด)..."
                            />
                            <p className="text-xs text-slate-400 ml-1">(หากมีสามารถแนบแบบฟอร์มหรือลิงก์เอกสารเพิ่มเติมมาด้วยได้ที่ช่องด้านล่าง)</p>
                        </div>
                        
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-amber-500"/> เหตุผลการขอพัฒนาโปรแกรม <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                name="reason"
                                value={formData.reason}
                                onChange={handleChange}
                                className="input-modern w-full min-h-[80px] p-4 text-sm"
                                placeholder="Reason for changes (เหตุผลความจำเป็นที่ต้องพัฒนา)..."
                            />
                        </div>
                    </div>
                </div>

                {/* Signature Section */}
                <div className="mb-8 p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50 shadow-inner border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <span className="text-red-500">*</span> ลายมือชื่อผู้ร้องขอ (Requested by)
                        </h3>
                        <button 
                            type="button" 
                            onClick={() => signatureRef.current.clear()}
                            className="text-xs text-red-500 hover:text-red-600 font-semibold"
                        >
                            ล้างลายเซ็น
                        </button>
                    </div>
                    <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 overflow-hidden relative" style={{ height: '140px' }}>
                        <SignatureCanvas 
                            ref={signatureRef} 
                            penColor="black"
                            canvasProps={{ className: 'w-full h-full xl-signature' }}
                        />
                        <div className="absolute bottom-2 right-4 text-slate-400 text-xs pointer-events-none opacity-50">
                            เซ็นชื่อในกรอบนี้
                        </div>
                    </div>
                </div>

                {/* Info Box */}
                <div className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 p-4 rounded-xl flex gap-3 items-start mb-8 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                        <span className="font-semibold block mb-1">ขั้นตอนถัดไป</span>
                        หลังจากกดส่งคำร้อง ระบบจะสร้างลิงก์สำหรับให้ <b>ผู้อนุมัติ (หัวหน้างาน)</b> ของคุณคลิกเพื่อเซ็นอนุมัติ โดยทางฝ่าย IT จะเริ่มพิจารณาดำเนินการหลังจากที่ได้รับการอนุมัติแล้วเท่านั้น
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col-reverse sm:flex-row justify-end items-center gap-3 pt-6 border-t border-slate-100 dark:border-slate-700">
                    {onCancel && (
                        <button
                            type="button"
                            onClick={onCancel}
                            className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                        >
                            ยกเลิก
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            if (!signatureRef.current.isEmpty()) {
                                setSignatureData(signatureRef.current.getCanvas().toDataURL('image/png'));
                            }
                            setIsPreviewOpen(true);
                        }}
                        className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition flex items-center justify-center gap-2 border border-emerald-200 dark:border-emerald-800"
                    >
                        <Printer className="w-5 h-5" />
                        ดูตัวอย่างแบบฟอร์ม (PDF)
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full sm:w-auto overflow-hidden relative group bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl px-6 py-2.5 shadow-lg shadow-emerald-600/30 transition-all duration-200 border-none"
                    >
                        <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></span>
                        <div className="flex items-center justify-center gap-2 relative z-10 transition-transform duration-200 group-hover:scale-105">
                            {isSubmitting ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    <span className="text-white">กำลังส่งคำร้อง...</span>
                                </>
                            ) : (
                                <>
                                    <Save className="w-5 h-5 text-white" />
                                    <span className="text-white">บันทึกใบคำร้องขอพัฒนาระบบ</span>
                                </>
                            )}
                        </div>
                    </button>
                </div>
            </form>

            <Fmit15PdfPreview 
                isOpen={isPreviewOpen} 
                onClose={() => setIsPreviewOpen(false)} 
                formData={{...formData, requesterSign: signatureData}} 
            />
        </div>
    );
};

export default ChangeRequestForm;

