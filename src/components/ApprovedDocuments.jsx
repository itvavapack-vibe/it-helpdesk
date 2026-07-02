import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardPenLine, Edit, FileCheck2, Key, Search, XCircle } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import Swal from 'sweetalert2';
import { mysql } from '../mysqlClient';
import { APPROVAL_QUEUE_STATUS_BY_ROLE, normalizeRoleValue, visibleQueueStatuses } from '../config/roles';
import { toMysqlDateTime } from '../utils/dateTime';
import { loadSignatureIntoCanvas } from '../utils/signatureCanvas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

const STATUS_LABELS = {
    Pending_IT: 'รับแจ้ง',
    Pending_IT_Supervisor: 'หัวหน้าแผนก',
    Pending_IT_Manager: 'ผู้จัดการ',
    Pending_User_Acknowledgement: 'ผู้แจ้งรับทราบ',
    In_Progress: 'รอดำเนินการ',
    In_Development: 'กำลังดำเนินการ',
    Pending_User_Acceptance: 'เสร็จสิ้น',
    Completed: 'ปิดจบ',
    Approved: 'อนุมัติแล้ว',
    Rejected: 'ไม่อนุมัติ',
};

const statusBadgeClass = (status) => {
    if (status === 'Completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900';
    if (status === 'Rejected') return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900';
    if (status === 'In_Progress') return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900';
    return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900';
};

const ACCESS_DOCUMENT_LIST_COLUMNS = [
    'id',
    'ticket_number',
    'name_th',
    'department',
    'request_details',
    'other_system_details',
    'status',
    'created_at',
].join(',');

const CHANGE_DOCUMENT_LIST_COLUMNS = [
    'id',
    'ticket_number',
    'requester_name',
    'department',
    'details',
    'status',
    'created_at',
].join(',');

const ApprovedDocuments = ({ currentAdmin }) => {
    const [documents, setDocuments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [typeFilter, setTypeFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [approvalDocument, setApprovalDocument] = useState(null);
    const [selectedApprovalStatus, setSelectedApprovalStatus] = useState('');
    const signatureRef = useRef(null);
    const currentRole = normalizeRoleValue(currentAdmin?.role);
    const approvalStatuses = visibleQueueStatuses(currentRole, APPROVAL_QUEUE_STATUS_BY_ROLE);

    const fetchDocuments = async ({ silent = false } = {}) => {
        if (!silent) setIsLoading(true);
        try {
            const [accessResult, changeResult] = await Promise.all([
                mysql.from('access_requests').select(ACCESS_DOCUMENT_LIST_COLUMNS).order('created_at', { ascending: false }),
                mysql.from('change_requests').select(CHANGE_DOCUMENT_LIST_COLUMNS).order('created_at', { ascending: false }),
            ]);

            if (accessResult.error) throw accessResult.error;
            if (changeResult.error) throw changeResult.error;

            const accessDocs = (accessResult.data || [])
                .filter((req) => approvalStatuses.includes(req.status))
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
                }));

            const changeDocs = (changeResult.data || [])
                .filter((req) => req.status !== 'Pending_IT_Supervisor' && approvalStatuses.includes(req.status))
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

    useEffect(() => {
        if (!approvalDocument || !selectedApprovalStatus) return;
        loadSignatureIntoCanvas(signatureRef, currentAdmin?.signature);
    }, [approvalDocument, selectedApprovalStatus]);

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

    const canApprove = (doc) => approvalStatuses.includes(doc.status);

    const getApprovalActionOptions = (doc) => {
        if (!doc) return [];
        if (doc.type === 'access' && doc.status === 'Pending_IT_Supervisor') {
            return [{ value: 'Pending_IT_Manager', label: 'ส่งต่อ IT Manager' }];
        }
        if (doc.type === 'access') {
            return [{ value: 'Pending_User_Acknowledgement', label: 'อนุมัติและส่งให้ผู้แจ้งรับทราบ' }];
        }
        return [{ value: 'In_Progress', label: 'อนุมัติและส่งดำเนินการ' }];
    };

    const openApproval = (doc) => {
        setApprovalDocument(doc);
        setSelectedApprovalStatus('');
    };

    const handleApprove = async () => {
        if (!selectedApprovalStatus) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณาเลือกสถานะที่ต้องการเปลี่ยน', 'warning');
            return;
        }

        if (!approvalDocument || !signatureRef.current || signatureRef.current.isEmpty()) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณาลงลายเซ็นก่อนยืนยัน', 'warning');
            return;
        }

        const isSupervisorStep = approvalDocument.status === 'Pending_IT_Supervisor';
        const signature = signatureRef.current.getCanvas().toDataURL('image/png');
        const updateData = approvalDocument.type === 'access'
            ? isSupervisorStep
                ? {
                    status: selectedApprovalStatus,
                    it_supervisor_name: currentAdmin?.name || '',
                    it_supervisor_position: currentAdmin?.position || '',
                    it_supervisor_sign: signature,
                    it_supervisor_date: toMysqlDateTime(),
                }
                : {
                    status: selectedApprovalStatus,
                    it_manager_name: currentAdmin?.name || '',
                    it_manager_position: currentAdmin?.position || '',
                    it_manager_sign: signature,
                    it_manager_date: toMysqlDateTime(),
                }
            : isSupervisorStep
                ? {
                    status: selectedApprovalStatus,
                    it_supervisor_name: currentAdmin?.name || '',
                    it_supervisor_position: currentAdmin?.position || '',
                    it_supervisor_sign: signature,
                    it_supervisor_date: toMysqlDateTime(),
                }
                : {
                    status: selectedApprovalStatus,
                    it_approval_status: 'Approved',
                    it_manager_name: currentAdmin?.name || '',
                    it_manager_position: currentAdmin?.position || '',
                    it_manager_sign: signature,
                    it_manager_date: toMysqlDateTime(),
                };

        try {
            const table = approvalDocument.type === 'access' ? 'access_requests' : 'change_requests';
            const { error } = await mysql.from(table).update(updateData).eq('id', approvalDocument.rawId);
            if (error) throw error;
            setDocuments((currentDocuments) => currentDocuments.filter((doc) => doc.id !== approvalDocument.id));
            setApprovalDocument(null);
            setSelectedApprovalStatus('');
            window.dispatchEvent(new Event('approval-queues:refresh'));
            fetchDocuments({ silent: true });
            Swal.fire('อัปเดตแล้ว', isSupervisorStep ? 'เซ็นและส่งต่อ IT Manager แล้ว' : 'เซ็นอนุมัติเรียบร้อยแล้ว', 'success');
        } catch (error) {
            console.error('Error approving document:', error);
            Swal.fire('Error', 'ไม่สามารถบันทึกลายเซ็นได้', 'error');
        }
    };

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
                <div className="flex flex-col items-start gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-violet-100 dark:bg-violet-900/50 rounded-xl text-violet-600 dark:text-violet-300">
                            <FileCheck2 className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 dark:text-white">เอกสารอนุมัติ</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400">ตรวจสอบเอกสารและลงนามตามขั้นตอนของ IT Supervisor และ IT Manager</p>
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
                    <h3 className="font-bold text-slate-700 dark:text-slate-200">ไม่มีเอกสารรออนุมัติ</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">รายการจะแสดงเมื่อเข้าสู่ขั้นตอนอนุมัติของคุณ</p>
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
                                                {doc.type === 'access' ? <Key className="w-4 h-4 text-indigo-500" /> : <ClipboardPenLine className="w-4 h-4 text-emerald-500" />}
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
                                            <div className="flex justify-end gap-2">
                                                {canApprove(doc) && (
                                                    <button type="button" onClick={() => openApproval(doc)} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-600 transition-colors hover:bg-amber-600 hover:text-white">
                                                        <Edit className="w-4 h-4" /> เปลี่ยนสถานะ
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {approvalDocument && (
                <div className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-slate-900/60 p-3 backdrop-blur-sm sm:items-center sm:p-4">
                    <div className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-800 sm:p-6">
                        <div className="mb-5 flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white">ลงนามอนุมัติเอกสาร</h3>
                                <p className="mt-1 text-xs text-slate-500">{approvalDocument.ticketNumber || '-'}</p>
                            </div>
                            <button type="button" onClick={() => { setApprovalDocument(null); setSelectedApprovalStatus(''); }} className="text-slate-400 hover:text-rose-500" aria-label="ปิด">
                                <XCircle className="h-6 w-6" />
                            </button>
                        </div>
                        <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                            ผู้ลงนาม: <span className="font-semibold text-slate-800 dark:text-slate-100">{currentAdmin?.name || '-'}</span>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">ตำแหน่ง: {currentAdmin?.position || '-'}</div>
                        </div>
                        <div className="mb-4">
                            <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">สถานะที่ต้องการเปลี่ยน</label>
                            <Select value={selectedApprovalStatus} onValueChange={setSelectedApprovalStatus}>
                                <SelectTrigger className="input-modern w-full">
                                    <SelectValue placeholder="เลือกสถานะ" />
                                </SelectTrigger>
                                <SelectContent className="z-[200]">
                                    {getApprovalActionOptions(approvalDocument).map((option) => (
                                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {selectedApprovalStatus && (
                            <div className="relative h-40 overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900/50">
                                <SignatureCanvas ref={signatureRef} penColor="black" canvasProps={{ className: 'h-full w-full xl-signature' }} />
                                <button type="button" onClick={() => signatureRef.current?.clear()} className="absolute right-2 top-2 text-xs font-semibold text-red-500">ล้าง</button>
                            </div>
                        )}
                        <div className="mt-5 flex gap-3">
                            <button type="button" onClick={() => { setApprovalDocument(null); setSelectedApprovalStatus(''); }} className="flex-1 rounded-xl bg-slate-100 px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200">ยกเลิก</button>
                            <button type="button" onClick={handleApprove} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700">ยืนยัน</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ApprovedDocuments;
