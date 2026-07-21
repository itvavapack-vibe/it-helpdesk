import React, { useEffect, useMemo, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { CheckCircle2, ClipboardCheck, Eraser, FileSignature, ImagePlus, Loader2, X, XCircle } from 'lucide-react';
import Swal from 'sweetalert2';
import { mysql } from '../mysqlClient';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Textarea } from '@/components/ui';
import { toMysqlDateTime } from '../utils/dateTime';
import { loadSignatureIntoCanvas } from '../utils/signatureCanvas';
import { resolveAttachmentUrl } from '../utils/fileUpload';

const imageExtensionPattern = /\.(png|jpe?g|gif|webp|bmp|avif)(?:\?.*)?$/i;

const parseAttachments = (value) => {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const isImageAttachment = (file) => {
    const mimeType = String(file?.type || file?.mimetype || file?.mimeType || '').toLowerCase();
    const url = String(file?.url || file?.path || file?.name || '').toLowerCase();
    return mimeType.startsWith('image/') || imageExtensionPattern.test(url);
};

const isItRepairEvidence = (file) => {
    const uploadedByType = String(file?.uploadedByType || '').toLowerCase();
    const source = String(file?.source || '').toLowerCase();
    return uploadedByType === 'it' || source === 'repair_evidence';
};

const IssueCloseSignature = ({ issueId, onCloseIssue }) => {
    const signatureRef = useRef(null);
    const [issue, setIssue] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({ name: '', position: '', note: '' });
    const [latestCloseSignature, setLatestCloseSignature] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);

    const repairEvidenceImages = useMemo(() => (
        parseAttachments(issue?.attachments_json).filter((file) => isImageAttachment(file) && isItRepairEvidence(file))
    ), [issue?.attachments_json]);

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
                let previousClose = null;
                if (data?.name && !data?.user_close_sign && !data?.user_closed_at) {
                    const { data: previousIssues, error: previousError } = await mysql
                        .from('issues')
                        .select('id,name,user_close_position,user_close_sign,user_closed_at,created_at')
                        .eq('name', data.name)
                        .order('user_closed_at', { ascending: false })
                        .limit(20);

                    if (previousError) {
                        console.error('Error loading latest close signature:', previousError);
                    } else {
                        previousClose = (previousIssues || []).find((item) =>
                            String(item.id) !== String(data.id) && item.user_close_sign
                        );
                    }
                }
                setLatestCloseSignature(previousClose?.user_close_sign || null);
                setFormData(prev => ({
                    ...prev,
                    name: data?.user_close_name || data?.name || '',
                    position: data?.user_close_position || previousClose?.user_close_position || ''
                }));
            }
            setIsLoading(false);
        };

        fetchIssue();
    }, [issueId]);

    useEffect(() => {
        if (!issue || issue.status === 'Closed' || issue.user_close_sign || issue.user_closed_at || !latestCloseSignature) return;
        loadSignatureIntoCanvas(signatureRef, latestCloseSignature, 100);
    }, [issue, latestCloseSignature]);

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
        const hasCanvasSignature = signatureRef.current && !signatureRef.current.isEmpty();
        if (!hasCanvasSignature && !latestCloseSignature) {
            Swal.fire('ยังไม่ได้เซ็น', 'กรุณาเซ็นยืนยันการปิดงาน', 'warning');
            return;
        }

        setIsSubmitting(true);
        const signature = hasCanvasSignature
            ? signatureRef.current.getCanvas().toDataURL('image/png')
            : latestCloseSignature;

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

    const alreadyClosed = issue.status === 'Closed' || Boolean(issue.user_close_sign || issue.user_closed_at);

    return (
        <div className="flex min-h-screen w-full items-start justify-center p-0 sm:p-6 animate-fade-in">
            <Card className="min-h-screen w-full max-w-3xl rounded-none border-0 sm:min-h-0 sm:rounded-3xl sm:border sm:shadow-xl">
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

                    <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 dark:border-sky-900/50 dark:bg-sky-950/20">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
                                    <ImagePlus className="h-4 w-4 text-sky-600 dark:text-sky-300" />
                                    รูปหลักฐานการซ่อม
                                </div>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    กรุณาตรวจสอบรูปประกอบก่อนเซ็นยืนยันปิดจบงาน
                                </p>
                            </div>
                            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-sky-700 shadow-sm dark:bg-slate-900/60 dark:text-sky-200">
                                {repairEvidenceImages.length} รูป
                            </span>
                        </div>
                        {repairEvidenceImages.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-sky-200 bg-white/70 p-4 text-center text-sm text-slate-500 dark:border-sky-900/60 dark:bg-slate-900/40 dark:text-slate-400">
                                ยังไม่มีรูปหลักฐานการซ่อมแนบในระบบ
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                {repairEvidenceImages.map((file, index) => {
                                    const imageUrl = resolveAttachmentUrl(file.url || file.path);
                                    return (
                                        <button
                                            key={`${imageUrl || file.name}-${index}`}
                                            type="button"
                                            onClick={() => setPreviewImage({ ...file, imageUrl, index })}
                                            className="group overflow-hidden rounded-xl border border-white bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-900/70 dark:hover:border-sky-800"
                                        >
                                            <div className="aspect-[4/3] bg-slate-100 dark:bg-slate-800">
                                                <img
                                                    src={imageUrl}
                                                    alt={`รูปหลักฐานการซ่อม ${index + 1}`}
                                                    className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                                                />
                                            </div>
                                            <div className="p-2 text-xs">
                                                <div className="font-bold text-slate-700 dark:text-slate-200">รูปที่ {index + 1}</div>
                                                <div className="mt-0.5 truncate text-slate-400">{file.name || 'repair evidence'}</div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
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
                                        onClick={() => {
                                            signatureRef.current?.clear();
                                            setLatestCloseSignature(null);
                                        }}
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
            {previewImage && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={() => setPreviewImage(null)}>
                    <div className="relative max-h-full w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                            <div>
                                <div className="font-bold text-slate-900 dark:text-white">รูปหลักฐานการซ่อม {previewImage.index + 1}</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">{previewImage.name || '-'}</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setPreviewImage(null)}
                                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-rose-500 dark:hover:bg-slate-800"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="flex max-h-[78vh] items-center justify-center bg-slate-100 p-3 dark:bg-slate-950">
                            <img src={previewImage.imageUrl} alt={`รูปหลักฐานการซ่อม ${previewImage.index + 1}`} className="max-h-[74vh] max-w-full object-contain" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default IssueCloseSignature;
