import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';
import { X, Download, Printer } from 'lucide-react';
import Swal from 'sweetalert2';

const MaintenanceReportPdfPreview = ({ isOpen, onClose, formData }) => {
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
            pdf.save(`Maintenance_Report_${formData.id || Date.now()}.pdf`);
        } catch (error) {
            console.error("Error generating PDF", error);
            Swal.fire('Error', 'ไม่สามารถสร้างไฟล์ PDF ได้', 'error');
        }
    };

    if (!isOpen || !formData) return null;

    const printDate = new Date(formData.createdAt).toLocaleDateString('th-TH', { 
        year: '2-digit', 
        month: '2-digit', 
        day: '2-digit' 
    }).replace(/\//g, '/');

    const getStatusBadgeText = (status) => {
        switch (status) {
            case 'Pending':
                return 'รอดำเนินการ';
            case 'In Progress':
                return 'กำลังแก้ไข';
            case 'Resolved':
                return 'เสร็จสิ้น';
            default:
                return status;
        }
    };

    const getSeverityText = (severity) => {
        switch (severity) {
            case 'Low':
                return 'ต่ำ';
            case 'Normal':
                return 'ปกติ';
            case 'High':
                return 'สูง';
            case 'Critical':
                return 'ฉุกเฉิน';
            default:
                return severity;
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
            <div className="bg-slate-100 dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col border border-white/20 dark:border-slate-700 overflow-hidden my-auto h-[calc(100dvh-1rem)] sm:h-[90vh]">

                {/* Modal Toolbar */}
                <div className="flex justify-between items-center p-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0">
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">รายงานใบแจ้งซ่อม</h2>
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
                            color: '#000',
                            fontFamily: 'Sarabun, "Segoe UI", Tahoma, sans-serif',
                            position: 'relative',
                            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
                            padding: '35px 40px',
                            boxSizing: 'border-box'
                        }}
                    >
                        {/* Header Section */}
                        <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '3px solid #1e293b', paddingBottom: '15px' }}>
                            {/* Logo */}
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '8px' }}>
                                <img 
                                    src="/vava-pack-logo.png" 
                                    alt="VAVA PACK Logo" 
                                    style={{ height: '40px', objectFit: 'contain' }}
                                    onError={(e) => { 
                                        e.target.style.display = 'none'; 
                                        e.target.nextElementSibling.style.display = 'flex'; 
                                    }} 
                                />
                                <div style={{ display: 'none', justifyContent: 'center', alignItems: 'center' }}>
                                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#cc0000', marginRight: '10px' }}>VA</div>
                                    <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#cc0000', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                        <span>VAVA PACK</span>
                                    </div>
                                </div>
                                <span style={{ marginLeft: '12px', fontSize: '18px', fontWeight: 'bold', color: '#1e293b' }}>บริษัท วาวา แพ็ค จำกัด</span>
                            </div>
                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e293b', marginTop: '8px' }}>
                                ใบแจ้งซ่อม / Maintenance Request Report
                            </div>
                        </div>

                        {/* Reference Number & Date */}
                        <table style={{ width: '100%', marginBottom: '15px', borderCollapse: 'collapse' }}>
                            <tbody>
                                <tr>
                                    <td style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', width: '30%' }}>
                                        เลขที่ใบแจ้ง:
                                    </td>
                                    <td style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px' }}>
                                        {formData.id || '—'}
                                    </td>
                                    <td style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', width: '25%', paddingLeft: '25px' }}>
                                        วันที่แจ้ง:
                                    </td>
                                    <td style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px' }}>
                                        {printDate}
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        {/* User Information Section */}
                        <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px', paddingTop: '8px', borderTop: '2px solid #e2e8f0' }}>
                            ข้อมูลผู้แจ้ง (Reporter Information)
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '15px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc' }}>
                            <tbody>
                                <tr>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px', fontWeight: '600', width: '20%', backgroundColor: '#e2e8f0' }}>ชื่อ-สกุล:</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px' }}>{formData.name || '—'}</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px', fontWeight: '600', width: '20%', backgroundColor: '#e2e8f0' }}>แผนก/ฝ่าย:</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px' }}>{formData.department || '—'}</td>
                                </tr>
                            </tbody>
                        </table>

                        {/* Issue Details Section */}
                        <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px', paddingTop: '8px', borderTop: '2px solid #e2e8f0' }}>
                            รายละเอียดการแจ้งซ่อม (Issue Details)
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '15px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc' }}>
                            <tbody>
                                <tr>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px', fontWeight: '600', width: '20%', backgroundColor: '#e2e8f0' }}>หมวดหมู่:</td>
                                    <td colSpan="3" style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px' }}>{formData.category || '—'}</td>
                                </tr>
                                <tr>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px', fontWeight: '600', backgroundColor: '#e2e8f0' }}>อุปกรณ์/ระบบ:</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px' }}>{formData.assetName || '—'}</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px', fontWeight: '600', backgroundColor: '#e2e8f0' }}>รหัส:</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px' }}>{formData.assetId || '—'}</td>
                                </tr>
                                <tr>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px', fontWeight: '600', backgroundColor: '#e2e8f0' }}>ระดับความสำคัญ:</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px' }}>
                                        <span style={{
                                            display: 'inline-block',
                                            padding: '3px 8px',
                                            borderRadius: '4px',
                                            fontSize: '12px',
                                            fontWeight: '600',
                                            backgroundColor: formData.severity === 'Critical' ? '#fee2e2' : 
                                                           formData.severity === 'High' ? '#fef3c7' :
                                                           formData.severity === 'Normal' ? '#dbeafe' : '#d1fae5',
                                            color: formData.severity === 'Critical' ? '#991b1b' : 
                                                   formData.severity === 'High' ? '#92400e' :
                                                   formData.severity === 'Normal' ? '#1e40af' : '#065f46'
                                        }}>
                                            {getSeverityText(formData.severity)}
                                        </span>
                                    </td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px', fontWeight: '600', backgroundColor: '#e2e8f0' }}>สถานะ:</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px' }}>
                                        <span style={{
                                            display: 'inline-block',
                                            padding: '3px 8px',
                                            borderRadius: '4px',
                                            fontSize: '12px',
                                            fontWeight: '600',
                                            backgroundColor: formData.status === 'Resolved' ? '#d1fae5' : 
                                                           formData.status === 'In Progress' ? '#dbeafe' : '#fef3c7',
                                            color: formData.status === 'Resolved' ? '#065f46' : 
                                                   formData.status === 'In Progress' ? '#1e40af' : '#92400e'
                                        }}>
                                            {getStatusBadgeText(formData.status)}
                                        </span>
                                    </td>
                                </tr>
                                <tr>
                                    <td colSpan="4" style={{ border: '1px solid #cbd5e1', padding: '10px 12px', fontSize: '13px', fontWeight: '600', backgroundColor: '#e2e8f0', verticalAlign: 'top' }}>
                                        รายละเอียดปัญหา:
                                    </td>
                                </tr>
                                <tr>
                                    <td colSpan="4" style={{ border: '1px solid #cbd5e1', padding: '12px', fontSize: '13px', minHeight: '60px', lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                        {formData.description || '—'}
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        {/* Additional Information */}
                        <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px', paddingTop: '8px', borderTop: '2px solid #e2e8f0' }}>
                            ข้อมูลเพิ่มเติม (Additional Information)
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc' }}>
                            <tbody>
                                <tr>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px', fontWeight: '600', width: '50%', backgroundColor: '#e2e8f0' }}>
                                        วันที่สร้างใบแจ้ง:
                                    </td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px' }}>
                                        {printDate}
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        {/* Signature Section */}
                        <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#1e293b', marginBottom: '20px', paddingTop: '15px', borderTop: '2px solid #e2e8f0' }}>
                            ความเห็นของผู้บันทึก (Recorder)
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '35px', minHeight: '100px' }}>
                            <div style={{ textAlign: 'center', width: '48%' }}>
                                <div style={{ borderBottom: '1px dotted #000', height: '45px', marginBottom: '12px' }}></div>
                                <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '6px' }}>ลงชื่อผู้บันทึก</div>
                                <div style={{ fontSize: '13px', marginBottom: '4px' }}>(...........................................................................)</div>
                                <div style={{ fontSize: '13px' }}>วันที่ ....../....../.....</div>
                            </div>
                            <div style={{ textAlign: 'center', width: '48%' }}>
                                <div style={{ borderBottom: '1px dotted #000', height: '45px', marginBottom: '12px' }}></div>
                                <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '6px' }}>ผู้อนุมัติ</div>
                                <div style={{ fontSize: '13px', marginBottom: '4px' }}>(...........................................................................)</div>
                                <div style={{ fontSize: '13px' }}>วันที่ ....../....../.....</div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{ 
                            marginTop: '40px', 
                            paddingTop: '15px', 
                            borderTop: '2px solid #cbd5e1', 
                            textAlign: 'center', 
                            fontSize: '11px', 
                            color: '#64748b' 
                        }}>
                            <div>เอกสารนี้ได้รับการสร้างจากระบบ IT Helpdesk</div>
                            <div>Generated by IT Helpdesk System</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default MaintenanceReportPdfPreview;
