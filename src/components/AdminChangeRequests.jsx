import React, { useState, useEffect, useRef } from 'react';
import { mysql } from '../mysqlClient';
import { Search, Filter, ClipboardPenLine, CheckCircle, XCircle, Clock, Trash2, Edit, Link, Printer, Paperclip, X } from 'lucide-react';
import Swal from 'sweetalert2';
import SignatureCanvas from 'react-signature-canvas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toLocalDateInputValue, toMysqlDateTime } from '../utils/dateTime';
import { CHANGE_QUEUE_STATUS_BY_ROLE, canDeleteRecords, canHandleChangeRequestCategory, normalizeRoleValue, visibleQueueStatuses } from '../config/roles';
import { getChangeRequestTypeLabel } from '../config/changeRequestTypes';
import { showAcceptChangeRequestLinkDialog } from '../utils/closeIssueLink';
import Fmit15PdfPreview from './Fmit15PdfPreview';
import { MAX_ATTACHMENT_SIZE, resolveAttachmentUrl, uploadAttachmentFiles } from '../utils/fileUpload';

const parseAttachments = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const formatFileSize = (size) => {
    const numericSize = Number(size || 0);
    if (!numericSize) return '';
    if (numericSize < 1024 * 1024) return `${(numericSize / 1024).toFixed(1)} KB`;
    return `${(numericSize / 1024 / 1024).toFixed(1)} MB`;
};

