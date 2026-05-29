import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';
import { Download, X } from 'lucide-react';
import Swal from 'sweetalert2';

const Fmit12PdfPreview = ({ isOpen, onClose, formData }) => {
    const previewRef = useRef(null);

    const handleDownloadPdf = async () => {
        if (!previewRef.current) return;

        try {
            const canvas = await html2canvas(previewRef.current, {
                scale: 2.5,
                useCORS: true,
                backgroundColor: '#ffffff',
                windowWidth: previewRef.current.scrollWidth,
                windowHeight: previewRef.current.scrollHeight,
            });
            const imgData = canvas.toDataURL('image/jpeg', 0.98);
            const pdf = new jsPDF('p', 'mm', 'a4');

            pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
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
            height: '297mm',
            color: '#000',
            fontFamily: '"Angsana New", "TH Sarabun New", Sarabun, "Segoe UI", Tahoma, sans-serif',
            position: 'relative',
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
            padding: '18mm 17mm 17mm',
            boxSizing: 'border-box',
            fontSize: '11.5px',
            lineHeight: 1.16,
            overflow: 'hidden',
        },
        table: {
            width: '100%',
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
        },
        cell: {
            border: '1px solid #000',
            padding: '2px 6px',
            verticalAlign: 'middle',
            height: '19px',
            wordBreak: 'break-word',
        },
        sectionTitle: {
            fontSize: '13px',
            fontWeight: 800,
            margin: '8px 0 5px',
        },
        dottedLine: {
            borderBottom: '1px dotted #000',
            minHeight: '17px',
            padding: '1px 2px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
        },
    };

    const CheckBox = ({ checked }) => (
        <div
            style={{
                width: '13px',
                height: '13px',
                border: '1.5px solid #111',
                margin: '0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                fontWeight: 900,
                lineHeight: 1,
            }}
        >
            {checked ? '✓' : ''}
        </div>
    );

    const SignatureBox = ({ title, sign, name, date, height = 64 }) => (
        <td style={{ ...styles.cell, height, verticalAlign: 'top', padding: '5px 6px' }}>
            <div style={{ textDecoration: 'underline', fontWeight: 800, textAlign: 'center', marginBottom: '9px', fontSize: '10.8px' }}>{title}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '4px', fontSize: '10.8px' }}>
                <span>ลงนาม</span>
                <span style={{ borderBottom: '1px dotted #000', minWidth: '92px', height: '23px', display: 'inline-flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    {sign && <img src={sign} alt="signature" style={{ maxHeight: '27px', maxWidth: '88px', objectFit: 'contain' }} />}
                    {!sign && name}
                </span>
            </div>
            <div style={{ textAlign: 'center', marginTop: '5px', fontSize: '10.5px' }}>วันที่&nbsp;&nbsp; {date || '......../......../............'}</div>
        </td>
    );

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
            <div className="bg-slate-100 dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-[min(96vw,980px)] flex flex-col border border-white/20 dark:border-slate-700 overflow-hidden my-auto h-[92vh]">
                <div className="flex flex-wrap justify-between items-center gap-3 p-3 sm:p-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0">
                    <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">ตัวอย่างแบบฟอร์ม FMIT 12</h2>
                    <div className="flex gap-2">
                        <button onClick={handleDownloadPdf} className="py-2 px-3 sm:px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-md flex items-center gap-2 transition-transform hover:-translate-y-0.5">
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">ดาวน์โหลด PDF</span>
                        </button>
                        <button onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl transition-colors shadow-sm">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-2 sm:p-4 md:p-6 bg-slate-200/60 dark:bg-slate-800">
                    <div className="min-w-max flex justify-center">
                        <div ref={previewRef} style={styles.paper}>
                            {isCancelled && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: '41%',
                                        left: '50%',
                                        transform: 'translate(-50%, -50%) rotate(-18deg)',
                                        border: '5px solid #dc2626',
                                        color: '#dc2626',
                                        fontSize: '42px',
                                        fontWeight: 900,
                                        letterSpacing: '3px',
                                        padding: '8px 22px',
                                        opacity: 0.18,
                                        zIndex: 10,
                                        pointerEvents: 'none',
                                    }}
                                >
                                    ยกเลิก
                                </div>
                            )}

                            <div style={{ textAlign: 'center', marginBottom: '5px' }}>
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px' }}>
                                    <img src="/vava-pack-logo.png" alt="VAVA PACK" style={{ height: '32px', objectFit: 'contain' }} />
                                    <div style={{ fontSize: '14px', fontWeight: 800 }}>บริษัท วาวา แพค จำกัด</div>
                                </div>
                                <div style={{ fontSize: '13.5px', fontWeight: 900, marginTop: '1px' }}>ใบขอเพิ่มบัญชีผู้ใช้งานระบบเทคโนโลยีสารสนเทศ (FMIT 12)</div>
                            </div>

                            <table style={{ ...styles.table, marginBottom: '7px' }}>
                                <tbody>
                                    <tr>
                                        <td style={{ ...styles.cell, width: '16%' }}>ชื่อผู้แจ้ง :</td>
                                        <td style={{ ...styles.cell, width: '32%' }}>{formData.nameTh || ''}</td>
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

                            <div style={styles.sectionTitle}>ข้อมูลผู้ขอใช้บริการ <span style={{ fontWeight: 400, fontStyle: 'italic', marginLeft: '6px' }}>(กรุณากรอกข้อความให้ชัดเจน)</span></div>
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
                                        <td style={{ ...styles.cell, height: '38px', verticalAlign: 'bottom' }} colSpan="4">
                                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
                                                <span>ลงนาม</span>
                                                <span style={{ borderBottom: '1px dotted #000', flex: 1, height: '25px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                                                    {formData.requesterSign && <img src={formData.requesterSign} alt="Requester Sign" style={{ maxHeight: '28px', objectFit: 'contain' }} />}
                                                </span>
                                                <span>ผู้ขอใช้งาน</span>
                                                <span style={{ marginLeft: '10px' }}>วันที่</span>
                                                <span style={{ borderBottom: '1px dotted #000', width: '120px' }}>&nbsp;</span>
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
                                            'อื่น ๆ',
                                        ].map((label) => (
                                            <th key={label} style={{ ...styles.cell, fontSize: '9.5px', fontWeight: 900, height: '27px', whiteSpace: 'pre-line' }}>{label}</th>
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
                                            systems.other,
                                        ].map((checked, index) => (
                                            <td key={index} style={{ ...styles.cell, height: '23px' }}><CheckBox checked={checked} /></td>
                                        ))}
                                    </tr>
                                </tbody>
                            </table>

                            <div style={styles.sectionTitle}>รายละเอียดการร้องขอ</div>
                            <div style={styles.dottedLine}>{systems.other ? `ระบบอื่น ๆ: ${formData.otherSystemDetails || ''} ` : ''}{formData.requestDetails || ''}</div>
                            <div style={styles.dottedLine}></div>
                            <div style={{ ...styles.dottedLine, marginBottom: '7px' }}></div>

                            <table style={{ ...styles.table, marginBottom: '5px' }}>
                                <tbody>
                                    <tr>
                                        <SignatureBox title="ลงนาม หน./ผจก. แผนก/ฝ่าย ต้นสังกัด" sign={formData.managerSign} />
                                        <SignatureBox title="ลงนามหัวหน้าส่วนเทคโนโลยีสารสนเทศและ ERP" sign={formData.itSupervisorSign || formData.itManagerSign} />
                                        <SignatureBox title="ลงนามผู้จัดการแผนกเทคโนโลยีสารสนเทศและ ERP" sign={formData.itManagerSign} />
                                    </tr>
                                </tbody>
                            </table>

                            <div style={styles.sectionTitle}>ผลการดำเนินการ (ส่วนของผู้ดำเนินการ)</div>
                            <div style={styles.dottedLine}>{formData.actionResult || ''}</div>
                            <div style={{ ...styles.dottedLine, marginBottom: '6px' }}></div>

                            <div style={styles.sectionTitle}>ส่วนรับทราบผลการปฏิบัติงาน</div>
                            <table style={{ ...styles.table, marginBottom: '5px' }}>
                                <tbody>
                                    <tr>
                                        <SignatureBox title="ผู้แจ้งงานลงนามรับทราบผลการใช้งาน" sign={formData.requesterSign} height={52} />
                                        <SignatureBox title="ลงนามผู้ปฏิบัติงาน ผู้ติดตั้งการใช้งาน" sign={formData.itSign} name={formData.itStaffName} height={52} />
                                    </tr>
                                </tbody>
                            </table>

                            <div style={styles.sectionTitle}>ส่วนยกเลิกการใช้งาน</div>
                            <table style={{ width: '48%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                <tbody>
                                    <tr>
                                        <SignatureBox
                                            title="ลงนามผู้ปฏิบัติงาน ผู้ยกเลิกการใช้งาน"
                                            sign={formData.cancelItSign}
                                            name={formData.cancelItName}
                                            date={formData.cancelledAt ? new Date(formData.cancelledAt).toLocaleDateString('th-TH') : undefined}
                                            height={52}
                                        />
                                    </tr>
                                </tbody>
                            </table>

                            {formData.cancelReason && (
                                <div style={{ marginTop: '4px', fontSize: '9.5px', color: '#b91c1c' }}>เหตุผลการยกเลิก: {formData.cancelReason}</div>
                            )}

                            <div style={{ position: 'absolute', bottom: '18mm', left: '17mm', right: '17mm', display: 'flex', justifyContent: 'space-between', fontSize: '9.5px' }}>
                                <div>Revision NO : 04</div>
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

export default Fmit12PdfPreview;
