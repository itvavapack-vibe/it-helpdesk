import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';
import { X, Download } from 'lucide-react';
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
            pdf.save(`FMIT12_${formData?.ticketNumber || 'Request'}.pdf`);
        } catch (error) {
            console.error('Error generating PDF', error);
            Swal.fire('Error', 'ไม่สามารถสร้างไฟล์ PDF ได้', 'error');
        }
    };

    if (!isOpen || !formData) return null;

    const systems = formData.systems || {};
    const isCancelled = formData.status === 'Cancelled' || Boolean(formData.cancelledAt);
    const requestDate = formData.createdAt
        ? new Date(formData.createdAt).toLocaleDateString('th-TH')
        : new Date().toLocaleDateString('th-TH');

    const styles = {
        paper: {
            background: '#fff',
            width: '210mm',
            minHeight: '297mm',
            color: '#000',
            fontFamily: 'Sarabun, "TH Sarabun New", "Segoe UI", Tahoma, sans-serif',
            position: 'relative',
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
            padding: '20mm 18mm 18mm',
            boxSizing: 'border-box',
            fontSize: '13px',
            lineHeight: 1.25
        },
        table: {
            width: '100%',
            borderCollapse: 'collapse',
            tableLayout: 'fixed'
        },
        cell: {
            border: '1px solid #000',
            padding: '4px 8px',
            verticalAlign: 'middle',
            height: '24px'
        },
        sectionTitle: {
            fontSize: '15px',
            fontWeight: 800,
            margin: '14px 0 6px'
        },
        dottedLine: {
            borderBottom: '1px dotted #000',
            minHeight: '21px',
            padding: '1px 3px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
        }
    };

    const CheckBox = ({ checked }) => (
        <div
            style={{
                width: '18px',
                height: '18px',
                border: '2px solid #111',
                margin: '0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                fontWeight: 900
            }}
        >
            {checked ? '✓' : ''}
        </div>
    );

    const SignatureBox = ({ title, sign, name, date, height = 82 }) => (
        <td style={{ ...styles.cell, height, verticalAlign: 'top', padding: '8px 12px' }}>
            <div style={{ textDecoration: 'underline', fontWeight: 800, textAlign: 'center', marginBottom: '22px' }}>{title}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '8px' }}>
                <span>ลงนาม</span>
                <span style={{ borderBottom: '1px dotted #000', minWidth: '135px', height: '28px', display: 'inline-flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    {sign && <img src={sign} alt="signature" style={{ maxHeight: '34px', maxWidth: '130px', objectFit: 'contain' }} />}
                    {!sign && name}
                </span>
            </div>
            <div style={{ textAlign: 'center', marginTop: '6px' }}>วันที่&nbsp;&nbsp; {date || '......../......../............'}</div>
        </td>
    );

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
            <div className="bg-slate-100 dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col border border-white/20 dark:border-slate-700 overflow-hidden my-auto h-[90vh]">
                <div className="flex justify-between items-center p-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0">
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">ตัวอย่างแบบฟอร์ม FMIT 12</h2>
                    <div className="flex gap-2.5">
                        <button onClick={handleDownloadPdf} className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-md flex items-center gap-2 transition-transform hover:-translate-y-0.5">
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">ดาวน์โหลด PDF</span>
                        </button>
                        <button onClick={onClose} className="p-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl transition-colors shadow-sm">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-6 bg-slate-200/60 dark:bg-slate-800 flex justify-center">
                    <div ref={previewRef} style={styles.paper}>
                        {isCancelled && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: '41%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%) rotate(-18deg)',
                                    border: '6px solid #dc2626',
                                    color: '#dc2626',
                                    fontSize: '54px',
                                    fontWeight: 900,
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

                        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '18px' }}>
                                <img src="/vava-pack-logo.png" alt="VAVA PACK" style={{ height: '38px', objectFit: 'contain' }} />
                                <div style={{ fontSize: '17px', fontWeight: 800 }}>บริษัท วาวา แพค จำกัด</div>
                            </div>
                            <div style={{ fontSize: '16px', fontWeight: 900, marginTop: '2px' }}>ใบขอเพิ่มบัญชีผู้ใช้งานระบบเทคโนโลยีสารสนเทศ (FMIT 12)</div>
                        </div>

                        <table style={{ ...styles.table, marginBottom: '12px' }}>
                            <tbody>
                                <tr>
                                    <td style={{ ...styles.cell, width: '17%' }}>ชื่อผู้แจ้ง :</td>
                                    <td style={{ ...styles.cell, width: '31%' }}>{formData.nameTh || ''}</td>
                                    <td style={{ ...styles.cell, width: '17%', background: '#e5e5e5' }}>เลขที่ใบแจ้ง:</td>
                                    <td style={{ ...styles.cell, width: '35%', background: '#e5e5e5', fontWeight: 700 }}>{formData.ticketNumber || 'ITU .............../................'}</td>
                                </tr>
                                <tr>
                                    <td style={styles.cell}>วันที่แจ้ง :</td>
                                    <td style={{ ...styles.cell, textAlign: 'center' }}>{requestDate || '............/............/............'}</td>
                                    <td style={{ ...styles.cell, background: '#e5e5e5' }}>ผู้รับแจ้ง:</td>
                                    <td style={{ ...styles.cell, background: '#e5e5e5', textAlign: 'right' }}>......../......../..........</td>
                                </tr>
                            </tbody>
                        </table>

                        <div style={styles.sectionTitle}>ข้อมูลผู้ขอใช้บริการ <span style={{ fontWeight: 400, fontStyle: 'italic', marginLeft: '8px' }}>(กรุณากรอกข้อความให้ชัดเจน)</span></div>
                        <table style={styles.table}>
                            <tbody>
                                <tr>
                                    <td style={{ ...styles.cell, width: '21%' }}>ชื่อ-สกุล (ภาษาไทย) :</td>
                                    <td style={styles.cell} colSpan="3">{formData.nameTh || ''}</td>
                                </tr>
                                <tr>
                                    <td style={styles.cell}>ชื่อ-สกุล (ภาษาอังกฤษ) :</td>
                                    <td style={styles.cell} colSpan="3">{formData.nameEn || ''}</td>
                                </tr>
                                <tr>
                                    <td style={styles.cell}>แผนก / ฝ่าย :</td>
                                    <td style={styles.cell} colSpan="3">{formData.department || ''}</td>
                                </tr>
                                <tr>
                                    <td style={styles.cell}>ตำแหน่ง :</td>
                                    <td style={{ ...styles.cell, width: '28%' }}>{formData.position || ''}</td>
                                    <td style={{ ...styles.cell, width: '16%' }}>เบอร์โทรภายใน :</td>
                                    <td style={{ ...styles.cell, width: '35%' }}>{formData.internalPhone || ''}</td>
                                </tr>
                                <tr>
                                    <td style={{ ...styles.cell, height: '48px', verticalAlign: 'bottom' }} colSpan="4">
                                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                                            <span>ลงนาม</span>
                                            <span style={{ borderBottom: '1px dotted #000', flex: 1, height: '34px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                                                {formData.requesterSign && <img src={formData.requesterSign} alt="Requester Sign" style={{ maxHeight: '38px', objectFit: 'contain' }} />}
                                            </span>
                                            <span>ผู้ขอใช้งาน</span>
                                            <span style={{ marginLeft: '16px' }}>วันที่</span>
                                            <span style={{ borderBottom: '1px dotted #000', width: '160px' }}>&nbsp;</span>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        <div style={styles.sectionTitle}>ส่วนร้องขอใช้ระบบงาน</div>
                        <table style={{ ...styles.table, textAlign: 'center' }}>
                            <thead>
                                <tr>
                                    {[
                                        'User\nComputer',
                                        'E-Mail',
                                        'Data All',
                                        'VPN',
                                        'All Web',
                                        'WMS',
                                        'MS\nDynamics365',
                                        'Cyber HRM',
                                        'อื่น ๆ'
                                    ].map((label) => (
                                        <th key={label} style={{ ...styles.cell, fontSize: '12px', fontWeight: 900, height: '34px', whiteSpace: 'pre-line' }}>{label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    {[
                                        systems.userComputer,
                                        systems.email,
                                        systems.dataAll,
                                        systems.vpn,
                                        systems.allWeb,
                                        systems.wms,
                                        systems.msDynamics365,
                                        systems.cyberHrm,
                                        systems.other
                                    ].map((checked, index) => (
                                        <td key={index} style={{ ...styles.cell, height: '28px' }}><CheckBox checked={checked} /></td>
                                    ))}
                                </tr>
                            </tbody>
                        </table>

                        <div style={styles.sectionTitle}>รายละเอียดการร้องขอ</div>
                        <div style={styles.dottedLine}>{systems.other ? `ระบบอื่น ๆ: ${formData.otherSystemDetails || ''} ` : ''}{formData.requestDetails || ''}</div>
                        <div style={styles.dottedLine}></div>
                        <div style={{ ...styles.dottedLine, marginBottom: '14px' }}></div>

                        <table style={{ ...styles.table, marginBottom: '14px' }}>
                            <tbody>
                                <tr>
                                    <SignatureBox title="ลงนาม หน./ผจก. แผนก/ฝ่าย ต้นสังกัด" sign={formData.managerSign} />
                                    <SignatureBox title="ลงนามหัวหน้าส่วนเทคโนโลยีสารสนเทศและ ERP :" sign={formData.itManagerSign} />
                                    <SignatureBox title="ลงนามผู้จัดการแผนกเทคโนโลยีสารสนเทศและ ERP :" sign={formData.itManagerSign} />
                                </tr>
                            </tbody>
                        </table>

                        <div style={styles.sectionTitle}>ผลการดำเนินการ ( ส่วนของผู้ดำเนินการ )</div>
                        <div style={styles.dottedLine}>{formData.actionResult || ''}</div>
                        <div style={{ ...styles.dottedLine, marginBottom: '8px' }}></div>

                        <div style={styles.sectionTitle}>ส่วนรับทราบผลการปฏิบัติงาน</div>
                        <table style={{ ...styles.table, marginBottom: '14px' }}>
                            <tbody>
                                <tr>
                                    <SignatureBox title="ผู้แจ้งงานลงนามรับทราบผล การใช้งาน :" sign={formData.requesterSign} height={58} />
                                    <SignatureBox title="ลงนามผู้ปฏิบัติงาน ผู้ติดตั้งการใช้งาน :" sign={formData.itSign} name={formData.itStaffName} height={58} />
                                </tr>
                            </tbody>
                        </table>

                        <div style={styles.sectionTitle}>ส่วนยกเลิกการใช้งาน</div>
                        <table style={{ width: '48%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                            <tbody>
                                <tr>
                                    <SignatureBox
                                        title="ลงนามผู้ปฏิบัติงาน ผู้ยกเลิกการใช้งาน :"
                                        sign={formData.cancelItSign}
                                        name={formData.cancelItName}
                                        date={formData.cancelledAt ? new Date(formData.cancelledAt).toLocaleDateString('th-TH') : undefined}
                                        height={58}
                                    />
                                </tr>
                            </tbody>
                        </table>

                        {formData.cancelReason && (
                            <div style={{ marginTop: '6px', fontSize: '11px', color: '#b91c1c' }}>เหตุผลการยกเลิก: {formData.cancelReason}</div>
                        )}

                        <div style={{ marginTop: 'auto', paddingTop: '28px', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                            <div>Revision NO : 04</div>
                            <div>Date of Issue : 03.04.26</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default Fmit12PdfPreview;
