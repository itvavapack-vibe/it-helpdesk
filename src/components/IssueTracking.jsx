import React, { useRef, useState } from 'react';
import { CheckCircle2, Clock, Edit, Eye, FileSignature, Link2, Paperclip, Search, X, XCircle, ZoomIn, ZoomOut } from 'lucide-react';
import { API_URL } from '../mysqlClient';
import { buildBorrowReturnIssueLink } from '../utils/closeIssueLink';
import { getStatusBadgeClass } from '../utils/statusStyles';

const STATUS_LABELS = {
    Pending: 'รอดำเนินการ',
    'In Progress': 'กำลังแก้ไข',
    'External Repair': 'ส่งซ่อมภายนอก',
    'Waiting for Parts': 'รออะไหล่',
    Resolved: 'เสร็จสิ้น',
    Closed: 'ปิดจบ',
    Cancelled: 'ยกเลิก'
};

const getStatusLabel = (status) => STATUS_LABELS[status] || status || '-';
const BORROW_IT_CATEGORY = 'ยืมคอมพิวเตอร์/อุปกรณ์IT';
const normalizeBorrowCategory = (value) => String(value || '').replace(/\s+/g, '');
const isBorrowIssue = (issue) => normalizeBorrowCategory(issue?.category) === normalizeBorrowCategory(BORROW_IT_CATEGORY);
const isIssueClosed = (issue) => issue?.status === 'Closed' || Boolean(issue?.userCloseSign || issue?.userClosedAt);
const displayValue = (value) => value || '-';

const resolveAttachmentUrl = (url) => {
    if (!url) return '';
    if (/^(data:|blob:|https?:\/\/)/i.test(url)) return url;
    return `${API_URL}${url}`;
};

const imageExtensionPattern = /\.(png|jpe?g|gif|webp|bmp|avif)(?:\?.*)?$/i;

const isImageAttachment = (file) => {
    const mimeType = String(file?.type || file?.mimetype || file?.mimeType || '').toLowerCase();
    const url = String(file?.url || file?.path || file?.name || '').toLowerCase();
    return mimeType.startsWith('image/') || imageExtensionPattern.test(url);
};

const isRepairEvidenceAttachment = (file) => {
    const uploadedByType = String(file?.uploadedByType || '').toLowerCase();
    const source = String(file?.source || '').toLowerCase();
    return uploadedByType === 'it' || source === 'repair_evidence';
};

const getAttachmentGroups = (attachments = []) => attachments.reduce((groups, file, index) => {
    const entry = { file, index };
    if (isRepairEvidenceAttachment(file)) groups.repairEvidence.push(entry);
    else groups.requester.push(entry);
    return groups;
}, { requester: [], repairEvidence: [] });

const getStatusBadge = (status) => {
    const badgeClass = `inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-semibold ${getStatusBadgeClass(status)}`;
    switch (status) {
        case 'Pending':
            return <span className={badgeClass}><Clock className="w-3 h-3" /> {getStatusLabel(status)}</span>;
        case 'In Progress':
            return <span className={badgeClass}><Edit className="w-3 h-3" /> {getStatusLabel(status)}</span>;
        case 'External Repair':
            return <span className={badgeClass}><Edit className="w-3 h-3" /> {getStatusLabel(status)}</span>;
        case 'Waiting for Parts':
            return <span className={badgeClass}><Clock className="w-3 h-3" /> {getStatusLabel(status)}</span>;
        case 'Resolved':
            return <span className={badgeClass}><CheckCircle2 className="w-3 h-3" /> {getStatusLabel(status)}</span>;
        case 'Closed':
            return <span className={badgeClass}><CheckCircle2 className="w-3 h-3" /> {getStatusLabel(status)}</span>;
        case 'Cancelled':
            return <span className={badgeClass}><XCircle className="w-3 h-3" /> {getStatusLabel(status)}</span>;
        default:
            return <span className={badgeClass}>{getStatusLabel(status)}</span>;
    }
};

