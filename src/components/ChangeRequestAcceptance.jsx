import React, { useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { CheckCircle2, ClipboardCheck, Eraser, FileSignature, Loader2, XCircle } from 'lucide-react';
import Swal from 'sweetalert2';
import { mysql } from '../mysqlClient';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Label } from '@/components/ui';
import { toMysqlDateTime } from '../utils/dateTime';
import { loadSignatureIntoCanvas } from '../utils/signatureCanvas';

const ChangeRequestAcceptance = ({ requestId }) => {
    const signatureRef = useRef(null);
    const [request, setRequest] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [acceptance, setAcceptance] = useState('Accepted');
    const [rejectReason, setRejectReason] = useState('');

    useEffect(() => {
        const fetchRequest = async () => {
            if (!requestId) {
                setIsLoading(false);
                return;
            }

            const { data, error } = await mysql
                .from('change_requests')
                .select('*')
                .eq('id', requestId)
                .single();

            if (error) {
                console.error('Error loading change request for acceptance:', error);
                setRequest(null);
            } else {
                setRequest(data);
            }
            setIsLoading(false);
        };

        fetchRequest();
    }, [requestId]);

    useEffect(() => {
        if (!request?.requester_sign || request.status === 'Completed') return;
        loadSignatureIntoCanvas(signatureRef, request.requester_sign);
    }, [request]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!request) return;
        if (request.status !== 'Pending_User_Acceptance') {
            Swal.fire('ยังยืนยันไม่ได้', 'รายการนี้ไม่ได้อยู่ในสถานะรอส่งมอบ', 'warning');
            return;
        }
        if (!signatureRef.current || signatureRef.current.isEmpty()) {
            Swal.fire('ยังไม่ได้เซ็น', 'กรุณาเซ็นยืนยันรับมอบงาน', 'warning');
            return;
        }
        if (acceptance === 'Rejected' && !rejectReason.trim()) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณาระบุสาเหตุที่ไม่ถูกต้อง', 'warning');
            return;
        }

        setIsSubmitting(true);
        const signature = signatureRef.current.getCanvas().toDataURL('image/png');
        const updateData = {
            user_acceptance: acceptance,
            user_reject_reason: acceptance === 'Rejected' ? rejectReason.trim() : null,
            user_accept_sign: signature,
            user_accept_date: toMysqlDateTime(),
            status: acceptance === 'Accepted' ? 'Completed' : 'In_Development'
        };
        const { error } = await mysql.from('change_requests').update(updateData).eq('id', request.id);
        setIsSubmitting(false);

        if (error) {
            console.error('Error accepting change request:', error);
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกลายเซ็นได้ กรุณาลองใหม่อีกครั้ง', 'error');
            return;
        }

        setRequest(prev => ({ ...prev, ...updateData }));
        Swal.fire(
            acceptance === 'Accepted' ? 'ปิดจบคำร้องแล้ว' : 'ส่งกลับให้ IT ดำเนินการต่อแล้ว',
            acceptance === 'Accepted' ? 'บันทึกลายเซ็นรับมอบงานเรียบร้อย' : 'บันทึกสาเหตุที่ไม่ถูกต้องเรียบร้อย',
            'success'
        );
    };

    if (isLoading) {
        return (
            <Card className="mx-auto min-h-screen w-full max-w-3xl rounded-none border-0 sm:min-h-0 sm:rounded-3xl sm:border">
                <CardContent className="flex items-center justify-center gap-3 p-10 text-slate-500">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    กำลังโหลดข้อมูล...
                </CardContent>
            </Card>
        );
    }

    if (!request) {
        return (
            <Card className="mx-auto min-h-screen w-full max-w-3xl rounded-none border-0 sm:min-h-0 sm:rounded-3xl sm:border">
                <CardContent className="p-10 text-center">
                    <XCircle className="mx-auto mb-4 h-14 w-14 text-rose-500" />
                    <CardTitle className="text-xl">ไม่พบคำร้องขอพัฒนา</CardTitle>
                    <CardDescription className="mt-2">กรุณาตรวจสอบลิงก์อีกครั้ง</CardDescription>
                </CardContent>
            </Card>
        );
    }

    const alreadyAccepted = request.status === 'Completed';

    return (
        <div className="flex min-h-screen w-full items-start justify-center p-0 sm:p-6 animate-fade-in">
            <Card className="min-h-screen w-full max-w-3xl rounded-none border-0 sm:min-h-0 sm:rounded-3xl sm:border sm:shadow-xl">
                <CardHeader className="flex-row items-start gap-4 space-y-0">
                    <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
                        <ClipboardCheck className="h-7 w-7" />
                    </div>
                    <div>
                        <CardTitle>เซ็นรับมอบงานขอพัฒนา</CardTitle>
                        <CardDescription className="mt-1">ยืนยันว่ารับทราบผลการดำเนินการและปิดจบคำร้องเรียบร้อย</CardDescription>
                    </div>
                </CardHeader>

                <CardContent className="space-y-6">
                    <div className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-sm dark:border-slate-700/70 dark:bg-slate-900/40">
                        <div><span className="font-semibold text-slate-500">เลขเอกสาร:</span> <span className="font-bold text-indigo-600">{request.ticket_number}</span></div>
                        <div><span className="font-semibold text-slate-500">ผู้แจ้ง:</span> {request.requester_name}</div>
                        <div><span className="font-semibold text-slate-500">แผนก:</span> {request.department}</div>
                        <div><span className="font-semibold text-slate-500">รายละเอียด:</span> {request.details}</div>
                        {request.it_solution && <div><span className="font-semibold text-slate-500">ผลการดำเนินการ:</span> {request.it_solution}</div>}
                    </div>

                    {alreadyAccepted ? (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-300">
                            <div className="flex items-center gap-2 font-bold">
                                <CheckCircle2 className="h-5 w-5" />
                                คำร้องนี้เซ็นรับมอบและปิดจบแล้ว
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-700/70 dark:bg-slate-900/40">
                                <div className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">ผลการตรวจรับงาน</div>
                                <div className="space-y-2 text-sm">
                                    <label className="flex items-center gap-2">
                                        <input type="radio" name="acceptance" value="Accepted" checked={acceptance === 'Accepted'} onChange={() => setAcceptance('Accepted')} />
                                        ถูกต้องครบถ้วน
                                    </label>
                                    <label className="flex items-center gap-2">
                                        <input type="radio" name="acceptance" value="Rejected" checked={acceptance === 'Rejected'} onChange={() => setAcceptance('Rejected')} />
                                        ไม่ถูกต้อง
                                    </label>
                                </div>
                                {acceptance === 'Rejected' && (
                                    <textarea
                                        className="input-modern mt-3 w-full"
                                        rows="3"
                                        placeholder="ระบุสาเหตุที่ไม่ถูกต้อง..."
                                        value={rejectReason}
                                        onChange={(event) => setRejectReason(event.target.value)}
                                    />
                                )}
                            </div>
                            <div>
                                <div className="mb-2 flex items-center justify-between">
                                    <Label className="flex items-center gap-2">
                                        <FileSignature className="h-4 w-4" />
                                        ลายเซ็นผู้แจ้ง
                                    </Label>
                                    <Button type="button" variant="ghost" size="sm" onClick={() => signatureRef.current?.clear()} className="text-xs text-slate-500 hover:text-rose-500">
                                        <Eraser className="h-3.5 w-3.5" />
                                        ล้างลายเซ็น
                                    </Button>
                                </div>
                                <div className="h-44 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
                                    <SignatureCanvas ref={signatureRef} canvasProps={{ className: 'h-full w-full' }} />
                                </div>
                            </div>
                            <Button type="submit" disabled={isSubmitting} className="w-full bg-emerald-600 shadow-emerald-200/50 hover:bg-emerald-700">
                                {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                                ยืนยันรับมอบและปิดจบงาน
                            </Button>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default ChangeRequestAcceptance;
