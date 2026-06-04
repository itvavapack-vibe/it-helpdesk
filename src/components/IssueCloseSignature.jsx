import React, { useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { CheckCircle2, ClipboardCheck, Eraser, FileSignature, Loader2, XCircle } from 'lucide-react';
import Swal from 'sweetalert2';
import { mysql } from '../mysqlClient';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Textarea } from '@/components/ui';
import { toMysqlDateTime } from '../utils/dateTime';

const IssueCloseSignature = ({ issueId, onCloseIssue }) => {
    const signatureRef = useRef(null);
    const [issue, setIssue] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({ name: '', position: '', note: '' });

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
                console.error('Error loading issue for close signature:', error);
                setIssue(null);
            } else {
                setIssue(data);
                setFormData(prev => ({
                    ...prev,
                    name: data?.user_close_name || data?.name || '',
                    position: data?.user_close_position || ''
                }));
            }
            setIsLoading(false);
        };

        fetchIssue();
    }, [issueId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!issue) return;
        if (issue.status === 'Closed' || issue.user_closed_at) {
            Swal.fire('ปิดจบงานแล้ว', 'รายการนี้ถูกปิดจบงานเรียบร้อยแล้ว', 'info');
            return;
        }
        if (issue.status !== 'Resolved') {
            Swal.fire('ยังปิดงานไม่ได้', 'รายการนี้ยังไม่ได้อยู่ในสถานะเสร็จสิ้น', 'warning');
            return;
        }
        if (!formData.name.trim()) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณาระบุชื่อผู้เซ็นปิดงาน', 'warning');
            return;
        }
        if (!formData.position.trim()) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณาระบุตำแหน่งผู้เซ็นปิดงาน', 'warning');
            return;
        }
        if (!signatureRef.current || signatureRef.current.isEmpty()) {
            Swal.fire('ยังไม่ได้เซ็น', 'กรุณาเซ็นยืนยันการปิดงาน', 'warning');
            return;
        }

        setIsSubmitting(true);
        const signature = signatureRef.current.getCanvas().toDataURL('image/png');
        const ok = await onCloseIssue(issue.id, {
            name: formData.name.trim(),
            position: formData.position.trim(),
            note: formData.note.trim(),
            signature
        });
        setIsSubmitting(false);

        if (ok) {
            setIssue(prev => ({
                ...prev,
                status: 'Closed',
                user_close_name: formData.name.trim(),
                user_close_position: formData.position.trim(),
                user_close_note: formData.note.trim(),
                user_close_sign: signature,
                user_closed_at: toMysqlDateTime()
            }));
            Swal.fire('ปิดจบงานแล้ว', 'บันทึกลายเซ็นผู้ใช้งานเรียบร้อย', 'success');
        }
    };

    if (isLoading) {
        return (
            <Card className="min-h-screen w-full rounded-none border-0">
                <CardContent className="p-10 flex items-center justify-center gap-3 text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    กำลังโหลดข้อมูล...
                </CardContent>
            </Card>
        );
    }

    if (!issue) {
        return (
            <Card className="min-h-screen w-full rounded-none border-0">
                <CardContent className="p-10 text-center">
                    <XCircle className="w-14 h-14 text-rose-500 mx-auto mb-4" />
                    <CardTitle className="text-xl">ไม่พบรายการแจ้งซ่อม</CardTitle>
                    <CardDescription className="mt-2">กรุณาตรวจสอบลิงก์อีกครั้ง</CardDescription>
                </CardContent>
            </Card>
        );
    }

    const alreadyClosed = issue.status === 'Closed' || Boolean(issue.user_close_sign || issue.user_closed_at);

    return (
        <div className="min-h-screen w-full animate-fade-in">
            <Card className="min-h-screen w-full rounded-none border-0">
                <CardHeader className="flex-row items-start gap-4 space-y-0">
                    <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
                        <ClipboardCheck className="w-7 h-7" />
                    </div>
                    <div>
                        <CardTitle>เซ็นปิดจบงานแจ้งซ่อม</CardTitle>
                        <CardDescription className="mt-1">
                            ยืนยันว่ารับทราบผลการดำเนินการและปิดงานเรียบร้อย
                        </CardDescription>
                    </div>
                </CardHeader>

                <CardContent className="space-y-6">
                    <div className="grid gap-3 text-sm bg-slate-50/80 dark:bg-slate-900/40 rounded-2xl p-4 border border-slate-100 dark:border-slate-700/70">
                        <div><span className="font-semibold text-slate-500">เลขที่:</span> <span className="font-bold text-indigo-600">{issue.id}</span></div>
                        <div><span className="font-semibold text-slate-500">ผู้แจ้ง:</span> {issue.name}</div>
                        <div><span className="font-semibold text-slate-500">แผนก:</span> {issue.department}</div>
                        <div><span className="font-semibold text-slate-500">ปัญหา:</span> {issue.description}</div>
                        {issue.repair_details && <div><span className="font-semibold text-slate-500">ผลการดำเนินการ:</span> {issue.repair_details}</div>}
                    </div>

                    {alreadyClosed ? (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-300">
                            <div className="flex items-center gap-2 font-bold">
                                <CheckCircle2 className="w-5 h-5" />
                                รายการนี้เซ็นปิดงานแล้ว
                            </div>
                            <p className="text-sm mt-2">ผู้เซ็น: {issue.user_close_name || '-'}</p>
                            <p className="text-sm mt-1">ตำแหน่ง: {issue.user_close_position || '-'}</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="close-name">ชื่อผู้เซ็นปิดงาน</Label>
                                <Input
                                    id="close-name"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="ชื่อ-นามสกุล"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="close-position">ตำแหน่งผู้เซ็นปิดงาน</Label>
                                <Input
                                    id="close-position"
                                    value={formData.position}
                                    onChange={(e) => setFormData(prev => ({ ...prev, position: e.target.value }))}
                                    placeholder="ตำแหน่ง"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="close-note">หมายเหตุ</Label>
                                <Textarea
                                    id="close-note"
                                    value={formData.note}
                                    onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
                                    rows="3"
                                    placeholder="ระบุหมายเหตุเพิ่มเติมถ้ามี"
                                />
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <Label className="flex items-center gap-2">
                                        <FileSignature className="w-4 h-4" />
                                        ลายเซ็น
                                    </Label>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => signatureRef.current?.clear()}
                                        className="text-xs text-slate-500 hover:text-rose-500"
                                    >
                                        <Eraser className="w-3.5 h-3.5" />
                                        ล้างลายเซ็น
                                    </Button>
                                </div>
                                <div className="h-44 rounded-2xl border border-slate-200 bg-white dark:bg-slate-950 dark:border-slate-700 overflow-hidden">
                                    <SignatureCanvas ref={signatureRef} canvasProps={{ className: 'w-full h-full', 'aria-label': 'ลายเซ็นผู้แจ้งปิดจบงาน' }} />
                                </div>
                            </div>
                            <Button type="submit" disabled={isSubmitting} className="w-full bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200/50">
                                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                                ยืนยันปิดจบงาน
                            </Button>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default IssueCloseSignature;
