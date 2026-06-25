import React, { useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { CheckCircle2, ClipboardCheck, Eraser, FileSignature, Loader2, XCircle } from 'lucide-react';
import Swal from 'sweetalert2';
import { mysql } from '../mysqlClient';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@/components/ui';
import { toMysqlDateTime } from '../utils/dateTime';

const BORROW_IT_CATEGORY = 'ยืมคอมพิวเตอร์/อุปกรณ์IT';

const normalizeBorrowCategory = (value) => String(value || '').replace(/\s+/g, '');
const isBorrowIssue = (issue) => normalizeBorrowCategory(issue?.category) === normalizeBorrowCategory(BORROW_IT_CATEGORY);

const formatDisplayDateTime = (value = new Date()) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('th-TH');
};

const BorrowReturnSignature = ({ issueId, onReturnBorrowIssue }) => {
    const signatureRef = useRef(null);
    const [issue, setIssue] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({ name: '', position: '' });
    const [returnDate] = useState(() => new Date());

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
                console.error('Error loading issue for borrow return:', error);
                setIssue(null);
            } else {
                setIssue(data);
                setFormData({
                    name: data?.borrow_returner_name || data?.user_close_name || data?.name || '',
                    position: data?.borrow_returner_position || data?.user_close_position || '',
                });
            }
            setIsLoading(false);
        };

        fetchIssue();
    }, [issueId]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!issue) return;

        if (!isBorrowIssue(issue)) {
            Swal.fire('ไม่ใช่รายการยืมอุปกรณ์', 'ลิงก์นี้ใช้ได้เฉพาะหมวดหมู่ยืมคอมพิวเตอร์/อุปกรณ์ IT', 'warning');
            return;
        }
        if (!(issue.status === 'Closed' || issue.user_closed_at)) {
            Swal.fire('ยังส่งคืนไม่ได้', 'รายการนี้ต้องปิดจบก่อนจึงจะบันทึกส่งคืนได้', 'warning');
            return;
        }
        if (issue.borrow_returned_at || issue.borrow_returner_sign) {
            Swal.fire('ส่งคืนแล้ว', 'รายการนี้มีการลงนามส่งคืนเรียบร้อยแล้ว', 'info');
            return;
        }
        if (!formData.name.trim()) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณาระบุชื่อผู้ส่งคืน', 'warning');
            return;
        }
        if (!formData.position.trim()) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณาระบุตำแหน่งผู้ส่งคืน', 'warning');
            return;
        }
        if (!signatureRef.current || signatureRef.current.isEmpty()) {
            Swal.fire('ยังไม่ได้เซ็น', 'กรุณาเซ็นชื่อผู้ส่งคืน', 'warning');
            return;
        }

        setIsSubmitting(true);
        const signature = signatureRef.current.getCanvas().toDataURL('image/png');
        const returnedAt = toMysqlDateTime(returnDate);
        const ok = await onReturnBorrowIssue(issue.id, {
            name: formData.name.trim(),
            position: formData.position.trim(),
            signature,
            returnedAt,
        });
        setIsSubmitting(false);

        if (ok) {
            setIssue(prev => ({
                ...prev,
                borrow_returner_name: formData.name.trim(),
                borrow_returner_position: formData.position.trim(),
                borrow_returner_sign: signature,
                borrow_returned_at: returnedAt,
            }));
            Swal.fire('บันทึกส่งคืนแล้ว', 'บันทึกลายเซ็นผู้ส่งคืนเรียบร้อย', 'success');
        }
    };

    if (isLoading) {
        return (
            <Card className="mx-auto min-h-screen w-full max-w-3xl rounded-none border-0 sm:min-h-0 sm:rounded-3xl sm:border">
                <CardContent className="p-10 flex items-center justify-center gap-3 text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    กำลังโหลดข้อมูล...
                </CardContent>
            </Card>
        );
    }

    if (!issue) {
        return (
            <Card className="mx-auto min-h-screen w-full max-w-3xl rounded-none border-0 sm:min-h-0 sm:rounded-3xl sm:border">
                <CardContent className="p-10 text-center">
                    <XCircle className="w-14 h-14 text-rose-500 mx-auto mb-4" />
                    <CardTitle className="text-xl">ไม่พบรายการแจ้งซ่อม</CardTitle>
                    <CardDescription className="mt-2">กรุณาตรวจสอบลิงก์อีกครั้ง</CardDescription>
                </CardContent>
            </Card>
        );
    }

    const alreadyReturned = Boolean(issue.borrow_returner_sign || issue.borrow_returned_at);
    const canReturn = isBorrowIssue(issue) && (issue.status === 'Closed' || issue.user_closed_at);

    return (
        <div className="flex min-h-screen w-full items-start justify-center p-0 sm:p-6 animate-fade-in">
            <Card className="min-h-screen w-full max-w-3xl rounded-none border-0 sm:min-h-0 sm:rounded-3xl sm:border sm:shadow-xl">
                <CardHeader className="flex-row items-start gap-4 space-y-0">
                    <div className="p-3 rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300">
                        <ClipboardCheck className="w-7 h-7" />
                    </div>
                    <div>
                        <CardTitle>บันทึกส่งคืนคอมพิวเตอร์/อุปกรณ์ IT</CardTitle>
                        <CardDescription className="mt-1">วันที่ส่งคืนถูกกำหนดตามวันที่กดลิงก์และไม่สามารถแก้ไขได้</CardDescription>
                    </div>
                </CardHeader>

                <CardContent className="space-y-6">
                    <div className="grid gap-3 text-sm bg-slate-50/80 dark:bg-slate-900/40 rounded-2xl p-4 border border-slate-100 dark:border-slate-700/70">
                        <div><span className="font-semibold text-slate-500">เลขที่:</span> <span className="font-bold text-indigo-600">{issue.id}</span></div>
                        <div><span className="font-semibold text-slate-500">ผู้แจ้ง:</span> {issue.name}</div>
                        <div><span className="font-semibold text-slate-500">แผนก:</span> {issue.department}</div>
                        <div><span className="font-semibold text-slate-500">หมวดหมู่:</span> {issue.category}</div>
                        <div className="whitespace-pre-wrap"><span className="font-semibold text-slate-500">รายละเอียด:</span> {issue.description}</div>
                        <div><span className="font-semibold text-slate-500">วันที่ส่งคืน:</span> {formatDisplayDateTime(returnDate)}</div>
                    </div>

                    {!canReturn ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-300">
                            รายการนี้ยังไม่สามารถบันทึกส่งคืนได้
                        </div>
                    ) : alreadyReturned ? (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-300">
                            <div className="flex items-center gap-2 font-bold">
                                <CheckCircle2 className="w-5 h-5" />
                                รายการนี้บันทึกส่งคืนแล้ว
                            </div>
                            <p className="text-sm mt-2">ผู้ส่งคืน: {issue.borrow_returner_name || '-'}</p>
                            <p className="text-sm mt-1">วันที่ส่งคืน: {formatDisplayDateTime(issue.borrow_returned_at)}</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="return-name">ชื่อผู้ส่งคืน</Label>
                                <Input id="return-name" value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder="ชื่อ-นามสกุล" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="return-position">ตำแหน่งผู้ส่งคืน</Label>
                                <Input id="return-position" value={formData.position} onChange={(e) => setFormData(prev => ({ ...prev, position: e.target.value }))} placeholder="ตำแหน่ง" />
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <Label className="flex items-center gap-2">
                                        <FileSignature className="w-4 h-4" />
                                        ลายเซ็นผู้ส่งคืน
                                    </Label>
                                    <Button type="button" variant="ghost" size="sm" onClick={() => signatureRef.current?.clear()} className="text-xs text-slate-500 hover:text-rose-500">
                                        <Eraser className="w-3.5 h-3.5" />
                                        ล้างลายเซ็น
                                    </Button>
                                </div>
                                <div className="h-44 rounded-2xl border border-slate-200 bg-white dark:bg-slate-950 dark:border-slate-700 overflow-hidden">
                                    <SignatureCanvas ref={signatureRef} canvasProps={{ className: 'w-full h-full', 'aria-label': 'ลายเซ็นผู้ส่งคืนอุปกรณ์' }} />
                                </div>
                            </div>
                            <Button type="submit" disabled={isSubmitting} className="w-full bg-amber-600 hover:bg-amber-700 shadow-amber-200/50">
                                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                                ยืนยันส่งคืน
                            </Button>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default BorrowReturnSignature;
