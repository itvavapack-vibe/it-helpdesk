import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';
import { Download, ImagePlus, Printer, X, ZoomIn, ZoomOut } from 'lucide-react';
import Swal from 'sweetalert2';
import { resolveAttachmentUrl } from '../utils/fileUpload';

const imageExtensionPattern = /\.(png|jpe?g|gif|webp|bmp|avif)(?:\?.*)?$/i;

const isImageAttachment = (file) => {
    const mimeType = String(file?.type || file?.mimetype || file?.mimeType || '').toLowerCase();
    const url = String(file?.url || file?.path || file?.name || '').toLowerCase();
    return mimeType.startsWith('image/') || imageExtensionPattern.test(url);
};

const isItEvidenceAttachment = (file) => {
    const uploadedByType = String(file?.uploadedByType || '').toLowerCase();
    const source = String(file?.source || '').toLowerCase();
    return uploadedByType === 'it' || source === 'repair_evidence';
};

const formatReportDateTime = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('th-TH', {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const IssueEvidenceReportPreview = ({ isOpen, onClose, issue }) => {
    const previewRef = useRef(null);
    const [previewImage, setPreviewImage] = useState(null);
    const [previewZoom, setPreviewZoom] = useState(1);

    const evidenceImages = useMemo(
        () => (Array.isArray(issue?.attachments) ? issue.attachments.filter(isImageAttachment) : []),
        [issue?.attachments]
    );
    const itEvidenceImageCount = evidenceImages.filter(isItEvidenceAttachment).length;
    const requesterImageCount = evidenceImages.length - itEvidenceImageCount;

    const openImagePreview = (image) => {
        setPreviewImage(image);
        setPreviewZoom(1);
    };

    const closeImagePreview = () => {
        setPreviewImage(null);
        setPreviewZoom(1);
    };

    const handleDownloadPdf = async () => {
        if (!previewRef.current) return;

        try {
            await document.fonts?.ready;
            const canvas = await html2canvas(previewRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff'
            });
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const imgHeight = (canvas.height * pdfWidth) / canvas.width;
            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
            heightLeft -= pdfHeight;

            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
                heightLeft -= pdfHeight;
            }

            pdf.save(`Issue_Evidence_${issue?.id || Date.now()}.pdf`);
        } catch (error) {
            console.error('Error generating evidence PDF', error);
            Swal.fire('Error', 'ไม่สามารถสร้างไฟล์ PDF หลักฐานรูปภาพได้', 'error');
        }
    };

    const handlePrint = async () => {
        if (!previewRef.current) return;

        const printFrame = document.createElement('iframe');
        printFrame.setAttribute('title', 'พิมพ์รายงานหลักฐานรูปภาพ');
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
                        <title>Issue Evidence ${issue?.id || ''}</title>
                        <style>
                            @page { size: A4 portrait; margin: 10mm; }
                            html, body { margin: 0; padding: 0; background: #fff; }
                            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                            .evidence-page { box-shadow: none !important; width: 190mm !important; min-height: auto !important; padding: 0 !important; }
                            .evidence-image-card { break-inside: avoid; page-break-inside: avoid; }
                        </style>
                    </head>
                    <body>${previewRef.current.outerHTML}</body>
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

            const printWindow = printFrame.contentWindow;
            if (!printWindow) throw new Error('Print window is unavailable');

            printWindow.onafterprint = cleanupPrintFrame;
            printWindow.focus();
            printWindow.print();
            window.setTimeout(cleanupPrintFrame, 60000);
        } catch (error) {
            console.error('Error printing evidence report', error);
            cleanupPrintFrame();
            Swal.fire('Error', 'ไม่สามารถเปิดหน้าต่างพิมพ์ได้', 'error');
        }
    };

    if (!isOpen || !issue) return null;

    return createPortal(
        <div className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
            <div className="bg-slate-100 dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col border border-white/20 dark:border-slate-700 overflow-hidden my-auto h-[calc(100dvh-1rem)] sm:h-[90vh]">
                <div className="flex justify-between items-center p-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0">
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <ImagePlus className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                        รายงานหลักฐานรูปภาพ
                    </h2>
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

                <div className="flex-1 overflow-auto p-6 bg-slate-200/60 dark:bg-slate-800 flex justify-center">
                    <div
                        ref={previewRef}
                        className="evidence-page"
                        style={{
                            background: 'white',
                            width: '210mm',
                            minHeight: '297mm',
                            color: '#000',
                            fontFamily: 'Sarabun, "Segoe UI", Tahoma, sans-serif',
                            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
                            padding: '35px 40px',
                            boxSizing: 'border-box'
                        }}
                    >
                        <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '3px solid #0f172a', paddingBottom: '15px' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '8px' }}>
                                <img src="/vava-pack-logo.png" alt="VAVA PACK Logo" style={{ height: '40px', objectFit: 'contain' }} />
                                <span style={{ marginLeft: '12px', fontSize: '18px', fontWeight: 'bold', color: '#1e293b' }}>บริษัท วาวา แพ็ค จำกัด</span>
                            </div>
                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>
                                รายงานหลักฐานรูปภาพประกอบการแจ้งซ่อม
                                <br />
                                Issue Evidence Photo Report
                            </div>
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc' }}>
                            <tbody>
                                <tr>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: '12px', fontWeight: 700, width: '18%', backgroundColor: '#e2e8f0' }}>เลขที่แจ้ง</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: '12px', fontWeight: 700 }}>{issue.id || '-'}</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: '12px', fontWeight: 700, width: '18%', backgroundColor: '#e2e8f0' }}>วันที่แจ้ง</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: '12px' }}>{formatReportDateTime(issue.createdAt)}</td>
                                </tr>
                                <tr>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: '12px', fontWeight: 700, backgroundColor: '#e2e8f0' }}>ผู้แจ้ง</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: '12px' }}>{issue.name || '-'}</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: '12px', fontWeight: 700, backgroundColor: '#e2e8f0' }}>แผนก</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: '12px' }}>{issue.department || '-'}</td>
                                </tr>
                                <tr>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: '12px', fontWeight: 700, backgroundColor: '#e2e8f0' }}>หมวดหมู่</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: '12px' }}>{issue.category || '-'}</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: '12px', fontWeight: 700, backgroundColor: '#e2e8f0' }}>อุปกรณ์</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: '12px' }}>{issue.assetName || issue.assetId || '-'}</td>
                                </tr>
                            </tbody>
                        </table>

                        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                            <div style={{ flex: 1, border: '1px solid #bae6fd', background: '#f0f9ff', padding: '10px 12px', borderRadius: '8px' }}>
                                <div style={{ fontSize: '11px', color: '#0369a1', fontWeight: 700 }}>รูปที่ผู้แจ้งแนบ</div>
                                <div style={{ fontSize: '22px', color: '#075985', fontWeight: 800 }}>{requesterImageCount}</div>
                            </div>
                            <div style={{ flex: 1, border: '1px solid #c7d2fe', background: '#eef2ff', padding: '10px 12px', borderRadius: '8px' }}>
                                <div style={{ fontSize: '11px', color: '#4338ca', fontWeight: 700 }}>รูปที่ IT แนบหลักฐานการซ่อม</div>
                                <div style={{ fontSize: '22px', color: '#3730a3', fontWeight: 800 }}>{itEvidenceImageCount}</div>
                            </div>
                            <div style={{ flex: 1, border: '1px solid #d1d5db', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px' }}>
                                <div style={{ fontSize: '11px', color: '#475569', fontWeight: 700 }}>รวมรูปหลักฐาน</div>
                                <div style={{ fontSize: '22px', color: '#0f172a', fontWeight: 800 }}>{evidenceImages.length}</div>
                            </div>
                        </div>

                        {evidenceImages.length === 0 ? (
                            <div style={{ border: '1px dashed #94a3b8', borderRadius: '10px', padding: '28px', textAlign: 'center', color: '#64748b', background: '#f8fafc', fontSize: '14px' }}>
                                ไม่มีรูปหลักฐานแนบในรายการนี้
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                {evidenceImages.map((file, index) => {
                                    const imageUrl = resolveAttachmentUrl(file.url || file.path);
                                    const sourceLabel = isItEvidenceAttachment(file) ? 'IT แนบหลักฐานการซ่อม' : 'ผู้แจ้งแนบ';
                                    return (
                                        <div
                                            key={`${file.url || file.name || index}-${index}`}
                                            className="evidence-image-card"
                                            role="button"
                                            tabIndex={0}
                                            title="คลิกเพื่อดูรูปเต็ม"
                                            onClick={() => openImagePreview({ url: imageUrl, name: file.name || `Evidence ${index + 1}`, label: sourceLabel })}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault();
                                                    openImagePreview({ url: imageUrl, name: file.name || `Evidence ${index + 1}`, label: sourceLabel });
                                                }
                                            }}
                                            style={{ border: '1px solid #cbd5e1', borderRadius: '10px', overflow: 'hidden', background: '#ffffff', cursor: 'pointer' }}
                                        >
                                            <div style={{ height: '210px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <img
                                                    src={imageUrl}
                                                    alt={file.name || `Evidence ${index + 1}`}
                                                    crossOrigin="anonymous"
                                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                                />
                                            </div>
                                            <div style={{ padding: '9px 10px', borderTop: '1px solid #e2e8f0' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                                                    <span>รูปที่ {index + 1}</span>
                                                    <span style={{ color: isItEvidenceAttachment(file) ? '#4338ca' : '#0369a1' }}>{sourceLabel}</span>
                                                </div>
                                                <div style={{ marginTop: '4px', fontSize: '11px', color: '#64748b', lineHeight: 1.45 }}>
                                                    <div>ชื่อไฟล์: {file.name || '-'}</div>
                                                    <div>ผู้แนบ: {file.uploadedBy || (isItEvidenceAttachment(file) ? 'IT' : issue.name) || '-'}</div>
                                                    <div>วันที่แนบ: {formatReportDateTime(file.uploadedAt)}</div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {previewImage && (
                <div
                    className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/90 p-3 sm:p-6"
                    onClick={closeImagePreview}
                >
                    <div className="flex h-full w-full max-w-6xl flex-col" onClick={(event) => event.stopPropagation()}>
                        <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-white/10 px-4 py-3 text-white backdrop-blur-md">
                            <div className="min-w-0">
                                <div className="truncate text-sm font-bold">{previewImage.name}</div>
                                <div className="truncate text-xs text-slate-200">{previewImage.label}</div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPreviewZoom((zoom) => Math.max(0.5, Number((zoom - 0.25).toFixed(2))))}
                                    disabled={previewZoom <= 0.5}
                                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                                    title="ย่อรูป"
                                >
                                    <ZoomOut className="h-5 w-5" />
                                </button>
                                <div className="min-w-16 rounded-full bg-white/10 px-3 py-2 text-center text-xs font-bold text-white">
                                    {Math.round(previewZoom * 100)}%
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setPreviewZoom((zoom) => Math.min(3, Number((zoom + 0.25).toFixed(2))))}
                                    disabled={previewZoom >= 3}
                                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                                    title="ขยายรูป"
                                >
                                    <ZoomIn className="h-5 w-5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={closeImagePreview}
                                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 hover:text-rose-200"
                                    title="ปิด"
                                >
                                    <X className="h-6 w-6" />
                                </button>
                            </div>
                        </div>
                        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-2xl bg-black/20">
                            <img
                                src={previewImage.url}
                                alt={previewImage.name}
                                className="max-h-full max-w-full origin-center rounded-xl object-contain shadow-2xl transition-transform duration-150"
                                style={{ transform: `scale(${previewZoom})` }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>,
        document.body
    );
};

export default IssueEvidenceReportPreview;
