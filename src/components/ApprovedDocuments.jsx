import React, { useEffect, useMemo, useState } from 'react';
import { Code, Eye, FileCheck2, Key, Search } from 'lucide-react';
import Swal from 'sweetalert2';
import { mysql } from '../mysqlClient';
import Fmit12PdfPreview from './Fmit12PdfPreview';
import Fmit15PdfPreview from './Fmit15PdfPreview';

const APPROVED_STATUSES = new Set([
    'Pending_IT',
    'Pending_IT_Supervisor',
    'Pending_IT_Manager',
    'In_Progress',
    'Pending_User_Acceptance',
    'Completed',
    'Approved',
    'Rejected',
]);

const STATUS_LABELS = {
    Pending_IT: 'รอทีม IT',
    Pending_IT_Supervisor: 'รอ IT Supervisor',
    Pending_IT_Manager: 'รอ IT Manager',
    In_Progress: 'กำลังดำเนินการ',
    Pending_User_Acceptance: 'รอส่งมอบ',
    Completed: 'เสร็จสิ้น',
    Approved: 'อนุมัติแล้ว',
    Rejected: 'ไม่อนุมัติ',
};

const normalizeSystems = (systems) => {
    if (!systems) return {};
    if (typeof systems === 'object') return systems;
    try {
        const parsed = JSON.parse(systems);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

const toAccessPreviewData = (req) => ({
    ticketNumber: req.ticket_number,
    nameTh: req.name_th,
    nameEn: req.name_en,
    department: req.department,
    position: req.position,
    internalPhone: req.internal_phone,
    systems: normalizeSystems(req.systems),
    otherSystemDetails: req.other_system_details || '',
    requestDetails: req.request_details || '',
    requesterSign: req.requester_sign || null,
    requesterDate: req.created_at || null,
    managerSign: req.manager_sign || null,
    managerDate: req.manager_date || null,
    itSign: req.it_staff_sign || req.it_sign || null,
    itStaffDate: req.it_staff_date || null,
    itManagerSign: req.it_manager_sign || null,
    itManagerDate: req.it_manager_date || null,
    itSupervisorSign: req.it_supervisor_sign || null,
    itSupervisorDate: req.it_supervisor_date || null,
    itStaffName: req.it_staff_name || '',
    actionResult: req.action_result || '',
    createdAt: req.created_at || null,
    status: req.status || '',
    cancelledAt: req.cancelled_at || null,
    cancelReason: req.cancel_reason || '',
    cancelItName: req.cancel_it_name || '',
    cancelItSign: req.cancel_it_sign || null,
});

const toChangePreviewData = (req) => ({
    ticketNumber: req.ticket_number,
    createdAt: req.created_at || null,
    reqType: req.req_type,
    reqTypeOther: req.req_type_other || '',
    department: req.department,
    requestDetails: req.details,
    reason: req.reason,
    requesterName: req.requester_name,
    requesterPosition: req.requester_position,
    requesterSign: req.requester_sign || null,
    requesterDate: req.created_at || null,
    managerSign: req.manager_sign || null,
    managerPosition: req.manager_position || '',
    managerDate: req.manager_date || null,
    itReceivedDate: req.it_received_date || '',
    itOperationDate: req.it_operation_date || '',
    itTargetDate: req.it_target_date || '',
    itApprovalStatus: req.it_approval_status || '',
    itRejectReason: req.it_reject_reason || '',
    itManagerSign: req.it_manager_sign || null,
    itManagerPosition: req.it_manager_position || '',
    itManagerDate: req.it_manager_date || null,
    itSolution: req.it_solution || '',
    itStaffSign: req.it_staff_sign || null,
    itStaffDate: req.it_staff_date || null,
    itStaffPosition: req.it_staff_position || '',
    userAcceptance: req.user_acceptance || '',
    userRejectReason: req.user_reject_reason || '',
    userAcceptSign: req.user_accept_sign || null,
    userAcceptDate: req.user_accept_date || null,
    status: req.status || '',
    cancelledAt: req.cancelled_at || null,
});

const statusBadgeClass = (status) => {
    if (status === 'Completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900';
    if (status === 'Rejected') return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900';
    if (status === 'In_Progress') return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900';
    return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900';
};

const ApprovedDocuments = () => {
    const [documents, setDocuments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [typeFilter, setTypeFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [preview, setPreview] = useState(null);

    const fetchDocuments = async ({ silent = false } = {}) => {
        if (!silent) setIsLoading(true);
        try {
            const [accessResult, changeResult] = await Promise.all([
                mysql.from('access_requests').select('*').order('created_at', { ascending: false }),
                mysql.from('change_requests').select('*').order('created_at', { ascending: false }),
            ]);

            if (accessResult.error) throw accessResult.error;
            if (changeResult.error) throw changeResult.error;

            const accessDocs = (accessResult.data || [])
                .filter((req) => APPROVED_STATUSES.has(req.status) || req.manager_sign)
                .map((req) => ({
                    id: `access-${req.id}`,
                    rawId: req.id,
                    type: 'access',
                    typeLabel: 'ขอสิทธิ์',
                    ticketNumber: req.ticket_number,
                    requester: req.name_th,
                    department: req.department,
                    details: req.request_details || req.other_system_details || '',
                    status: req.status || '',
                    createdAt: req.created_at,
                    raw: req,
                }));

            const changeDocs = (changeResult.data || [])
                .filter((req) => APPROVED_STATUSES.has(req.status) || req.manager_sign)
                .map((req) => ({
                    id: `change-${req.id}`,
                    rawId: req.id,
                    type: 'change',
                    typeLabel: 'ขอพัฒนา',
                    ticketNumber: req.ticket_number,
                    requester: req.requester_name,
                    department: req.department,
                    details: req.details || '',
                    status: req.status || '',
                    createdAt: req.created_at,
                    raw: req,
                }));

            setDocuments([...accessDocs, ...changeDocs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
        } catch (error) {
            console.error('Error loading approved documents:', error);
            if (!silent) Swal.fire('Error', 'ไม่สามารถโหลดเอกสารอนุมัติได้', 'error');
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchDocuments();
        const intervalId = setInterval(() => {
            if (document.visibilityState === 'visible') fetchDocuments({ silent: true });
        }, 10000);
        const handleRefresh = () => fetchDocuments({ silent: true });
        window.addEventListener('approval-queues:refresh', handleRefresh);
        return () => {
            clearInterval(intervalId);
            window.removeEventListener('approval-queues:refresh', handleRefresh);
        };
    }, []);

    const filteredDocuments = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        return documents.filter((doc) => {
            const matchesType = typeFilter === 'all' || doc.type === typeFilter;
            const matchesSearch = !keyword ||
                doc.ticketNumber?.toLowerCase().includes(keyword) ||
                doc.requester?.toLowerCase().includes(keyword) ||
                doc.department?.toLowerCase().includes(keyword) ||
                doc.details?.toLowerCase().includes(keyword);
            return matchesType && matchesSearch;
        });
    }, [documents, searchTerm, typeFilter]);

    const openPreview = (doc) => {
        setPreview({
            type: doc.type,
            formData: doc.type === 'access' ? toAccessPreviewData(doc.raw) : toChangePreviewData(doc.raw),
        });
    };

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
                <div className="flex flex-col items-start gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900/50 rounded-xl text-emerald-600 dark:text-emerald-300">
                            <FileCheck2 className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 dark:text-white">เอกสารที่อนุมัติแล้ว</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400">รวมเอกสารขอสิทธิ์และขอพัฒนาโปรแกรมที่เข้าสู่คิว IT แล้ว</p>
                        </div>
                    </div>

                    <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap">
                        <div className="relative w-full sm:min-w-80 sm:flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                placeholder="ค้นหาเลขเอกสาร, ผู้ร้องขอ, แผนก..."
                                className="input-modern !pl-9 !py-2 !text-sm w-full"
                            />
                        </div>
                        <div className="flex rounded-xl bg-slate-100 dark:bg-slate-900/60 p-1">
                            {[
                                ['all', 'ทั้งหมด'],
                                ['access', 'ขอสิทธิ์'],
                                ['change', 'ขอพัฒนา'],
                            ].map(([value, label]) => (
                                <button
                                    key={value}
                                    onClick={() => setTypeFilter(value)}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${typeFilter === value ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center flex-col items-center py-20 gap-3">
                    <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div>
                    <p className="text-sm text-slate-500">กำลังโหลดเอกสาร...</p>
                </div>
            ) : filteredDocuments.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 p-10 rounded-2xl text-center border border-slate-100 dark:border-slate-700">
                    <FileCheck2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <h3 className="font-bold text-slate-700 dark:text-slate-200">ยังไม่พบเอกสารอนุมัติ</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">เมื่อเอกสารผ่านหัวหน้าต้นทางและเข้าสู่คิว IT จะมาแสดงที่นี่</p>
                </div>
            ) : (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs uppercase">
                                    <th className="p-4 whitespace-nowrap">เอกสาร</th>
                                    <th className="p-4 whitespace-nowrap">ผู้ร้องขอ / แผนก</th>
                                    <th className="p-4">รายละเอียด</th>
                                    <th className="p-4 whitespace-nowrap">สถานะ</th>
                                    <th className="p-4 text-right whitespace-nowrap">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                                {filteredDocuments.map((doc) => (
                                    <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                                        <td className="p-4 align-top">
                                            <div className="flex items-center gap-2">
                                                {doc.type === 'access' ? <Key className="w-4 h-4 text-indigo-500" /> : <Code className="w-4 h-4 text-emerald-500" />}
                                                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{doc.typeLabel}</span>
                                            </div>
                                            <div className="text-xs font-mono text-slate-500 mt-1">{doc.ticketNumber || '-'}</div>
                                            <div className="text-xs text-slate-400 mt-1">{new Date(doc.createdAt).toLocaleDateString('th-TH')}</div>
                                        </td>
                                        <td className="p-4 align-top whitespace-nowrap">
                                            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{doc.requester || '-'}</div>
                                            <div className="text-xs text-slate-500 mt-1">{doc.department || '-'}</div>
                                        </td>
                                        <td className="p-4 align-top min-w-[240px]">
                                            <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2">{doc.details || '-'}</p>
                                        </td>
                                        <td className="p-4 align-top whitespace-nowrap">
                                            <span className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-semibold ${statusBadgeClass(doc.status)}`}>
                                                {STATUS_LABELS[doc.status] || doc.status || '-'}
                                            </span>
                                        </td>
                                        <td className="p-4 align-top text-right">
                                            <button
                                                onClick={() => openPreview(doc)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                                            >
                                                <Eye className="w-4 h-4" /> ดูเอกสาร
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {preview?.type === 'access' && (
                <Fmit12PdfPreview
                    isOpen
                    onClose={() => setPreview(null)}
                    formData={preview.formData}
                />
            )}
            {preview?.type === 'change' && (
                <Fmit15PdfPreview
                    isOpen
                    onClose={() => setPreview(null)}
                    formData={preview.formData}
                />
            )}
        </div>
    );
};

export default ApprovedDocuments;
