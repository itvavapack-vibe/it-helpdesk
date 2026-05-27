import React, { useState, useEffect, useRef } from 'react';
import { mysql } from '../mysqlClient';
import { Search, Filter, Key, CheckCircle, XCircle, Clock, Trash2 } from 'lucide-react';
import Fmit12PdfPreview from './Fmit12PdfPreview';
import Swal from 'sweetalert2';
import SignatureCanvas from 'react-signature-canvas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { copyText } from '../utils/closeIssueLink';

const AdminAccessRequests = () => {
    const [requests, setRequests] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [dateRangeStart, setDateRangeStart] = useState('');
    const [dateRangeEnd, setDateRangeEnd] = useState('');
    
    // For PDF Preview
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);

    // For IT Signature Modal
    const [isSignModalOpen, setIsSignModalOpen] = useState(false);
    const [signingRequestId, setSigningRequestId] = useState(null);
    const [signingStatusTarget, setSigningStatusTarget] = useState(null);
    const adminSignatureRef = useRef(null);
    
    // For IT Staff Completion Form
    const [itStaffName, setItStaffName] = useState('');
    const [actionResult, setActionResult] = useState('');

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

    const buildItApprovalLink = (id) => `${window.location.origin}${window.location.pathname}?itApproveRequest=${id}`;

    const showItApprovalLinkDialog = async (id) => {
        const link = buildItApprovalLink(id);
        const safeLink = link.replace(/"/g, '&quot;');
        await Swal.fire({
            icon: 'success',
            title: 'ส่งต่อให้หัวหน้า IT ลงนาม',
            html: `
                <p style="text-align:left; color:#4b5563; font-size:14px; line-height:1.5; margin-bottom:10px;">
                    คัดลอกลิงก์นี้ส่งให้หัวหน้า IT เพื่อลงนามปิดงานคำร้องขอสิทธิ์
                </p>
                <input id="it-approval-link" readonly value="${safeLink}" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; font-size:12px; background:#f8fafc;" />
            `,
            confirmButtonText: 'คัดลอกลิงก์',
            cancelButtonText: 'ปิด',
            showCancelButton: true,
            confirmButtonColor: '#4f46e5',
            didOpen: () => {
                const input = document.getElementById('it-approval-link');
                input?.addEventListener('click', () => input.select());
            },
            preConfirm: async () => {
                await copyText(link);
            }
        });
    };
    
    useEffect(() => {
        fetchRequests();

        // Subscribe to real-time changes
        const subscription = mysql
            .channel('access_requests_changes')
            .on('mysql_changes', 
                { event: '*', schema: 'public', table: 'access_requests' }, 
                () => {
                    fetchRequests(); // Re-fetch on any change
                }
            )
            .subscribe();

        return () => {
            mysql.removeChannel(subscription);
        };
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
                .from('access_requests')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setRequests((data || []).map(req => ({
                ...req,
                systems: normalizeSystems(req.systems)
            })));
        } catch (error) {
            console.error('Error fetching access requests:', error);
            if (silent) return;
            // It might fail if table doesn't exist yet
            Swal.fire({
                title: 'ไม่พบตารางข้อมูล',
                text: 'กรุณาสร้างตาราง access_requests ใน mysql ก่อน',
                icon: 'warning',
                confirmButtonColor: '#4f46e5'
            });
        } finally {
            if (silent) return;
            setIsLoading(false);
        }
    };

    const handleStatusChange = async (id, currentStatus) => {
        const statuses = ['Pending_Manager', 'Pending_IT', 'Pending_IT_Manager', 'Completed', 'Rejected'];
        // If current status is legacy 'Pending', map it to 'Pending_Manager' for the next step calculation.
        const effectiveStatus = currentStatus === 'Pending' ? 'Pending_Manager' : currentStatus;
        let currentIndex = statuses.indexOf(effectiveStatus);
        
        // Safety fallback if status not found
        if (currentIndex === -1) currentIndex = 0;
        
        const nextStatus = statuses[(currentIndex + 1) % statuses.length];

        if (nextStatus === 'Pending_IT_Manager') {
            setSigningRequestId(id);
            setSigningStatusTarget(nextStatus);
            setItStaffName('');
            setActionResult('');
            setIsSignModalOpen(true);
            return;
        }

        try {
            const { error } = await mysql
                .from('access_requests')
                .update({ status: nextStatus })
                .eq('id', id);

            if (error) throw error;
            setRequests(requests.map(req => req.id === id ? { ...req, status: nextStatus } : req));
        } catch (error) {
            console.error('Error updating status:', error);
            Swal.fire('Error', 'ไม่สามารถอัปเดตสถานะได้', 'error');
        }
    };

    const handleSignAndComplete = async () => {
        if (!itStaffName.trim() || !actionResult.trim() || adminSignatureRef.current.isEmpty()) {
            return Swal.fire({
                icon: 'warning',
                title: 'กรุณากรอกข้อมูลให้ครบถ้วน',
                text: 'กรุณาระบุชื่อผู้รับแจ้ง ผลการดำเนินการ และเซ็นชื่อผู้ปฏิบัติงาน',
                confirmButtonColor: '#4f46e5'
            });
        }

        const signData = adminSignatureRef.current.getCanvas().toDataURL('image/png');

        try {
            const { error } = await mysql
                .from('access_requests')
                .update({ 
                    status: signingStatusTarget, 
                    it_staff_sign: signData,
                    it_staff_name: itStaffName,
                    action_result: actionResult
                })
                .eq('id', signingRequestId);

            if (error) throw error;
            setRequests(requests.map(req => req.id === signingRequestId ? { ...req, status: signingStatusTarget, it_staff_sign: signData, it_staff_name: itStaffName, action_result: actionResult } : req));
            
            setIsSignModalOpen(false);
            setSigningRequestId(null);
            setSigningStatusTarget(null);
            await showItApprovalLinkDialog(signingRequestId);
            return;
            
            Swal.fire('เสร็จสิ้น!', 'บันทึกการดำเนินการแบบมีลายเซ็นเรียบร้อย', 'success');
        } catch (error) {
            console.error('Error signing:', error);
            Swal.fire('Error', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        }
    };

    const handleDelete = async (id) => {
        const result = await Swal.fire({
            title: 'ยืนยันการลบ?',
            text: "คุณต้องการลบคำร้องปนี้ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'ลบข้อมูล',
            cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed) {
            try {
                const { error } = await mysql
                    .from('access_requests')
                    .delete()
                    .eq('id', id);

                if (error) throw error;
                setRequests(requests.filter(req => req.id !== id));
                Swal.fire('Deleted!', 'ลบคำร้องเรียบร้อยแล้ว', 'success');
            } catch (error) {
                console.error('Error deleting request:', error);
                Swal.fire('Error', 'ไม่สามารถลบข้อมูลได้', 'error');
            }
        }
    };

    const openPreview = (req) => {
        // Map db columns back to formData structure for the PDF preview
        const formData = {
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
            itSign: req.it_staff_sign || req.it_sign || null,
            itManagerSign: req.it_manager_sign || null,
            itStaffName: req.it_staff_name || '',
            actionResult: req.action_result || '',
            status: req.status || '',
            cancelledAt: req.cancelled_at || null,
            cancelReason: req.cancel_reason || '',
            cancelItName: req.cancel_it_name || '',
            cancelItSign: req.cancel_it_sign || null
        };
        setSelectedRequest(formData);
        setIsPreviewOpen(true);
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'Pending':
            case 'Pending_Manager':
                return <span className="px-2.5 py-1 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 rounded-full text-xs font-semibold flex items-center gap-1"><Clock className="w-3 h-3" /> รอดำเนินการ (ผจก.)</span>;
            case 'Pending_IT':
                return <span className="px-2.5 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full text-xs font-semibold flex items-center gap-1"><Clock className="w-3 h-3" /> รอดำเนินการ (IT)</span>;
            case 'Pending_IT_Manager':
                return <span className="px-2.5 py-1 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded-full text-xs font-semibold flex items-center gap-1"><Clock className="w-3 h-3" /> รอลงนาม (หัวหน้า IT)</span>;
            case 'Approved': /* Legacy */
                return <span className="px-2.5 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full text-xs font-semibold flex items-center gap-1"><CheckCircle className="w-3 h-3" /> อนุมัติแล้ว</span>;
            case 'Completed':
                return <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-full text-xs font-semibold flex items-center gap-1"><CheckCircle className="w-3 h-3" /> เสร็จสิ้น</span>;
            case 'Rejected':
                return <span className="px-2.5 py-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full text-xs font-semibold flex items-center gap-1"><XCircle className="w-3 h-3" /> ไม่อนุมัติ</span>;
            case 'Cancelled':
                return <span className="px-2.5 py-1 bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 rounded-full text-xs font-semibold flex items-center gap-1"><XCircle className="w-3 h-3" /> ยกเลิก</span>;
            default:
                return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 rounded-full text-xs font-semibold">{status || 'Pending'}</span>;
        }
    };

    const formatSystems = (systemsMap, otherDetails) => {
        if (!systemsMap) return '-';
        const labels = {
            userComputer: 'User PC', email: 'E-Mail', dataAll: 'Data All',
            vpn: 'VPN', allWeb: 'All Web', wms: 'WMS',
            msDynamics365: 'MS Dynamics', cyberHrm: 'Cyber HRM'
        };
        const requested = Object.keys(systemsMap).filter(k => systemsMap[k] && k !== 'other').map(k => labels[k]);
        if (systemsMap.other) requested.push(`อื่นๆ (${otherDetails})`);
        
        return requested.length > 0 ? requested.join(', ') : '-';
    };

    const filteredRequests = requests.filter(req => {
        const matchesSearch = 
            req.name_th?.toLowerCase().includes(searchTerm.toLowerCase()) || 
            req.department?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            req.ticket_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            req.request_details?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            req.other_system_details?.toLowerCase().includes(searchTerm.toLowerCase());
                              
        const effectiveStatus = (req.status === 'Pending' || !req.status) ? 'Pending_Manager' : req.status;
        const matchesStatus = statusFilter === 'All' || effectiveStatus === statusFilter;
        
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
        
        return matchesSearch && matchesStatus && matchesDate;
    });

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            {/* Header & Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/50 rounded-xl text-indigo-600 dark:text-indigo-400 hide-empty">
                        <Key className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">คำร้องขอสิทธิ์ใช้งานระบบ</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">จัดการแบบฟอร์ม FMIT 12</p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    <div className="relative w-full sm:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="ค้นหาชื่อ, แผนก, เลขที่, รายละเอียด..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="input-modern !pl-9 !py-2 !text-sm w-full"
                        />
                    </div>
                    
                    <div className="relative w-full sm:w-auto">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        {false && <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="input-modern !pl-9 !py-2 !text-sm w-full sm:w-40 appearance-none bg-white dark:bg-slate-800"
                        >
                            <option value="All">สถานะทั้งหมด</option>
                            <option value="Pending_Manager">รอดำเนินการ (ผจก.)</option>
                            <option value="Pending_IT">รอดำเนินการ (IT)</option>
                            <option value="Pending_IT_Manager">รอลงนาม (หัวหน้า IT)</option>
                            <option value="Completed">เสร็จสิ้น</option>
                            <option value="Rejected">ไม่อนุมัติ</option>
                        </select>}
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="input-modern !pl-9 !py-2 !text-sm w-full sm:w-40 bg-white dark:bg-slate-800">
                                <SelectValue placeholder="All" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All</SelectItem>
                                <SelectItem value="Pending_Manager">Pending Manager</SelectItem>
                                <SelectItem value="Pending_IT">Pending IT</SelectItem>
                                <SelectItem value="Pending_IT_Manager">Pending IT Manager</SelectItem>
                                <SelectItem value="Completed">Completed</SelectItem>
                                <SelectItem value="Rejected">Rejected</SelectItem>
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

            {/* Content Area */}
            {isLoading ? (
                <div className="flex justify-center items-center py-20">
                    <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                </div>
            ) : filteredRequests.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 p-10 rounded-2xl text-center border border-slate-100 dark:border-slate-700">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Key className="w-8 h-8 text-slate-400 m-auto" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-2">ไม่พบคำร้องขอสิทธิ์</h3>
                    <p className="text-slate-500 dark:text-slate-400">ยังไม่มีผู้ใช้งานส่งคำร้องขอสิทธิ์เข้ามาในระบบ หรือไม่พบในเงื่อนไขการค้นหา</p>
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
                                            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                                {new Date(req.created_at).toLocaleDateString('th-TH')}
                                            </div>
                                            <div className="text-xs text-slate-500 font-mono mt-1">
                                                {req.ticket_number || 'ไม่มีเลขที่'}
                                            </div>
                                        </td>
                                        <td className="p-4 align-top whitespace-nowrap">
                                            <div className="text-sm font-bold text-slate-800 dark:text-white">
                                                {req.name_th}
                                            </div>
                                            <div className="text-xs text-slate-500 mt-1">
                                                {req.department}
                                            </div>
                                            {req.status === 'Cancelled' && (
                                                <div className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200 text-[11px] font-semibold">
                                                    <XCircle className="w-3 h-3" />
                                                    ยกเลิกสิทธิ์แล้ว
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4 align-top min-w-[200px]">
                                            <div className="text-sm text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                                                {formatSystems(req.systems, req.other_system_details)}
                                            </div>
                                            {req.request_details && (
                                                <div className="text-xs text-slate-500 mt-1.5 line-clamp-2" title={req.request_details}>
                                                    <span className="font-medium">รายละเอียด:</span> {req.request_details}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4 align-top whitespace-nowrap">
                                            <button 
                                                onClick={() => handleStatusChange(req.id, req.status || 'Pending')}
                                                disabled={req.status !== 'Pending_IT'}
                                                className={`transition-opacity ${req.status === 'Pending_IT' ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
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
                                                            Swal.fire({
                                                                title: 'คัดลอกลิงก์สำเร็จ',
                                                                text: 'ส่งลิงก์นี้ให้หัวหน้า IT อนุมัติได้เลยครับ',
                                                                icon: 'success',
                                                                timer: 2000,
                                                                showConfirmButton: false
                                                            });
                                                        }}
                                                        className="py-1.5 px-3 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-semibold text-xs rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors whitespace-nowrap shadow-sm"
                                                    >
                                                        คัดลอกลิงก์
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={() => openPreview(req)}
                                                    className="py-1.5 px-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold text-xs rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors whitespace-nowrap shadow-sm"
                                                >
                                                    ดูแบบฟอร์ม
                                                </button>
                                                <button 
                                                    onClick={() => handleDelete(req.id)}
                                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                >
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

            {/* IT Signature Modal */}
            {isSignModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl animate-slide-up border border-slate-100 dark:border-slate-700">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <span className="text-indigo-500"><CheckCircle className="w-5 h-5"/></span> ลงนามปิดงาน (IT)
                            </h3>
                            <button 
                                onClick={() => setIsSignModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            >
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="mb-4 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">1. ชื่อผู้รับแจ้ง</label>
                                <input 
                                    type="text" 
                                    className="input-modern w-full" 
                                    placeholder="ระบุชื่อเจ้าหน้าที่ IT" 
                                    value={itStaffName}
                                    onChange={(e) => setItStaffName(e.target.value)}
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">2. ผลการดำเนินการ</label>
                                <textarea 
                                    className="input-modern w-full" 
                                    placeholder="รายละเอียดการปฏิบัติงาน" 
                                    rows="2"
                                    value={actionResult}
                                    onChange={(e) => setActionResult(e.target.value)}
                                ></textarea>
                            </div>
                            
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">3. ลายมือชื่อผู้ปฏิบัติงาน / ผู้ติดตั้ง</span>
                                    <button 
                                        onClick={() => adminSignatureRef.current.clear()}
                                        className="text-xs text-red-500 font-bold hover:underline"
                                    >
                                        ล้างลายเซ็น
                                    </button>
                                </div>
                                <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900/50 relative overflow-hidden" style={{ height: '140px' }}>
                                    <SignatureCanvas 
                                        ref={adminSignatureRef} 
                                        penColor="black"
                                        canvasProps={{ className: 'w-full h-full xl-signature' }}
                                    />
                                    <div className="absolute bottom-2 right-3 text-slate-400 text-xs pointer-events-none opacity-50">เซ็นชื่อผู้ปฏิบัติงานที่นี่</div>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setIsSignModalOpen(false)}
                                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 rounded-xl font-bold transition-colors"
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={handleSignAndComplete}
                                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors shadow-lg shadow-indigo-600/30"
                            >
                                ยืนยันปิดงาน
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <Fmit12PdfPreview 
                isOpen={isPreviewOpen} 
                onClose={() => setIsPreviewOpen(false)} 
                formData={selectedRequest} 
            />
        </div>
    );
};

export default AdminAccessRequests;
