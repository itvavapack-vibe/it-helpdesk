import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';
import { X, Download, Printer } from 'lucide-react';
import Swal from 'sweetalert2';

const AUTO_CLOSE_NOTE = 'Auto closed after requester did not sign within 3 days.';

const MaintenanceReportPdfPreview = ({ isOpen, onClose, formData }) => {
    const previewRef = useRef(null);

    const handleDownloadPdf = async () => {
        if (!previewRef.current) return;

        try {
            await document.fonts?.ready;
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

    const handlePrint = async () => {
        if (!previewRef.current) return;

        const printFrame = document.createElement('iframe');
        printFrame.setAttribute('title', 'พิมพ์รายงานใบแจ้งซ่อม');
        printFrame.style.position = 'fixed';
        printFrame.style.right = '0';
        printFrame.style.bottom = '0';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = '0';
        document.body.appendChild(printFrame);
        const cleanupPrintFrame = () => printFrame.remove();

        try {
            const printDocument = printFrame.contentDocument;
            if (!printDocument) throw new Error('Print document is unavailable');

            printDocument.open();
            printDocument.write(`
                <!doctype html>
                <html>
                    <head>
                        <base href="${document.baseURI}">
                        <title>Maintenance Report ${formData.id || ''}</title>
                        <style>
                            @page { size: A4 portrait; margin: 0; }
                            html, body {
                                width: 210mm;
                                height: 297mm;
                                margin: 0;
                                padding: 0;
                                overflow: hidden;
                                background: #fff;
                            }
                            body {
                                -webkit-print-color-adjust: exact;
                                print-color-adjust: exact;
                            }
                            #print-page {
                                width: 210mm;
                                height: 297mm;
                                overflow: hidden;
                                page-break-after: avoid;
                                break-after: avoid-page;
                            }
                            #print-report {
                                box-shadow: none !important;
                                transform-origin: top left;
                            }
                        </style>
                    </head>
                    <body><div id="print-page">${previewRef.current.outerHTML}</div></body>
                </html>
            `);
            printDocument.close();

            await printDocument.fonts?.ready;
            await Promise.all(Array.from(printDocument.images).map((image) => {
                if (image.complete) return Promise.resolve();
                return new Promise((resolve) => {
                    image.onload = resolve;
                    image.onerror = resolve;
                });
            }));

            const printPage = printDocument.getElementById('print-page');
            const printReport = printPage?.firstElementChild;
            if (!printPage || !printReport) throw new Error('Print report is unavailable');

            printReport.id = 'print-report';
            const availableWidth = printPage.clientWidth;
            const availableHeight = printPage.clientHeight - 4;
            const printScale = Math.min(
                1,
                availableWidth / printReport.scrollWidth,
                availableHeight / printReport.scrollHeight
            );
            printReport.style.transform = `scale(${printScale})`;

            const printWindow = printFrame.contentWindow;
            if (!printWindow) throw new Error('Print window is unavailable');

            printWindow.onafterprint = cleanupPrintFrame;
            printWindow.focus();
            printWindow.print();
            window.setTimeout(cleanupPrintFrame, 60000);
        } catch (error) {
            console.error('Error printing report', error);
            cleanupPrintFrame();
            Swal.fire('Error', 'ไม่สามารถเปิดหน้าต่างพิมพ์ได้', 'error');
        }
    };

    if (!isOpen || !formData) return null;

    const formatReportDate = (value) => {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('th-TH', {
            year: '2-digit',
            month: '2-digit',
            day: '2-digit'
        });
    };

    const printDate = formatReportDate(formData.createdAt);
    const isAutoClosed = formData.userCloseNote === AUTO_CLOSE_NOTE && !formData.userCloseSign;
    const autoCloseSignatureName = formData.userCloseName || formData.name || '-';

    const getSeverityText = (severity) => {
        switch (severity) {
            case 'Most Urgent':
                return 'ด่วนที่สุด';
            case 'Urgent':
                return 'ด่วน';
            case 'Normal':
                return 'ปกติ';
            default:
                return severity || '-';
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
                            onClick={handlePrint}
                            className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-md flex items-center gap-2 transition-transform hover:-translate-y-0.5"
                        >
                            <Printer className="w-4 h-4" />
                            <span className="hidden sm:inline">พิมพ์</span>
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
                                ใบแจ้งซ่อม (FMIT 01)
                                <br />
                                Maintenance Request Report
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
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px', fontWeight: '600', backgroundColor: '#e2e8f0' }}>ชื่ออุปกรณ์:</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px' }}>{formData.assetName || '—'}</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px', fontWeight: '600', backgroundColor: '#e2e8f0' }}>ประเภทอุปกรณ์:</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px' }}>{formData.assetType || '—'}</td>
                                </tr>
                                <tr>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px', fontWeight: '600', backgroundColor: '#e2e8f0' }}>สถานที่ติดตั้ง:</td>
                                    <td colSpan="3" style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px' }}>{formData.assetLocation || '—'}</td>
                                </tr>
                                <tr>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px', fontWeight: '600', backgroundColor: '#e2e8f0' }}>ระดับความสำคัญ:</td>
                                    <td colSpan="3" style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px' }}>
                                        <span style={{
                                            display: 'inline-block',
                                            padding: '3px 8px',
                                            borderRadius: '4px',
                                            fontSize: '12px',
                                            fontWeight: '600',
                                            backgroundColor: formData.severity === 'Most Urgent' ? '#fee2e2' :
                                                           formData.severity === 'Urgent' ? '#fef3c7' : '#dbeafe',
                                            color: formData.severity === 'Most Urgent' ? '#991b1b' :
                                                   formData.severity === 'Urgent' ? '#92400e' : '#1e40af'
                                        }}>
                                            {getSeverityText(formData.severity)}
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
                                        วันที่ดำเนินการ:
                                    </td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px' }}>
                                        {formatReportDate(formData.operationStartedAt)}
                                    </td>
                                </tr>
                                <tr>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px', fontWeight: '600', width: '50%', backgroundColor: '#e2e8f0' }}>
                                        วันที่แล้วเสร็จ:
                                    </td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px' }}>
                                        {formatReportDate(formData.userClosedAt)}
                                    </td>
                                </tr>
                                <tr>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px', fontWeight: '600', width: '50%', backgroundColor: '#e2e8f0' }}>
                                        งบประมาณ:
                                    </td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: '13px' }}>
                                        {formData.budget === null || formData.budget === undefined || formData.budget === '' ? '-' : Number(formData.budget).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        {/* Signature Section */}
                        <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#1e293b', marginBottom: '20px', paddingTop: '15px', borderTop: '2px solid #e2e8f0' }}>
                            แนวทางแก้ไข/ความคิดเห็น
                        </div>
                        <div style={{ border: '1px solid #cbd5e1', padding: '12px', marginBottom: '20px', minHeight: '54px', fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-word', backgroundColor: '#f8fafc' }}>
                            {formData.repairDetails || '-'}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '44px', marginTop: '20px', minHeight: '145px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: '42%' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px dotted #000', height: '55px', margin: '0 auto 10px', width: '82%' }}>
                                    {formData.userCloseSign && <img src={formData.userCloseSign} alt="ลายเซ็นผู้แจ้ง" style={{ display: 'block', maxHeight: '52px', maxWidth: '100%', objectFit: 'contain', margin: '0 auto' }} />}
                                    {isAutoClosed && (
                                        <div style={{ fontSize: '13px', lineHeight: 1.35 }}>
                                            <div style={{ fontWeight: 600 }}>{autoCloseSignatureName}</div>
                                            <div style={{ fontSize: '11px', color: '#64748b' }}>ระบบปิดอัตโนมัติเมื่อครบ 3 วัน</div>
                                        </div>
                                    )}
                                </div>
                                <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '5px' }}>ชื่อผู้แจ้ง</div>
                                <div style={{ fontSize: '13px', marginBottom: '3px' }}>({formData.userCloseName || formData.name || '-'})</div>
                                <div style={{ fontSize: '13px', marginBottom: '3px' }}>ตำแหน่ง {formData.userClosePosition || '-'}</div>
                                <div style={{ fontSize: '13px' }}>วันที่ {formatReportDate(formData.userClosedAt)}</div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: '42%' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px dotted #000', height: '55px', margin: '0 auto 10px', width: '82%' }}>
                                    {formData.inspectorSign && <img src={formData.inspectorSign} alt="ลายเซ็นผู้ตรวจสอบดำเนินการ" style={{ display: 'block', maxHeight: '52px', maxWidth: '100%', objectFit: 'contain', margin: '0 auto' }} />}
                                </div>
                                <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '5px' }}>ผู้ตรวจสอบดำเนินการ</div>
                                <div style={{ fontSize: '13px', marginBottom: '3px' }}>({formData.inspectorName || '-'})</div>
                                <div style={{ fontSize: '13px', marginBottom: '3px' }}>ตำแหน่ง {formData.inspectorPosition || '-'}</div>
                                <div style={{ fontSize: '13px' }}>วันที่ {formatReportDate(formData.inspectorSignedAt)}</div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{ 
                            marginTop: 'auto',
                            paddingTop: '15px', 
                            borderTop: '2px solid #cbd5e1', 
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-end',
                            gap: '24px',
                            fontSize: '11px', 
                            color: '#64748b' 
                        }}>
                            <div style={{ textAlign: 'left', color: '#0f172a' }}>
                                <div>Revision No : 03</div>
                                <div>Date of Issue : 03.04.26</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default MaintenanceReportPdfPreview;
