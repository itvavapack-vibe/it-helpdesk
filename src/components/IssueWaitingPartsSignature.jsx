import React, { useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { CheckCircle2, ClipboardCheck, Eraser, FileSignature, Loader2, XCircle } from 'lucide-react';
import Swal from 'sweetalert2';
import { mysql } from '../mysqlClient';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@/components/ui';
import { toMysqlDateTime } from '../utils/dateTime';
import { loadSignatureIntoCanvas } from '../utils/signatureCanvas';

const IssueWaitingPartsSignature = ({ issueId, onSignWaitingPartsIssue }) => {
    const signatureRef = useRef(null);
    const [issue, setIssue] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({ name: '', position: '' });

    useEffect(() => {
        const fetchIssue = async () => {
            if (!issueId) {
                setIsLoading(false);
                return;
            }

            const { data, error } = await mysql
                .from('issues')
                .select('*')
                .eq('id', issueId)
                .single();

            if (error) {
                console.error('Error loading issue for waiting parts signature:', error);
                setIssue(null);
            } else {
                setIssue(data);
                setFormData({
                    name: data?.waiting_parts_user_name || data?.name || '',
                    position: data?.waiting_parts_user_position || data?.user_close_position || '',
                });
                if (data?.waiting_parts_user_sign) {
                    loadSignatureIntoCanvas(signatureRef, data.waiting_parts_user_sign, 150);
                }
            }
            setIsLoading(false);
        };

        fetchIssue();
    }, [issueId]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!issue) return;

        if (issue.status !== 'Waiting for Parts') {
            Swal.fire('ยังเซ็นรับทราบไม่ได้', 'รายการนี้ยังไม่ได้อยู่ในสถานะรออะไหล่', 'warning');
            return;
        }
        if (issue.waiting_parts_user_sign || issue.waiting_parts_signed_at) {
            Swal.fire('เซ็นรับทราบแล้ว', 'รายการนี้มีลายเซ็นรับทราบการเปิด PR ขอซื้ออะไหล่แล้ว', 'info');
            return;
        }
        if (!formData.name.trim()) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณาระบุชื่อผู้แจ้ง', 'warning');
            return;
        }
        if (!signatureRef.current || signatureRef.current.isEmpty()) {
            Swal.fire('ยังไม่ได้เซ็น', 'กรุณาเซ็นรับทราบการเปิด PR ขอซื้ออะไหล่', 'warning');
            return;
        }

        setIsSubmitting(true);
        const signature = signatureRef.current.getCanvas().toDataURL('image/png');
        const signedAt = toMysqlDateTime();
        const payload = {
            name: formData.name.trim(),
            position: formData.position.trim(),
            signature,
            signedAt,
        };
        const ok = await onSignWaitingPartsIssue(issue.id, payload);
        setIsSubmitting(false);

        if (ok) {
            setIssue(prev => ({
                ...prev,
                waiting_parts_user_name: payload.name,
                waiting_parts_user_position: payload.position,
                waiting_parts_user_sign: payload.signature,
                waiting_parts_signed_at: payload.signedAt,
            }));
            Swal.fire('บันทึกลายเซ็นแล้ว', 'สามารถนำใบแจ้งซ่อมไปแนบหลักฐานเปิด PR ขอซื้ออะไหล่ได้แล้ว', 'success');
        }
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

    if (!issue) {
        return (
            <Card className="mx-auto min-h-screen w-full max-w-3xl rounded-none border-0 sm:min-h-0 sm:rounded-3xl sm:border">
                <CardContent className="p-10 text-center">
                    <XCircle className="mx-auto mb-4 h-14 w-14 text-rose-500" />
                    <CardTitle className="text-xl">ไม่พบรายการแจ้งซ่อม</CardTitle>
                    <CardDescription className="mt-2">กรุณาตรวจสอบลิงก์อีกครั้ง</CardDescription>
                </CardContent>
            </Card>
        );
    }

    const alreadySigned = Boolean(issue.waiting_parts_user_sign || issue.waiting_parts_signed_at);
    const canSign = issue.status === 'Waiting for Parts';

    return (
        <div className="flex min-h-screen w-full animate-fade-in items-start justify-center p-0 sm:p-6">
            <Card className="min-h-screen w-full max-w-3xl rounded-none border-0 sm:min-h-0 sm:rounded-3xl sm:border sm:shadow-xl">
                <CardHeader className="flex-row items-start gap-4 space-y-0">
                    <div className="rounded-2xl bg-pink-100 p-3 text-pink-600 dark:bg-pink-900/40 dark:text-pink-300">
                        <ClipboardCheck className="h-7 w-7" />
                    </div>
                    <div>
                        <CardTitle>เซ็นรับทราบเปิด PR ขอซื้ออะไหล่</CardTitle>
                        <CardDescription className="mt-1">
                            ใช้ลายเซ็นนี้ประกอบใบแจ้งซ่อมสำหรับแนบหลักฐานการเปิด PR ขอซื้ออะไหล่
                        </CardDescription>
                    </div>
                </CardHeader>

                <CardContent className="space-y-6">
                    <div className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-sm dark:border-slate-700/70 dark:bg-slate-900/40">
                        <div><span className="font-semibold text-slate-500">เลขที่:</span> <span className="font-bold text-indigo-600">{issue.id}</span></div>
                        <div><span className="font-semibold text-slate-500">ผู้แจ้ง:</span> {issue.name}</div>
                        <div><span className="font-semibold text-slate-500">แผนก:</span> {issue.department}</div>
                        <div><span className="font-semibold text-slate-500">สถานะ:</span> {issue.status}</div>
                        <div className="whitespace-pre-wrap"><span className="font-semibold text-slate-500">ปัญหา:</span> {issue.description}</div>
                        {issue.repair_details && <div className="whitespace-pre-wrap"><span className="font-semibold text-slate-500">แนวทางแก้ไข/ความคิดเห็น:</span> {issue.repair_details}</div>}
                    </div>

                    {!canSign ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-300">
                            รายการนี้ยังไม่ได้อยู่ในสถานะรออะไหล่ จึงยังเซ็นรับทราบการเปิด PR ขอซื้ออะไหล่ไม่ได้
                        </div>
                    ) : alreadySigned ? (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-300">
                            <div className="flex items-center gap-2 font-bold">
                                <CheckCircle2 className="h-5 w-5" />
                                รายการนี้เซ็นรับทราบแล้ว
                            </div>
                            <p className="mt-2 text-sm">ผู้เซ็น: {issue.waiting_parts_user_name || '-'}</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="waiting-parts-name">ชื่อผู้แจ้ง</Label>
                                <Input
                                    id="waiting-parts-name"
                                    value={formData.name}
                                    onChange={(event) => setFormData(prev => ({ ...prev, name: event.target.value }))}
                                    placeholder="ชื่อ-นามสกุล"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="waiting-parts-position">ตำแหน่ง</Label>
                                <Input
                                    id="waiting-parts-position"
                                    value={formData.position}
                                    onChange={(event) => setFormData(prev => ({ ...prev, position: event.target.value }))}
                                    placeholder="ตำแหน่ง"
                                />
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
                                    <SignatureCanvas ref={signatureRef} canvasProps={{ className: 'h-full w-full', 'aria-label': 'ลายเซ็นผู้แจ้งรับทราบเปิด PR ขอซื้ออะไหล่' }} />
                                </div>
                            </div>
                            <Button type="submit" disabled={isSubmitting} className="w-full bg-pink-600 hover:bg-pink-700 shadow-pink-200/50">
                                {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                                ยืนยันรับทราบเปิด PR ขอซื้ออะไหล่
                            </Button>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default IssueWaitingPartsSignature;
