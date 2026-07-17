import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardPenLine, Edit, Eye, FileCheck2, FileText, Key, Search, Server, X, XCircle } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import Swal from 'sweetalert2';
import { mysql } from '../mysqlClient';
import { APPROVAL_QUEUE_STATUS_BY_ROLE, canApproveServerRoomEntry, normalizeRoleValue, visibleQueueStatuses } from '../config/roles';
import { toMysqlDateTime } from '../utils/dateTime';
import { loadSignatureIntoCanvas } from '../utils/signatureCanvas';
import { getStatusBadgeClass } from '../utils/statusStyles';
import Fmit12PdfPreview from './Fmit12PdfPreview';
import Fmit15PdfPreview from './Fmit15PdfPreview';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

const STATUS_LABELS = {
    Pending_IT: 'รับแจ้ง',
    Pending_IT_Supervisor: 'หัวหน้าแผนก',
    Pending_IT_Manager: 'ผู้จัดการ',
    Pending_User_Acknowledgement: 'ผู้แจ้งรับทราบ',
    In_Progress: 'รอดำเนินการ',
    In_Development: 'กำลังดำเนินการ',
    Pending_User_Acceptance: 'เสร็จสิ้น',
    Pending_Approval: 'รออนุมัติ',
    Completed: 'ปิดจบ',
    Approved: 'อนุมัติแล้ว',
    Rejected: 'ไม่อนุมัติ',
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

const SERVER_ROOM_DOCUMENT_LIST_COLUMNS = [
    'id',
    'entry_date',
    'department',
    'full_name',
    'entry_time',
    'reason',
    'status',
    'created_at',
].join(',');
const DOCUMENT_REFRESH_INTERVAL_MS = 30 * 1000;

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

const formatDateTime = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const formatDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('th-TH');
};

