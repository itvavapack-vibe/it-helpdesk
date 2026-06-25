import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, CheckCircle, Clock, Edit, Eye, Filter, Key, Link, MoveRight, Printer, Search, Trash2, UserMinus, XCircle } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import Swal from 'sweetalert2';
import { mysql } from '../mysqlClient';
import Fmit12PdfPreview from './Fmit12PdfPreview';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ACCESS_QUEUE_STATUS_BY_ROLE, ROLES, canDeleteRecords, canManageAllWork, normalizeRoleValue, visibleQueueStatuses } from '../config/roles';
import { toMysqlDateTime } from '../utils/dateTime';
import { showAcknowledgeAccessRequestLinkDialog } from '../utils/closeIssueLink';
import { loadSignatureIntoCanvas } from '../utils/signatureCanvas';

const STATUS_LABELS = {
    Pending: 'ร้องขอ',
    Pending_Manager: 'ผู้จัดการของผู้แจ้ง',
    Pending_IT: 'รับแจ้ง',
    Pending_IT_Supervisor: 'หัวหน้าแผนก',
    Pending_IT_Manager: 'ผู้จัดการ',
    Pending_User_Acknowledgement: 'ผู้แจ้งรับทราบ',
    Approved: 'อนุมัติแล้ว',
    Completed: 'เสร็จสิ้น',
    Rejected: 'ไม่อนุมัติ',
    Cancelled: 'ยกเลิก',
};

const EMPLOYEE_STATUS = {
    ACTIVE: 'ทำงาน',
    TRANSFERRED: 'โอนย้าย',
    RESIGNED: 'ลาออก',
};

const EMPLOYEE_EVENT_FILTERS = {
    ALL: 'All',
    RESIGNED: 'resigned',
    TRANSFERRED: 'transferred',
};

const STATUS_CARD_ORDER = [
    'Pending_Manager',
    'Pending_IT',
    'Pending_IT_Supervisor',
    'Pending_IT_Manager',
    'Pending_User_Acknowledgement',
    'Completed',
    'Rejected',
    'Cancelled',
];

const SYSTEM_OPTIONS = [
    { id: 'userComputer', label: 'User Computer' },
    { id: 'email', label: 'E-Mail' },
    { id: 'dataAll', label: 'Data All' },
    { id: 'vpn', label: 'VPN' },
    { id: 'allWeb', label: 'All Web' },
    { id: 'wms', label: 'WMS' },
    { id: 'msDynamics365', label: 'MS Dynamics365' },
    { id: 'cyberHrm', label: 'Cyber HRM' },
];

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

const formatSystems = (systemsMap, otherDetails) => {
    if (!systemsMap) return '-';
    const labels = Object.fromEntries(SYSTEM_OPTIONS.map((option) => [option.id, option.label]));
    const requested = Object.keys(systemsMap)
        .filter((key) => systemsMap[key] && key !== 'other')
        .map((key) => labels[key] || key);
    if (systemsMap.other) requested.push(`อื่นๆ (${otherDetails || '-'})`);
    return requested.length ? requested.join(', ') : '-';
};

const getTimeValue = (value) => {
    const time = new Date(value || 0).getTime();
    return Number.isNaN(time) ? 0 : time;
};

const getEffectiveStatus = (status) => (status === 'Pending' || !status ? 'Pending_Manager' : status);
const normalizeEmployeeId = (value) => String(value || '').trim();

const formatDisplayDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('th-TH');
};

