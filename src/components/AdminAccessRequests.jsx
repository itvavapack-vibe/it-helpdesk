import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, Clock, Filter, Key, Search, Trash2, XCircle } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import Swal from 'sweetalert2';
import { mysql } from '../mysqlClient';
import Fmit12PdfPreview from './Fmit12PdfPreview';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { copyText } from '../utils/closeIssueLink';
import { ACCESS_QUEUE_STATUS_BY_ROLE, ROLES, normalizeRoleValue, visibleQueueStatuses } from '../config/roles';
import { toMysqlDateTime } from '../utils/dateTime';

const STATUS_LABELS = {
    Pending: 'รอหัวหน้างาน',
    Pending_Manager: 'รอหัวหน้างาน',
    Pending_IT: 'รอดำเนินการ (IT Support)',
    Pending_IT_Supervisor: 'รอตรวจสอบ (IT Supervisor)',
    Pending_IT_Manager: 'รออนุมัติ (IT Manager)',
    Approved: 'อนุมัติแล้ว',
    Completed: 'เสร็จสิ้น',
    Rejected: 'ไม่อนุมัติ',
    Cancelled: 'ยกเลิก',
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

const formatSystems = (systemsMap, otherDetails) => {
    if (!systemsMap) return '-';
    const labels = {
        userComputer: 'User Computer',
        email: 'E-Mail',
        dataAll: 'Data All',
        vpn: 'VPN',
        allWeb: 'All Web',
        wms: 'WMS',
        msDynamics365: 'MS Dynamics365',
        cyberHrm: 'Cyber HRM',
    };
    const requested = Object.keys(systemsMap)
        .filter((key) => systemsMap[key] && key !== 'other')
        .map((key) => labels[key] || key);
    if (systemsMap.other) requested.push(`อื่นๆ (${otherDetails || '-'})`);
    return requested.length ? requested.join(', ') : '-';
};

const AdminAccessRequests = ({ currentAdmin }) => {
    const [requests, setRequests] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [dateRangeStart, setDateRangeStart] = useState('');
    const [dateRangeEnd, setDateRangeEnd] = useState('');
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isSignModalOpen, setIsSignModalOpen] = useState(false);
    const [signingRequestId, setSigningRequestId] = useState(null);
    const [itStaffName, setItStaffName] = useState('');
    const [actionResult, setActionResult] = useState('');
    const [approvalSignRequest, setApprovalSignRequest] = useState(null);
    const adminSignatureRef = useRef(null);

    const currentRole = normalizeRoleValue(currentAdmin?.role);
    const visibleStatuses = visibleQueueStatuses(currentRole, ACCESS_QUEUE_STATUS_BY_ROLE);
    const canActOnStatus = (status) => {
        const normalizedStatus = status === 'Pending' || !status ? 'Pending_Manager' : status;
        if (currentRole === ROLES.SUPERADMIN) {
            return ['Pending_IT', 'Pending_IT_Supervisor', 'Pending_IT_Manager'].includes(normalizedStatus);
        }
        return (visibleStatuses || []).includes(normalizedStatus);
    };

    const buildItApprovalLink = (id) => `${window.location.origin}${window.location.pathname}?itApproveRequest=${id}`;

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

    useEffect(() => {
        fetchRequests();
        const intervalId = setInterval(() => {
            if (document.visibilityState === 'visible') fetchRequests({ silent: true });
        }, 7000);
        return () => clearInterval(intervalId);
    }, []);

    const handleStatusChange = async (id, currentStatus) => {
        const effectiveStatus = currentStatus === 'Pending' || !currentStatus ? 'Pending_Manager' : currentStatus;
        if (!canActOnStatus(effectiveStatus)) return;

        if (effectiveStatus === 'Pending_IT') {
            setSigningRequestId(id);
            setItStaffName('');
            setActionResult('');
            setIsSignModalOpen(true);
            setTimeout(() => adminSignatureRef.current?.clear(), 50);
            return;
        }

        if (effectiveStatus === 'Pending_IT_Supervisor' || effectiveStatus === 'Pending_IT_Manager') {
            setApprovalSignRequest({ id, status: effectiveStatus });
            setTimeout(() => adminSignatureRef.current?.clear(), 50);
        }
    };

    const handleSignAndForward = async () => {
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
            window.dispatchEvent(new Event('approval-queues:refresh'));
            Swal.fire('ส่งต่อแล้ว', 'ส่งคำร้องไปยัง IT Supervisor แล้ว', 'success');
        } catch (error) {
            console.error('Error signing:', error);
            Swal.fire('Error', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        }
    };

    const handleApprovalSign = async () => {
        if (!approvalSignRequest || !adminSignatureRef.current || adminSignatureRef.current.isEmpty()) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณาลงลายเซ็นก่อนยืนยัน', 'warning');
            return;
        }

        const signData = adminSignatureRef.current.getCanvas().toDataURL('image/png');
        const isSupervisorStep = approvalSignRequest.status === 'Pending_IT_Supervisor';
        const updatePayload = isSupervisorStep
            ? {
                status: 'Pending_IT_Manager',
                it_supervisor_name: currentAdmin?.name || '',
                it_supervisor_sign: signData,
                it_supervisor_date: toMysqlDateTime(),
            }
            : {
                status: 'Completed',
                it_manager_name: currentAdmin?.name || '',
                it_manager_sign: signData,
                it_manager_date: toMysqlDateTime(),
            };

        try {
            const { error } = await mysql.from('access_requests').update(updatePayload).eq('id', approvalSignRequest.id);
            if (error) throw error;
            setRequests((prev) => prev.map((req) => (req.id === approvalSignRequest.id ? { ...req, ...updatePayload } : req)));
            setApprovalSignRequest(null);
            window.dispatchEvent(new Event('approval-queues:refresh'));
            Swal.fire('อัปเดตแล้ว', isSupervisorStep ? 'เซ็นและส่งต่อ IT Manager แล้ว' : 'เซ็นและปิดงานเรียบร้อยแล้ว', 'success');
        } catch (error) {
            console.error('Error signing approval:', error);
            Swal.fire('Error', 'ไม่สามารถบันทึกลายเซ็นได้', 'error');
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
            createdAt: req.created_at || null,
            status: req.status || '',
            cancelledAt: req.cancelled_at || null,
            cancelReason: req.cancel_reason || '',
            cancelItName: req.cancel_it_name || '',
            cancelItSign: req.cancel_it_sign || null,
        });
        setIsPreviewOpen(true);
    };

    const getStatusBadge = (status) => {
        const normalizedStatus = status === 'Pending' || !status ? 'Pending_Manager' : status;
        const tone = {
            Pending_Manager: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
            Pending_IT: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
            Pending_IT_Supervisor: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
            Pending_IT_Manager: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
            Completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
            Rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
            Cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
        }[normalizedStatus] || 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
        const Icon = ['Completed', 'Approved'].includes(normalizedStatus) ? CheckCircle : normalizedStatus === 'Rejected' || normalizedStatus === 'Cancelled' ? XCircle : Clock;
        return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1 ${tone}`}><Icon className="w-3 h-3" /> {STATUS_LABELS[normalizedStatus] || normalizedStatus}</span>;
    };

    const filteredRequests = requests.filter((req) => {
        const keyword = searchTerm.trim().toLowerCase();
        const effectiveStatus = req.status === 'Pending' || !req.status ? 'Pending_Manager' : req.status;
        const matchesSearch =
            !keyword ||
            req.name_th?.toLowerCase().includes(keyword) ||
            req.department?.toLowerCase().includes(keyword) ||
            req.ticket_number?.toLowerCase().includes(keyword) ||
            req.request_details?.toLowerCase().includes(keyword) ||
            req.other_system_details?.toLowerCase().includes(keyword);
        const matchesRoleQueue = visibleStatuses === null || (visibleStatuses || []).includes(effectiveStatus);
        const matchesStatus = statusFilter === 'All' || effectiveStatus === statusFilter;
        const reqDate = new Date(req.created_at);
        const matchesStart = !dateRangeStart || reqDate >= new Date(dateRangeStart);
        const matchesEnd = !dateRangeEnd || reqDate <= new Date(`${dateRangeEnd}T23:59:59`);
        return matchesSearch && matchesRoleQueue && matchesStatus && matchesStart && matchesEnd;
    });

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="flex flex-col items-start gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/50 rounded-xl text-indigo-600 dark:text-indigo-400">
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
                            placeholder="ค้นหาชื่อ แผนก เลขที่ หรือรายละเอียด..."
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            className="input-modern !pl-9 !py-2 !text-sm w-full"
                        />
                    </div>
                    <div className="relative w-full sm:w-56">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="input-modern !pl-9 !py-2 !text-sm w-full bg-white dark:bg-slate-800">
                                <SelectValue placeholder="สถานะทั้งหมด" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">สถานะทั้งหมด</SelectItem>
                                <SelectItem value="Pending_Manager">รอหัวหน้างาน</SelectItem>
                                <SelectItem value="Pending_IT">Pending IT Support</SelectItem>
                                <SelectItem value="Pending_IT_Supervisor">Pending IT Supervisor</SelectItem>
                                <SelectItem value="Pending_IT_Manager">Pending IT Manager</SelectItem>
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
                    <p className="text-slate-500 dark:text-slate-400">ยังไม่มีรายการในคิวของคุณ หรือไม่พบตามเงื่อนไขการค้นหา</p>
                </div>
            ) : (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                                    <th className="p-4 font-semibold whitespace-nowrap">วันที่ / เลขที่</th>
                                    <th className="p-4 font-semibold whitespace-nowrap">ชื่อ / แผนก</th>
                                    <th className="p-4 font-semibold">ระบบที่ขอสิทธิ์</th>
                                    <th className="p-4 font-semibold whitespace-nowrap">สถานะ</th>
                                    <th className="p-4 font-semibold text-right whitespace-nowrap">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                {filteredRequests.map((req) => (
                                    <tr key={req.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="p-4 align-top whitespace-nowrap">
                                            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{new Date(req.created_at).toLocaleDateString('th-TH')}</div>
                                            <div className="text-xs text-slate-500 font-mono mt-1">{req.ticket_number || 'ไม่มีเลขที่'}</div>
                                        </td>
                                        <td className="p-4 align-top whitespace-nowrap">
                                            <div className="text-sm font-bold text-slate-800 dark:text-white">{req.name_th}</div>
                                            <div className="text-xs text-slate-500 mt-1">{req.department}</div>
                                        </td>
                                        <td className="p-4 align-top min-w-[220px]">
                                            <div className="text-sm text-slate-700 dark:text-slate-300 font-medium leading-relaxed">{formatSystems(req.systems, req.other_system_details)}</div>
                                            {req.request_details && <div className="text-xs text-slate-500 mt-1.5 line-clamp-2" title={req.request_details}><span className="font-medium">รายละเอียด:</span> {req.request_details}</div>}
                                        </td>
                                        <td className="p-4 align-top whitespace-nowrap">
                                            <button
                                                onClick={() => handleStatusChange(req.id, req.status || 'Pending')}
                                                disabled={!canActOnStatus(req.status || 'Pending')}
                                                className={`transition-opacity ${canActOnStatus(req.status || 'Pending') ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                                            >
                                                {getStatusBadge(req.status || 'Pending')}
                                            </button>
                                        </td>
                                        <td className="p-4 align-top">
                                            <div className="flex gap-2 justify-end">
                                                {req.status === 'Pending_IT_Manager' && (
                                                    <button
                                                        onClick={async () => {
                                                            await copyText(buildItApprovalLink(req.id));
                                                            Swal.fire('คัดลอกลิงก์สำเร็จ', 'ส่งลิงก์นี้ให้ IT Manager อนุมัติได้เลยครับ', 'success');
                                                        }}
                                                        className="py-1.5 px-3 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-semibold text-xs rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors whitespace-nowrap shadow-sm"
                                                    >
                                                        คัดลอกลิงก์
                                                    </button>
                                                )}
                                                <button onClick={() => openPreview(req)} className="py-1.5 px-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold text-xs rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors whitespace-nowrap shadow-sm">
                                                    ดูแบบฟอร์ม
                                                </button>
                                                <button onClick={() => handleDelete(req.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
                            <button onClick={() => setIsSignModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="mb-4 space-y-4">
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
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setIsSignModalOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-200 dark:hover:bg-slate-600">ยกเลิก</button>
                            <button onClick={handleSignAndForward} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 shadow-md">ส่งต่อ Supervisor</button>
                        </div>
                    </div>
                </div>
            )}

            {approvalSignRequest && (
                <div className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center overflow-y-auto p-3 sm:p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 sm:p-6 w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto shadow-2xl animate-slide-up border border-slate-100 dark:border-slate-700">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <CheckCircle className="w-5 h-5 text-indigo-500" />
                                {approvalSignRequest.status === 'Pending_IT_Supervisor' ? 'IT Supervisor ลงนาม' : 'IT Manager ลงนาม'}
                            </h3>
                            <button onClick={() => setApprovalSignRequest(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="space-y-3 mb-4">
                            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700 p-3 text-sm text-slate-600 dark:text-slate-300">
                                ผู้ลงนาม: <span className="font-semibold text-slate-800 dark:text-slate-100">{currentAdmin?.name || '-'}</span>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">ลายเซ็น</span>
                                    <button onClick={() => adminSignatureRef.current?.clear()} className="text-xs text-red-500 font-bold hover:underline">ล้างลายเซ็น</button>
                                </div>
                                <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900/50 relative overflow-hidden" style={{ height: '150px' }}>
                                    <SignatureCanvas ref={adminSignatureRef} penColor="black" canvasProps={{ className: 'w-full h-full xl-signature' }} />
                                    <div className="absolute bottom-2 right-3 text-slate-400 text-xs pointer-events-none opacity-50">เซ็นชื่อที่นี่</div>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setApprovalSignRequest(null)} className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-200 dark:hover:bg-slate-600">ยกเลิก</button>
                            <button onClick={handleApprovalSign} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 shadow-md">ยืนยัน</button>
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
