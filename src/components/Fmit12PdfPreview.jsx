import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';
import { X, Download, Printer } from 'lucide-react';
import Swal from 'sweetalert2';

const Fmit12PdfPreview = ({ isOpen, onClose, formData }) => {
    const previewRef = useRef(null);

    const handleDownloadPdf = async () => {
        if (!previewRef.current) return;

        try {
            const canvas = await html2canvas(previewRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff'
            });
            const imgData = canvas.toDataURL('image/jpeg', 1.0);

            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`FMIT12_Request.pdf`);
        } catch (error) {
            console.error("Error generating PDF", error);
            Swal.fire('Error', 'ไม่สามารถสร้างไฟล์ PDF ได้', 'error');
        }
    };

    if (!isOpen || !formData) return null;

    const printDate = new Date().toLocaleDateString('th-TH', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\//g, '/');

    const CheckBox = ({ checked }) => (
        <div style={{ 
            width: '14px', 
            height: '14px', 
            border: '1px solid #000', 
            margin: '0 auto', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            fontSize: '12px'
        }}>
            {checked ? '✓' : ''}
        </div>
    );

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
            <div className="bg-slate-100 dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col border border-white/20 dark:border-slate-700 overflow-hidden my-auto h-[90vh]">

                {/* Modal Toolbar */}
                <div className="flex justify-between items-center p-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0">
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">ตัวอย่างแบบฟอร์ม FMIT 12</h2>
                    <div className="flex gap-2.5">
                        <button
                            onClick={handleDownloadPdf}
                            className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-md flex items-center gap-2 transition-transform hover:-translate-y-0.5"
                        >
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">ดาวน์โหลด PDF</span>
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl transition-colors shadow-sm"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Scrollable Preview Area */}
                <div className="flex-1 overflow-auto p-6 bg-slate-200/60 dark:bg-slate-800 flex justify-center">
                    {/* A4 Paper */}
                    <div
                        ref={previewRef}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            background: 'white',
                            width: '210mm',
                            minHeight: '297mm',
                            height: 'max-content',
                            color: '#000', // Black text for formal document
                            fontFamily: 'Sarabun, "Segoe UI", Tahoma, sans-serif',
                            position: 'relative',
                            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
                            padding: '30px 40px', // Adjusted margins for bigger font
                            boxSizing: 'border-box'
                        }}
                    >
                        {/* Header Section */}
                        <div style={{ textAlign: 'center', marginBottom: '15px' }}>
                            {/* Logo */}
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '5px' }}>
                                <img 
                                    src="/vava-pack-logo.png" 
                                    alt="VAVA PACK Logo" 
                                    style={{ height: '35px', objectFit: 'contain' }}
                                    onError={(e) => { 
                                        e.target.style.display = 'none'; 
                                        e.target.nextElementSibling.style.display = 'flex'; 
                                    }} 
                                />
                                {/* Fallback text if logo image is not found */}
                                <div style={{ display: 'none', justifyContent: 'center', alignItems: 'center' }}>
                                    <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#cc0000', marginRight: '10px' }}>VA</div>
                                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#cc0000', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                        <span>VAVA PACK</span>
                                    </div>
                                </div>
                                <span style={{ marginLeft: '10px', fontSize: '16px', fontWeight: 'bold' }}>บริษัท วาวา แพ็ค จำกัด</span>
                            </div>
                            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                                ใบขอเพิ่มบัญชีผู้ใช้งานระบบเทคโนโลยีสารสนเทศ (FMIT 12)
                            </div>
                        </div>

                        {/* Top Info Table */}
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px', border: '1px solid #000' }}>
                            <tbody>
                                <tr>
                                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: '14px', width: '20%' }}>ชื่อผู้แจ้ง :</td>
                                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: '14px', width: '30%' }}>{formData.nameTh}</td>
                                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: '14px', width: '20%' }}>เลขที่ใบแจ้ง:</td>
                                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: '14px', width: '30%', fontWeight: 'bold' }}>{formData.ticketNumber || 'ITU ...................../.....................'}</td>
                                </tr>
                                <tr>
                                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: '14px' }}>วันที่แจ้ง :</td>
                                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: '14px' }}>{printDate}</td>
                                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: '14px' }}>ผู้รับแจ้ง:</td>
                                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: '14px' }}>.............../.............../...............</td>
                                </tr>
                            </tbody>
                        </table>

                        {/* User Info Table */}
                        <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '2px' }}>ข้อมูลผู้ขอใช้บริการ (กรุณากรอกข้อความให้ชัดเจน)</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px', border: '1px solid #000' }}>
                            <tbody>
                                <tr>
                                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: '14px', width: '25%' }}>ชื่อ-สกุล (ภาษาไทย) :</td>
                                    <td colSpan="3" style={{ border: '1px solid #000', padding: '4px 8px', fontSize: '14px' }}>{formData.nameTh}</td>
                                </tr>
                                <tr>
                                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: '14px' }}>ชื่อ-สกุล (ภาษาอังกฤษ) :</td>
                                    <td colSpan="3" style={{ border: '1px solid #000', padding: '4px 8px', fontSize: '14px' }}>{formData.nameEn}</td>
                                </tr>
                                <tr>
                                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: '14px' }}>แผนก / ฝ่าย :</td>
                                    <td colSpan="3" style={{ border: '1px solid #000', padding: '4px 8px', fontSize: '14px' }}>{formData.department}</td>
                                </tr>
                                <tr>
                                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: '14px' }}>ตำแหน่ง :</td>
                                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: '14px', width: '35%' }}>{formData.position}</td>
                                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: '14px', width: '15%', whiteSpace: 'nowrap' }}>เบอร์โทรภายใน :</td>
                                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: '14px', width: '25%' }}>{formData.internalPhone}</td>
                                </tr>
                                <tr>
                                    <td colSpan="4" style={{ border: '1px solid #000', padding: '10px 8px 6px 8px', fontSize: '14px' }}>
                                        <div>ลงนาม</div>
                                        <div style={{ marginTop: '5px', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start', gap: '30px', width: '100%' }}>
                                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '5px' }}>
                                                <div style={{ borderBottom: '1px dotted #000', width: '200px', display: 'flex', justifyContent: 'center', height: '40px' }}>
                                                    {formData.requesterSign && <img src={formData.requesterSign} alt="Requester Sign" style={{ height: '40px', objectFit: 'contain' }} />}
                                                </div>
                                                <span>ผู้ขอใช้งาน</span>
                                            </div>
                                            <span>วันที่ ............/............/............</span>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        {/* Approval Section */}
                        <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '2px' }}>ผู้อนุมัติ</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px', border: '1px solid #000' }}>
                            <tbody>
                                <tr>
                                    <td style={{ border: '1px solid #000', padding: '4px 8px 10px 8px', fontSize: '14px', width: '50%', verticalAlign: 'top' }}>
                                        <div style={{ fontWeight: 'bold', textDecoration: 'underline', marginBottom: '15px' }}>ลงนาม หน./ผจก. แผนก/ฝ่าย ต้นสังกัด :</div>
                                        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '30px', alignItems: 'flex-end', width: '100%' }}>
                                            <div style={{ borderBottom: '1px dotted #000', width: '130px', display: 'flex', justifyContent: 'center', height: '40px' }}>
                                                {formData.managerSign && <img src={formData.managerSign} alt="Manager Sign" style={{ height: '40px', objectFit: 'contain' }} />}
                                            </div>
                                            <span>วันที่ ......./......./.......</span>
                                        </div>
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '4px 8px 10px 8px', fontSize: '14px', width: '50%', verticalAlign: 'top', backgroundColor: '#e2e8f0' }}>
                                        <div style={{ fontWeight: 'bold', textDecoration: 'underline', marginBottom: '15px' }}>ลงนามหัวหน้าแผนก IT :</div>
                                        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '30px', alignItems: 'flex-end', width: '100%' }}>
                                            <div style={{ borderBottom: '1px dotted #000', width: '130px', display: 'flex', justifyContent: 'center', height: '40px' }}>
                                                {formData.itManagerSign && <img src={formData.itManagerSign} alt="IT Manager Sign" style={{ height: '40px', objectFit: 'contain' }} />}
                                            </div>
                                            <span>วันที่ ......./......./.......</span>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        {/* System Request Section */}
                        <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '2px' }}>ส่วนร้องขอใช้ระบบงาน</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px', border: '1px solid #000', textAlign: 'center' }}>
                            <thead>
                                <tr>
                                    <td style={{ border: '1px solid #000', padding: '4px', fontSize: '12px', fontWeight: 'bold', width: '11%' }}>User<br/>Computer</td>
                                    <td style={{ border: '1px solid #000', padding: '4px', fontSize: '12px', fontWeight: 'bold', width: '11%' }}>E-Mail</td>
                                    <td style={{ border: '1px solid #000', padding: '4px', fontSize: '12px', fontWeight: 'bold', width: '11%' }}>Data All</td>
                                    <td style={{ border: '1px solid #000', padding: '4px', fontSize: '12px', fontWeight: 'bold', width: '11%' }}>VPN</td>
                                    <td style={{ border: '1px solid #000', padding: '4px', fontSize: '12px', fontWeight: 'bold', width: '11%' }}>All Web</td>
                                    <td style={{ border: '1px solid #000', padding: '4px', fontSize: '12px', fontWeight: 'bold', width: '11%' }}>WMS</td>
                                    <td style={{ border: '1px solid #000', padding: '4px', fontSize: '12px', fontWeight: 'bold', width: '11%' }}>MS<br/>Dynamics365</td>
                                    <td style={{ border: '1px solid #000', padding: '4px', fontSize: '12px', fontWeight: 'bold', width: '12%' }}>Cyber HRM</td>
                                    <td style={{ border: '1px solid #000', padding: '4px', fontSize: '12px', fontWeight: 'bold', width: '11%' }}>อื่น ๆ</td>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style={{ border: '1px solid #000', padding: '6px' }}><CheckBox checked={formData.systems.userComputer} /></td>
                                    <td style={{ border: '1px solid #000', padding: '6px' }}><CheckBox checked={formData.systems.email} /></td>
                                    <td style={{ border: '1px solid #000', padding: '6px' }}><CheckBox checked={formData.systems.dataAll} /></td>
                                    <td style={{ border: '1px solid #000', padding: '6px' }}><CheckBox checked={formData.systems.vpn} /></td>
                                    <td style={{ border: '1px solid #000', padding: '6px' }}><CheckBox checked={formData.systems.allWeb} /></td>
                                    <td style={{ border: '1px solid #000', padding: '6px' }}><CheckBox checked={formData.systems.wms} /></td>
                                    <td style={{ border: '1px solid #000', padding: '6px' }}><CheckBox checked={formData.systems.msDynamics365} /></td>
                                    <td style={{ border: '1px solid #000', padding: '6px' }}><CheckBox checked={formData.systems.cyberHrm} /></td>
                                    <td style={{ border: '1px solid #000', padding: '6px' }}>
                                        <CheckBox checked={formData.systems.other} />
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        {/* Request Details */}
                        <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '5px' }}>รายละเอียดการร้องขอ</div>
                        <div style={{ 
                            fontSize: '14px', 
                            lineHeight: '20px', 
                            borderBottom: '1px dotted #000', 
                            minHeight: '20px',
                            paddingBottom: '2px',
                            wordBreak: 'break-word',
                            position: 'relative'
                        }}>
                            {formData.systems.other && <span>ระบบอื่นๆ: {formData.otherSystemDetails} </span>}
                            {formData.requestDetails}
                        </div>
                        <div style={{ borderBottom: '1px dotted #000', marginTop: '20px' }}></div>
                        <div style={{ borderBottom: '1px dotted #000', marginTop: '20px', marginBottom: '15px' }}></div>


                        {/* Acknowledgment Section */}
                        <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '2px' }}>ส่วนรับทราบผลการปฏิบัติงาน</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px', border: '1px solid #000' }}>
                            <tbody>
                                <tr>
                                    <td style={{ border: '1px solid #000', padding: '4px 8px 6px 8px', fontSize: '14px', width: '50%', verticalAlign: 'top' }}>
                                        <div style={{ fontWeight: 'bold', textDecoration: 'underline', marginBottom: '15px' }}>ผู้แจ้งงานลงนามรับทราบผล การใช้งาน :</div>
                                        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '30px', alignItems: 'flex-end', width: '100%' }}>
                                            <div style={{ borderBottom: '1px dotted #000', width: '130px', display: 'flex', justifyContent: 'center', height: '40px' }}>
                                                {formData.requesterSign && <img src={formData.requesterSign} alt="Requester Sign" style={{ height: '40px', objectFit: 'contain' }} />}
                                            </div>
                                            <span>วันที่ ......./......./.......</span>
                                        </div>
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '4px 8px 6px 8px', fontSize: '14px', width: '50%', verticalAlign: 'top' }}>
                                        <div style={{ fontWeight: 'bold', textDecoration: 'underline', marginBottom: '15px' }}>ลงนามผู้ปฏิบัติงาน ผู้ติดตั้งการใช้งาน :</div>
                                        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '30px', alignItems: 'flex-end', width: '100%' }}>
                                            <div style={{ borderBottom: '1px dotted #000', width: '130px', display: 'flex', justifyContent: 'center', height: '40px' }}>
                                                {formData.itSign && <img src={formData.itSign} alt="IT Sign" style={{ height: '40px', objectFit: 'contain' }} />}
                                            </div>
                                            <span>วันที่ ......./......./.......</span>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        {/* Specific Systems Sections */}
                        <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '2px' }}>ส่วนขอเข้าใช้งานระบบงาน เฉพาะ MS Dynamics365 และ WMS</div>
                        <table style={{ width: '50%', borderCollapse: 'collapse', marginBottom: '10px', border: '1px solid #000' }}>
                            <tbody>
                                <tr>
                                    <td style={{ border: '1px solid #000', padding: '4px 8px 6px 8px', fontSize: '14px', verticalAlign: 'top' }}>
                                        <div style={{ fontWeight: 'bold', textDecoration: 'underline', marginBottom: '15px' }}>ลงนามผู้อนุมัติ การเข้าใช้งานระบบ :</div>
                                        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '30px', alignItems: 'flex-end', width: '100%' }}>
                                            <div style={{ borderBottom: '1px dotted #000', width: '130px', display: 'flex', justifyContent: 'center', height: '40px' }}>
                                                {formData.managerSign && <img src={formData.managerSign} alt="Manager Sign" style={{ height: '40px', objectFit: 'contain' }} />}
                                            </div>
                                            <span>วันที่ ......./......./.......</span>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '2px' }}>ส่วนยกเลิกการใช้งาน</div>
                        <table style={{ width: '50%', borderCollapse: 'collapse', marginBottom: '15px', border: '1px solid #000' }}>
                            <tbody>
                                <tr>
                                    <td style={{ border: '1px solid #000', padding: '4px 8px 6px 8px', fontSize: '14px', verticalAlign: 'top' }}>
                                        <div style={{ fontWeight: 'bold', textDecoration: 'underline', marginBottom: '15px' }}>ลงนามผู้ปฏิบัติงาน ผู้ยกเลิกการใช้งาน :</div>
                                        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '30px' }}>
                                            <span>..........................................</span>
                                            <span>วันที่ ......./......./.......</span>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        {/* Footer */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 'bold', marginTop: 'auto', paddingTop: '10px' }}>
                            <div>Revision NO : 03</div>
                            <div>Date of Issue : 26.11.25</div>
                        </div>

                    </div>
                </div>

            </div>
        </div>,
        document.body
    );
};

export default Fmit12PdfPreview;
