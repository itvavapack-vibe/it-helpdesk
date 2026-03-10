import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';
import { X, Download } from 'lucide-react';
import Swal from 'sweetalert2';

const PdfPreviewModal = ({ isOpen, onClose, issue }) => {
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
            pdf.save(`Ticket_${issue?.id || 'export'}.pdf`);

            onClose();
        } catch (error) {
            console.error("Error generating PDF", error);
            Swal.fire('Error', 'ไม่สามารถสร้างไฟล์ PDF ได้', 'error');
        }
    };

    if (!isOpen || !issue) return null;

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        return new Date(dateString).toLocaleDateString('th-TH', options);
    };

    const getSeverityText = (severity) => {
        switch (severity) {
            case 'Most Urgent': return 'ด่วนที่สุด';
            case 'Urgent': return 'ด่วน';
            default: return 'ปกติ';
        }
    };

    const getStatusText = (status) => {
        switch (status) {
            case 'Pending': return 'รอดำเนินการ';
            case 'In Progress': return 'กำลังแก้ไข';
            case 'Resolved': return 'เสร็จสิ้น';
            default: return status || '-';
        }
    };

    const printDate = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
            <div className="bg-slate-100 dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col border border-white/20 dark:border-slate-700 overflow-hidden my-auto h-[90vh]">

                {/* Modal Toolbar */}
                <div className="flex justify-between items-center p-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0">
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">ดูตัวอย่างใบแจ้งซ่อม</h2>
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
                            background: 'white',
                            width: '210mm',
                            minHeight: '297mm',
                            color: '#0f172a',
                            fontFamily: 'Sarabun, "Segoe UI", Tahoma, sans-serif',
                            position: 'relative',
                            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
                        }}
                    >
                        {/* Left accent stripe */}
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '7px', background: 'linear-gradient(180deg, #4f46e5 0%, #7c3aed 100%)' }} />

                        <div style={{ padding: '28px 36px 32px 44px' }}>

                            {/* ── HEADER ── */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', paddingBottom: '20px', borderBottom: '2px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                    <img
                                        src="/logo.png"
                                        alt="Logo"
                                        style={{ height: '56px', width: 'auto', objectFit: 'contain' }}
                                        onError={(e) => { e.target.style.display = 'none'; }}
                                    />
                                    <div>
                                        <div style={{ fontSize: '17px', fontWeight: '800', color: '#1e293b' }}>บริษัท ไอที ซัพพอร์ต จำกัด</div>
                                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>123 ถนนตัวอย่าง กรุงเทพฯ 10110</div>
                                        <div style={{ fontSize: '11px', color: '#64748b' }}>โทร: 02-123-4567 | support@company.com</div>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '28px', fontWeight: '900', color: '#4f46e5', letterSpacing: '0.5px', lineHeight: 1 }}>ใบแจ้งซ่อม</div>
                                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', letterSpacing: '3px', marginTop: '5px' }}>SERVICE TICKET</div>
                                </div>
                            </div>

                            {/* ── DOCUMENT META ── */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', minWidth: '228px' }}>
                                    <div style={{ background: '#4f46e5', padding: '6px 14px' }}>
                                        <div style={{ fontSize: '9px', fontWeight: '700', color: 'white', letterSpacing: '1.5px', textTransform: 'uppercase' }}>ข้อมูลเอกสาร</div>
                                    </div>
                                    <div style={{ background: '#fafafa', padding: '10px 14px' }}>
                                        {[
                                            { label: 'เลขที่', value: issue.id },
                                            { label: 'วันที่แจ้ง', value: formatDate(issue.createdAt) },
                                            { label: 'สถานะ', value: getStatusText(issue.status) },
                                        ].map(({ label, value }, i, arr) => (
                                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>{label}</span>
                                                <span style={{ fontSize: '11px', color: '#1e293b', fontWeight: '700' }}>{value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* ── REQUESTER INFO ── */}
                            <div style={{ marginBottom: '18px', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                                <div style={{ background: '#1e293b', padding: '7px 14px' }}>
                                    <div style={{ fontSize: '9px', fontWeight: '700', color: 'white', letterSpacing: '1.5px', textTransform: 'uppercase' }}>ข้อมูลผู้แจ้งซ่อม — Requester Information</div>
                                </div>
                                <div style={{ background: '#f8fafc', padding: '14px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 28px' }}>
                                    {[
                                        { label: 'ชื่อ - นามสกุล (Name)', value: issue.name },
                                        { label: 'แผนก (Department)', value: issue.department },
                                        { label: 'หมวดหมู่ปัญหา (Category)', value: issue.category },
                                        { label: 'ระดับความรุนแรง (Severity)', value: getSeverityText(issue.severity) },
                                        ...(issue.assetName ? [{ label: 'อุปกรณ์ที่แจ้งซ่อม (Asset)', value: issue.assetName }] : []),
                                    ].map(({ label, value }) => (
                                        <div key={label}>
                                            <div style={{ fontSize: '9px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '3px' }}>{label}</div>
                                            <div style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b', paddingBottom: '4px', borderBottom: '1.5px solid #e2e8f0' }}>{value || '-'}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* ── ISSUE DESCRIPTION ── */}
                            <div style={{ marginBottom: '18px', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                                <div style={{ background: '#1e293b', padding: '7px 14px' }}>
                                    <div style={{ fontSize: '9px', fontWeight: '700', color: 'white', letterSpacing: '1.5px', textTransform: 'uppercase' }}>รายละเอียดปัญหา — Issue Description</div>
                                </div>
                                <div style={{ background: 'white', padding: '14px 18px', minHeight: '90px', fontSize: '13px', color: '#334155', lineHeight: '1.8', whiteSpace: 'pre-wrap' }}>
                                    {issue.description || 'ไม่ระบุรายละเอียด'}
                                </div>
                            </div>

                            {/* ── REPAIR NOTES (conditional) ── */}
                            {issue.repairDetails && (
                                <div style={{ marginBottom: '24px', border: '1px solid #bbf7d0', borderRadius: '10px', overflow: 'hidden' }}>
                                    <div style={{ background: '#059669', padding: '7px 14px' }}>
                                        <div style={{ fontSize: '9px', fontWeight: '700', color: 'white', letterSpacing: '1.5px', textTransform: 'uppercase' }}>บันทึกการซ่อมแซม — Resolution Notes</div>
                                    </div>
                                    <div style={{ background: '#f0fdf4', padding: '14px 18px', fontSize: '13px', color: '#134e4a', lineHeight: '1.8', whiteSpace: 'pre-wrap', fontWeight: '600' }}>
                                        {issue.repairDetails}
                                    </div>
                                </div>
                            )}

                            {/* ── SIGNATURES ── */}
                            <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '32px', paddingTop: '24px', borderTop: '1.5px dashed #cbd5e1' }}>
                                {[
                                    { title: 'ผู้แจ้ง / Reporter', name: issue.name },
                                    { title: 'ผู้รับงาน / IT Support', name: issue.assignedAdmin || 'ยังไม่ระบุ' },
                                ].map(({ title, name }) => (
                                    <div key={title} style={{ textAlign: 'center', width: '170px' }}>
                                        <div style={{ height: '56px', borderBottom: '1.5px dashed #94a3b8', marginBottom: '10px' }} />
                                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#1e293b' }}>( {name} )</div>
                                        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>{title}</div>
                                        <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>วันที่: {printDate}</div>
                                    </div>
                                ))}
                            </div>

                            {/* ── FOOTER ── */}
                            <div style={{ marginTop: '28px', paddingTop: '10px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                                <div style={{ fontSize: '9px', color: '#cbd5e1' }}>เอกสารนี้ออกโดยระบบ IT Helpdesk — ห้ามแก้ไขโดยไม่ได้รับอนุญาต</div>
                                <div style={{ fontSize: '9px', color: '#cbd5e1' }}>พิมพ์วันที่: {printDate}</div>
                            </div>

                        </div>
                    </div>
                </div>

            </div>
        </div>,
        document.body
    );
};

export default PdfPreviewModal;