const AdminAccessRequests = ({ currentAdmin }) => {
    const [requests, setRequests] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [ticketFilter, setTicketFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [employeeEventFilter, setEmployeeEventFilter] = useState(EMPLOYEE_EVENT_FILTERS.ALL);
    const [dateRangeStart, setDateRangeStart] = useState('');
    const [dateRangeEnd, setDateRangeEnd] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [detailRequest, setDetailRequest] = useState(null);
    const [detailForm, setDetailForm] = useState({});
    const [isSavingDetails, setIsSavingDetails] = useState(false);
    const [handledTransferEmployeeIds, setHandledTransferEmployeeIds] = useState(() => new Set());
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isSignModalOpen, setIsSignModalOpen] = useState(false);
    const [signingRequestId, setSigningRequestId] = useState(null);
    const [selectedActionStatus, setSelectedActionStatus] = useState('');
    const [itStaffName, setItStaffName] = useState('');
    const [actionResult, setActionResult] = useState('');
    const adminSignatureRef = useRef(null);

    const currentRole = normalizeRoleValue(currentAdmin?.role);
    const canDeleteRecord = canDeleteRecords(currentAdmin?.role);
    const canEditAllWork = canManageAllWork(currentAdmin?.role);
    const visibleStatuses = visibleQueueStatuses(currentRole, ACCESS_QUEUE_STATUS_BY_ROLE);
    const canActOnStatus = (status) => {
        const normalizedStatus = getEffectiveStatus(status);
        return (visibleStatuses || []).includes(normalizedStatus);
    };
    const canEditEmployeeMovementRequests = [ROLES.IT_SUPPORT, ROLES.IT_SOFTWARE].includes(currentRole);

    const toggleSort = (key) => {
        setSortConfig((current) => {
            if (current.key === key) {
                return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: key === 'created_at' ? 'desc' : 'asc' };
        });
    };

    const renderSortIcon = (key) => {
        if (sortConfig.key !== key) return <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />;
        return sortConfig.direction === 'asc'
            ? <ArrowUp className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />
            : <ArrowDown className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />;
    };

    const fetchRequests = async ({ silent = false } = {}) => {
        if (!silent) setIsLoading(true);
        try {
            const { data, error } = await mysql
                .from('access_requests')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setRequests((data || []).map((req) => ({ ...req, systems: normalizeSystems(req.systems) })));
        } catch (error) {
            console.error('Error fetching access requests:', error);
            if (!silent) {
                Swal.fire('ไม่พบตารางข้อมูล', 'กรุณาสร้างตาราง access_requests ใน MySQL ก่อน', 'warning');
            }
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    const fetchEmployees = async () => {
        try {
            const { data, error } = await mysql
                .from('employees')
                .select('emp_id, status, end_date, transfer_date, transfer_department, transfer_position')
                .order('emp_id', { ascending: true });

            if (error) throw error;
            setEmployees(data || []);
        } catch (error) {
            console.error('Error fetching employees for access request alerts:', error);
        }
    };

    useEffect(() => {
        fetchRequests();
        fetchEmployees();
        const intervalId = setInterval(() => {
            if (document.visibilityState === 'visible') {
                fetchRequests({ silent: true });
                fetchEmployees();
            }
        }, 7000);
        return () => clearInterval(intervalId);
    }, []);

    useEffect(() => {
        if (!isSignModalOpen || selectedActionStatus !== 'Pending_IT_Supervisor') return;
        loadSignatureIntoCanvas(adminSignatureRef, currentAdmin?.signature);
    }, [isSignModalOpen, selectedActionStatus]);

    const employeesById = useMemo(() => {
        const map = new Map();
        employees.forEach((employee) => {
            const employeeId = normalizeEmployeeId(employee.emp_id);
            if (employeeId) map.set(employeeId, employee);
        });
        return map;
    }, [employees]);

    const getRequestEmployee = (req) => employeesById.get(normalizeEmployeeId(req?.employee_id));

    const isResignedAccessRequest = (req) => {
        const employee = getRequestEmployee(req);
        return employee?.status === EMPLOYEE_STATUS.RESIGNED && getEffectiveStatus(req?.status) !== 'Cancelled';
    };

    const isTransferredAccessRequest = (req) => {
        const employee = getRequestEmployee(req);
        const employeeId = normalizeEmployeeId(req?.employee_id);
        return employee?.status === EMPLOYEE_STATUS.TRANSFERRED && !handledTransferEmployeeIds.has(employeeId);
    };

    const canEditAccessRequest = (req) => {
        const employeeId = normalizeEmployeeId(req?.employee_id);
        if (handledTransferEmployeeIds.has(employeeId)) return false;
        if (canEditAllWork) return true;
        if (!canEditEmployeeMovementRequests) return false;
        return isTransferredAccessRequest(req) || isResignedAccessRequest(req);
    };

    const getEmployeeMovementInfo = (req) => {
        const employee = getRequestEmployee(req);
        if (!employee) return null;
        if (employee.status === EMPLOYEE_STATUS.RESIGNED && getEffectiveStatus(req?.status) !== 'Cancelled') {
            return {
                type: EMPLOYEE_EVENT_FILTERS.RESIGNED,
                label: 'ลาออก',
                detail: `วันที่ลาออก ${formatDisplayDate(employee.end_date)}`,
                className: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300',
            };
        }
        if (isTransferredAccessRequest(req)) {
            const transferDetail = [
                employee.transfer_date ? `วันที่โอนย้าย ${formatDisplayDate(employee.transfer_date)}` : '',
                employee.transfer_department ? `ไป ${employee.transfer_department}` : '',
                employee.transfer_position ? `ตำแหน่ง ${employee.transfer_position}` : '',
            ].filter(Boolean).join(' · ');
            return {
                type: EMPLOYEE_EVENT_FILTERS.TRANSFERRED,
                label: 'โอนย้าย',
                detail: transferDetail || 'มีข้อมูลโอนย้ายจากหน้าพนักงาน',
                className: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300',
            };
        }
        return null;
    };

    const getActionStatusOptions = (status) => {
        const effectiveStatus = getEffectiveStatus(status);
        if (effectiveStatus === 'Pending_IT') {
            return [{ value: 'Pending_IT_Supervisor', label: 'ส่งต่อ IT Supervisor' }];
        }
        return [];
    };

    const openStatusActionModal = (req) => {
        const effectiveStatus = getEffectiveStatus(req.status);
        if (!canActOnStatus(effectiveStatus)) return;
        const options = getActionStatusOptions(effectiveStatus);
        if (!options.length) return;

        setSigningRequestId(req.id);
        setSelectedActionStatus('');
        setItStaffName(currentAdmin?.name || currentAdmin?.username || '');
        setActionResult('');
        setIsSignModalOpen(true);
    };

    const handleSignAndForward = async () => {
        if (selectedActionStatus !== 'Pending_IT_Supervisor') {
            Swal.fire('ข้อมูลไม่ครบถ้วน', 'กรุณาเลือกสถานะที่ต้องการเปลี่ยน', 'warning');
            return;
        }

        if (!itStaffName.trim() || !actionResult.trim() || !adminSignatureRef.current || adminSignatureRef.current.isEmpty()) {
            Swal.fire('ข้อมูลไม่ครบถ้วน', 'กรุณาระบุชื่อผู้รับแจ้ง ผลการดำเนินการ และลงลายเซ็นผู้ปฏิบัติงาน', 'warning');
            return;
        }

        const signData = adminSignatureRef.current.getCanvas().toDataURL('image/png');
        const updatePayload = {
            status: 'Pending_IT_Supervisor',
            it_staff_sign: signData,
            it_staff_date: toMysqlDateTime(),
            it_staff_name: itStaffName.trim(),
            action_result: actionResult.trim(),
        };

        try {
            const { error } = await mysql.from('access_requests').update(updatePayload).eq('id', signingRequestId);
            if (error) throw error;
            setRequests((prev) => prev.map((req) => (req.id === signingRequestId ? { ...req, ...updatePayload } : req)));
            setIsSignModalOpen(false);
            setSigningRequestId(null);
            setSelectedActionStatus('');
            window.dispatchEvent(new Event('approval-queues:refresh'));
            Swal.fire('ส่งต่อแล้ว', 'ส่งคำร้องไปยัง IT Supervisor แล้ว', 'success');
        } catch (error) {
            console.error('Error signing:', error);
            Swal.fire('Error', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        }
    };

    const handleDelete = async (id) => {
        const result = await Swal.fire({
            title: 'ยืนยันการลบ?',
            text: 'ต้องการลบคำร้องนี้ใช่ไหม? การทำงานนี้ย้อนกลับไม่ได้',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'ลบข้อมูล',
            cancelButtonText: 'ยกเลิก',
        });

        if (!result.isConfirmed) return;
        try {
            const { error } = await mysql.from('access_requests').delete().eq('id', id);
            if (error) throw error;
            setRequests((prev) => prev.filter((req) => req.id !== id));
            window.dispatchEvent(new Event('approval-queues:refresh'));
            Swal.fire('ลบสำเร็จ', 'ลบคำร้องเรียบร้อยแล้ว', 'success');
        } catch (error) {
            console.error('Error deleting request:', error);
            Swal.fire('Error', 'ไม่สามารถลบข้อมูลได้', 'error');
        }
    };

    const handleCancelRequest = async (req) => {
        if (!req || req.status === 'Cancelled') return;
        const result = await Swal.fire({
            title: 'ยืนยันการยกเลิกคำร้อง?',
            text: 'ระบบจะเปลี่ยนสถานะเป็นยกเลิก โดยไม่ลบข้อมูลออกจากระบบ',
            input: 'textarea',
            inputPlaceholder: 'เหตุผลการยกเลิก (ถ้ามี)',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#e11d48',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'ยืนยันยกเลิก',
            cancelButtonText: 'ปิด',
        });
        if (!result.isConfirmed) return;

        const updatePayload = {
            status: 'Cancelled',
            cancelled_at: toMysqlDateTime(),
            cancel_reason: result.value || '',
            cancel_it_name: currentAdmin?.name || currentAdmin?.username || '',
        };

        try {
            const { error } = await mysql.from('access_requests').update(updatePayload).eq('id', req.id);
            if (error) throw error;
            setRequests((prev) => prev.map((item) => (item.id === req.id ? { ...item, ...updatePayload } : item)));
            window.dispatchEvent(new Event('approval-queues:refresh'));
            Swal.fire('ยกเลิกแล้ว', 'เปลี่ยนสถานะคำร้องเป็นยกเลิกเรียบร้อยแล้ว', 'success');
        } catch (error) {
            console.error('Error cancelling access request:', error);
            Swal.fire('Error', 'ไม่สามารถยกเลิกคำร้องได้', 'error');
        }
    };

    const openPreview = (req) => {
        setSelectedRequest({
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
        });
        setIsPreviewOpen(true);
    };

    const openDetailModal = (req) => {
        setDetailRequest(req);
        setDetailForm({
            ticket_number: req.ticket_number || '',
            name_th: req.name_th || '',
            name_en: req.name_en || '',
            department: req.department || '',
            position: req.position || '',
            internal_phone: req.internal_phone || '',
            systems: normalizeSystems(req.systems),
            request_details: req.request_details || '',
            other_system_details: req.other_system_details || '',
            status: req.status || 'Pending_Manager',
            it_staff_name: req.it_staff_name || '',
            action_result: req.action_result || '',
            cancel_reason: req.cancel_reason || '',
        });
    };

    const handleDetailFormChange = (field, value) => {
        if (!canEditAccessRequest(detailRequest)) return;
        setDetailForm((current) => ({ ...current, [field]: value }));
    };

    const handleDetailSystemChange = (systemId) => {
        if (!canEditAccessRequest(detailRequest)) return;
        setDetailForm((current) => ({
            ...current,
            systems: {
                ...normalizeSystems(current.systems),
                [systemId]: !normalizeSystems(current.systems)[systemId],
            },
        }));
    };

    const handleSaveDetails = async () => {
        if (!detailRequest || !canEditAccessRequest(detailRequest)) return;
        setIsSavingDetails(true);
        const normalizedSystems = normalizeSystems(detailForm.systems);
        const updatePayload = {
            ticket_number: detailForm.ticket_number || null,
            name_th: detailForm.name_th || null,
            name_en: detailForm.name_en || null,
            department: detailForm.department || null,
            position: detailForm.position || null,
            internal_phone: detailForm.internal_phone || null,
            systems: JSON.stringify(normalizedSystems),
            request_details: detailForm.request_details || null,
            other_system_details: detailForm.other_system_details || null,
            status: detailForm.status || 'Pending_Manager',
            it_staff_name: detailForm.it_staff_name || null,
            action_result: detailForm.action_result || null,
            cancel_reason: detailForm.cancel_reason || null,
        };
        try {
            const { error } = await mysql.from('access_requests').update(updatePayload).eq('id', detailRequest.id);
            if (error) throw error;
            const wasTransferUpdate = isTransferredAccessRequest(detailRequest);
            const transferEmployeeId = normalizeEmployeeId(detailRequest.employee_id);
            const nextRequest = { ...detailRequest, ...updatePayload, systems: normalizedSystems };

            if (wasTransferUpdate && transferEmployeeId) {
                const { error: employeeError } = await mysql
                    .from('employees')
                    .update({ status: EMPLOYEE_STATUS.ACTIVE })
                    .eq('emp_id', transferEmployeeId);

                if (employeeError) throw employeeError;

                setEmployees((prev) => prev.map((employee) => (
                    normalizeEmployeeId(employee.emp_id) === transferEmployeeId
                        ? { ...employee, status: EMPLOYEE_STATUS.ACTIVE }
                        : employee
                )));
            }

            setRequests((prev) => prev.map((req) => (req.id === detailRequest.id ? { ...req, ...updatePayload, systems: normalizedSystems } : req)));
            if (wasTransferUpdate) {
                setHandledTransferEmployeeIds((current) => {
                    const next = new Set(current);
                    if (transferEmployeeId) next.add(transferEmployeeId);
                    return next;
                });
            }
            setDetailRequest(wasTransferUpdate ? null : nextRequest);
            window.dispatchEvent(new Event('approval-queues:refresh'));
            Swal.fire('บันทึกแล้ว', 'อัปเดตข้อมูลคำร้องขอสิทธิ์เรียบร้อยแล้ว', 'success');
        } catch (error) {
            console.error('Error updating access request detail:', error);
            Swal.fire('Error', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        } finally {
            setIsSavingDetails(false);
        }
    };

    const getStatusBadge = (status) => {
        const normalizedStatus = getEffectiveStatus(status);
        const tone = {
            Pending_Manager: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
            Pending_IT: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
            Pending_IT_Supervisor: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
            Pending_IT_Manager: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
            Pending_User_Acknowledgement: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
            Completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
            Rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
            Cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
        }[normalizedStatus] || 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
        const Icon = ['Completed', 'Approved'].includes(normalizedStatus) ? CheckCircle : normalizedStatus === 'Rejected' || normalizedStatus === 'Cancelled' ? XCircle : Clock;
        return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1 ${tone}`}><Icon className="w-3 h-3" /> {STATUS_LABELS[normalizedStatus] || normalizedStatus}</span>;
    };

    const statusCounts = useMemo(() => {
        const counts = { All: requests.length };
        STATUS_CARD_ORDER.forEach((status) => {
            counts[status] = 0;
        });
        requests.forEach((req) => {
            const effectiveStatus = getEffectiveStatus(req.status);
            counts[effectiveStatus] = (counts[effectiveStatus] || 0) + 1;
        });
        return counts;
    }, [requests]);

    const employeeEventIds = useMemo(() => {
        const resigned = new Set();
        const transferred = new Set();

        requests.forEach((req) => {
            const employeeId = normalizeEmployeeId(req.employee_id);
            if (!employeeId) return;
            if (isResignedAccessRequest(req)) resigned.add(employeeId);
            if (isTransferredAccessRequest(req)) transferred.add(employeeId);
        });

        return {
            [EMPLOYEE_EVENT_FILTERS.RESIGNED]: resigned,
            [EMPLOYEE_EVENT_FILTERS.TRANSFERRED]: transferred,
        };
    }, [employeesById, handledTransferEmployeeIds, requests]);

    const employeeEventCounts = useMemo(() => ({
        [EMPLOYEE_EVENT_FILTERS.RESIGNED]: employeeEventIds[EMPLOYEE_EVENT_FILTERS.RESIGNED].size,
        [EMPLOYEE_EVENT_FILTERS.TRANSFERRED]: employeeEventIds[EMPLOYEE_EVENT_FILTERS.TRANSFERRED].size,
    }), [employeeEventIds]);

    const statusSummaryCards = useMemo(() => ([
        { status: 'All', label: 'ทั้งหมด', value: statusCounts.All || 0, icon: Key, className: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200' },
        ...STATUS_CARD_ORDER.map((status) => ({
            status,
            label: STATUS_LABELS[status] || status,
            value: statusCounts[status] || 0,
            icon: ['Completed', 'Approved'].includes(status) ? CheckCircle : status === 'Rejected' || status === 'Cancelled' ? XCircle : Clock,
            className: {
                Pending_Manager: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
                Pending_IT: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
                Pending_IT_Supervisor: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
                Pending_IT_Manager: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
                Pending_User_Acknowledgement: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
                Completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
                Rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
                Cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
            }[status] || 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
        })),
    ]), [statusCounts]);

    const employeeEventCards = useMemo(() => ([
        {
            filter: EMPLOYEE_EVENT_FILTERS.RESIGNED,
            label: 'พนักงานลาออก',
            description: 'แสดงจนกว่าคำร้องจะยกเลิก',
            value: employeeEventCounts[EMPLOYEE_EVENT_FILTERS.RESIGNED] || 0,
            icon: UserMinus,
            className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
        },
        {
            filter: EMPLOYEE_EVENT_FILTERS.TRANSFERRED,
            label: 'พนักงานโอนย้าย',
            description: 'แก้ไขข้อมูลจากรายการได้',
            value: employeeEventCounts[EMPLOYEE_EVENT_FILTERS.TRANSFERRED] || 0,
            icon: MoveRight,
            className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
        },
    ]), [employeeEventCounts]);

    const filteredRequests = useMemo(() => requests.filter((req) => {
        const keyword = searchTerm.trim().toLowerCase();
        const ticketKeyword = ticketFilter.trim().toLowerCase();
        const effectiveStatus = getEffectiveStatus(req.status);
        const matchesSearch =
            !keyword ||
            req.employee_id?.toLowerCase().includes(keyword) ||
            req.name_th?.toLowerCase().includes(keyword) ||
            req.department?.toLowerCase().includes(keyword) ||
            req.ticket_number?.toLowerCase().includes(keyword) ||
            req.request_details?.toLowerCase().includes(keyword) ||
            req.other_system_details?.toLowerCase().includes(keyword);
        const matchesTicket = !ticketKeyword || req.ticket_number?.toLowerCase().includes(ticketKeyword);
        const matchesStatus = statusFilter === 'All' || effectiveStatus === statusFilter;
        const employeeId = normalizeEmployeeId(req.employee_id);
        const matchesEmployeeEvent =
            employeeEventFilter === EMPLOYEE_EVENT_FILTERS.ALL ||
            (employeeEventFilter === EMPLOYEE_EVENT_FILTERS.RESIGNED && isResignedAccessRequest(req) && employeeEventIds[EMPLOYEE_EVENT_FILTERS.RESIGNED].has(employeeId)) ||
            (employeeEventFilter === EMPLOYEE_EVENT_FILTERS.TRANSFERRED && isTransferredAccessRequest(req) && employeeEventIds[EMPLOYEE_EVENT_FILTERS.TRANSFERRED].has(employeeId));
        const reqDate = new Date(req.created_at);
        const matchesStart = !dateRangeStart || reqDate >= new Date(dateRangeStart);
        const matchesEnd = !dateRangeEnd || reqDate <= new Date(`${dateRangeEnd}T23:59:59`);
        return matchesSearch && matchesTicket && matchesStatus && matchesEmployeeEvent && matchesStart && matchesEnd;
    }), [dateRangeEnd, dateRangeStart, employeeEventFilter, employeeEventIds, employeesById, requests, searchTerm, statusFilter, ticketFilter]);

    const sortedRequests = useMemo(() => {
        const direction = sortConfig.direction === 'asc' ? 1 : -1;
        return [...filteredRequests].sort((a, b) => {
            let compareValue = 0;
            if (sortConfig.key === 'ticket_number') {
                compareValue = String(a.ticket_number || '').localeCompare(String(b.ticket_number || ''), 'th-TH', { numeric: true, sensitivity: 'base' });
            } else {
                compareValue = getTimeValue(a.created_at) - getTimeValue(b.created_at);
            }
            if (compareValue === 0) compareValue = Number(a.id || 0) - Number(b.id || 0);
            return compareValue * direction;
        });
    }, [filteredRequests, sortConfig]);

    const canEditDetailRequest = detailRequest ? canEditAccessRequest(detailRequest) : canEditAllWork;
    const isTransferDetailUpdate = detailRequest ? isTransferredAccessRequest(detailRequest) : false;

    const applyStatusCardFilter = (status) => {
        setEmployeeEventFilter(EMPLOYEE_EVENT_FILTERS.ALL);
        setStatusFilter((currentStatus) => (status !== 'All' && currentStatus === status ? 'All' : status));
    };

    const applyEmployeeEventFilter = (filter) => {
        setStatusFilter('All');
        setEmployeeEventFilter((currentFilter) => (
            currentFilter === filter ? EMPLOYEE_EVENT_FILTERS.ALL : filter
        ));
    };

    const handleStatusSelectFilter = (value) => {
        setEmployeeEventFilter(EMPLOYEE_EVENT_FILTERS.ALL);
        setStatusFilter(value);
    };

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="flex flex-col items-start gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-100 dark:bg-amber-900/50 rounded-xl text-amber-600 dark:text-amber-300">
                        <Key className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">คำร้องขอสิทธิ์ใช้งานระบบ</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">จัดการแบบฟอร์ม FMIT 12</p>
                    </div>
                </div>

                <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <div className="relative w-full sm:min-w-80 sm:flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="ค้นหารหัสพนักงาน ชื่อ แผนก หรือรายละเอียด..."
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            className="input-modern !pl-9 !py-2 !text-sm w-full"
                        />
                    </div>
                    <div className="relative w-full sm:w-56">
                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="กรองเลขที่เอกสาร..."
                            value={ticketFilter}
                            onChange={(event) => setTicketFilter(event.target.value)}
                            className="input-modern !pl-9 !py-2 !text-sm w-full"
                        />
                    </div>
                    <div className="relative w-full sm:w-56">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <Select value={statusFilter} onValueChange={handleStatusSelectFilter}>
                            <SelectTrigger className="input-modern !pl-9 !py-2 !text-sm w-full bg-white dark:bg-slate-800">
                                <SelectValue placeholder="สถานะทั้งหมด" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">สถานะทั้งหมด</SelectItem>
                                <SelectItem value="Pending_Manager">ผู้จัดการของผู้แจ้ง</SelectItem>
                                <SelectItem value="Pending_IT">รับแจ้ง</SelectItem>
                                <SelectItem value="Pending_IT_Supervisor">หัวหน้าแผนก</SelectItem>
                                <SelectItem value="Pending_IT_Manager">ผู้จัดการ</SelectItem>
                                <SelectItem value="Pending_User_Acknowledgement">ผู้แจ้งรับทราบ</SelectItem>
                                <SelectItem value="Completed">Completed</SelectItem>
                                <SelectItem value="Rejected">Rejected</SelectItem>
                                <SelectItem value="Cancelled">Cancelled</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <input type="date" value={dateRangeStart} onChange={(event) => setDateRangeStart(event.target.value)} className="input-modern !py-2 !text-sm w-full sm:w-40" title="วันที่เริ่มต้น" />
                    <input type="date" value={dateRangeEnd} onChange={(event) => setDateRangeEnd(event.target.value)} className="input-modern !py-2 !text-sm w-full sm:w-40" title="วันที่สิ้นสุด" />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {statusSummaryCards.map((card) => {
                    const Icon = card.icon;
                    const isActive = statusFilter === card.status && employeeEventFilter === EMPLOYEE_EVENT_FILTERS.ALL;
                    return (
                        <button
                            key={card.status}
                            type="button"
                            onClick={() => applyStatusCardFilter(card.status)}
                            aria-pressed={isActive}
                            className={`group flex min-h-[104px] flex-col justify-between rounded-2xl border bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md dark:bg-slate-800 ${
                                isActive
                                    ? 'border-amber-400 ring-2 ring-amber-200 dark:border-amber-500 dark:ring-amber-900/50'
                                    : 'border-slate-100 dark:border-slate-700'
                            }`}
                        >
                            <div className="flex items-center justify-between gap-3">
                                <span className={`rounded-xl p-2 ${card.className}`}>
                                    <Icon className="h-4 w-4" />
                                </span>
                                <span className="text-2xl font-extrabold text-slate-900 dark:text-white">{card.value}</span>
                            </div>
                            <span className="mt-3 text-sm font-semibold leading-tight text-slate-600 dark:text-slate-300">{card.label}</span>
                        </button>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {employeeEventCards.map((card) => {
                    const Icon = card.icon;
                    const isActive = employeeEventFilter === card.filter;
                    return (
                        <button
                            key={card.filter}
                            type="button"
                            onClick={() => applyEmployeeEventFilter(card.filter)}
                            aria-pressed={isActive}
                            className={`flex min-h-[112px] items-center justify-between gap-4 rounded-2xl border bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-800 ${
                                isActive
                                    ? 'border-blue-400 ring-2 ring-blue-200 dark:border-blue-500 dark:ring-blue-900/50'
                                    : 'border-slate-100 dark:border-slate-700'
                            }`}
                        >
                            <div className="flex min-w-0 items-center gap-4">
                                <span className={`shrink-0 rounded-xl p-3 ${card.className}`}>
                                    <Icon className="h-5 w-5" />
                                </span>
                                <div className="min-w-0">
                                    <div className="font-bold text-slate-800 dark:text-white">{card.label}</div>
                                    <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{card.description}</div>
                                </div>
                            </div>
                            <div className="shrink-0 text-right">
                                <div className="text-3xl font-extrabold text-slate-900 dark:text-white">{card.value}</div>
                                <div className="text-xs font-semibold text-slate-400">พนักงาน</div>
                            </div>
                        </button>
                    );
                })}
            </div>

            {isLoading ? (
                <div className="flex justify-center items-center py-20">
                    <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                </div>
            ) : filteredRequests.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 p-10 rounded-2xl text-center border border-slate-100 dark:border-slate-700">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Key className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-2">ไม่พบคำร้องขอสิทธิ์</h3>
                    <p className="text-slate-500 dark:text-slate-400">ยังไม่มีคำร้องขอสิทธิ์ หรือไม่พบรายการตามเงื่อนไขการค้นหา</p>
                </div>
            ) : (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                                    <th className="p-4 font-semibold whitespace-nowrap">
                                        <button type="button" onClick={() => toggleSort('created_at')} className="inline-flex items-center gap-1.5 rounded-lg px-1 py-0.5 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                                            วันที่
                                            {renderSortIcon('created_at')}
                                        </button>
                                    </th>
                                    <th className="p-4 font-semibold whitespace-nowrap">
                                        <button type="button" onClick={() => toggleSort('ticket_number')} className="inline-flex items-center gap-1.5 rounded-lg px-1 py-0.5 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                                            เลขที่
                                            {renderSortIcon('ticket_number')}
                                        </button>
                                    </th>
                                    <th className="p-4 font-semibold whitespace-nowrap">รหัสพนักงาน</th>
                                    <th className="p-4 font-semibold whitespace-nowrap">ชื่อ / แผนก</th>
                                    <th className="p-4 font-semibold">ระบบที่ขอสิทธิ์</th>
                                    <th className="p-4 font-semibold whitespace-nowrap">สถานะ</th>
                                    <th className="p-4 font-semibold text-right whitespace-nowrap">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                {sortedRequests.map((req) => {
                                    const movementInfo = getEmployeeMovementInfo(req);
                                    const canEditThisRequest = canEditAccessRequest(req);
                                    const isTransferUpdateRequest = isTransferredAccessRequest(req);
                                    return (
                                    <tr key={req.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="p-4 align-top whitespace-nowrap">
                                            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{new Date(req.created_at).toLocaleDateString('th-TH')}</div>
                                        </td>
                                        <td className="p-4 align-top whitespace-nowrap">
                                            <div className="font-mono text-sm font-semibold text-slate-700 dark:text-slate-300">{req.ticket_number || 'ไม่มีเลขที่'}</div>
                                        </td>
                                        <td className="p-4 align-top whitespace-nowrap">
                                            <span className="font-mono text-sm font-semibold text-slate-700 dark:text-slate-300">{req.employee_id || '-'}</span>
                                        </td>
                                        <td className="p-4 align-top whitespace-nowrap">
                                            <div className="text-sm font-bold text-slate-800 dark:text-white">{req.name_th}</div>
                                            <div className="text-xs text-slate-500 mt-1">{req.department}</div>
                                            {movementInfo && (
                                                <div className={`mt-2 inline-flex max-w-[240px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${movementInfo.className}`} title={movementInfo.detail}>
                                                    {movementInfo.type === EMPLOYEE_EVENT_FILTERS.RESIGNED ? <UserMinus className="h-3.5 w-3.5 shrink-0" /> : <MoveRight className="h-3.5 w-3.5 shrink-0" />}
                                                    <span className="shrink-0">{movementInfo.label}</span>
                                                    <span className="truncate font-medium opacity-80">{movementInfo.detail}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4 align-top min-w-[220px]">
                                            <div className="text-sm text-slate-700 dark:text-slate-300 font-medium leading-relaxed">{formatSystems(req.systems, req.other_system_details)}</div>
                                            {req.request_details && <div className="text-xs text-slate-500 mt-1.5 line-clamp-2" title={req.request_details}><span className="font-medium">รายละเอียด:</span> {req.request_details}</div>}
                                        </td>
                                        <td className="p-4 align-top whitespace-nowrap">
                                            {getStatusBadge(req.status || 'Pending')}
                                        </td>
                                        <td className="p-4 align-top whitespace-nowrap">
                                            <div className="flex min-w-max gap-2 justify-end">
                                                {canActOnStatus(req.status || 'Pending') && getActionStatusOptions(req.status || 'Pending').length > 0 && (
                                                    <button onClick={() => openStatusActionModal(req)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-amber-600 transition-colors hover:bg-amber-600 hover:text-white" title="เปลี่ยนสถานะ" aria-label="เปลี่ยนสถานะ">
                                                        <Edit className="h-5 w-5" />
                                                    </button>
                                                )}
                                                {req.status === 'Pending_User_Acknowledgement' && (
                                                    <button onClick={() => showAcknowledgeAccessRequestLinkDialog(req)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-teal-600 transition-colors hover:bg-teal-600 hover:text-white" title="ส่งลิงก์ให้ผู้แจ้งรับทราบ" aria-label="ส่งลิงก์ให้ผู้แจ้งรับทราบ">
                                                        <Link className="h-5 w-5" />
                                                    </button>
                                                )}
                                                <button onClick={() => openDetailModal(req)} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${canEditThisRequest ? 'text-amber-600 hover:bg-amber-600 hover:text-white' : 'text-sky-600 hover:bg-sky-600 hover:text-white'}`} title={canEditThisRequest && isTransferUpdateRequest ? 'อัพเดทข้อมูล' : canEditThisRequest ? 'แก้ไขข้อมูลคำร้อง' : 'ดูข้อมูลคำร้อง'} aria-label={canEditThisRequest && isTransferUpdateRequest ? 'อัพเดทข้อมูล' : canEditThisRequest ? 'แก้ไขข้อมูลคำร้อง' : 'ดูข้อมูลคำร้อง'}>
                                                    {canEditThisRequest ? <Edit className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                                </button>
                                                <button onClick={() => openPreview(req)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 shadow-sm transition-colors hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50" title="ดูเอกสาร" aria-label="ดูเอกสาร">
                                                    <Printer className="h-5 w-5" />
                                                </button>
                                                {canDeleteRecord && (
                                                    <button onClick={() => handleDelete(req.id)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20" title="ลบข้อมูล" aria-label="ลบข้อมูล">
                                                        <Trash2 className="h-5 w-5" />
                                                    </button>
                                                )}
                                                {(!canDeleteRecord || canEditAllWork) && !['Cancelled', 'Completed', 'Rejected'].includes(req.status) && (
                                                    <button onClick={() => handleCancelRequest(req)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-rose-500 transition-colors hover:bg-rose-600 hover:text-white" title="ตั้งสถานะยกเลิก" aria-label="ตั้งสถานะยกเลิก">
                                                        <XCircle className="h-5 w-5" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {detailRequest && (
                <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 backdrop-blur-sm sm:p-4">
                    <div className="w-full max-w-4xl animate-slide-up rounded-3xl border border-slate-100 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-800 sm:p-6">
                        <div className="mb-5 flex items-start justify-between gap-4">
                            <div>
                                <h3 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-white">
                                    <Eye className="h-5 w-5 text-sky-500" /> ข้อมูลคำร้องขอสิทธิ์
                                </h3>
                                <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                                    {canEditDetailRequest ? 'สามารถแก้ไขข้อมูลคำร้องนี้ได้' : 'สิทธิ์ปัจจุบันอ่านข้อมูลได้อย่างเดียว'}
                                </p>
                            </div>
                            <button onClick={() => setDetailRequest(null)} className="rounded-xl p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200">
                                <XCircle className="h-6 w-6" />
                            </button>
                        </div>

                        <div className="grid max-h-[calc(100dvh-13rem)] grid-cols-1 gap-4 overflow-y-auto pr-1 md:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">เลขที่เอกสาร</label>
                                <input className="input-modern w-full" value={detailForm.ticket_number || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('ticket_number', event.target.value)} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">สถานะ</label>
                                <Select value={detailForm.status || 'Pending_Manager'} onValueChange={(value) => handleDetailFormChange('status', value)} disabled={!canEditDetailRequest}>
                                    <SelectTrigger className="input-modern w-full">
                                        <SelectValue placeholder="เลือกสถานะ" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                                            <SelectItem key={value} value={value}>{label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">ชื่อ-สกุล ภาษาไทย</label>
                                <input className="input-modern w-full" value={detailForm.name_th || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('name_th', event.target.value)} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">ชื่อ-สกุล ภาษาอังกฤษ</label>
                                <input className="input-modern w-full" value={detailForm.name_en || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('name_en', event.target.value)} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">แผนก</label>
                                <input className="input-modern w-full" value={detailForm.department || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('department', event.target.value)} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">ตำแหน่ง</label>
                                <input className="input-modern w-full" value={detailForm.position || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('position', event.target.value)} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">เบอร์ภายใน</label>
                                <input className="input-modern w-full" value={detailForm.internal_phone || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('internal_phone', event.target.value)} />
                            </div>
                            <div className="md:col-span-2">
                                <label className="mb-2 block text-xs font-bold text-slate-500 dark:text-slate-400">ระบบที่ขอสิทธิ์</label>
                                <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40 sm:grid-cols-2 xl:grid-cols-4">
                                    {SYSTEM_OPTIONS.map((system) => {
                                        const checked = Boolean(normalizeSystems(detailForm.systems)[system.id]);
                                        return (
                                            <label key={system.id} className={`flex items-start gap-3 rounded-xl border p-3 transition-all ${checked ? 'border-indigo-200 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-900/30' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'} ${canEditDetailRequest ? 'cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-600' : 'cursor-default opacity-90'}`}>
                                                <input
                                                    type="checkbox"
                                                    className="mt-0.5 h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed"
                                                    checked={checked}
                                                    disabled={!canEditDetailRequest}
                                                    onChange={() => handleDetailSystemChange(system.id)}
                                                />
                                                <span className={`text-sm font-medium ${checked ? 'text-indigo-800 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-300'}`}>
                                                    {system.label}
                                                </span>
                                            </label>
                                        );
                                    })}
                                    <label className={`flex flex-col gap-3 rounded-xl border p-3 transition-all sm:col-span-2 xl:col-span-4 ${normalizeSystems(detailForm.systems).other ? 'border-indigo-200 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-900/30' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'} ${canEditDetailRequest ? 'cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-600' : 'cursor-default opacity-90'} sm:flex-row sm:items-center`}>
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed"
                                            checked={Boolean(normalizeSystems(detailForm.systems).other)}
                                            disabled={!canEditDetailRequest}
                                            onChange={() => handleDetailSystemChange('other')}
                                        />
                                        <span className="text-sm font-medium text-slate-600 dark:text-slate-300 sm:whitespace-nowrap">อื่น ๆ ระบุ:</span>
                                        <input
                                            className="flex-1 border-b border-slate-300 bg-transparent text-sm outline-none transition-all focus:border-indigo-500 disabled:cursor-not-allowed disabled:text-slate-400"
                                            value={detailForm.other_system_details || ''}
                                            disabled={!canEditDetailRequest || !normalizeSystems(detailForm.systems).other}
                                            onChange={(event) => handleDetailFormChange('other_system_details', event.target.value)}
                                            placeholder="โปรดระบุระบบ..."
                                        />
                                    </label>
                                </div>
                            </div>
                            <div className="md:col-span-2">
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">รายละเอียดคำร้อง</label>
                                <textarea className="input-modern w-full" rows="3" value={detailForm.request_details || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('request_details', event.target.value)} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">ผู้รับแจ้ง / ผู้ดำเนินการ</label>
                                <input className="input-modern w-full" value={detailForm.it_staff_name || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('it_staff_name', event.target.value)} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">วันที่สร้างคำร้อง</label>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
                                    {detailRequest.created_at ? new Date(detailRequest.created_at).toLocaleString('th-TH') : '-'}
                                </div>
                            </div>
                            <div className="md:col-span-2">
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">ผลการดำเนินการ</label>
                                <textarea className="input-modern w-full" rows="3" value={detailForm.action_result || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('action_result', event.target.value)} />
                            </div>
                            <div className="md:col-span-2">
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">เหตุผลยกเลิก</label>
                                <textarea className="input-modern w-full" rows="2" value={detailForm.cancel_reason || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('cancel_reason', event.target.value)} />
                            </div>
                        </div>

                        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button onClick={() => setDetailRequest(null)} className="rounded-xl bg-slate-100 px-5 py-2.5 font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600">ปิด</button>
                            {canEditDetailRequest && (
                                <button onClick={handleSaveDetails} disabled={isSavingDetails} className="rounded-xl bg-sky-600 px-5 py-2.5 font-semibold text-white shadow-md transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">
                                    {isSavingDetails ? 'กำลังบันทึก...' : isTransferDetailUpdate ? 'อัพเดทข้อมูล' : 'บันทึกข้อมูล'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {isSignModalOpen && (
                <div className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center overflow-y-auto p-3 sm:p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 sm:p-6 w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto shadow-2xl animate-slide-up border border-slate-100 dark:border-slate-700">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <CheckCircle className="w-5 h-5 text-indigo-500" /> ลงนามดำเนินการ (IT Support)
                            </h3>
                            <button onClick={() => { setIsSignModalOpen(false); setSelectedActionStatus(''); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="mb-4 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">สถานะที่ต้องการเปลี่ยน</label>
                                <Select value={selectedActionStatus} onValueChange={setSelectedActionStatus}>
                                    <SelectTrigger className="input-modern w-full">
                                        <SelectValue placeholder="เลือกสถานะ" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {getActionStatusOptions('Pending_IT').map((option) => (
                                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {selectedActionStatus === 'Pending_IT_Supervisor' && (
                                <>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">1. ชื่อผู้รับแจ้ง</label>
                                <input type="text" className="input-modern w-full" placeholder="ระบุชื่อเจ้าหน้าที่ IT" value={itStaffName} onChange={(event) => setItStaffName(event.target.value)} />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">2. ผลการดำเนินการ</label>
                                <textarea className="input-modern w-full" placeholder="รายละเอียดการปฏิบัติงาน" rows="2" value={actionResult} onChange={(event) => setActionResult(event.target.value)} />
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">3. ลายมือชื่อผู้ปฏิบัติงาน</span>
                                    <button onClick={() => adminSignatureRef.current?.clear()} className="text-xs text-red-500 font-bold hover:underline">ล้างลายเซ็น</button>
                                </div>
                                <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900/50 relative overflow-hidden" style={{ height: '150px' }}>
                                    <SignatureCanvas ref={adminSignatureRef} penColor="black" canvasProps={{ className: 'w-full h-full xl-signature' }} />
                                    <div className="absolute bottom-2 right-3 text-slate-400 text-xs pointer-events-none opacity-50">เซ็นชื่อผู้ปฏิบัติงานที่นี่</div>
                                </div>
                            </div>
                                </>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => { setIsSignModalOpen(false); setSelectedActionStatus(''); }} className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-200 dark:hover:bg-slate-600">ยกเลิก</button>
                            <button onClick={handleSignAndForward} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 shadow-md">ส่งต่อ Supervisor</button>
                        </div>
                    </div>
                </div>
            )}

            {isPreviewOpen && selectedRequest && (
                <Fmit12PdfPreview
                    formData={selectedRequest}
                    isOpen={isPreviewOpen}
                    onClose={() => setIsPreviewOpen(false)}
                />
            )}
        </div>
    );
};

export default AdminAccessRequests;
