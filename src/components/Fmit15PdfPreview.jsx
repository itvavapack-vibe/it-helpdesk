import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';
import { X, Download } from 'lucide-react';
import Swal from 'sweetalert2';

const Fmit15PdfPreview = ({ isOpen, onClose, formData }) => {
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
            pdf.save(`FMIT15_ChangeRequest_${formData.ticketNumber || 'Draft'}.pdf`);
        } catch (error) {
            console.error("Error generating PDF", error);
            Swal.fire('Error', 'ไม่สามารถสร้างไฟล์ PDF ได้', 'error');
        }
    };

    if (!isOpen || !formData) return null;
    const isCancelled = formData.status === 'Cancelled' || Boolean(formData.cancelledAt);
    const formatDate = (value) => {
        if (!value) return '......./......./.......';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('th-TH');
    };
    const hasText = (value) => String(value ?? '').trim().length > 0;
    const textBlockStyle = {
        fontSize: '14px',
        lineHeight: 1.28,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        position: 'relative',
        zIndex: 1,
    };

    const CheckBox = ({ checked, label }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{
                width: '12px',
                height: '12px',
                border: '1px solid #000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                fontWeight: 500
            }}>
                {checked ? '✓' : ''}
            </div>
            {label && <span style={{ fontSize: '14px', fontWeight: 500 }}>{label}</span>}
        </div>
    );

    return createPortal(
        <div className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
            <div className="bg-slate-100 dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col border border-white/20 dark:border-slate-700 overflow-hidden my-auto h-[calc(100dvh-1rem)] sm:h-[90vh]">

                {/* Modal Toolbar */}
                <div className="flex justify-between items-center p-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0">
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">ตัวอย่างแบบฟอร์ม FMIT 15</h2>
                    <div className="flex gap-2.5">
                        <button
                            onClick={handleDownloadPdf}
                            className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-md flex items-center gap-2 transition-transform hover:-translate-y-0.5"
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
                            padding: '10mm 12mm', /* Expanded to edge */
                            boxSizing: 'border-box',
                            lineHeight: 1.22,
                            fontWeight: 400
                        }}
                    >
                        {isCancelled && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: '42%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%) rotate(-18deg)',
                                    border: '6px solid #dc2626',
                                    color: '#dc2626',
                                    fontSize: '54px',
                                    fontWeight: 700,
                                    letterSpacing: '4px',
                                    padding: '10px 28px',
                                    opacity: 0.18,
                                    zIndex: 10,
                                    pointerEvents: 'none'
                                }}
                            >
                                ยกเลิก
                            </div>
                        )}
                        {/* Header Bordered Box */}
                        <div style={{ border: '2px solid #1e3a8a', display: 'flex', marginBottom: '15px' }}>
                            <div style={{ width: '25%', borderRight: '1px solid #1e3a8a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                                <img src="/vava-pack-logo.png" alt="VAVA PACK" style={{ width: '60%', height: 'auto', maxHeight: '45px', objectFit: 'contain' }} />
                            </div>
                            <div style={{ width: '75%', padding: '10px 15px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <div style={{ fontSize: '12px', fontWeight: 500 }}>Doc. Type</div>
                                <div style={{ display: 'flex', alignItems: 'center', marginTop: '2px' }}>
                                    <div style={{ fontSize: '15px', fontWeight: 500 }}>Change Request Form (FMIT 15)</div>
                                    <div style={{ fontSize: '12px', fontWeight: 500, marginLeft: '10px', paddingBottom: '2px', flex: 1, whiteSpace: 'nowrap', textAlign: 'right' }}>
                                        ITC No. 
                                        <span style={{ display: 'inline-block', minWidth: '80px', borderBottom: formData.ticketNumber ? 'none' : '1px dotted #000', textAlign: 'center', color: '#1e3a8a', margin: '0 5px' }}>
                                            {formData.ticketNumber ? formData.ticketNumber.split('/')[0] : ''}
                                        </span>
                                        /
                                        <span style={{ display: 'inline-block', minWidth: '80px', borderBottom: formData.ticketNumber ? 'none' : '1px dotted #000', textAlign: 'center', color: '#1e3a8a', marginLeft: '5px' }}>
                                            {formData.ticketNumber ? formData.ticketNumber.split('/')[1] : ''}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Request Type */}
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '10px', paddingLeft: 0 }}>
                            <span style={{ fontSize: '14px', fontWeight: 500 }}>ความต้องการ</span>
                            <CheckBox checked={formData.reqType === 'add'} label="เพิ่ม" />
                            <CheckBox checked={formData.reqType === 'remove'} label="นำออก" />
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CheckBox checked={formData.reqType === 'change'} label="เปลี่ยนแปลงแก้ไข" />
                                <span style={{ borderBottom: formData.reqType === 'change' && hasText(formData.reqTypeOther) ? 'none' : '1px dotted #000', width: '170px', display: 'inline-block', marginLeft: '5px' }}>
                                    {formData.reqType === 'change' && <span style={{ marginLeft: '10px' }}>{formData.reqTypeOther}</span>}
                                </span>
                            </div>
                        </div>

                        {/* Part 1 */}
                        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', marginBottom: '15px' }}>
                            <tbody>
                                <tr>
                                    <td colSpan="3" style={{ backgroundColor: '#e5e7eb', border: '1px solid #000', padding: '5px 10px', fontSize: '14px', fontWeight: 500, textAlign: 'center' }}>
                                        ส่วนที่ 1 : ผู้ร้องขอเปลี่ยนแปลงระบบ
                                    </td>
                                </tr>
                                <tr>
                                    <td style={{ width: '20%', border: '1px solid #000', padding: '5px 10px', fontSize: '14px', fontWeight: 500 }}>
                                        แผนก/ฝ่าย ผู้ร้องขอ
                                    </td>
                                    <td colSpan="2" style={{ border: '1px solid #000', padding: '5px 10px', fontSize: '14px' }}>
                                        {formData.department}
                                    </td>
                                </tr>
                                <tr>
                                    <td colSpan="3" style={{ border: '1px solid #000', padding: '5px 10px', height: '100px', verticalAlign: 'top', position: 'relative' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 500, marginBottom: '5px' }}>Details of the Proposed Changes: (รายละเอียด)</div>
                                        <div style={textBlockStyle}>{formData.requestDetails}</div>

                                        {!hasText(formData.requestDetails) && (
                                            <>
                                                <div style={{ position: 'absolute', bottom: '25px', left: '10px', right: '10px', borderBottom: '1px solid #ccc' }}></div>
                                                <div style={{ position: 'absolute', bottom: '45px', left: '10px', right: '10px', borderBottom: '1px solid #ccc' }}></div>
                                                <div style={{ position: 'absolute', bottom: '65px', left: '10px', right: '10px', borderBottom: '1px solid #ccc' }}></div>
                                            </>
                                        )}

                                        <div style={{ position: 'absolute', bottom: '5px', left: '10px', fontSize: '12px' }}>(กรุณาแนบแบบฟอร์มหรือเอกสารเพิ่มเติมมาด้วย)</div>
                                    </td>
                                </tr>
                                <tr>
                                    <td colSpan="3" style={{ border: '1px solid #000', padding: '5px 10px', height: '80px', verticalAlign: 'top', position: 'relative' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 500, marginBottom: '5px' }}>Reason for changes: (เหตุผลการเปลี่ยนแปลง)</div>
                                        <div style={textBlockStyle}>{formData.reason}</div>

                                        {!hasText(formData.reason) && (
                                            <>
                                                <div style={{ position: 'absolute', bottom: '15px', left: '10px', right: '10px', borderBottom: '1px solid #ccc' }}></div>
                                                <div style={{ position: 'absolute', bottom: '35px', left: '10px', right: '10px', borderBottom: '1px solid #ccc' }}></div>
                                            </>
                                        )}
                                    </td>
                                </tr>
                                <tr style={{ height: '50px' }}>
                                    <td style={{ border: '1px solid #000', padding: '5px', width: '33.33%', verticalAlign: 'top' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 500 }}>Requested by : (ชื่อผู้ร้องขอ)</div>
                                        <div style={{ height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {formData.requesterSign && <img src={formData.requesterSign} alt="sign" style={{ height: '30px', objectFit: 'contain' }} />}
                                            {!formData.requesterSign && <span style={{ fontSize: '14px', textAlign: 'center' }}>{formData.requesterName}</span>}
                                        </div>
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '5px', width: '33.33%', verticalAlign: 'top' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 500 }}>Position (ตำแหน่ง) :</div>
                                        <div style={{ height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                                            {formData.requesterPosition}
                                        </div>
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '5px', width: '33.33%', verticalAlign: 'top' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 500 }}>Date (วันที่) :</div>
                                        <div style={{ height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                                            {formatDate(formData.requesterDate || formData.createdAt)}
                                        </div>
                                    </td>
                                </tr>
                                <tr style={{ height: '50px' }}>
                                    <td style={{ border: '1px solid #000', padding: '5px', width: '33.33%', verticalAlign: 'top' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 500 }}>Approve by : (ชื่อผู้อนุมัติ)</div>
                                        <div style={{ height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {formData.managerSign && <img src={formData.managerSign} alt="sign" style={{ height: '30px', objectFit: 'contain' }} />}
                                        </div>
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '5px', width: '33.33%', verticalAlign: 'top' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 500 }}>Position (ตำแหน่ง) :</div>
                                        <div style={{ height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                                            {formData.managerPosition}
                                        </div>
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '5px', width: '33.33%', verticalAlign: 'top' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 500 }}>Date (วันที่) :</div>
                                        <div style={{ height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                                            {formatDate(formData.managerDate)}
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        {/* Part 2 */}
                        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', marginBottom: '15px' }}>
                            <tbody>
                                <tr>
                                    <td colSpan="3" style={{ backgroundColor: '#e5e7eb', border: '1px solid #000', padding: '5px 10px', fontSize: '14px', fontWeight: 500, textAlign: 'center' }}>
                                        ส่วนที่ 2 : สำหรับเจ้าหน้าที่
                                    </td>
                                </tr>
                                <tr>
                                    <td style={{ width: '33.33%', border: '1px solid #000', padding: '5px 10px', fontSize: '14px', fontWeight: 500 }}>
                                        วันที่รับคำร้องขอ : {formatDate(formData.itReceivedDate)}
                                    </td>
                                    <td colSpan="2" style={{ border: '1px solid #000', padding: '5px 10px', fontSize: '14px', fontWeight: 500 }}>
                                        วันที่ดำเนินการ : {formatDate(formData.itOperationDate)}
                                    </td>
                                </tr>
                                <tr>
                                    <td colSpan="3" style={{ backgroundColor: '#f3f4f6', border: '1px solid #000', padding: '5px 10px', fontSize: '14px', fontWeight: 500, textAlign: 'center' }}>
                                        วันที่นัดหมายแล้วเสร็จ : {formatDate(formData.itTargetDate)}
                                    </td>
                                </tr>
                                <tr>
                                    <td colSpan="3" style={{ border: '1px solid #000', padding: '10px', height: '60px', verticalAlign: 'top' }}>
                                        <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '10px' }}>ผลการพิจารณาการขอเปลี่ยนแปลงระบบ:</div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
                                            <CheckBox checked={formData.itApprovalStatus === 'Approved'} label="อนุมัติ" />
                                            <div style={{ display: 'flex', alignItems: 'center', minWidth: '300px' }}>
                                                <CheckBox checked={formData.itApprovalStatus === 'Rejected'} label="ไม่อนุมัติ (ระบุสาเหตุ)" />
                                                <span style={{ borderBottom: formData.itApprovalStatus === 'Rejected' && hasText(formData.itRejectReason) ? 'none' : '1px dotted #000', flex: 1, display: 'inline-block', marginLeft: '5px' }}>
                                                    {formData.itApprovalStatus === 'Rejected' && <span style={{ marginLeft: '10px' }}>{formData.itRejectReason}</span>}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                                <tr style={{ height: '50px' }}>
                                    <td style={{ border: '1px solid #000', padding: '5px', width: '33.33%', verticalAlign: 'top' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 500 }}>Approve by : (ชื่อผู้อนุมัติ)</div>
                                        <div style={{ height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {formData.itManagerSign && <img src={formData.itManagerSign} alt="sign" style={{ height: '30px', objectFit: 'contain' }} />}
                                        </div>
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '5px', width: '33.33%', verticalAlign: 'top' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 500 }}>Position (ตำแหน่ง) :</div>
                                        <div style={{ height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                                            {formData.itManagerPosition}
                                        </div>
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '5px', width: '33.33%', verticalAlign: 'top' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 500 }}>Date (วันที่) :</div>
                                        <div style={{ height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                                            {formatDate(formData.itManagerDate)}
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td colSpan="3" style={{ border: '1px solid #000', padding: '5px 10px', height: '80px', verticalAlign: 'top', position: 'relative' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 500, marginBottom: '5px' }}>Solution (วิธีแก้ไข):</div>
                                        <div style={textBlockStyle}>{formData.itSolution}</div>

                                        {!hasText(formData.itSolution) && (
                                            <>
                                                <div style={{ position: 'absolute', bottom: '15px', left: '10px', right: '10px', borderBottom: '1px solid #ccc' }}></div>
                                                <div style={{ position: 'absolute', bottom: '35px', left: '10px', right: '10px', borderBottom: '1px solid #ccc' }}></div>
                                            </>
                                        )}
                                    </td>
                                </tr>
                                <tr style={{ height: '50px' }}>
                                    <td style={{ border: '1px solid #000', padding: '5px', width: '33.33%', verticalAlign: 'top' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 500 }}>Operated by : (ชื่อผู้ดำเนินการ)</div>
                                        <div style={{ height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {formData.itStaffSign && <img src={formData.itStaffSign} alt="sign" style={{ height: '30px', objectFit: 'contain' }} />}
                                        </div>
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '5px', width: '33.33%', verticalAlign: 'top' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 500 }}>Position (ตำแหน่ง) :</div>
                                        <div style={{ height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                                            {formData.itStaffPosition}
                                        </div>
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '5px', width: '33.33%', verticalAlign: 'top' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 500 }}>Date (วันที่) :</div>
                                        <div style={{ height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                                            {formatDate(formData.itStaffDate || formData.itOperationDate)}
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        {/* Part 3 */}
                        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', marginBottom: '15px' }}>
                            <tbody>
                                <tr>
                                    <td colSpan="3" style={{ backgroundColor: '#e5e7eb', border: '1px solid #000', padding: '5px 10px', fontSize: '14px', fontWeight: 500, textAlign: 'center' }}>
                                        ส่วนที่ 3 : ผลการดำเนินงาน
                                    </td>
                                </tr>
                                <tr>
                                    <td colSpan="3" style={{ border: '1px solid #000', padding: '10px', height: '60px', verticalAlign: 'top' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
                                            <CheckBox checked={formData.userAcceptance === 'Accepted'} label="ถูกต้องครบถ้วน" />
                                            <div style={{ display: 'flex', alignItems: 'center', minWidth: '300px' }}>
                                                <CheckBox checked={formData.userAcceptance === 'Rejected'} label="ไม่ถูกต้อง (ระบุสาเหตุ)" />
                                                <span style={{ borderBottom: formData.userAcceptance === 'Rejected' && hasText(formData.userRejectReason) ? 'none' : '1px dotted #000', flex: 1, display: 'inline-block', marginLeft: '5px' }}>
                                                    {formData.userAcceptance === 'Rejected' && <span style={{ marginLeft: '10px' }}>{formData.userRejectReason}</span>}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                                <tr style={{ height: '50px' }}>
                                    <td style={{ border: '1px solid #000', padding: '5px', width: '33.33%', verticalAlign: 'top' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 500 }}>Receive Project (ลงชื่อผู้รับงานรับทราบ)</div>
                                        <div style={{ height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {formData.userAcceptSign && <img src={formData.userAcceptSign} alt="sign" style={{ height: '30px', objectFit: 'contain' }} />}
                                        </div>
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '5px', width: '33.33%', verticalAlign: 'top' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 500 }}>Position (ตำแหน่ง) :</div>
                                        <div style={{ height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                                            {formData.requesterPosition}
                                        </div>
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '5px', width: '33.33%', verticalAlign: 'top' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 500 }}>Date (วันที่) :</div>
                                        <div style={{ height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                                            {formatDate(formData.userAcceptDate)}
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        {/* Footer */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 500, marginTop: 'auto', borderTop: '2px solid #1e3a8a', paddingTop: '5px' }}>
                            <div>Revision NO : 03&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Date of Issue : 02.02.26</div>
                            <div>Page 1 of 1</div>
                            <div>Prepared by: IT VAVA PACK Team</div>
                        </div>

                    </div>
                </div>

            </div>
        </div>,
        document.body
    );
};

export default Fmit15PdfPreview;
