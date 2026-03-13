import React, { useState, useRef } from 'react';
import { UserPlus, Save, LayoutGrid, AlertCircle, Phone, Briefcase, Building2, User, Globe, FileText, Printer } from 'lucide-react';
import Swal from 'sweetalert2';
import Fmit12PdfPreview from './Fmit12PdfPreview';
import { notifyNewAccessRequest } from '../telegramNotify';
import { supabase } from '../supabaseClient';
import SignatureCanvas from 'react-signature-canvas';

const DEPARTMENTS = [
    'แอดมิน', 'บุคคลและธุรการ', 'วิศวกรรม', 'การตลาดและขาย (ในประเทศ)',
    'การตลาดและขาย (ต่างประเทศ)', 'แอดมินการตลาด', 'บัญชี', 'การเงิน',
    'จัดซื้อ', 'เทคโนโลยีสารสนเทศ และ ERP', 'วางแผน', 'ฝ่ายผลิต',
    'ตรวจสอบคุณภาพ', 'ควบคุมคุณภาพ', 'บริหารระบบ และ จป.', 'ออกแบบ',
    'วิจัยและพัฒนาผลิตภัณฑ์', 'คลังพัสดุและจัดส่ง', 'ตรวจสอบ', 'ซ่อมบำรุง',
    'สำนักกรรมการ', 'อื่นๆ'
];
const UserAccessRequestForm = ({ onCancel }) => {
    const signatureRef = useRef(null);
    const [signatureData, setSignatureData] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [formData, setFormData] = useState({
        nameTh: '',
        nameEn: '',
        department: '',
        position: '',
        internalPhone: '',
        systems: {
            userComputer: false,
            email: false,
            dataAll: false,
            vpn: false,
            allWeb: false,
            wms: false,
            msDynamics365: false,
            cyberHrm: false,
            other: false
        },
        otherSystemDetails: '',
        requestDetails: ''
    });

    const handleSystemChange = (systemName) => {
        setFormData(prev => ({
            ...prev,
            systems: {
                ...prev.systems,
                [systemName]: !prev.systems[systemName]
            }
        }));
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Basic validation
        if (!formData.nameTh || !formData.department || !formData.position) {
            Swal.fire({
                icon: 'warning',
                title: 'ข้อมูลไม่ครบถ้วน',
                text: 'กรุณากรอกข้อมูลที่มีเครื่องหมาย * ให้ครบทุกช่อง',
                confirmButtonColor: '#4f46e5'
            });
            return;
        }

        const isAnySystemSelected = Object.values(formData.systems).some(val => val === true);
        if (!isAnySystemSelected) {
            Swal.fire({
                icon: 'warning',
                title: 'ยังไม่ได้เลือกระบบ',
                text: 'กรุณาเลือกระบบเทคโนโลยีสารสนเทศที่ต้องการร้องขออย่างน้อย 1 รายการ',
                confirmButtonColor: '#4f46e5'
            });
            return;
        }

        if (formData.systems.other && !formData.otherSystemDetails) {
            Swal.fire({
                icon: 'warning',
                title: 'ข้อมูลเพิ่มเติม',
                text: 'กรุณาระบุรายละเอียดระบบอื่นๆ ที่ต้องการ',
                confirmButtonColor: '#4f46e5'
            });
            return;
        }

        if (signatureRef.current.isEmpty()) {
            Swal.fire({
                icon: 'warning',
                title: 'กรุณาลงนาม',
                text: 'กรุณาเซ็นชื่อในช่อง "ลายมือชื่อผู้ขอใช้งาน" ก่อนกดยืนยัน',
                confirmButtonColor: '#4f46e5'
            });
            return;
        }

        const currentSignature = signatureRef.current.getCanvas().toDataURL('image/png');
        setSignatureData(currentSignature);

        setIsSubmitting(true);
        try {
            // Generate Ticket Number (ITU ddmmyy/xxx)
            const today = new Date();
            const startOfDay = new Date(today.setHours(0,0,0,0)).toISOString();
            const endOfDay = new Date(today.setHours(23,59,59,999)).toISOString();
            
            const { count } = await supabase
                .from('access_requests')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', startOfDay)
                .lte('created_at', endOfDay);
                
            const currDate = new Date(); // Need fresh date obj after setHours mutation
            const dd = String(currDate.getDate()).padStart(2, '0');
            const mm = String(currDate.getMonth() + 1).padStart(2, '0');
            const yy = String(currDate.getFullYear()).slice(-2);
            const sequenceNum = String((count || 0) + 1).padStart(3, '0');
            const generatedTicket = `ITU ${dd}${mm}${yy}/${sequenceNum}`;

            // Save to Supabase
            const { data: insertedData, error } = await supabase.from('access_requests').insert([{
                ticket_number: generatedTicket,
                name_th: formData.nameTh,
                name_en: formData.nameEn,
                department: formData.department,
                position: formData.position,
                internal_phone: formData.internalPhone,
                systems: formData.systems,
                other_system_details: formData.otherSystemDetails,
                request_details: formData.requestDetails,
                status: 'Pending_Manager',
                requester_sign: currentSignature
            }]).select();

            if (error) throw error;
            
            const reqId = insertedData[0].id;
            const approvalLink = `${window.location.origin}/?approveRequest=${reqId}`;

            Swal.fire({
                icon: 'success',
                title: 'สร้างคำร้องสำเร็จ!',
                html: `
                    <div style="text-align: left; font-size: 14px; margin-bottom: 10px;">
                        <p>เลขที่ใบแจ้ง: <b>${generatedTicket}</b></p>
                        <p style="margin-top: 10px; color: #ef4444; font-weight: bold;">⚠️ สำคัญมาก:</p>
                        <p style="color: #4b5563; line-height: 1.5;">กรุณาคัดลอกลิงก์ด้านล่างนี้ ส่งให้ <b>ผู้จัดการ/หัวหน้างาน</b> ของคุณเพื่อทำการอนุมัติ (ฝ่าย IT จะไม่เริ่มดำเนินการจนกว่าผู้จัดการจะกดอนุมัติผ่านลิงก์นี้)</p>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <input type="text" id="approval-link" value="${approvalLink}" readonly style="flex: 1; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 12px; background: #f8fafc;" />
                        <button onclick="navigator.clipboard.writeText(document.getElementById('approval-link').value); const btn = this; btn.innerText = 'คัดลอกแล้ว!'; btn.style.background = '#10b981';" style="padding: 10px 15px; background: #4f46e5; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: bold; transition: all 0.2s;">คัดลอกลิงก์</button>
                    </div>
                `,
                confirmButtonColor: '#10b981',
                confirmButtonText: 'ปิดหน้าต่าง',
                allowOutsideClick: false
            }).then(() => {
                if (onCancel) onCancel(); // Return to previous screen or clear form
                else {
                    window.location.reload(); 
                }
            });
        } catch (error) {
            console.error('Error submitting form:', error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถส่งคำร้องได้ กรุณาติดต่อผู้ดูแลระบบ',
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
                <div className="inline-flex items-center justify-center p-3 sm:p-4 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-xl shadow-indigo-200/50 dark:shadow-indigo-900/30 mb-4 transform transition-all hover:scale-105 hover:rotate-3">
                    <UserPlus className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-indigo-900 dark:from-white dark:to-indigo-300 mb-2">
                    ฟอร์มขอเพิ่มบัญชีผู้ใช้งาน
                </h2>
                <p className="text-slate-500 dark:text-slate-400 font-medium text-sm sm:text-base max-w-lg mx-auto">
                    ใบขอเพิ่มบัญชีผู้ใช้งานระบบเทคโนโลยีสารสนเทศ (FMIT 12)
                </p>
                <div className="w-24 h-1.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full mx-auto mt-6 opacity-80 mix-blend-multiply dark:mix-blend-screen"></div>
            </div>

            <form onSubmit={handleSubmit} className="glass-card rounded-3xl p-6 sm:p-8 animate-slide-up relative bg-white dark:bg-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-700">
                
                {/* Section 1: User Info */}
                <div className="mb-8">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                        <User className="w-5 h-5 text-indigo-500" /> ข้อมูลผู้ขอใช้บริการ
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                ชื่อ-สกุล (ภาษาไทย) <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                                    <User className="w-4 h-4" />
                                </span>
                                <input
                                    type="text"
                                    name="nameTh"
                                    value={formData.nameTh}
                                    onChange={handleChange}
                                    className="input-modern !pl-10 w-full"
                                    placeholder="นาย/นางสาว..."
                                />
                            </div>
                        </div>
                        
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                ชื่อ-สกุล (ภาษาอังกฤษ)
                            </label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                                    <Globe className="w-4 h-4" />
                                </span>
                                <input
                                    type="text"
                                    name="nameEn"
                                    value={formData.nameEn}
                                    onChange={handleChange}
                                    className="input-modern !pl-10 w-full"
                                    placeholder="Mr./Ms..."
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                แผนก / ฝ่าย <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                                    <Building2 className="w-4 h-4" />
                                </span>
                                <input
                                    type="text"
                                    name="department"
                                    list="department-list"
                                    value={formData.department}
                                    onChange={handleChange}
                                    className="input-modern !pl-10 w-full"
                                    placeholder="ระบุแผนก..."
                                    autoComplete="off"
                                />
                                <datalist id="department-list">
                                    {DEPARTMENTS.map(dept => (
                                        <option key={dept} value={dept} />
                                    ))}
                                </datalist>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                    ตำแหน่ง <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                                        <Briefcase className="w-4 h-4" />
                                    </span>
                                    <input
                                        type="text"
                                        name="position"
                                        value={formData.position}
                                        onChange={handleChange}
                                        className="input-modern !pl-10 w-full"
                                        placeholder="ระบุตำแหน่ง..."
                                    />
                                </div>
                            </div>
                            
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                    เบอร์โทรภายใน
                                </label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                                        <Phone className="w-4 h-4" />
                                    </span>
                                    <input
                                        type="tel"
                                        name="internalPhone"
                                        value={formData.internalPhone}
                                        onChange={handleChange}
                                        className="input-modern !pl-10 w-full"
                                        placeholder="เช่น 1234"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Section 2: Requested Systems */}
                <div className="mb-8">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                        <LayoutGrid className="w-5 h-5 text-indigo-500" /> ส่วนร้องขอใช้ระบบงาน <span className="text-red-500 text-sm font-normal ml-1">*เลือกอย่างน้อย 1 รายการ</span>
                    </h3>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                        {/* Checkboxes items */}
                        {[
                            { id: 'userComputer', label: 'User Computer' },
                            { id: 'email', label: 'E-Mail' },
                            { id: 'dataAll', label: 'Data All' },
                            { id: 'vpn', label: 'VPN' },
                            { id: 'allWeb', label: 'All Web' },
                            { id: 'wms', label: 'WMS' },
                            { id: 'msDynamics365', label: 'MS Dynamics365' },
                            { id: 'cyberHrm', label: 'Cyber HRM' }
                        ].map((sys) => (
                            <label key={sys.id} className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer border transition-all ${formData.systems[sys.id] ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600'}`}>
                                <div className="relative flex items-center justify-center mt-0.5">
                                    <input 
                                        type="checkbox" 
                                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 dark:focus:ring-indigo-600 dark:ring-offset-slate-800 dark:bg-slate-700 dark:border-slate-600"
                                        checked={formData.systems[sys.id]}
                                        onChange={() => handleSystemChange(sys.id)}
                                    />
                                </div>
                                <span className={`text-sm font-medium ${formData.systems[sys.id] ? 'text-indigo-800 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-300'}`}>
                                    {sys.label}
                                </span>
                            </label>
                        ))}

                        {/* Other Choice */}
                        <label className={`col-span-2 sm:col-span-3 md:col-span-4 flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${formData.systems.other ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600'}`}>
                            <div className="relative flex items-center justify-center">
                                <input 
                                    type="checkbox" 
                                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 dark:focus:ring-indigo-600 dark:ring-offset-slate-800 dark:bg-slate-700 dark:border-slate-600"
                                    checked={formData.systems.other}
                                    onChange={() => handleSystemChange('other')}
                                />
                            </div>
                            <span className={`text-sm font-medium whitespace-nowrap ${formData.systems.other ? 'text-indigo-800 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-300'}`}>
                                อื่นๆ ระบุ:
                            </span>
                            <input
                                type="text"
                                name="otherSystemDetails"
                                value={formData.otherSystemDetails}
                                onChange={handleChange}
                                disabled={!formData.systems.other}
                                className={`flex-1 bg-transparent border-b outline-none text-sm transition-all focus:border-indigo-500 ${formData.systems.other ? 'border-indigo-300 text-indigo-900 dark:text-indigo-100 placeholder-indigo-300' : 'border-slate-300 text-slate-500 placeholder-slate-300 cursor-not-allowed'}`}
                                placeholder="โปรดระบุระบบ..."
                            />
                        </label>
                    </div>
                </div>
                {/* Section 3: Detailed Request */}
                <div className="mb-8">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                        <FileText className="w-5 h-5 text-indigo-500" /> รายละเอียดการร้องขอ
                    </h3>
                    <div className="space-y-1.5 w-full">
                        <textarea
                            name="requestDetails"
                            value={formData.requestDetails}
                            onChange={handleChange}
                            className="input-modern w-full min-h-[120px] resize-y p-4"
                            placeholder="ระบุวัตถุประสงค์การขอสิทธิ์ หรือรายละเอียดเพิ่มเติมที่ต้องการให้ฝ่าย IT ทราบ..."
                        />
                    </div>
                </div>
                {/* Section 4: Signature Section */}
                <div className="mb-8 p-6 rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <span className="text-red-500">*</span> ลายมือชื่อผู้ขอใช้งาน
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
                                className: 'signature-canvas w-full h-full xl-signature'
                            }}
                        />
                        <div className="absolute bottom-2 right-4 text-slate-400 text-xs pointer-events-none opacity-50">
                            เซ็นชื่อในกรอบนี้
                        </div>
                    </div>
                </div>

                {/* Info Box */}
                <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 p-4 rounded-xl flex gap-3 items-start mb-8 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                        <span className="font-semibold block mb-1">หมายเหตุการขอสิทธิ์</span>
                        การขอสิทธิ์ในบางระบบ เช่น MS Dynamics365 หรือ VPN อาจต้องได้รับการอนุมัติจากผู้จัดการฝ่ายหรือผู้อำนวยการก่อนดำเนินการ ระบบจะมีขั้นตอนส่งอีเมลขออนุมัติอัตโนมัติในภายหลัง
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
                        onClick={() => setIsPreviewOpen(true)}
                        className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition flex items-center justify-center gap-2 border border-indigo-200 dark:border-indigo-800"
                    >
                        <Printer className="w-5 h-5" />
                        ดูตัวอย่างแบบฟอร์ม (PDF)
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full sm:w-auto overflow-hidden relative group btn-primary"
                    >
                        <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></span>
                        <div className="flex items-center justify-center gap-2 relative z-10 transition-transform duration-200 group-hover:scale-105">
                            {isSubmitting ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    <span>กำลังส่งคำร้อง...</span>
                                </>
                            ) : (
                                <>
                                    <Save className="w-5 h-5" />
                                    <span>ส่งแบบคำร้องขอสิทธิ์</span>
                                </>
                            )}
                        </div>
                    </button>
                </div>
            </form>

            <Fmit12PdfPreview 
                isOpen={isPreviewOpen} 
                onClose={() => setIsPreviewOpen(false)} 
                formData={{...formData, requesterSign: signatureData}} 
            />
        </div>
    );
};

export default UserAccessRequestForm;
