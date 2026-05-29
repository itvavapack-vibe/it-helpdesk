import React, { useState, useEffect, useRef } from 'react';
import { mysql } from '../mysqlClient';
import { Search, Filter, Code, CheckCircle, XCircle, Clock, Trash2, Edit } from 'lucide-react';
import Swal from 'sweetalert2';
import SignatureCanvas from 'react-signature-canvas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toLocalDateInputValue, toMysqlDateTime } from '../utils/dateTime';
import { CHANGE_QUEUE_STATUS_BY_ROLE, ROLES, normalizeRoleValue, visibleQueueStatuses } from '../config/roles';

const AdminChangeRequests = ({ currentAdmin }) => {
    const [requests, setRequests] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [dateRangeStart, setDateRangeStart] = useState('');
    const [dateRangeEnd, setDateRangeEnd] = useState('');
    
    // For Preview / Form Actions
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [isActionModalOpen, setIsActionModalOpen] = useState(false);
    const [approvalSignRequest, setApprovalSignRequest] = useState(null);
    
    // For IT Action Form 
    const [actionType, setActionType] = useState('it_manager'); // 'it_manager' or 'it_staff'
    const [itStatus, setItStatus] = useState('Approved'); // 'Approved' / 'Rejected'
    const [itForm, setItForm] = useState({
        receivedDate: '',
        targetDate: '',
        operationDate: '',
        reason: '',
        solution: '',
        staffName: '',
        staffPosition: '',
        managerName: '',
        managerPosition: ''
    });
    const staffSignatureRef = useRef(null);
    const itManagerSignatureRef = useRef(null);
    const currentRole = normalizeRoleValue(currentAdmin?.role);
    const visibleStatuses = visibleQueueStatuses(currentRole, CHANGE_QUEUE_STATUS_BY_ROLE);
    const canActOnStatus = (status) => {
        if (currentRole === ROLES.SUPERADMIN) return ['Pending_IT', 'Pending_IT_Supervisor', 'Pending_IT_Manager', 'In_Progress'].includes(status);
        return (visibleStatuses || []).includes(status);
    };

    useEffect(() => {
        fetchRequests();

        const subscription = mysql
            .channel('change_requests_changes')
            .on('mysql_changes', 
                { event: '*', schema: 'public', table: 'change_requests' }, 
                () => { fetchRequests(); }
            )
            .subscribe();

        return () => mysql.removeChannel(subscription);
    }, []);

    useEffect(() => {
        const intervalId = setInterval(() => {
            if (document.visibilityState === 'visible') {
                fetchRequests({ silent: true });
            }
        }, 7000);

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                fetchRequests({ silent: true });
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    const fetchRequests = async ({ silent = false } = {}) => {
        if (!silent) setIsLoading(true);
        try {
            const { data, error } = await mysql
                .from('change_requests')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setRequests(data || []);
        } catch (error) {
            console.error('Error fetching change requests:', error);
            if (silent) return;
            Swal.fire({
                title: 'ไม่พบตารางข้อมูล',
                text: 'กรุณาสร้างตาราง change_requests ใน mysql ก่อน',
                icon: 'warning',
                confirmButtonColor: '#10b981'
            });
        } finally {
            if (silent) return;
            setIsLoading(false);
        }
    };

    const handleStatusChange = async (id, currentStatus) => {
        if (currentStatus === 'Cancelled') return;

        // Simple flow: Pending_Manager -> Pending_IT -> In_Progress -> Pending_User_Acceptance -> Completed
        const req = requests.find(r => r.id === id);
        if (!req) return;
        if (!canActOnStatus(currentStatus)) return;

        if (currentStatus === 'Pending_IT') {
            const { error } = await mysql
                .from('change_requests')
                .update({ status: 'Pending_IT_Supervisor' })
                .eq('id', id);
            if (error) {
                console.error('Error updating status:', error);
                Swal.fire('Error', 'ไม่สามารถอัปเดตสถานะได้', 'error');
                return;
            }
            window.dispatchEvent(new Event('approval-queues:refresh'));
            fetchRequests();
            return;
        }

        if (currentStatus === 'Pending_IT_Supervisor') {
            setApprovalSignRequest({ id, status: currentStatus });
            setTimeout(() => itManagerSignatureRef.current?.clear(), 100);
            return;
        }

        if (currentStatus === 'Pending_IT_Manager') {
            setApprovalSignRequest({ id, status: currentStatus });
            setTimeout(() => itManagerSignatureRef.current?.clear(), 100);
            return;
        }

        if (currentStatus === 'In_Progress') {
            // Setup IT Staff Operation
            setActionType('it_staff');
            setSelectedRequest(req);
            setItForm(f => ({ ...f, operationDate: toLocalDateInputValue() }));
            setIsActionModalOpen(true);
            setTimeout(() => staffSignatureRef.current?.clear(), 100);
            return;
        }

        const statuses = ['Pending_Manager', 'Pending_IT', 'Pending_IT_Supervisor', 'Pending_IT_Manager', 'In_Progress', 'Pending_User_Acceptance', 'Completed', 'Rejected'];
        let currentIndex = statuses.indexOf(currentStatus);
        if (currentIndex === -1) currentIndex = 0;
        const nextStatus = statuses[(currentIndex + 1) % statuses.length];

        try {
            const { error } = await mysql
                .from('change_requests')
                .update({ status: nextStatus })
                .eq('id', id);

            if (error) throw error;
            fetchRequests();
        } catch (error) {
            console.error('Error updating status:', error);
            Swal.fire('Error', 'ไม่สามารถอัปเดตสถานะได้', 'error');
        }
    };

    const handleItAction = async () => {
        const reqId = selectedRequest.id;
        
        try {
            if (actionType === 'it_manager') {
                if (!itForm.managerName || !itForm.managerPosition || itManagerSignatureRef.current.isEmpty()) {
                    return Swal.fire('ข้อมูลไม่ครบ', 'ระบุชื่อ ตำแหน่ง และลายเซ็น IT Manager ให้ครบ', 'warning');
                }
                const signData = itManagerSignatureRef.current.getCanvas().toDataURL('image/png');
                const updateData = {
                    it_received_date: itForm.receivedDate || null,
                    it_target_date: itForm.targetDate || null,
                    it_approval_status: itStatus,
                    it_reject_reason: itStatus === 'Rejected' ? itForm.reason : null,
                    it_manager_name: itForm.managerName,
                    it_manager_position: itForm.managerPosition,
                    it_manager_sign: signData,
                    status: itStatus === 'Rejected' ? 'Rejected' : 'In_Progress'
                };
                
                const { error } = await mysql.from('change_requests').update(updateData).eq('id', reqId);
                if (error) throw error;

            } else if (actionType === 'it_staff') {
                if (!itForm.staffName || !itForm.staffPosition || staffSignatureRef.current.isEmpty()) {
                    return Swal.fire('ข้อมูลไม่ครบ', 'ระบุผลการดำเนินงาน ผู้ดำเนินการ และลายเซ็นให้ครบ', 'warning');
                }
                const signData = staffSignatureRef.current.getCanvas().toDataURL('image/png');
                const updateData = {
                    it_solution: itForm.solution,
                    it_operation_date: itForm.operationDate || null,
                    it_staff_name: itForm.staffName,
                    it_staff_position: itForm.staffPosition,
                    it_staff_sign: signData,
                    status: 'Pending_User_Acceptance'
                };
                
                const { error } = await mysql.from('change_requests').update(updateData).eq('id', reqId);
                if (error) throw error;
            }

            setIsActionModalOpen(false);
            window.dispatchEvent(new Event('approval-queues:refresh'));
            Swal.fire('สำเร็จ!', 'บันทึกการดำเนินการของ IT เรียบร้อย', 'success');
            fetchRequests();
            
        } catch (error) {
            console.error('Error IT action:', error);
            Swal.fire('Error', 'เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
        }
    };

    const handleApprovalSign = async () => {
        if (!approvalSignRequest || !itManagerSignatureRef.current || itManagerSignatureRef.current.isEmpty()) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณาลงลายเซ็นก่อนยืนยัน', 'warning');
            return;
        }

        const signData = itManagerSignatureRef.current.getCanvas().toDataURL('image/png');
        const isSupervisorStep = approvalSignRequest.status === 'Pending_IT_Supervisor';
        const updateData = isSupervisorStep
            ? {
                status: 'Pending_IT_Manager',
                it_supervisor_name: currentAdmin?.name || '',
                it_supervisor_sign: signData,
                it_supervisor_date: toMysqlDateTime(),
            }
            : {
                status: 'In_Progress',
                it_approval_status: 'Approved',
                it_manager_name: currentAdmin?.name || '',
                it_manager_sign: signData,
                it_manager_date: toMysqlDateTime(),
            };

        try {
            const { error } = await mysql.from('change_requests').update(updateData).eq('id', approvalSignRequest.id);
            if (error) throw error;
            setApprovalSignRequest(null);
            window.dispatchEvent(new Event('approval-queues:refresh'));
            fetchRequests();
            Swal.fire('อัปเดตแล้ว', isSupervisorStep ? 'เซ็นและส่งต่อ IT Manager แล้ว' : 'เซ็นอนุมัติและส่งต่อดำเนินการแล้ว', 'success');
        } catch (error) {
            console.error('Error signing approval:', error);
            Swal.fire('Error', 'ไม่สามารถบันทึกลายเซ็นได้', 'error');
        }
    };

    const handleDelete = async (id) => {
        const result = await Swal.fire({
            title: 'ยืนยันการลบ?',
            text: "คุณต้องการลบคำร้องนี้ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'ลบข้อมูล'
        });

        if (result.isConfirmed) {
            try {
                const { error } = await mysql.from('change_requests').delete().eq('id', id);
                if (error) throw error;
                window.dispatchEvent(new Event('approval-queues:refresh'));
                fetchRequests();
                Swal.fire('Deleted!', 'ลบคำร้องเรียบร้อยแล้ว', 'success');
            } catch (error) {
                console.error('Error deleting request:', error);
                Swal.fire('Error', 'ไม่สามารถลบข้อมูลได้', 'error');
            }
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'Pending_Manager': return <span className="px-2.5 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold flex items-center gap-1"><Clock className="w-3 h-3"/> รอดำเนินการ (หัวหน้างาน)</span>;
            case 'Pending_IT': return <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold flex items-center gap-1"><Clock className="w-3 h-3"/> รอดำเนินการ (IT Software)</span>;
            case 'Pending_IT_Supervisor': return <span className="px-2.5 py-1 bg-cyan-100 text-cyan-700 rounded-full text-xs font-semibold flex items-center gap-1"><Clock className="w-3 h-3"/> รอตรวจสอบ (IT Supervisor)</span>;
            case 'Pending_IT_Manager': return <span className="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold flex items-center gap-1"><Clock className="w-3 h-3"/> รออนุมัติ (IT Manager)</span>;
            case 'In_Progress': return <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-semibold flex items-center gap-1"><Edit className="w-3 h-3"/> กำลังพัฒนาโปรแกรม</span>;
            case 'Pending_User_Acceptance': return <span className="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold flex items-center gap-1"><Clock className="w-3 h-3"/> รอส่งมอบ (User ยอมรับ)</span>;
            case 'Completed': return <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold flex items-center gap-1"><CheckCircle className="w-3 h-3"/> เสร็จสิ้น</span>;
            case 'Rejected': return <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold flex items-center gap-1"><XCircle className="w-3 h-3"/> ไม่อนุมัติ</span>;
            case 'Cancelled': return <span className="px-2.5 py-1 bg-rose-100 text-rose-700 rounded-full text-xs font-semibold flex items-center gap-1"><XCircle className="w-3 h-3"/> ยกเลิก</span>;
            default: return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-semibold">{status}</span>;
        }
    };

    const filteredRequests = requests.filter(req => {
        const matchesSearch = req.requester_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              req.department?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              req.ticket_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              req.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              req.request_details?.toLowerCase().includes(searchTerm.toLowerCase());
                              
        const matchesStatus = statusFilter === 'All' || req.status === statusFilter;
        const matchesRoleQueue = visibleStatuses === null || (visibleStatuses || []).includes(req.status);
        
        const reqDate = new Date(req.created_at);
        let matchesDate = true;
        if (dateRangeStart) {
            const startDate = new Date(dateRangeStart);
            matchesDate = matchesDate && reqDate >= startDate;
        }
        if (dateRangeEnd) {
            const endDate = new Date(dateRangeEnd);
            endDate.setHours(23, 59, 59, 999);
            matchesDate = matchesDate && reqDate <= endDate;
        }
        
        return matchesSearch && matchesRoleQueue && matchesStatus && matchesDate;
    });

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900/50 rounded-xl text-emerald-600 dark:text-emerald-400">
                        <Code className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 dark:text-white">คำร้องขอพัฒนาระบบ (Change Request)</h2>
                        <p className="text-sm text-slate-500 font-medium">จัดการแบบฟอร์มประเมินและพัฒนาโปรแกรม (FMIT 15)</p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    <div className="relative w-full sm:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input type="text" placeholder="ค้นหาชื่อ, แผนก, เลขเอกสาร, รายละเอียด..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="input-modern !pl-9 !py-2 !text-sm w-full" />
                    </div>
                    <div className="relative w-full sm:w-auto">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        {false && <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-modern !pl-9 !py-2 !text-sm w-full sm:w-auto appearance-none bg-white dark:bg-slate-800">
                            <option value="All">ทุกสถานะ</option>
                            <option value="Pending_IT">รออนุมัติ (IT Manager)</option>
                            <option value="In_Progress">กำลังพัฒนาโปรแกรม</option>
                            <option value="Pending_User_Acceptance">รอจัดการส่งมอบ (User)</option>
                            <option value="Completed">ปิดงานสมบูรณ์</option>
                        </select>}
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="input-modern !pl-9 !py-2 !text-sm w-full sm:w-auto bg-white dark:bg-slate-800">
                                <SelectValue placeholder="All statuses" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All</SelectItem>
                                <SelectItem value="Pending_IT">Pending IT Software</SelectItem>
                                <SelectItem value="Pending_IT_Supervisor">Pending IT Supervisor</SelectItem>
                                <SelectItem value="Pending_IT_Manager">Pending IT Manager</SelectItem>
                                <SelectItem value="In_Progress">In Progress</SelectItem>
                                <SelectItem value="Pending_User_Acceptance">Pending User Acceptance</SelectItem>
                                <SelectItem value="Completed">Completed</SelectItem>
                                <SelectItem value="Cancelled">Cancelled</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex gap-2 w-full sm:w-auto">
                        <input
                            type="date"
                            value={dateRangeStart}
                            onChange={(e) => setDateRangeStart(e.target.value)}
                            className="input-modern !py-2 !text-sm flex-1 sm:flex-auto"
                            title="วันที่เริ่มต้น"
                        />
                        <input
                            type="date"
                            value={dateRangeEnd}
                            onChange={(e) => setDateRangeEnd(e.target.value)}
                            className="input-modern !py-2 !text-sm flex-1 sm:flex-auto"
                            title="วันที่สิ้นสุด"
                        />
                    </div>
                </div>
            </div>

            {/* Content Table */}
            {isLoading ? (
                <div className="flex justify-center flex-col items-center py-20 gap-3">
                    <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div>
                    <p className="text-sm text-slate-500">กำลังโหลดคำร้อง...</p>
                </div>
            ) : filteredRequests.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 p-10 rounded-2xl text-center border border-slate-100 dark:border-slate-700">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Code className="w-8 h-8 text-slate-400 m-auto" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-2">ไม่พบคำร้องขอพัฒนาโปรแกรม</h3>
                    <p className="text-slate-500 dark:text-slate-400">ยังไม่มีผู้ใช้งานส่งคำร้องขอพัฒนาโปรแกรมเข้ามาในระบบ หรือไม่พบในเงื่อนไขการค้นหา</p>
                </div>
            ) : (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b text-slate-500 text-xs uppercase">
                                    <th className="p-4 whitespace-nowrap">วันที่ / เลขเอกสาร</th>
                                    <th className="p-4 whitespace-nowrap">ผู้ร้องขอ / แผนก</th>
                                    <th className="p-4">รายละเอียดการขอ (Requirement)</th>
                                    <th className="p-4 whitespace-nowrap">สถานะ (คลิกเพื่อเปลี่ยน)</th>
                                    <th className="p-4 whitespace-nowrap text-right">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredRequests.map((req) => (
                                    <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-4 align-top">
                                            <div className="text-sm font-semibold">{new Date(req.created_at).toLocaleDateString('th-TH')}</div>
                                            <div className="text-xs text-emerald-600 font-mono mt-1">{req.ticket_number}</div>
                                            <div className="text-xs text-slate-400 mt-1 uppercase font-bold">{req.req_type}</div>
                                        </td>
                                        <td className="p-4 align-top">
                                            <div className="text-sm font-bold text-slate-800">{req.requester_name}</div>
                                            <div className="text-xs text-slate-500 mt-1">{req.department}</div>
                                            {req.status === 'Cancelled' && (
                                                <div className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200 text-[11px] font-semibold">
                                                    <XCircle className="w-3 h-3" />
                                                    ยกเลิกสิทธิ์แล้ว
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4 align-top min-w-[250px] max-w-sm">
                                            <p className="text-sm text-slate-700 line-clamp-2" title={req.details}>{req.details}</p>
                                            <p className="text-xs text-amber-600 border border-amber-200 bg-amber-50 rounded p-1 mt-2 line-clamp-1 truncate" title={req.reason}>เหตุผล: {req.reason}</p>
                                        </td>
                                        <td className="p-4 align-top">
                                            <button 
                                                onClick={() => handleStatusChange(req.id, req.status)}
                                                disabled={!canActOnStatus(req.status)}
                                                className={`transition-all ${canActOnStatus(req.status) ? 'hover:scale-105 active:scale-95 cursor-pointer' : 'cursor-default'}`}
                                            >
                                                {getStatusBadge(req.status)}
                                            </button>
                                        </td>
                                        <td className="p-4 align-top text-right">
                                            <button onClick={() => handleDelete(req.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Action form Modal Config */}
            {approvalSignRequest && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl animate-fade-in border">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                <CheckCircle className="w-6 h-6 text-emerald-500" />
                                {approvalSignRequest.status === 'Pending_IT_Supervisor' ? 'IT Supervisor ลงนาม' : 'IT Manager ลงนาม'}
                            </h3>
                            <button onClick={() => setApprovalSignRequest(null)} className="text-slate-400 hover:text-rose-500"><XCircle className="w-6 h-6" /></button>
                        </div>
                        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm text-slate-600 mb-4">
                            ผู้ลงนาม: <span className="font-semibold text-slate-800">{currentAdmin?.name || '-'}</span>
                        </div>
                        <div className="border shadow-inner bg-slate-50 h-36 relative rounded-xl overflow-hidden">
                            <SignatureCanvas ref={itManagerSignatureRef} canvasProps={{ className: 'w-full h-full xl-signature' }} />
                            <button className="absolute top-2 right-2 text-xs text-red-500 font-semibold" onClick={() => itManagerSignatureRef.current?.clear()}>ล้าง</button>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setApprovalSignRequest(null)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 font-bold rounded-xl text-slate-700">ยกเลิก</button>
                            <button onClick={handleApprovalSign} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg">ยืนยัน</button>
                        </div>
                    </div>
                </div>
            )}

            {isActionModalOpen && selectedRequest && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl animate-fade-in border overflow-y-auto max-h-[90vh]">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                <Code className="w-6 h-6 text-emerald-500"/> 
                                {actionType === 'it_manager' ? 'ส่วนที่ 2 (IT Manager อนุญาต)' : 'ส่วนที่ 2 (IT Staff ดำเนินการ)'}
                            </h3>
                            <button onClick={() => setIsActionModalOpen(false)} className="text-slate-400 hover:text-rose-500"><XCircle className="w-6 h-6" /></button>
                        </div>
                        
                        <div className="bg-slate-50 p-3 rounded-lg text-sm mb-4 border border-slate-200">
                            <b>เอกสารอ้างอิง:</b> {selectedRequest.ticket_number}<br/>
                            <b>รายละเอียดการขอ:</b> {selectedRequest.details}
                        </div>

                        {actionType === 'it_manager' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-semibold mb-1 block">วันที่รับคำร้อง</label>
                                        <input type="date" className="input-modern w-full text-sm" value={itForm.receivedDate} onChange={e => setItForm({...itForm, receivedDate: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold mb-1 block">วันที่นัดหมายแล้วเสร็จ</label>
                                        <input type="date" className="input-modern w-full text-sm" value={itForm.targetDate} onChange={e => setItForm({...itForm, targetDate: e.target.value})} />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold mb-2 block">ผลการพิจารณา</label>
                                    <div className="flex gap-4">
                                        <label className="flex items-center gap-2"><input type="radio" checked={itStatus==='Approved'} onChange={()=>setItStatus('Approved')}/> อนุมัติ</label>
                                        <label className="flex items-center gap-2"><input type="radio" checked={itStatus==='Rejected'} onChange={()=>setItStatus('Rejected')}/> ไม่อนุมัติ</label>
                                    </div>
                                </div>
                                {itStatus === 'Rejected' && (
                                    <div>
                                        <textarea className="input-modern w-full text-sm p-3" placeholder="ระบุสาเหตุที่ไม่อนุมัติ..." value={itForm.reason} onChange={e => setItForm({...itForm, reason: e.target.value})} />
                                    </div>
                                )}
                                <hr className="my-2 border-slate-200" />
                                <div className="grid grid-cols-2 gap-3">
                                    <input type="text" className="input-modern" placeholder="ชื่อผู้อนุมัติ" value={itForm.managerName} onChange={e => setItForm({...itForm, managerName: e.target.value})} />
                                    <input type="text" className="input-modern" placeholder="ตำแหน่ง" value={itForm.managerPosition} onChange={e => setItForm({...itForm, managerPosition: e.target.value})} />
                                </div>
                                <div className="border shadow-inner bg-slate-50 h-32 relative rounded-xl overflow-hidden">
                                     <SignatureCanvas ref={itManagerSignatureRef} canvasProps={{ className: 'w-full h-full xl-signature' }} />
                                     <div className="absolute top-2 right-2 text-xs text-red-500 cursor-pointer" onClick={() => itManagerSignatureRef.current.clear()}>ล้าง</div>
                                </div>
                            </div>
                        )}

                        {actionType === 'it_staff' && (
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-semibold mb-1 block">วันที่ดำเนินการ (เสร็จสิ้นการเขียนโปรแกรม)</label>
                                    <input type="date" className="input-modern w-full text-sm" value={itForm.operationDate} onChange={e => setItForm({...itForm, operationDate: e.target.value})} />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold mb-1 block">วิธีแก้ไข/พัฒนา (Solution)</label>
                                    <textarea className="input-modern w-full text-sm p-3 min-h-[100px]" placeholder="เพิ่ม Database Table, สร้าง หน้าเว็บใหม่ ..." value={itForm.solution} onChange={e => setItForm({...itForm, solution: e.target.value})} />
                                </div>
                                <hr className="my-2 border-slate-200" />
                                <div className="grid grid-cols-2 gap-3">
                                    <input type="text" className="input-modern" placeholder="ชื่อผู้ดำเนินการ" value={itForm.staffName} onChange={e => setItForm({...itForm, staffName: e.target.value})} />
                                    <input type="text" className="input-modern" placeholder="ตำแหน่ง" value={itForm.staffPosition} onChange={e => setItForm({...itForm, staffPosition: e.target.value})} />
                                </div>
                                <div className="border shadow-inner bg-slate-50 h-32 relative rounded-xl overflow-hidden">
                                     <SignatureCanvas ref={staffSignatureRef} canvasProps={{ className: 'w-full h-full xl-signature' }} />
                                     <div className="absolute top-2 right-2 text-xs text-red-500 cursor-pointer" onClick={() => staffSignatureRef.current.clear()}>ล้าง</div>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setIsActionModalOpen(false)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 font-bold rounded-xl text-slate-700">ยกเลิก</button>
                            <button onClick={handleItAction} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg">ยืนยันรายการ</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminChangeRequests;
