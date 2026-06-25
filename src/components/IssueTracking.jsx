import React, { useState } from 'react';
import { CheckCircle2, Clock, Edit, FileSignature, Link2, Search, XCircle } from 'lucide-react';
import { buildBorrowReturnIssueLink } from '../utils/closeIssueLink';

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

const getStatusBadge = (status) => {
    switch (status) {
        case 'Pending':
            return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200"><Clock className="w-3 h-3" /> {getStatusLabel(status)}</span>;
        case 'In Progress':
            return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200"><Edit className="w-3 h-3" /> {getStatusLabel(status)}</span>;
        case 'External Repair':
            return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200"><Edit className="w-3 h-3" /> {getStatusLabel(status)}</span>;
        case 'Waiting for Parts':
            return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-100 text-sky-700 border border-sky-200"><Clock className="w-3 h-3" /> {getStatusLabel(status)}</span>;
        case 'Resolved':
            return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-3 h-3" /> {getStatusLabel(status)}</span>;
        case 'Closed':
            return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-100 text-teal-700 border border-teal-200"><CheckCircle2 className="w-3 h-3" /> {getStatusLabel(status)}</span>;
        case 'Cancelled':
            return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700 border border-rose-200"><XCircle className="w-3 h-3" /> {getStatusLabel(status)}</span>;
        default:
            return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">{getStatusLabel(status)}</span>;
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
    const [searchTerm, setSearchTerm] = useState('');
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
        </div>
    );
};

export default IssueTracking;
