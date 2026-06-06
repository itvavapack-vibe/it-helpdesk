import React, { useRef, useState } from 'react';
import { AlertCircle, Briefcase, FileText, Globe, LayoutGrid, Phone, Printer, Save, User, UserPlus } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import Swal from 'sweetalert2';
import Fmit12PdfPreview from './Fmit12PdfPreview';
import { mysql } from '../mysqlClient';
import { Combobox } from './ui/combobox';
import { buildManagerApprovalLink, copyText } from '../utils/closeIssueLink';
import { insertWithMonthlyDocumentNumber } from '../utils/ticketNumber';

const DEPARTMENTS = [
    'แอดมิน',
    'บุคคลและธุรการ',
    'วิศวกรรม',
    'การตลาดและขาย (ในประเทศ)',
    'การตลาดและขาย (ต่างประเทศ)',
    'แอดมินการตลาด',
    'บัญชี',
    'การเงิน',
    'จัดซื้อ',
    'เทคโนโลยีสารสนเทศ และ ERP',
    'วางแผน',
    'ฝ่ายผลิต',
    'ตรวจสอบคุณภาพ',
    'ควบคุมคุณภาพ',
    'บริหารระบบ และ จป.',
    'ออกแบบ',
    'วิจัยและพัฒนาผลิตภัณฑ์',
    'คลังพัสดุและจัดส่ง',
    'ตรวจสอบ',
    'ซ่อมบำรุง',
    'สำนักกรรมการ',
    'อื่นๆ',
];

const SYSTEM_OPTIONS = [
    { id: 'userComputer', label: 'User Computer' },
    { id: 'email', label: 'E-Mail' },
    { id: 'dataAll', label: 'Data All' },
    { id: 'vpn', label: 'VPN' },
    { id: 'allWeb', label: 'All Web' },
    { id: 'wms', label: 'WMS' },
    { id: 'msDynamics365', label: 'MS Dynamics365' },
    { id: 'cyberHrm', label: 'Cyber HRM' },
];

const INITIAL_FORM_DATA = {
    employeeId: '',
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
        other: false,
    },
    otherSystemDetails: '',
    requestDetails: '',
};