const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

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
    const [previewRequest, setPreviewRequest] = useState(null);
    const [selectedActionStatus, setSelectedActionStatus] = useState('');
    
    // For IT Action Form 
    const [actionType, setActionType] = useState('it_intake'); // 'it_intake', 'it_manager' or 'it_staff'
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
    const [actionFiles, setActionFiles] = useState([]);
    const staffSignatureRef = useRef(null);
    const itManagerSignatureRef = useRef(null);
    const currentRole = normalizeRoleValue(currentAdmin?.role);
    const canDeleteRecord = canDeleteRecords(currentAdmin?.role);
    const visibleStatuses = visibleQueueStatuses(currentRole, CHANGE_QUEUE_STATUS_BY_ROLE);
    const canActOnStatus = (status) => (canDeleteRecord && ['Pending_IT', 'In_Progress', 'In_Development'].includes(status)) || (visibleStatuses || []).includes(status);
    const canActOnRequest = (request) => canActOnStatus(request.status) && canHandleChangeRequestCategory(currentRole, request);
    const getActionModalTitle = () => {
        if (!selectedActionStatus) return 'เปลี่ยนสถานะคำร้อง';
        if (actionType === 'it_intake') return 'รับแจ้งคำร้องขอพัฒนาระบบ';
        if (actionType === 'it_schedule') return 'บันทึกวันที่ดำเนินการ';
        if (actionType === 'it_manager') return 'ส่วนที่ 2 (IT Manager อนุญาต)';
        return 'บันทึกการดำเนินการ';
    };

    const getActionStatusOptions = (status) => {
        if (status === 'Pending_IT') {
            return [{ value: 'Pending_IT_Manager', label: 'ส่งต่อผู้จัดการ' }];
        }
        if (status === 'In_Progress') {
            return [{ value: 'In_Development', label: 'บันทึกวันที่และเริ่มดำเนินการ' }];
        }
        if (status === 'In_Development') {
            return [{ value: 'Pending_User_Acceptance', label: 'บันทึกเสร็จสิ้นและส่งให้ผู้แจ้งเซ็นปิดจบ' }];
        }
        return [];
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
        const adminName = currentAdmin?.name || currentAdmin?.username || '';
        const adminPosition = currentAdmin?.position || '';
        if (!adminName && !adminPosition) return;
        setItForm((form) => ({
            ...form,
            staffName: form.staffName || adminName,
            staffPosition: form.staffPosition || adminPosition,
            managerName: form.managerName || adminName,
            managerPosition: form.managerPosition || adminPosition,
        }));
    }, [currentAdmin?.name, currentAdmin?.position, currentAdmin?.username]);

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

    const prepareActionForm = (req, targetStatus) => {
        setSelectedActionStatus(targetStatus);
        setActionFiles([]);
        if (targetStatus === 'Pending_IT_Manager') {
            setActionType('it_intake');
            setSelectedRequest(req);
            setItForm((form) => ({
                ...form,
                receivedDate: req.it_received_date ? toLocalDateInputValue(req.it_received_date) : toLocalDateInputValue(),
            }));
            return;
        }

        if (targetStatus === 'In_Development') {
            setActionType('it_schedule');
            setSelectedRequest(req);
            setItForm(f => ({
                ...f,
                operationDate: req.it_operation_date ? toLocalDateInputValue(req.it_operation_date) : toLocalDateInputValue(),
                targetDate: req.it_target_date ? toLocalDateInputValue(req.it_target_date) : f.targetDate,
            }));
            return;
        }

        if (targetStatus === 'Pending_User_Acceptance') {
            setActionType('it_staff');
            setSelectedRequest(req);
            setItForm(f => ({
                ...f,
                receivedDate: req.it_received_date ? toLocalDateInputValue(req.it_received_date) : f.receivedDate,
                operationDate: req.it_operation_date ? toLocalDateInputValue(req.it_operation_date) : f.operationDate,
                targetDate: req.it_target_date ? toLocalDateInputValue(req.it_target_date) : f.targetDate,
                staffName: currentAdmin?.name || currentAdmin?.username || f.staffName,
                staffPosition: currentAdmin?.position || f.staffPosition,
            }));
            setTimeout(() => staffSignatureRef.current?.clear(), 100);
            return;
        }
    };

    const openStatusActionModal = (req) => {
        if (!req || req.status === 'Cancelled') return;
        if (!canActOnRequest(req)) return;
        const options = getActionStatusOptions(req.status);
        if (!options.length) return;

        setSelectedRequest(req);
        setSelectedActionStatus('');
        setIsActionModalOpen(true);
    };

    const handleActionFileChange = (event) => {
        if (selectedActionStatus !== 'In_Development' || actionType !== 'it_schedule') {
            event.target.value = '';
            Swal.fire('ยังแนบไฟล์ไม่ได้', 'สามารถแนบไฟล์เพิ่มเติมได้ตอนเปลี่ยนสถานะเป็นกำลังดำเนินการเท่านั้น', 'warning');
            return;
        }

        const files = Array.from(event.target.files || []);
        if (actionFiles.length + files.length > 5) {
            Swal.fire('เกินกำหนด', 'สามารถแนบไฟล์เพิ่มเติมได้สูงสุด 5 ไฟล์ต่อครั้ง', 'warning');
            event.target.value = '';
            return;
        }
        const oversizedFile = files.find((file) => file.size > MAX_ATTACHMENT_SIZE);
        if (oversizedFile) {
            Swal.fire('ไฟล์ใหญ่เกินไป', `ไฟล์ ${oversizedFile.name} มีขนาดเกิน 5 MB`, 'warning');
            event.target.value = '';
            return;
        }

        setActionFiles((prev) => [
            ...prev,
            ...files.map((file) => ({
                id: `${Date.now()}-${file.name}-${Math.random()}`,
                file,
                name: file.name,
                size: file.size,
                type: file.type,
            })),
        ]);
        event.target.value = '';
    };

    const removeActionFile = (fileId) => {
        setActionFiles((prev) => prev.filter((file) => file.id !== fileId));
    };

    const showAttachmentsDialog = (req) => {
        const attachments = parseAttachments(req.attachments_json);
        if (!attachments.length) return;

        const html = `
            <div style="display:flex;flex-direction:column;gap:8px;text-align:left;">
                ${attachments.map((file, index) => `
                    <a href="${escapeHtml(resolveAttachmentUrl(file.url))}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #e2e8f0;border-radius:10px;text-decoration:none;color:#334155;">
                        <span style="font-weight:700;color:#10b981;">${index + 1}</span>
                        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(file.name || 'ไฟล์แนบ')}</span>
                        <span style="font-size:12px;color:#94a3b8;">${escapeHtml(formatFileSize(file.size))}</span>
                    </a>
                `).join('')}
            </div>
        `;

        Swal.fire({
            title: 'ไฟล์แนบเพิ่มเติม',
            html,
            confirmButtonColor: '#10b981',
            confirmButtonText: 'ปิด',
            width: 560,
        });
    };

    const handleItAction = async () => {
        const reqId = selectedRequest.id;
        if (!selectedActionStatus) {
            return Swal.fire('ข้อมูลไม่ครบ', 'กรุณาเลือกสถานะที่ต้องการเปลี่ยน', 'warning');
        }
        
        try {
            if (actionType === 'it_intake') {
                if (!itForm.receivedDate) {
                    return Swal.fire('ข้อมูลไม่ครบ', 'กรุณาระบุวันที่รับคำร้องขอ', 'warning');
                }

                const updateData = {
                    it_received_date: itForm.receivedDate,
                    status: 'Pending_IT_Manager',
                };

                const { error } = await mysql.from('change_requests').update(updateData).eq('id', reqId);
                if (error) throw error;
            } else if (actionType === 'it_manager') {
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
                    it_manager_date: toMysqlDateTime(),
                    status: itStatus === 'Rejected' ? 'Rejected' : 'In_Progress'
                };
                
                const { error } = await mysql.from('change_requests').update(updateData).eq('id', reqId);
                if (error) throw error;

            } else if (actionType === 'it_schedule') {
                if (!itForm.operationDate || !itForm.targetDate) {
                    return Swal.fire('ข้อมูลไม่ครบ', 'ระบุวันที่ดำเนินการและวันที่นัดหมายแล้วเสร็จให้ครบ', 'warning');
                }
                const existingAttachments = parseAttachments(selectedRequest.attachments_json);
                const newAttachments = await uploadAttachmentFiles(
                    actionFiles.map(({ file }) => file),
                    { uploadedBy: currentAdmin?.name || currentAdmin?.username || '' },
                );
                const updateData = {
                    it_operation_date: itForm.operationDate,
                    it_target_date: itForm.targetDate,
                    attachments_json: JSON.stringify([...existingAttachments, ...newAttachments]),
                    status: 'In_Development'
                };

                const { error } = await mysql.from('change_requests').update(updateData).eq('id', reqId);
                if (error) throw error;

            } else if (actionType === 'it_staff') {
                if (!itForm.solution || !itForm.staffName || !itForm.staffPosition || staffSignatureRef.current.isEmpty()) {
                    return Swal.fire('ข้อมูลไม่ครบ', 'ระบุวิธีแก้ไข ผู้ดำเนินการ ตำแหน่ง และลายเซ็นให้ครบ', 'warning');
                }
                const signData = staffSignatureRef.current.getCanvas().toDataURL('image/png');
                const updateData = {
                    it_solution: itForm.solution,
                    it_staff_name: itForm.staffName,
                    it_staff_position: itForm.staffPosition,
                    it_staff_sign: signData,
                    it_staff_date: toMysqlDateTime(),
                    status: 'Pending_User_Acceptance'
                };
                
                const { error } = await mysql.from('change_requests').update(updateData).eq('id', reqId);
                if (error) throw error;
            }

            setIsActionModalOpen(false);
            setSelectedActionStatus('');
            setActionFiles([]);
            window.dispatchEvent(new Event('approval-queues:refresh'));
            Swal.fire('สำเร็จ!', 'บันทึกการดำเนินการของ IT เรียบร้อย', 'success');
            if (actionType === 'it_staff') {
                await showAcceptChangeRequestLinkDialog(selectedRequest);
            }
            fetchRequests();
            
        } catch (error) {
            console.error('Error IT action:', error);
            Swal.fire('Error', error.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
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
            case 'Pending_Manager': return <span className="px-2.5 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold flex items-center gap-1"><Clock className="w-3 h-3"/> ผู้จัดการของผู้แจ้ง</span>;
            case 'Pending_IT': return <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold flex items-center gap-1"><Clock className="w-3 h-3"/> รับแจ้ง</span>;
            case 'Pending_IT_Supervisor': return <span className="px-2.5 py-1 bg-cyan-100 text-cyan-700 rounded-full text-xs font-semibold flex items-center gap-1"><Clock className="w-3 h-3"/> หัวหน้าแผนก</span>;
            case 'Pending_IT_Manager': return <span className="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold flex items-center gap-1"><Clock className="w-3 h-3"/> ผู้จัดการ</span>;
            case 'In_Progress': return <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-semibold flex items-center gap-1"><Clock className="w-3 h-3"/> รอดำเนินการ</span>;
            case 'In_Development': return <span className="px-2.5 py-1 bg-sky-100 text-sky-700 rounded-full text-xs font-semibold flex items-center gap-1"><Edit className="w-3 h-3"/> กำลังดำเนินการ</span>;
            case 'Pending_User_Acceptance': return <span className="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold flex items-center gap-1"><Clock className="w-3 h-3"/> เสร็จสิ้น</span>;
            case 'Completed': return <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold flex items-center gap-1"><CheckCircle className="w-3 h-3"/> ปิดจบ</span>;
            case 'Rejected': return <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold flex items-center gap-1"><XCircle className="w-3 h-3"/> ไม่อนุมัติ</span>;
            case 'Cancelled': return <span className="px-2.5 py-1 bg-rose-100 text-rose-700 rounded-full text-xs font-semibold flex items-center gap-1"><XCircle className="w-3 h-3"/> ยกเลิก</span>;
            default: return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-semibold">{status}</span>;
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
            const { error } = await mysql.from('change_requests').update(updatePayload).eq('id', req.id);
            if (error) throw error;
            window.dispatchEvent(new Event('approval-queues:refresh'));
            fetchRequests();
            Swal.fire('ยกเลิกแล้ว', 'เปลี่ยนสถานะคำร้องเป็นยกเลิกเรียบร้อยแล้ว', 'success');
        } catch (error) {
            console.error('Error cancelling change request:', error);
            Swal.fire('Error', 'ไม่สามารถยกเลิกคำร้องได้', 'error');
        }
    };

    const getRequestCategoryBadge = (category) => {
        if (!category) return <span className="text-xs text-slate-400">-</span>;
        const tone = category === 'พัฒนาสื่อ'
            ? 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700'
            : 'border-sky-200 bg-sky-50 text-sky-700';
        return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>{category}</span>;
    };

    const filteredRequests = requests.filter(req => {
        const matchesRoleCategory = canHandleChangeRequestCategory(currentRole, req);
        const matchesSearch = req.requester_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              req.department?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              req.ticket_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              req.request_category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              req.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              req.request_details?.toLowerCase().includes(searchTerm.toLowerCase());
                              
        const matchesStatus = statusFilter === 'All' || req.status === statusFilter;
        
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
        
        return matchesRoleCategory && matchesSearch && matchesStatus && matchesDate;
    });

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            {/* Header */}
            <div className="flex flex-col items-start gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900/50 rounded-xl text-emerald-600 dark:text-emerald-300">
                        <ClipboardPenLine className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 dark:text-white">คำร้องขอพัฒนาระบบ (Change Request)</h2>
                        <p className="text-sm text-slate-500 font-medium">จัดการแบบฟอร์มประเมินและพัฒนาโปรแกรม (FMIT 15)</p>
                    </div>
                </div>

                <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <div className="relative w-full sm:min-w-80 sm:flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input type="text" placeholder="ค้นหาชื่อ, แผนก, เลขเอกสาร, รายละเอียด..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="input-modern !pl-9 !py-2 !text-sm w-full" />
                    </div>
                    <div className="relative w-full sm:w-64">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        {false && <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-modern !pl-9 !py-2 !text-sm w-full sm:w-auto appearance-none bg-white dark:bg-slate-800">
                            <option value="All">ทุกสถานะ</option>
                            <option value="Pending_IT">รับแจ้ง</option>
                            <option value="In_Progress">รอดำเนินการ</option>
                            <option value="In_Development">กำลังดำเนินการ</option>
                            <option value="Pending_User_Acceptance">เสร็จสิ้น</option>
                            <option value="Completed">ปิดจบ</option>
                        </select>}
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="input-modern !pl-9 !py-2 !text-sm w-full bg-white dark:bg-slate-800">
                                <SelectValue placeholder="All statuses" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All</SelectItem>
                                <SelectItem value="Pending_IT">รับแจ้ง</SelectItem>
                                <SelectItem value="Pending_IT_Manager">ผู้จัดการ</SelectItem>
                                <SelectItem value="In_Progress">รอดำเนินการ</SelectItem>
                                <SelectItem value="In_Development">กำลังดำเนินการ</SelectItem>
                                <SelectItem value="Pending_User_Acceptance">เสร็จสิ้น</SelectItem>
                                <SelectItem value="Completed">ปิดจบ</SelectItem>
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
                        <ClipboardPenLine className="w-8 h-8 text-slate-400 m-auto" />
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
                                    <th className="p-4 whitespace-nowrap">ประเภทการร้องขอ</th>
                                    <th className="p-4 whitespace-nowrap">ผู้ร้องขอ / แผนก</th>
                                    <th className="p-4">รายละเอียดการขอ (Requirement)</th>
                                    <th className="p-4 whitespace-nowrap">สถานะ</th>
                                    <th className="p-4 whitespace-nowrap text-right">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredRequests.map((req) => (
                                    <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-4 align-top">
                                            <div className="text-sm font-semibold">{new Date(req.created_at).toLocaleDateString('th-TH')}</div>
                                            <div className="text-xs text-emerald-600 font-mono mt-1">{req.ticket_number}</div>
                                            <div className="text-xs text-slate-400 mt-1 font-bold">{getChangeRequestTypeLabel(req.req_type)}</div>
                                        </td>
                                        <td className="p-4 align-top">
                                            {getRequestCategoryBadge(req.request_category)}
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
                                            {getStatusBadge(req.status)}
                                        </td>
                                        <td className="p-4 align-top text-right">
                                            {canActOnRequest(req) && getActionStatusOptions(req.status).length > 0 && (
                                                <button type="button" onClick={() => openStatusActionModal(req)} className="p-2 text-amber-600 hover:text-white hover:bg-amber-600 rounded-lg" title="เปลี่ยนสถานะ">
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                            )}
                                            {req.status === 'Pending_User_Acceptance' && (
                                                <button type="button" onClick={() => showAcceptChangeRequestLinkDialog(req)} className="p-2 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg" title="สร้างลิงก์เซ็นรับมอบงาน">
                                                    <Link className="w-4 h-4" />
                                                </button>
                                            )}
                                            {parseAttachments(req.attachments_json).length > 0 && (
                                                <button type="button" onClick={() => showAttachmentsDialog(req)} className="p-2 text-emerald-600 hover:text-white hover:bg-emerald-600 rounded-lg" title="ดูไฟล์แนบเพิ่มเติม" aria-label="ดูไฟล์แนบเพิ่มเติม">
                                                    <Paperclip className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button type="button" onClick={() => setPreviewRequest(req)} className="p-2 rounded-lg bg-indigo-50 text-indigo-600 transition-colors hover:bg-indigo-100" title="ดูเอกสาร" aria-label="ดูเอกสาร">
                                                <Printer className="w-4 h-4" />
                                            </button>
                                            {canDeleteRecord && (
                                                <button onClick={() => handleDelete(req.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                            {!canDeleteRecord && !['Cancelled', 'Completed', 'Rejected'].includes(req.status) && (
                                                <button onClick={() => handleCancelRequest(req)} className="p-2 text-rose-500 hover:text-white hover:bg-rose-600 rounded-lg" title="ตั้งสถานะยกเลิก">
                                                    <XCircle className="w-4 h-4" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {isActionModalOpen && selectedRequest && (
                <div className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center overflow-y-auto p-3 sm:p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl p-5 sm:p-6 w-full max-w-lg shadow-2xl animate-fade-in border overflow-y-auto max-h-[calc(100dvh-1.5rem)]">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                <ClipboardPenLine className="w-6 h-6 text-emerald-500"/>
                                {getActionModalTitle()}
                            </h3>
                            <button onClick={() => { setIsActionModalOpen(false); setSelectedActionStatus(''); setActionFiles([]); }} className="text-slate-400 hover:text-rose-500"><XCircle className="w-6 h-6" /></button>
                        </div>
                        
                        <div className="bg-slate-50 p-3 rounded-lg text-sm mb-4 border border-slate-200">
                            <b>เอกสารอ้างอิง:</b> {selectedRequest.ticket_number}<br/>
                            <b>ประเภทการร้องขอ:</b> {selectedRequest.request_category || '-'}<br/>
                            <b>รายละเอียดการขอ:</b> {selectedRequest.details}
                        </div>

                        <div className="mb-4">
                            <label className="text-xs font-semibold mb-1 block">สถานะที่ต้องการเปลี่ยน</label>
                            <Select value={selectedActionStatus} onValueChange={(value) => prepareActionForm(selectedRequest, value)}>
                                <SelectTrigger className="input-modern w-full">
                                    <SelectValue placeholder="เลือกสถานะ" />
                                </SelectTrigger>
                                <SelectContent>
                                    {getActionStatusOptions(selectedRequest.status).map((option) => (
                                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {selectedActionStatus === 'Pending_IT_Manager' && actionType === 'it_intake' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 gap-3">
                                    <div>
                                        <label className="text-xs font-semibold mb-1 block">วันที่รับคำร้องขอ</label>
                                        <input type="date" className="input-modern w-full text-sm" value={itForm.receivedDate} onChange={e => setItForm({...itForm, receivedDate: e.target.value})} />
                                    </div>
                                </div>
                                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                                    บันทึกวันที่แล้วระบบจะส่งรายการต่อให้ IT Manager ลงนาม
                                </div>
                            </div>
                        )}

                        {selectedActionStatus === 'In_Progress' && actionType === 'it_manager' && (
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

                        {selectedActionStatus === 'In_Development' && actionType === 'it_schedule' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-semibold mb-1 block">วันที่ดำเนินการ</label>
                                        <input type="date" className="input-modern w-full text-sm" value={itForm.operationDate} onChange={e => setItForm({...itForm, operationDate: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold mb-1 block">วันที่นัดหมายแล้วเสร็จ</label>
                                        <input type="date" className="input-modern w-full text-sm" value={itForm.targetDate} onChange={e => setItForm({...itForm, targetDate: e.target.value})} />
                                    </div>
                                </div>
                                <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-700">
                                    บันทึกวันที่แล้วระบบจะเปลี่ยนสถานะเป็นกำลังดำเนินการ
                                </div>
                                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
                                    <label className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
                                        <Paperclip className="h-4 w-4 text-emerald-500" />
                                        ไฟล์แนบเพิ่มเติม <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
                                    </label>
                                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 hover:border-emerald-300 hover:text-emerald-600">
                                        <Paperclip className="h-4 w-4" />
                                        เลือกไฟล์
                                        <input type="file" multiple accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip" className="hidden" onChange={handleActionFileChange} />
                                    </label>
                                    {actionFiles.length > 0 && (
                                        <div className="mt-3 space-y-2">
                                            {actionFiles.map((file) => (
                                                <div key={file.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs">
                                                    <span className="min-w-0 truncate font-semibold text-slate-700">{file.name}</span>
                                                    <button type="button" onClick={() => removeActionFile(file.id)} className="shrink-0 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500" title="ลบไฟล์แนบ" aria-label="ลบไฟล์แนบ">
                                                        <X className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {selectedActionStatus === 'Pending_User_Acceptance' && actionType === 'it_staff' && (
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-semibold mb-1 block">วิธีแก้ไข/พัฒนา (Solution)</label>
                                    <textarea className="input-modern w-full text-sm p-3 min-h-[100px]" placeholder="เพิ่ม Database Table, สร้าง หน้าเว็บใหม่ ..." value={itForm.solution} onChange={e => setItForm({...itForm, solution: e.target.value})} />
                                </div>
                                <hr className="my-2 border-slate-200" />
                                <div className="grid grid-cols-2 gap-3">
                                    <input type="text" className="input-modern" placeholder="ชื่อผู้ดำเนินการ" value={itForm.staffName} onChange={e => setItForm({...itForm, staffName: e.target.value})} />
                                    <input type="text" className="input-modern" placeholder="ตำแหน่ง" value={itForm.staffPosition} onChange={e => setItForm({...itForm, staffPosition: e.target.value})} />
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                    ลงวันที่: {new Date().toLocaleDateString('th-TH')}
                                </div>
                                <div className="border shadow-inner bg-slate-50 h-32 relative rounded-xl overflow-hidden">
                                     <SignatureCanvas ref={staffSignatureRef} canvasProps={{ className: 'w-full h-full xl-signature' }} />
                                     <div className="absolute top-2 right-2 text-xs text-red-500 cursor-pointer" onClick={() => staffSignatureRef.current.clear()}>ล้าง</div>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-3 mt-6">
                            <button onClick={() => { setIsActionModalOpen(false); setSelectedActionStatus(''); setActionFiles([]); }} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 font-bold rounded-xl text-slate-700">ยกเลิก</button>
                            <button onClick={handleItAction} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg">ยืนยันรายการ</button>
                        </div>
                    </div>
                </div>
            )}
            {previewRequest && (
                <Fmit15PdfPreview
                    isOpen
                    onClose={() => setPreviewRequest(null)}
                    formData={{
                        ticketNumber: previewRequest.ticket_number,
                        createdAt: previewRequest.created_at || null,
                        reqType: previewRequest.req_type,
                        reqTypeOther: previewRequest.req_type_other || '',
                        department: previewRequest.department,
                        requestDetails: previewRequest.details,
                        reason: previewRequest.reason,
                        requesterName: previewRequest.requester_name,
                        requesterPosition: previewRequest.requester_position,
                        requesterSign: previewRequest.requester_sign || null,
                        managerSign: previewRequest.manager_sign || null,
                        managerPosition: previewRequest.manager_position || '',
                        managerDate: previewRequest.manager_date || null,
                        itReceivedDate: previewRequest.it_received_date || '',
                        itOperationDate: previewRequest.it_operation_date || '',
                        itTargetDate: previewRequest.it_target_date || '',
                        itApprovalStatus: previewRequest.it_approval_status || '',
                        itRejectReason: previewRequest.it_reject_reason || '',
                        itManagerSign: previewRequest.it_manager_sign || null,
                        itManagerPosition: previewRequest.it_manager_position || '',
                        itManagerDate: previewRequest.it_manager_date || null,
                        itSolution: previewRequest.it_solution || '',
                        itStaffSign: previewRequest.it_staff_sign || null,
                        itStaffDate: previewRequest.it_staff_date || null,
                        itStaffPosition: previewRequest.it_staff_position || '',
                        userAcceptance: previewRequest.user_acceptance || '',
                        userRejectReason: previewRequest.user_reject_reason || '',
                        userAcceptSign: previewRequest.user_accept_sign || null,
                        userAcceptDate: previewRequest.user_accept_date || null,
                        status: previewRequest.status || '',
                        cancelledAt: previewRequest.cancelled_at || null,
                    }}
                />
            )}
        </div>
    );
};

export default AdminChangeRequests;
