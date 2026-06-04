import React, { useState } from 'react';
import { CheckCircle2, Clock, Edit, Search } from 'lucide-react';

const getStatusBadge = (status) => {
    switch (status) {
        case 'Pending':
            return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200"><Clock className="w-3 h-3" /> รอดำเนินการ</span>;
        case 'In Progress':
            return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200"><Edit className="w-3 h-3" /> กำลังแก้ไข</span>;
        case 'Resolved':
            return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-3 h-3" /> เสร็จสิ้น</span>;
        default:
            return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">{status}</span>;
    }
};

const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
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
                            </div>
                            <div className="shrink-0 flex flex-col items-end gap-2">
                                {getStatusBadge(issue.status)}
                                {issue.status === 'Resolved' && issue.userCloseSign && (
                                    <span className="text-xs text-emerald-600 font-medium">เซ็นปิดงานแล้ว</span>
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