const toDateInputValue = (value = new Date()) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (num) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const UserAccessRequestForm = ({ onCancel }) => {
    const signatureRef = useRef(null);
    const [signatureData, setSignatureData] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [formData, setFormData] = useState(INITIAL_FORM_DATA);

    const updateField = (name, value) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleChange = (event) => {
        updateField(event.target.name, event.target.value);
    };

    const handleSystemChange = (systemName) => {
        setFormData(prev => ({
            ...prev,
            systems: {
                ...prev.systems,
                [systemName]: !prev.systems[systemName],
            },
        }));
    };

    const validateForm = () => {
        if (!formData.employeeId || !formData.nameTh || !formData.department || !formData.position) {
            Swal.fire('ข้อมูลไม่ครบถ้วน', 'กรุณากรอกข้อมูลที่มีเครื่องหมาย * ให้ครบทุกช่อง', 'warning');
            return false;
        }

        if (!/^\d{6}$/.test(formData.employeeId)) {
            Swal.fire('รหัสพนักงานไม่ถูกต้อง', 'กรุณากรอกรหัสพนักงานเป็นตัวเลข 6 หลัก', 'warning');
            return false;
        }

        if (!Object.values(formData.systems).some(Boolean)) {
            Swal.fire('ยังไม่ได้เลือกระบบ', 'กรุณาเลือกระบบที่ต้องการร้องขออย่างน้อย 1 รายการ', 'warning');
            return false;
        }

        if (formData.systems.other && !formData.otherSystemDetails.trim()) {
            Swal.fire('ข้อมูลเพิ่มเติมไม่ครบ', 'กรุณาระบุรายละเอียดระบบอื่น ๆ ที่ต้องการ', 'warning');
            return false;
        }

        if (!signatureRef.current || signatureRef.current.isEmpty()) {
            Swal.fire('กรุณาลงนาม', 'กรุณาเซ็นชื่อในช่องลายมือชื่อผู้ขอใช้งานก่อนส่งคำร้อง', 'warning');
            return false;
        }

        return true;
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!validateForm()) return;

        const currentSignature = signatureRef.current.getCanvas().toDataURL('image/png');
        setSignatureData(currentSignature);
        setIsSubmitting(true);

        try {
            const { data: insertedData, generatedTicket } = await insertWithMonthlyDocumentNumber({
                mysql,
                table: 'access_requests',
                prefix: 'ITU ',
                buildRow: (ticketNumber) => ({
                    ticket_number: ticketNumber,
                    name_th: formData.nameTh,
                    name_en: formData.nameEn,
                    employee_id: formData.employeeId,
                    department: formData.department,
                    position: formData.position,
                    internal_phone: formData.internalPhone,
                    systems: JSON.stringify(formData.systems),
                    other_system_details: formData.otherSystemDetails,
                    request_details: formData.requestDetails,
                    status: 'Pending_Manager',
                    requester_sign: currentSignature,
                }),
            });

            const { data: existingEmployees } = await mysql
                .from('employees')
                .select('id, status')
                .eq('emp_id', formData.employeeId)
                .limit(1);

            if (existingEmployees?.length) {
                const { error } = await mysql
                    .from('employees')
                    .update({
                        name_th: formData.nameTh,
                        department: formData.department,
                    })
                    .eq('emp_id', formData.employeeId);
                if (error) throw error;
            } else {
                const { error } = await mysql.from('employees').insert([{
                    emp_id: formData.employeeId,
                    name_th: formData.nameTh,
                    department: formData.department,
                    start_date: toDateInputValue(),
                    status: 'ทำงาน',
                }]);
                if (error) throw error;
            }

            const reqId = insertedData[0].id;
            const approvalLink = buildManagerApprovalLink(reqId);

            await Swal.fire({
                icon: 'success',
                title: 'สร้างคำร้องสำเร็จ!',
                html: `
                    <div style="text-align:left;font-size:14px;margin-bottom:10px;">
                        <p>เลขที่ใบแจ้ง: <b>${generatedTicket}</b></p>
                        <p style="margin-top:10px;color:#ef4444;font-weight:bold;">สำคัญมาก:</p>
                        <p style="color:#4b5563;line-height:1.5;">กรุณาคัดลอกลิงก์ด้านล่างนี้ ส่งให้ <b>ผู้จัดการ/หัวหน้างาน</b> ของคุณเพื่อทำการอนุมัติ</p>
                    </div>
                    <div style="display:flex;gap:5px;">
                        <input type="text" id="approval-link" value="${approvalLink}" readonly style="flex:1;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;background:#f8fafc;" />
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
                },
                preConfirm: async () => {
                    await copyText(approvalLink);
                },
            });

            if (onCancel) {
                onCancel();
                return;
            }
            setFormData(INITIAL_FORM_DATA);
            setSignatureData(null);
            signatureRef.current?.clear();
        } catch (error) {
            console.error('Error submitting access request:', error);
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถส่งคำร้องได้ กรุณาติดต่อผู้ดูแลระบบ', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="w-full max-w-4xl mx-auto pb-10">
            <div className="text-center mb-8 animate-fade-in relative z-10 pt-4">
                <div className="inline-flex items-center justify-center p-3 sm:p-4 bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl shadow-xl shadow-amber-200/50 dark:shadow-amber-900/30 mb-4">
                    <UserPlus className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                </div>
                <h2 className="text-2xl xl:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-indigo-900 dark:from-white dark:to-indigo-300 mb-2 fit-text">
                    ฟอร์มขอเพิ่มบัญชีผู้ใช้งาน
                </h2>
                <p className="text-slate-500 dark:text-slate-400 font-medium text-sm xl:text-base max-w-lg mx-auto fit-text">
                    ใบขอเพิ่มบัญชีผู้ใช้งานระบบเทคโนโลยีสารสนเทศ (FMIT 12)
                </p>
                <div className="w-24 h-1.5 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full mx-auto mt-6 opacity-80" />
            </div>

            <form onSubmit={handleSubmit} className="glass-card rounded-3xl p-4 sm:p-6 xl:p-8 animate-slide-up relative bg-white dark:bg-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-700">
                <div className="mb-8">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                        <User className="w-5 h-5 text-indigo-500" /> ข้อมูลผู้ขอใช้บริการ
                    </h3>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                        <Field label="รหัสพนักงาน" required icon={User}>
                            <input
                                type="text"
                                name="employeeId"
                                value={formData.employeeId}
                                onChange={handleChange}
                                maxLength="6"
                                inputMode="numeric"
                                className="input-modern !pl-10 w-full"
                                placeholder="เช่น 001234"
                            />
                        </Field>

                        <Field label="ชื่อ-สกุล (ภาษาไทย)" required icon={User}>
                            <input
                                type="text"
                                name="nameTh"
                                value={formData.nameTh}
                                onChange={handleChange}
                                className="input-modern !pl-10 w-full"
                                placeholder="นาย/นาง/นางสาว..."
                            />
                        </Field>

                        <Field label="ชื่อ-สกุล (ภาษาอังกฤษ)" icon={Globe}>
                            <input
                                type="text"
                                name="nameEn"
                                value={formData.nameEn}
                                onChange={handleChange}
                                className="input-modern !pl-10 w-full"
                                placeholder="Mr./Ms..."
                            />
                        </Field>

                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                แผนก / ฝ่าย <span className="text-red-500">*</span>
                            </label>
                            <Combobox
                                options={DEPARTMENTS.map(dept => ({ label: dept, value: dept }))}
                                value={formData.department}
                                onValueChange={(value) => updateField('department', value)}
                                placeholder="ระบุแผนก..."
                                searchPlaceholder="ค้นหาแผนก..."
                            />
                        </div>

                        <Field label="ตำแหน่ง" required icon={Briefcase}>
                            <input
                                type="text"
                                name="position"
                                value={formData.position}
                                onChange={handleChange}
                                className="input-modern !pl-10 w-full"
                                placeholder="ระบุตำแหน่ง..."
                            />
                        </Field>

                        <Field label="เบอร์โทรภายใน" icon={Phone}>
                            <input
                                type="tel"
                                name="internalPhone"
                                value={formData.internalPhone}
                                onChange={handleChange}
                                className="input-modern !pl-10 w-full"
                                placeholder="เช่น 1234"
                            />
                        </Field>
                    </div>
                </div>

                <div className="mb-8">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                        <LayoutGrid className="w-5 h-5 text-indigo-500" />
                        ส่วนร้องขอใช้ระบบงาน
                        <span className="text-red-500 text-sm font-normal ml-1">*เลือกอย่างน้อย 1 รายการ</span>
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 xl:gap-4 p-3 sm:p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                        {SYSTEM_OPTIONS.map((sys) => (
                            <label key={sys.id} className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer border transition-all ${formData.systems[sys.id] ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600'}`}>
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                                    checked={formData.systems[sys.id]}
                                    onChange={() => handleSystemChange(sys.id)}
                                />
                                <span className={`text-sm font-medium ${formData.systems[sys.id] ? 'text-indigo-800 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-300'}`}>
                                    {sys.label}
                                </span>
                            </label>
                        ))}

                        <label className={`sm:col-span-2 xl:col-span-4 flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${formData.systems.other ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600'}`}>
                            <input
                                type="checkbox"
                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                                checked={formData.systems.other}
                                onChange={() => handleSystemChange('other')}
                            />
                            <span className="text-sm font-medium sm:whitespace-nowrap">อื่น ๆ ระบุ:</span>
                            <input
                                type="text"
                                name="otherSystemDetails"
                                value={formData.otherSystemDetails}
                                onChange={handleChange}
                                disabled={!formData.systems.other}
                                className="flex-1 bg-transparent border-b outline-none text-sm transition-all focus:border-indigo-500 border-slate-300 disabled:cursor-not-allowed disabled:text-slate-400"
                                placeholder="โปรดระบุระบบ..."
                            />
                        </label>
                    </div>
                </div>

                <div className="mb-8">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                        <FileText className="w-5 h-5 text-indigo-500" /> รายละเอียดการร้องขอ
                    </h3>
                    <textarea
                        name="requestDetails"
                        value={formData.requestDetails}
                        onChange={handleChange}
                        className="input-modern w-full min-h-[120px] resize-y p-4"
                        placeholder="ระบุวัตถุประสงค์หรือรายละเอียดเพิ่มเติมที่ต้องการให้ฝ่าย IT ทราบ..."
                    />
                </div>

                <div className="mb-8 p-4 sm:p-6 rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700">
                    <div className="flex flex-col gap-2 min-[360px]:flex-row min-[360px]:items-center min-[360px]:justify-between mb-4">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <span className="text-red-500">*</span> ลายมือชื่อผู้ขอใช้งาน
                        </h3>
                        <button type="button" onClick={() => signatureRef.current?.clear()} className="self-end shrink-0 whitespace-nowrap text-xs text-red-500 hover:text-red-600 font-semibold">
                            ล้างลายเซ็น
                        </button>
                    </div>
                    <div className="border border-dashed border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900/50 overflow-hidden relative h-[150px]">
                        <SignatureCanvas ref={signatureRef} penColor="black" canvasProps={{ className: 'signature-canvas w-full h-full xl-signature' }} />
                        <div className="absolute bottom-2 right-4 text-slate-400 text-xs pointer-events-none opacity-50">
                            เซ็นชื่อในกรอบนี้
                        </div>
                    </div>
                </div>

                <div className="bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 p-4 rounded-xl flex gap-3 items-start mb-8 text-sm border border-amber-100 dark:border-amber-900/50">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-orange-500 dark:text-orange-300" />
                    <div>
                        <span className="font-semibold block mb-1">หมายเหตุการขอสิทธิ์</span>
                        การขอสิทธิ์ในบางระบบ เช่น MS Dynamics365 หรือ VPN อาจต้องได้รับการอนุมัติจากผู้จัดการฝ่ายหรือผู้อำนวยการก่อนดำเนินการ
                    </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row justify-end items-center gap-3 pt-6 border-t border-slate-100 dark:border-slate-700">
                    {onCancel && (
                        <button type="button" onClick={onCancel} className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition border border-amber-100 dark:border-amber-900/50">
                            ยกเลิก
                        </button>
                    )}
                    <button type="button" onClick={() => setIsPreviewOpen(true)} className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/30 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition flex items-center justify-center gap-2 border border-orange-200 dark:border-orange-900/50">
                        <Printer className="w-5 h-5" />
                        ดูตัวอย่างแบบฟอร์ม (PDF)
                    </button>
                    <button type="submit" disabled={isSubmitting} className="w-full sm:w-auto overflow-hidden relative group rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-2.5 font-bold text-white shadow-lg shadow-amber-500/30 transition-all duration-200 hover:from-amber-600 hover:to-orange-600 disabled:cursor-not-allowed disabled:opacity-70">
                        <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                        <div className="flex items-center justify-center gap-2 relative z-10">
                            {isSubmitting ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>กำลังบันทึก...</span>
                                </>
                            ) : (
                                <>
                                    <Save className="w-5 h-5" />
                                    <span>บันทึก</span>
                                </>
                            )}
                        </div>
                    </button>
                </div>
            </form>

            <Fmit12PdfPreview
                isOpen={isPreviewOpen}
                onClose={() => setIsPreviewOpen(false)}
                formData={{ ...formData, requesterSign: signatureData, requesterDate: new Date().toISOString() }}
            />
        </div>
    );
};

const Field = ({ label, required = false, icon: Icon, children }) => (
    <div className="space-y-1.5">
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {label} {required && <span className="text-red-500">*</span>}
        </label>
        <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Icon className="w-4 h-4" />
            </span>
            {children}
        </div>
    </div>
);

export default UserAccessRequestForm;