const ApprovedDocuments = ({ currentAdmin }) => {
    const [documents, setDocuments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [typeFilter, setTypeFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [approvalDocument, setApprovalDocument] = useState(null);
    const [detailDocument, setDetailDocument] = useState(null);
    const [accessReportData, setAccessReportData] = useState(null);
    const [changeReportData, setChangeReportData] = useState(null);
    const [selectedApprovalStatus, setSelectedApprovalStatus] = useState('');
    const signatureRef = useRef(null);
    const currentRole = normalizeRoleValue(currentAdmin?.role);
    const approvalStatuses = visibleQueueStatuses(currentRole, APPROVAL_QUEUE_STATUS_BY_ROLE);
    const canApproveServerRoomDocuments = canApproveServerRoomEntry(currentRole);

    const fetchDocuments = async ({ silent = false } = {}) => {
        if (!silent) setIsLoading(true);
        try {
            const accessQuery = approvalStatuses.length
                ? mysql.from('access_requests').select(ACCESS_DOCUMENT_LIST_COLUMNS).in('status', approvalStatuses).order('created_at', { ascending: false })
                : Promise.resolve({ data: [], error: null });
            const changeQuery = approvalStatuses.length
                ? mysql.from('change_requests').select(CHANGE_DOCUMENT_LIST_COLUMNS).in('status', approvalStatuses).not('status', 'Pending_IT_Supervisor').order('created_at', { ascending: false })
                : Promise.resolve({ data: [], error: null });
            const serverRoomQuery = canApproveServerRoomDocuments
                ? mysql.from('controlled_area_logs').select(SERVER_ROOM_DOCUMENT_LIST_COLUMNS).eq('status', 'Pending_Approval').order('entry_time', { ascending: false })
                : Promise.resolve({ data: [], error: null });
            const [accessResult, changeResult, serverRoomResult] = await Promise.all([
                accessQuery,
                changeQuery,
                serverRoomQuery,
            ]);

            if (accessResult.error) throw accessResult.error;
            if (changeResult.error) throw changeResult.error;
            if (serverRoomResult.error) throw serverRoomResult.error;

            const accessDocs = (accessResult.data || [])
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

            const serverRoomDocs = (serverRoomResult.data || [])
                .map((log) => ({
                    id: `server_room-${log.id}`,
                    rawId: log.id,
                    type: 'server_room',
                    typeLabel: 'เข้าห้องเซิร์ฟเวอร์',
                    ticketNumber: `SR-${log.id}`,
                    requester: log.full_name,
                    department: log.department,
                    details: log.reason || '',
                    status: log.status || '',
                    createdAt: log.entry_time || log.created_at || log.entry_date,
                    raw: log,
                }));

            setDocuments([...accessDocs, ...changeDocs, ...serverRoomDocs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
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
        }, DOCUMENT_REFRESH_INTERVAL_MS);
        const handleRefresh = () => fetchDocuments({ silent: true });
        window.addEventListener('approval-queues:refresh', handleRefresh);
        return () => {
            clearInterval(intervalId);
            window.removeEventListener('approval-queues:refresh', handleRefresh);
        };
    }, [approvalStatuses, canApproveServerRoomDocuments]);

    useEffect(() => {
        if (!approvalDocument || !selectedApprovalStatus) return;
        if (approvalDocument.type === 'server_room') return;
        loadSignatureIntoCanvas(signatureRef, currentAdmin?.signature);
    }, [approvalDocument, selectedApprovalStatus]);

    const filteredDocuments = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        return documents.filter((doc) => {
            const matchesType = typeFilter === 'all' || doc.type === typeFilter;
            const matchesSearch = !keyword ||
                doc.ticketNumber?.toLowerCase().includes(keyword) ||
                doc.typeLabel?.toLowerCase().includes(keyword) ||
                doc.requester?.toLowerCase().includes(keyword) ||
                doc.department?.toLowerCase().includes(keyword) ||
                doc.details?.toLowerCase().includes(keyword);
            return matchesType && matchesSearch;
        });
    }, [documents, searchTerm, typeFilter]);

    const canApprove = (doc) => doc.type === 'server_room'
        ? canApproveServerRoomDocuments && doc.status === 'Pending_Approval'
        : approvalStatuses.includes(doc.status);

    const getApprovalActionOptions = (doc) => {
        if (!doc) return [];
        if (doc.type === 'access' && doc.status === 'Pending_IT_Supervisor') {
            return [{ value: 'Pending_IT_Manager', label: 'ส่งต่อ IT Manager' }];
        }
        if (doc.type === 'access') {
            return [{ value: 'Pending_User_Acknowledgement', label: 'อนุมัติและส่งให้ผู้แจ้งรับทราบ' }];
        }
        if (doc.type === 'server_room') {
            return [{ value: 'Approved', label: 'อนุมัติเข้าห้องเซิร์ฟเวอร์' }];
        }
        return [{ value: 'In_Progress', label: 'อนุมัติและส่งดำเนินการ' }];
    };

    const openApproval = (doc) => {
        setApprovalDocument(doc);
        setSelectedApprovalStatus('');
    };

    const fetchFullDocument = async (doc) => {
        const table = doc.type === 'server_room'
            ? 'controlled_area_logs'
            : doc.type === 'access'
                ? 'access_requests'
                : 'change_requests';

        const { data, error } = await mysql
            .from(table)
            .select('*')
            .eq('id', doc.rawId)
            .single();

        if (error) throw error;
        return {
            ...doc,
            raw: doc.type === 'access'
                ? { ...data, systems: normalizeSystems(data?.systems) }
                : data,
        };
    };

    const showDocumentLoading = () => {
        Swal.fire({
            title: 'กำลังโหลดเอกสาร...',
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            didOpen: () => Swal.showLoading(),
        });
    };

    const openDetail = async (doc) => {
        try {
            showDocumentLoading();
            const fullDocument = await fetchFullDocument(doc);
            Swal.close();
            setDetailDocument(fullDocument);
        } catch (error) {
            console.error('Error loading approval document detail:', error);
            Swal.fire('Error', 'ไม่สามารถโหลดรายละเอียดเอกสารได้', 'error');
        }
    };

    const buildAccessReportData = (doc) => {
        const req = doc.raw || {};
        return {
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
            userAcknowledgeSign: req.user_acknowledge_sign || null,
            userAcknowledgeDate: req.user_acknowledge_date || null,
            createdAt: req.created_at || null,
            status: req.status || '',
            cancelledAt: req.cancelled_at || null,
            cancelReason: req.cancel_reason || '',
            cancelItName: req.cancel_it_name || '',
            cancelItSign: req.cancel_it_sign || null,
        };
    };

    const buildChangeReportData = (doc) => {
        const req = doc.raw || {};
        return {
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
            itStaffName: req.it_staff_name || '',
            itStaffDate: req.it_staff_date || null,
            itStaffPosition: req.it_staff_position || '',
            userAcceptance: req.user_acceptance || '',
            userRejectReason: req.user_reject_reason || '',
            userAcceptSign: req.user_accept_sign || null,
            userAcceptDate: req.user_accept_date || null,
            status: req.status || '',
            cancelledAt: req.cancelled_at || null,
        };
    };

    const openReport = async (doc) => {
        if (doc.type === 'server_room') {
            Swal.fire('ยังไม่มีแบบฟอร์มรายงาน', 'รายการเข้าห้องเซิร์ฟเวอร์สามารถดูรายละเอียดได้จากปุ่มดูรายละเอียดก่อน', 'info');
            return;
        }

        try {
            showDocumentLoading();
            const fullDocument = await fetchFullDocument(doc);
            Swal.close();
            if (fullDocument.type === 'access') {
                setAccessReportData(buildAccessReportData(fullDocument));
            } else {
                setChangeReportData(buildChangeReportData(fullDocument));
            }
        } catch (error) {
            console.error('Error loading approval document report:', error);
            Swal.fire('Error', 'ไม่สามารถโหลดรายงานเอกสารได้', 'error');
        }
    };

    const detailRows = useMemo(() => {
        if (!detailDocument) return [];
        const raw = detailDocument.raw || {};
        if (detailDocument.type === 'access') {
            const systemNames = Object.entries(normalizeSystems(raw.systems))
                .filter(([, enabled]) => enabled)
                .map(([key]) => key === 'other' ? `Other: ${raw.other_system_details || '-'}` : key)
                .join(', ');
            return [
                ['เลขที่เอกสาร', raw.ticket_number || '-'],
                ['ผู้ร้องขอ', raw.name_th || raw.name_en || '-'],
                ['รหัสพนักงาน', raw.employee_id || '-'],
                ['แผนก', raw.department || '-'],
                ['ตำแหน่ง', raw.position || '-'],
                ['เบอร์ภายใน', raw.internal_phone || '-'],
                ['ระบบที่ขอสิทธิ์', systemNames || '-'],
                ['รายละเอียด', raw.request_details || raw.other_system_details || '-'],
                ['สถานะ', STATUS_LABELS[raw.status] || raw.status || '-'],
                ['วันที่สร้าง', formatDateTime(raw.created_at)],
                ['หัวหน้าอนุมัติ', formatDateTime(raw.manager_date)],
                ['IT Supervisor', raw.it_supervisor_name ? `${raw.it_supervisor_name} (${formatDateTime(raw.it_supervisor_date)})` : formatDateTime(raw.it_supervisor_date)],
                ['IT Manager', raw.it_manager_name ? `${raw.it_manager_name} (${formatDateTime(raw.it_manager_date)})` : formatDateTime(raw.it_manager_date)],
            ];
        }
        if (detailDocument.type === 'change') {
            return [
                ['เลขที่เอกสาร', raw.ticket_number || '-'],
                ['ผู้ร้องขอ', raw.requester_name || '-'],
                ['แผนก', raw.department || '-'],
                ['ประเภท', raw.req_type || '-'],
                ['รายละเอียด', raw.details || '-'],
                ['เหตุผล', raw.reason || '-'],
                ['สถานะ', STATUS_LABELS[raw.status] || raw.status || '-'],
                ['วันที่สร้าง', formatDateTime(raw.created_at)],
                ['หัวหน้าอนุมัติ', formatDateTime(raw.manager_date)],
                ['IT Manager', raw.it_manager_name ? `${raw.it_manager_name} (${formatDateTime(raw.it_manager_date)})` : formatDateTime(raw.it_manager_date)],
                ['กำหนดแล้วเสร็จ', formatDate(raw.it_target_date)],
            ];
        }
        return [
            ['เลขที่รายการ', `SR-${raw.id || detailDocument.rawId}`],
            ['ผู้ขอเข้า', raw.full_name || '-'],
            ['แผนก', raw.department || '-'],
            ['วันที่เข้า', formatDate(raw.entry_date)],
            ['เวลาเข้า', raw.entry_time || '-'],
            ['เหตุผล', raw.reason || '-'],
            ['สถานะ', STATUS_LABELS[raw.status] || raw.status || '-'],
            ['ผู้อนุมัติ', raw.approved_by || '-'],
            ['เวลาอนุมัติ', formatDateTime(raw.approved_at)],
        ];
    }, [detailDocument]);

    const handleApprove = async () => {
        if (!selectedApprovalStatus) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณาเลือกสถานะที่ต้องการเปลี่ยน', 'warning');
            return;
        }

        const requiresSignature = approvalDocument?.type !== 'server_room';

        if (!approvalDocument || (requiresSignature && (!signatureRef.current || signatureRef.current.isEmpty()))) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณาลงลายเซ็นก่อนยืนยัน', 'warning');
            return;
        }

        const isSupervisorStep = approvalDocument.status === 'Pending_IT_Supervisor';
        const signature = requiresSignature ? signatureRef.current.getCanvas().toDataURL('image/png') : '';
        const updateData = approvalDocument.type === 'server_room'
            ? {
                status: selectedApprovalStatus,
                approved_by: currentAdmin?.name || currentAdmin?.username || '',
                approved_role: currentRole,
                approved_at: toMysqlDateTime(),
            }
            : approvalDocument.type === 'access'
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
            const table = approvalDocument.type === 'server_room'
                ? 'controlled_area_logs'
                : approvalDocument.type === 'access'
                    ? 'access_requests'
                    : 'change_requests';
            const { error } = await mysql.from(table).update(updateData).eq('id', approvalDocument.rawId);
            if (error) throw error;
            setDocuments((currentDocuments) => currentDocuments.filter((doc) => doc.id !== approvalDocument.id));
            setApprovalDocument(null);
            setSelectedApprovalStatus('');
            window.dispatchEvent(new Event('approval-queues:refresh'));
            if (approvalDocument.type === 'server_room') {
                window.dispatchEvent(new Event('server-room:refresh'));
            }
            fetchDocuments({ silent: true });
            Swal.fire('อัปเดตแล้ว', approvalDocument.type === 'server_room' ? 'อนุมัติรายการเข้าห้องเซิร์ฟเวอร์แล้ว' : isSupervisorStep ? 'เซ็นและส่งต่อ IT Manager แล้ว' : 'เซ็นอนุมัติเรียบร้อยแล้ว', 'success');
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
                                ['server_room', 'เข้าห้องเซิร์ฟเวอร์'],
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
                                                {doc.type === 'access' ? <Key className="w-4 h-4 text-indigo-500" /> : doc.type === 'server_room' ? <Server className="w-4 h-4 text-cyan-500" /> : <ClipboardPenLine className="w-4 h-4 text-emerald-500" />}
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
                                            <span className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-semibold ${getStatusBadgeClass(doc.status)}`}>
                                                {STATUS_LABELS[doc.status] || doc.status || '-'}
                                            </span>
                                        </td>
                                        <td className="p-4 align-top text-right">
                                            <div className="flex flex-wrap justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => openDetail(doc)}
                                                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-600 transition-colors hover:bg-sky-600 hover:text-white dark:bg-sky-950/50 dark:text-sky-300 dark:hover:bg-sky-600 dark:hover:text-white"
                                                    title="ดูรายละเอียดเอกสาร"
                                                >
                                                    <Eye className="w-4 h-4" /> รายละเอียด
                                                </button>
                                                {doc.type !== 'server_room' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => openReport(doc)}
                                                        className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-600 transition-colors hover:bg-violet-600 hover:text-white dark:bg-violet-950/50 dark:text-violet-300 dark:hover:bg-violet-600 dark:hover:text-white"
                                                        title="เปิดรีพอร์ต"
                                                    >
                                                        <FileText className="w-4 h-4" /> รีพอร์ต
                                                    </button>
                                                )}
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
                        {selectedApprovalStatus && approvalDocument.type === 'server_room' && (
                            <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-3 text-sm text-cyan-800 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-200">
                                รายการเข้าห้องเซิร์ฟเวอร์จะบันทึกชื่อผู้อนุมัติ บทบาท และเวลาอนุมัติอัตโนมัติ
                            </div>
                        )}
                        {selectedApprovalStatus && approvalDocument.type !== 'server_room' && (
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

            {detailDocument && (
                <div className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-slate-900/60 p-3 backdrop-blur-sm sm:items-center sm:p-4">
                    <div className="w-full max-w-3xl rounded-3xl border border-slate-100 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 dark:border-slate-700 sm:p-6">
                            <div>
                                <div className="flex items-center gap-2">
                                    {detailDocument.type === 'access' ? <Key className="h-5 w-5 text-indigo-500" /> : detailDocument.type === 'server_room' ? <Server className="h-5 w-5 text-cyan-500" /> : <ClipboardPenLine className="h-5 w-5 text-emerald-500" />}
                                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">รายละเอียดเอกสาร</h3>
                                </div>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{detailDocument.typeLabel} • {detailDocument.ticketNumber || '-'}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setDetailDocument(null)}
                                className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-rose-500 dark:hover:bg-slate-700"
                                aria-label="ปิด"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="max-h-[70vh] overflow-y-auto p-5 sm:p-6">
                            <div className="grid gap-3 sm:grid-cols-2">
                                {detailRows.map(([label, value]) => (
                                    <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                                        <div className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</div>
                                        <div className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold text-slate-700 dark:text-slate-200">{value || '-'}</div>
                                    </div>
                                ))}
                            </div>
                            {detailDocument.raw?.cancel_reason && (
                                <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                                    <span className="font-bold">เหตุผลยกเลิก: </span>{detailDocument.raw.cancel_reason}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <Fmit12PdfPreview
                isOpen={Boolean(accessReportData)}
                onClose={() => setAccessReportData(null)}
                formData={accessReportData}
            />
            <Fmit15PdfPreview
                isOpen={Boolean(changeReportData)}
                onClose={() => setChangeReportData(null)}
                formData={changeReportData}
            />
        </div>
    );
};

export default ApprovedDocuments;