const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatDateTime = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const IssueTracking = ({ issues = [], isLoading = false }) => {
    const previewScrollRef = useRef(null);
    const previewDragRef = useRef(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIssue, setSelectedIssue] = useState(null);
    const [previewAttachment, setPreviewAttachment] = useState(null);
    const [previewZoom, setPreviewZoom] = useState(1);

    const openAttachmentPreview = (file, index, issue) => {
        setPreviewAttachment({
            ...file,
            index,
            issueId: issue?.id,
            url: resolveAttachmentUrl(file.url || file.path),
            isImage: isImageAttachment(file),
            typeLabel: isRepairEvidenceAttachment(file) ? 'หลักฐานการซ่อม / การแก้ไข' : 'ไฟล์ที่ผู้แจ้งแนบ',
        });
        setPreviewZoom(1);
    };

    const closeAttachmentPreview = () => {
        setPreviewAttachment(null);
        setPreviewZoom(1);
        previewDragRef.current = null;
    };

    const startPreviewDrag = (event) => {
        if (!previewAttachment?.isImage || previewZoom <= 1 || !previewScrollRef.current) return;
        event.preventDefault();
        previewDragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            scrollLeft: previewScrollRef.current.scrollLeft,
            scrollTop: previewScrollRef.current.scrollTop,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };

    const movePreviewDrag = (event) => {
        const drag = previewDragRef.current;
        if (!drag || !previewScrollRef.current) return;
        previewScrollRef.current.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX);
        previewScrollRef.current.scrollTop = drag.scrollTop - (event.clientY - drag.startY);
    };

    const endPreviewDrag = (event) => {
        if (previewDragRef.current?.pointerId === event.pointerId) {
            previewDragRef.current = null;
            event.currentTarget.releasePointerCapture?.(event.pointerId);
        }
    };

    const filteredIssues = issues
        .filter((issue) => {
            const term = searchTerm.trim().toLowerCase();
            if (!term) return true;
            return [
                issue.id,
                issue.name,
                issue.department,
                issue.category,
                issue.description,
                issue.status,
                getStatusLabel(issue.status),
                issue.assignedAdmin,
            ]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(term));
        })
        .slice(0, 10);

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <div className="glass-card rounded-3xl p-5 sm:p-7">
                <h2 className="text-2xl font-bold text-indigo-950 dark:text-indigo-100">รายการแจ้งซ่อมล่าสุด</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">ค้นหารายการแจ้งซ่อมและตรวจสอบสถานะล่าสุดของงาน</p>
                <div className="relative mt-5">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        className="input-modern w-full !pl-9"
                        placeholder="ค้นหาจากชื่อ, รหัสแจ้งซ่อม, รายละเอียด, แผนก, หมวดหมู่ หรือสถานะ"
                    />
                </div>
            </div>

            {isLoading ? (
                <div className="glass-card rounded-2xl p-10 flex justify-center items-center">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                        <p className="text-sm text-slate-500 dark:text-slate-400 animate-pulse">กำลังโหลดข้อมูล...</p>
                    </div>
                </div>
            ) : filteredIssues.length === 0 ? (
                <div className="glass-card rounded-2xl p-10 text-center text-slate-400 dark:text-slate-500">
                    ไม่พบรายการแจ้งซ่อม
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredIssues.map((issue) => (
                        <div key={issue.id} className="glass-card rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 hover:shadow-lg transition-shadow">
                            <div className="shrink-0">
                                <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/40 px-2.5 py-1 rounded-lg border border-indigo-100 dark:border-indigo-800 inline-block">
                                    {issue.id}
                                </div>
                                <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{formatDate(issue.createdAt)}</div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{issue.description}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    {issue.name} · {issue.department} · {issue.category}
                                </p>
                                {issue.assignedAdmin && (
                                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-semibold">
                                        ผู้รับงาน: {issue.assignedAdmin}
                                    </p>
                                )}
                                {issue.attachments && issue.attachments.length > 0 && (
                                    (() => {
                                        const attachmentGroups = getAttachmentGroups(issue.attachments);
                                        return (
                                            <div className="mt-3 space-y-2">
                                                {attachmentGroups.requester.length > 0 && (
                                                    <div>
                                                        <div className="mb-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-300">ไฟล์ที่ผู้แจ้งแนบ</div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {attachmentGroups.requester.map(({ file, index }, groupIndex) => (
                                                                <button
                                                                    key={`${file.url || file.name || 'requester'}-${index}`}
                                                                    type="button"
                                                                    onClick={() => openAttachmentPreview(file, index, issue)}
                                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 shadow-sm transition-all hover:bg-indigo-100 dark:border-indigo-800/50 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50"
                                                                    title={file.name || `ไฟล์ผู้แจ้ง ${groupIndex + 1}`}
                                                                >
                                                                    <Paperclip className="h-3.5 w-3.5" />
                                                                    <span>ผู้แจ้ง {attachmentGroups.requester.length > 1 ? groupIndex + 1 : ''}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {attachmentGroups.repairEvidence.length > 0 && (
                                                    <div>
                                                        <div className="mb-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-300">หลักฐานการซ่อม / การแก้ไข</div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {attachmentGroups.repairEvidence.map(({ file, index }, groupIndex) => (
                                                                <button
                                                                    key={`${file.url || file.name || 'repair'}-${index}`}
                                                                    type="button"
                                                                    onClick={() => openAttachmentPreview(file, index, issue)}
                                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm transition-all hover:bg-emerald-100 dark:border-emerald-800/50 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                                                                    title={file.name || `หลักฐานการซ่อม ${groupIndex + 1}`}
                                                                >
                                                                    <Paperclip className="h-3.5 w-3.5" />
                                                                    <span>หลักฐาน {attachmentGroups.repairEvidence.length > 1 ? groupIndex + 1 : ''}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()
                                )}
                                {isBorrowIssue(issue) && (issue.borrowReturnerSign || issue.borrowReturnedAt) && (
                                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="min-w-0 text-xs text-amber-900 dark:text-amber-100">
                                                <div className="flex items-center gap-1.5 font-bold">
                                                    <FileSignature className="h-4 w-4" />
                                                    ลงนามส่งคืนอุปกรณ์แล้ว
                                                </div>
                                                <div className="mt-1 text-amber-800/80 dark:text-amber-200/80">
                                                    ผู้ส่งคืน: {issue.borrowReturnerName || issue.name || '-'}
                                                </div>
                                                <div className="mt-0.5 text-amber-800/80 dark:text-amber-200/80">
                                                    วันที่ส่งคืน: {formatDateTime(issue.borrowReturnedAt)}
                                                </div>
                                            </div>
                                            {issue.borrowReturnerSign && (
                                                <div className="flex h-20 w-full items-center justify-center rounded-lg border border-amber-200 bg-white px-3 dark:border-amber-900/60 dark:bg-slate-950 sm:w-44">
                                                    <img src={issue.borrowReturnerSign} alt="ลายเซ็นผู้ส่งคืน" className="h-16 w-full object-contain" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="shrink-0 flex flex-col items-end gap-2">
                                {getStatusBadge(issue.status)}
                                <button
                                    type="button"
                                    onClick={() => setSelectedIssue(issue)}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700 transition-colors hover:bg-sky-100 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-950/50"
                                    title="ดูข้อมูลรายการแจ้งซ่อม"
                                >
                                    <Eye className="h-3.5 w-3.5" />
                                    ดูข้อมูล
                                </button>
                                {issue.status === 'Resolved' && issue.userCloseSign && (
                                    <span className="text-xs text-emerald-600 font-medium">เซ็นปิดงานแล้ว</span>
                                )}
                                {isBorrowIssue(issue) && isIssueClosed(issue) && !issue.borrowReturnerSign && !issue.borrowReturnedAt && (
                                    <a
                                        href={buildBorrowReturnIssueLink(issue.id)}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-950/50"
                                    >
                                        <Link2 className="h-3.5 w-3.5" />
                                        บันทึกส่งคืน
                                    </a>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {selectedIssue && (
                <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-900/45 p-3 backdrop-blur-sm sm:items-center sm:p-4">
                    <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-4 dark:border-slate-700 dark:bg-slate-800/80">
                            <div>
                                <h3 className="text-lg font-bold text-indigo-950 dark:text-indigo-100">ข้อมูลรายการแจ้งซ่อม</h3>
                                <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">{selectedIssue.id}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedIssue(null)}
                                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-slate-700"
                                title="ปิด"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto p-5 sm:p-6">
                            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                                <div className="text-sm text-slate-500 dark:text-slate-400">วันที่แจ้ง: {formatDateTime(selectedIssue.createdAt)}</div>
                                {getStatusBadge(selectedIssue.status)}
                            </div>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <div className="text-xs font-semibold text-slate-400">ผู้แจ้ง</div>
                                    <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{displayValue(selectedIssue.name)}</div>
                                </div>
                                <div>
                                    <div className="text-xs font-semibold text-slate-400">แผนก</div>
                                    <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{displayValue(selectedIssue.department)}</div>
                                </div>
                                <div>
                                    <div className="text-xs font-semibold text-slate-400">หมวดหมู่</div>
                                    <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{displayValue(selectedIssue.category)}</div>
                                </div>
                                <div>
                                    <div className="text-xs font-semibold text-slate-400">ผู้รับงาน</div>
                                    <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{displayValue(selectedIssue.assignedAdmin)}</div>
                                </div>
                                <div className="sm:col-span-2">
                                    <div className="text-xs font-semibold text-slate-400">รายละเอียดปัญหา</div>
                                    <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 whitespace-pre-wrap">
                                        {displayValue(selectedIssue.description)}
                                    </div>
                                </div>
                                <div className="sm:col-span-2">
                                    <div className="text-xs font-semibold text-slate-400">แนวทางแก้ไข / ความคิดเห็น</div>
                                    <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 whitespace-pre-wrap">
                                        {displayValue(selectedIssue.repairDetails)}
                                    </div>
                                </div>
                            </div>

                            {selectedIssue.attachments && selectedIssue.attachments.length > 0 && (
                                (() => {
                                    const attachmentGroups = getAttachmentGroups(selectedIssue.attachments);
                                    const renderAttachmentCards = (items, groupName, accentClass) => (
                                        <div className={`rounded-2xl border p-4 ${accentClass}`}>
                                            <div className="mb-3 flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 text-sm font-bold">
                                                    <Paperclip className="h-4 w-4" />
                                                    {groupName}
                                                </div>
                                                <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-bold dark:bg-slate-950/40">{items.length} ไฟล์</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                                {items.map(({ file, index }, groupIndex) => (
                                                    <button
                                                        key={`${file.url || file.name || groupName}-${index}`}
                                                        type="button"
                                                        onClick={() => openAttachmentPreview(file, index, selectedIssue)}
                                                        className="group overflow-hidden rounded-xl border border-white/70 bg-white text-left text-xs font-semibold text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"
                                                    >
                                                        {isImageAttachment(file) ? (
                                                            <img src={resolveAttachmentUrl(file.url || file.path)} alt={file.name || `${groupName} ${groupIndex + 1}`} className="aspect-video w-full object-cover" />
                                                        ) : (
                                                            <div className="flex aspect-video w-full items-center justify-center bg-slate-100 dark:bg-slate-800">
                                                                <Paperclip className="h-8 w-8 text-slate-400" />
                                                            </div>
                                                        )}
                                                        <div className="truncate px-3 py-2">{file.name || `${groupName} ${groupIndex + 1}`}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );

                                    return (
                                        <div className="mt-6 space-y-4">
                                            <div className="text-sm font-bold text-slate-700 dark:text-slate-300">ไฟล์แนบ ({selectedIssue.attachments.length})</div>
                                            {attachmentGroups.requester.length > 0 && renderAttachmentCards(
                                                attachmentGroups.requester,
                                                'ไฟล์ที่ผู้แจ้งแนบ',
                                                'border-indigo-100 bg-indigo-50/70 text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/20 dark:text-indigo-200'
                                            )}
                                            {attachmentGroups.repairEvidence.length > 0 && renderAttachmentCards(
                                                attachmentGroups.repairEvidence,
                                                'หลักฐานการซ่อม / การแก้ไข',
                                                'border-emerald-100 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200'
                                            )}
                                        </div>
                                    );
                                })()
                            )}
                        </div>
                        <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-700/30">
                            <button
                                type="button"
                                onClick={() => setSelectedIssue(null)}
                                className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-colors hover:bg-indigo-700"
                            >
                                ปิด
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {previewAttachment && (
                <div
                    className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-sm sm:p-5"
                    onClick={closeAttachmentPreview}
                >
                    <div
                        className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl dark:bg-slate-900"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <div className="truncate text-sm font-bold text-slate-900 dark:text-white">
                                    {previewAttachment.name || `ไฟล์แนบ ${previewAttachment.index + 1}`}
                                </div>
                                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                    {previewAttachment.issueId ? `เลขที่เอกสาร ${previewAttachment.issueId}` : 'ไฟล์แนบรายการแจ้งซ่อม'}
                                </div>
                                <div className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                    previewAttachment.typeLabel === 'หลักฐานการซ่อม / การแก้ไข'
                                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200'
                                        : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200'
                                }`}>
                                    {previewAttachment.typeLabel}
                                </div>
                            </div>
                            <div className="flex items-center justify-end gap-2">
                                {previewAttachment.isImage && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setPreviewZoom((zoom) => Math.max(0.5, Number((zoom - 0.25).toFixed(2))))}
                                            disabled={previewZoom <= 0.5}
                                            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                                            title="ย่อ"
                                        >
                                            <ZoomOut className="h-5 w-5" />
                                        </button>
                                        <span className="min-w-16 rounded-xl bg-slate-100 px-3 py-2 text-center text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                            {Math.round(previewZoom * 100)}%
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setPreviewZoom((zoom) => Math.min(3, Number((zoom + 0.25).toFixed(2))))}
                                            disabled={previewZoom >= 3}
                                            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                                            title="ขยาย"
                                        >
                                            <ZoomIn className="h-5 w-5" />
                                        </button>
                                    </>
                                )}
                                <button
                                    type="button"
                                    onClick={closeAttachmentPreview}
                                    className="rounded-xl border border-rose-100 bg-rose-50 p-2 text-rose-600 transition hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200 dark:hover:bg-rose-950/70"
                                    title="ปิด"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                        <div
                            ref={previewScrollRef}
                            className="min-h-[55vh] flex-1 overflow-auto bg-slate-100 p-4 dark:bg-slate-950"
                            style={{ touchAction: previewAttachment.isImage && previewZoom > 1 ? 'none' : 'pan-x pan-y' }}
                        >
                            {previewAttachment.isImage ? (
                                <div
                                    className={`flex min-h-[55vh] min-w-full items-center justify-center ${previewZoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                    onPointerDown={startPreviewDrag}
                                    onPointerMove={movePreviewDrag}
                                    onPointerUp={endPreviewDrag}
                                    onPointerCancel={endPreviewDrag}
                                    onPointerLeave={endPreviewDrag}
                                    style={{
                                        width: `${previewZoom * 100}%`,
                                        minWidth: `${previewZoom * 100}%`,
                                        touchAction: previewZoom > 1 ? 'none' : 'auto',
                                    }}
                                >
                                    <img
                                        src={previewAttachment.url}
                                        alt={previewAttachment.name || `ไฟล์แนบ ${previewAttachment.index + 1}`}
                                        className="select-none object-contain"
                                        draggable={false}
                                        style={{
                                            maxHeight: previewZoom <= 1 ? '72vh' : 'none',
                                            maxWidth: previewZoom <= 1 ? '100%' : 'none',
                                            width: previewZoom > 1 ? '100%' : 'auto',
                                        }}
                                    />
                                </div>
                            ) : (
                                <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
                                    <Paperclip className="mx-auto h-10 w-10 text-slate-400" />
                                    <div className="mt-3 font-bold text-slate-800 dark:text-slate-100">ไม่สามารถ preview ไฟล์นี้ได้</div>
                                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">เปิดไฟล์ในแท็บใหม่เพื่อดูหรือดาวน์โหลด</p>
                                    <a
                                        href={previewAttachment.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mt-4 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-700"
                                    >
                                        เปิดไฟล์
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default IssueTracking;
