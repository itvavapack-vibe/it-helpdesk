import React, { useState, useEffect, useRef } from 'react';
import { mysql } from '../mysqlClient';
import { Search, Filter, ClipboardPenLine, CheckCircle, XCircle, Clock, Trash2, Edit, Link, Printer, Paperclip, X, Eye, LayoutGrid, User, Briefcase, FileText, AlertCircle } from 'lucide-react';
import Swal from 'sweetalert2';
import SignatureCanvas from 'react-signature-canvas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toLocalDateInputValue, toMysqlDateTime } from '../utils/dateTime';
import { CHANGE_QUEUE_STATUS_BY_ROLE, canDeleteRecords, canHandleChangeRequestCategory, canManageAllWork, normalizeRoleValue, visibleQueueStatuses } from '../config/roles';
import { CHANGE_REQUEST_TYPE_OPTIONS, getChangeRequestTypeLabel } from '../config/changeRequestTypes';
import { showAcceptChangeRequestLinkDialog } from '../utils/closeIssueLink';
import Fmit15PdfPreview from './Fmit15PdfPreview';
import { MAX_ATTACHMENT_SIZE, resolveAttachmentUrl, uploadAttachmentFiles } from '../utils/fileUpload';
import { loadSignatureIntoCanvas } from '../utils/signatureCanvas';
import { getStatusBadgeClass } from '../utils/statusStyles';

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

const REQUEST_CATEGORY_OPTIONS = [
    'พัฒนาโปรแกรม',
    'พัฒนาสื่อ'
];

const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const AdminChangeRequests = ({ currentAdmin, initialStatusFilter = 'All', filterSignal = 0 }) => {
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
    const [detailRequest, setDetailRequest] = useState(null);
    const [detailForm, setDetailForm] = useState({});
    const [isDetailEditing, setIsDetailEditing] = useState(false);
    const [isSavingDetails, setIsSavingDetails] = useState(false);
    
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
    const canEditAllWork = canManageAllWork(currentAdmin?.role);
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
        if (status === 'Pending_IT_Manager') {
            return [{ value: 'In_Progress', label: 'อนุมัติและส่งดำเนินการ' }];
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
        setStatusFilter(initialStatusFilter || 'All');
    }, [initialStatusFilter, filterSignal]);

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
        if (!isActionModalOpen || !selectedActionStatus) return;
        if (actionType === 'it_manager') {
            loadSignatureIntoCanvas(itManagerSignatureRef, currentAdmin?.signature);
        }
        if (actionType === 'it_staff') {
            loadSignatureIntoCanvas(staffSignatureRef, currentAdmin?.signature);
        }
    }, [actionType, isActionModalOpen, selectedActionStatus]);

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

        if (targetStatus === 'In_Progress') {
            setActionType('it_manager');
            setSelectedRequest(req);
            setItForm((form) => ({
                ...form,
                receivedDate: req.it_received_date ? toLocalDateInputValue(req.it_received_date) : form.receivedDate,
                targetDate: req.it_target_date ? toLocalDateInputValue(req.it_target_date) : form.targetDate,
                managerName: currentAdmin?.name || currentAdmin?.username || form.managerName,
                managerPosition: currentAdmin?.position || form.managerPosition,
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
        if (selectedActionStatus !== 'Pending_User_Acceptance' || actionType !== 'it_staff') {
            event.target.value = '';
            Swal.fire('ยังแนบไฟล์ไม่ได้', 'สามารถแนบไฟล์เพิ่มเติมได้ในหน้าบันทึกการดำเนินการเท่านั้น', 'warning');
            return;
        }

        const files = Array.from(event.target.files || []);
        if (actionFiles.length + files.length > 5) {
            Swal.fire('เกินกำหนด', 'สามารถแนบไฟล์เพิ่มเติมได้สูงสุด 5 ไฟล์ต่อครั้ง', 'warning');
            event.target.value = '';
            return;
        }
        const oversizedFile = files.find((file) => file.size > MAX_ATTACHMENT_SIZE && !file.type.startsWith('image/'));
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

        const isItAttachment = (file) => file.uploadedByType === 'it' || (!file.uploadedByType && Boolean(file.uploadedBy));
        const requesterAttachments = attachments.filter((file) => !isItAttachment(file));
        const itAttachments = attachments.filter(isItAttachment);
        const renderAttachmentGroup = (title, files, accentColor) => {
            if (!files.length) return '';
            return `
                <section style="display:flex;flex-direction:column;gap:8px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 2px;">
                        <strong style="font-size:14px;color:${accentColor};">${escapeHtml(title)}</strong>
                        <span style="font-size:12px;color:#94a3b8;">${files.length} ไฟล์</span>
                    </div>
                    ${files.map((file, index) => `
                        <a href="${escapeHtml(resolveAttachmentUrl(file.url))}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #e2e8f0;border-radius:10px;text-decoration:none;color:#334155;">
                            <span style="font-weight:700;color:${accentColor};">${index + 1}</span>
                            <span style="flex:1;min-width:0;">
                                <span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(file.name || 'ไฟล์แนบ')}</span>
                                ${file.uploadedBy ? `<span style="display:block;margin-top:2px;font-size:11px;color:#94a3b8;">แนบโดย ${escapeHtml(file.uploadedBy)}</span>` : ''}
                            </span>
                            <span style="font-size:12px;color:#94a3b8;">${escapeHtml(formatFileSize(file.size))}</span>
                        </a>
                    `).join('')}
                </section>
            `;
        };
        const html = `
            <div style="display:flex;flex-direction:column;gap:18px;text-align:left;">
                ${renderAttachmentGroup('ไฟล์จากผู้แจ้ง', requesterAttachments, '#2563eb')}
                ${renderAttachmentGroup('ไฟล์จาก IT', itAttachments, '#10b981')}
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

    const getActionSignature = (signatureRef) => {
        if (currentAdmin?.signature) return currentAdmin.signature;
        if (signatureRef.current && !signatureRef.current.isEmpty()) {
            return signatureRef.current.getCanvas().toDataURL('image/png');
        }
        return null;
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
                if (!itForm.managerName || !itForm.managerPosition) {
                    return Swal.fire('ข้อมูลไม่ครบ', 'ระบุชื่อและตำแหน่ง IT Manager ให้ครบ', 'warning');
                }
                const signData = getActionSignature(itManagerSignatureRef);
                if (!signData) {
                    return Swal.fire('ยังไม่ได้ลงนาม', 'กรุณาลงลายเซ็น IT Manager ก่อนยืนยันรายการ', 'warning');
                }
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
                const updateData = {
                    it_operation_date: itForm.operationDate,
                    it_target_date: itForm.targetDate,
                    status: 'In_Development'
                };

                const { error } = await mysql.from('change_requests').update(updateData).eq('id', reqId);
                if (error) throw error;

            } else if (actionType === 'it_staff') {
                if (!itForm.solution || !itForm.staffName || !itForm.staffPosition) {
                    return Swal.fire('ข้อมูลไม่ครบ', 'ระบุวิธีแก้ไข ผู้ดำเนินการ และตำแหน่งให้ครบ', 'warning');
                }
                const signData = getActionSignature(staffSignatureRef);
                if (!signData) {
                    return Swal.fire('ยังไม่ได้ลงนาม', 'กรุณาลงลายเซ็นผู้ดำเนินการก่อนยืนยันรายการ', 'warning');
                }
                const existingAttachments = parseAttachments(selectedRequest.attachments_json);
                const newAttachments = await uploadAttachmentFiles(
                    actionFiles.map(({ file }) => file),
                    { uploadedBy: currentAdmin?.name || currentAdmin?.username || '', uploadedByType: 'it' },
                );
                const updateData = {
                    it_solution: itForm.solution,
                    it_staff_name: itForm.staffName,
                    it_staff_position: itForm.staffPosition,
                    it_staff_sign: signData,
                    it_staff_date: toMysqlDateTime(),
                    attachments_json: JSON.stringify([...existingAttachments, ...newAttachments]),
                    status: 'Pending_User_Acceptance'
                };
                
                const { error } = await mysql.from('change_requests').update(updateData).eq('id', reqId);
                if (error) throw error;
            }

            setIsActionModalOpen(false);
            setDetailRequest(null);
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
        const badgeClass = `px-2.5 py-1 rounded-full border text-xs font-semibold flex items-center gap-1 ${getStatusBadgeClass(status)}`;
        switch (status) {
            case 'Pending_Manager': return <span className={badgeClass}><Clock className="w-3 h-3"/> ผู้จัดการของผู้แจ้ง</span>;
            case 'Pending_IT': return <span className={badgeClass}><Clock className="w-3 h-3"/> รับแจ้ง</span>;
            case 'Pending_IT_Supervisor': return <span className={badgeClass}><Clock className="w-3 h-3"/> หัวหน้าแผนก</span>;
            case 'Pending_IT_Manager': return <span className={badgeClass}><Clock className="w-3 h-3"/> ผู้จัดการ</span>;
            case 'In_Progress': return <span className={badgeClass}><Clock className="w-3 h-3"/> รอดำเนินการ</span>;
            case 'In_Development': return <span className={badgeClass}><Edit className="w-3 h-3"/> กำลังดำเนินการ</span>;
            case 'Pending_User_Acceptance': return <span className={badgeClass}><Clock className="w-3 h-3"/> เสร็จสิ้น</span>;
            case 'Completed': return <span className={badgeClass}><CheckCircle className="w-3 h-3"/> ปิดจบ</span>;
            case 'Rejected': return <span className={badgeClass}><XCircle className="w-3 h-3"/> ไม่อนุมัติ</span>;
            case 'Cancelled': return <span className={badgeClass}><XCircle className="w-3 h-3"/> ยกเลิก</span>;
            default: return <span className={badgeClass}>{status}</span>;
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

    const openDetailModal = (req, { edit = false } = {}) => {
        setSelectedRequest(req);
        setSelectedActionStatus('');
        setActionFiles([]);
        setIsDetailEditing(edit);
        setDetailRequest(req);
        setDetailForm({
            ticket_number: req.ticket_number || '',
            req_type: req.req_type || '',
            req_type_other: req.req_type_other || '',
            request_category: req.request_category || '',
            employee_id: req.employee_id || '',
            requester_name: req.requester_name || '',
            requester_position: req.requester_position || '',
            department: req.department || '',
            details: req.details || '',
            reason: req.reason || '',
            it_received_date: req.it_received_date ? toLocalDateInputValue(req.it_received_date) : '',
            it_operation_date: req.it_operation_date ? toLocalDateInputValue(req.it_operation_date) : '',
            it_target_date: req.it_target_date ? toLocalDateInputValue(req.it_target_date) : '',
            it_approval_status: req.it_approval_status || '',
            it_reject_reason: req.it_reject_reason || '',
            it_manager_name: req.it_manager_name || '',
            it_manager_position: req.it_manager_position || '',
            it_solution: req.it_solution || '',
            it_staff_name: req.it_staff_name || '',
            it_staff_position: req.it_staff_position || '',
            user_acceptance: req.user_acceptance || '',
            user_reject_reason: req.user_reject_reason || '',
            cancel_reason: req.cancel_reason || '',
        });
    };

    const canEditDetailRequest = Boolean(detailRequest && isDetailEditing && canEditAllWork);
    const isDetailActionMode = Boolean(detailRequest && isDetailEditing && (canEditAllWork || canActOnRequest(detailRequest)));

    const handleDetailFormChange = (field, value) => {
        if (!canEditDetailRequest) return;
        setDetailForm((current) => ({ ...current, [field]: value }));
    };

    const saveDetailChanges = async ({ showSuccess = false } = {}) => {
        if (!detailRequest || !canEditDetailRequest) return true;
        if (!detailForm.ticket_number || !detailForm.req_type || !detailForm.request_category || !detailForm.requester_name || !detailForm.department || !detailForm.requester_position || !detailForm.details || !detailForm.reason) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณาระบุเลขเอกสาร ประเภทคำร้อง หมวดคำร้อง ผู้ร้องขอ แผนก ตำแหน่ง รายละเอียด และเหตุผลให้ครบ', 'warning');
            return false;
        }

        const updatePayload = {
            ticket_number: detailForm.ticket_number || null,
            req_type: detailForm.req_type || null,
            req_type_other: detailForm.req_type_other || null,
            request_category: detailForm.request_category || null,
            employee_id: detailForm.employee_id || null,
            requester_name: detailForm.requester_name || null,
            requester_position: detailForm.requester_position || null,
            department: detailForm.department || null,
            details: detailForm.details || null,
            reason: detailForm.reason || null,
            it_received_date: detailForm.it_received_date || null,
            it_operation_date: detailForm.it_operation_date || null,
            it_target_date: detailForm.it_target_date || null,
            it_approval_status: detailForm.it_approval_status || null,
            it_reject_reason: detailForm.it_reject_reason || null,
            it_manager_name: detailForm.it_manager_name || null,
            it_manager_position: detailForm.it_manager_position || null,
            it_solution: detailForm.it_solution || null,
            it_staff_name: detailForm.it_staff_name || null,
            it_staff_position: detailForm.it_staff_position || null,
            user_acceptance: detailForm.user_acceptance || null,
            user_reject_reason: detailForm.user_reject_reason || null,
            cancel_reason: detailForm.cancel_reason || null,
        };

        try {
            const { error } = await mysql.from('change_requests').update(updatePayload).eq('id', detailRequest.id);
            if (error) throw error;

            const nextRequest = { ...detailRequest, ...updatePayload };
            setRequests((prev) => prev.map((req) => (req.id === detailRequest.id ? { ...req, ...updatePayload } : req)));
            setDetailRequest(nextRequest);
            setSelectedRequest(nextRequest);
            window.dispatchEvent(new Event('approval-queues:refresh'));
            if (showSuccess) {
                Swal.fire('บันทึกแล้ว', 'อัปเดตข้อมูลคำร้องขอพัฒนาระบบเรียบร้อยแล้ว', 'success');
            }
            return true;
        } catch (error) {
            console.error('Error updating change request detail:', error);
            Swal.fire('Error', error.message || 'ไม่สามารถบันทึกข้อมูลได้', 'error');
            return false;
        }
    };

    const handleSaveDetails = async () => {
        setIsSavingDetails(true);
        try {
            await saveDetailChanges({ showSuccess: true });
        } finally {
            setIsSavingDetails(false);
        }
    };

    const handleSaveDetailAndStatus = async () => {
        setIsSavingDetails(true);
        try {
            const saved = await saveDetailChanges({ showSuccess: false });
            if (!saved) return;

            if (selectedActionStatus) {
                await handleItAction();
                return;
            }

            Swal.fire('บันทึกแล้ว', 'อัปเดตข้อมูลคำร้องขอพัฒนาระบบเรียบร้อยแล้ว', 'success');
        } finally {
            setIsSavingDetails(false);
        }
    };

    const getRequestCategoryBadge = (category) => {
        if (!category) return <span className="text-xs text-slate-400">-</span>;
        const tone = category === 'พัฒนาสื่อ'
            ? 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:!border-fuchsia-700/50 dark:!bg-fuchsia-950/55 dark:!text-fuchsia-200'
            : 'border-sky-200 bg-sky-50 text-sky-700 dark:!border-sky-700/50 dark:!bg-sky-950/55 dark:!text-sky-200';
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
                        <table className="w-full min-w-[1180px] table-fixed text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b text-center text-slate-500 text-xs uppercase dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400">
                                    <th className="w-[130px] p-3 whitespace-nowrap text-center">วันที่ / เลขเอกสาร</th>
                                    <th className="w-[130px] p-3 whitespace-nowrap text-center">ประเภทการร้องขอ</th>
                                    <th className="w-[170px] p-3 whitespace-nowrap text-center">ผู้ร้องขอ / แผนก</th>
                                    <th className="w-[270px] p-3 text-center">รายละเอียดการขอ (Requirement)</th>
                                    <th className="w-[145px] p-3 whitespace-nowrap text-center">สถานะ</th>
                                    <th className="w-[300px] p-3 whitespace-nowrap text-center">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/70">
                                {filteredRequests.map((req) => (
                                    <tr key={req.id} className="hover:bg-slate-50 transition-colors dark:hover:bg-slate-900/45">
                                        <td className="p-3 align-top">
                                            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{new Date(req.created_at).toLocaleDateString('th-TH')}</div>
                                            <div className="text-xs text-emerald-600 font-mono mt-1 dark:text-emerald-300">{req.ticket_number}</div>
                                            <div className="text-xs text-slate-400 mt-1 font-bold">{getChangeRequestTypeLabel(req.req_type)}</div>
                                        </td>
                                        <td className="p-3 align-top">
                                            {getRequestCategoryBadge(req.request_category)}
                                        </td>
                                        <td className="p-3 align-top">
                                            <div className="truncate text-sm font-bold text-slate-800 dark:text-slate-100" title={req.requester_name}>{req.requester_name}</div>
                                            <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400" title={req.department}>{req.department}</div>
                                            {req.status === 'Cancelled' && (
                                                <div className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200 text-[11px] font-semibold dark:!border-rose-700/50 dark:!bg-rose-950/55 dark:!text-rose-200">
                                                    <XCircle className="w-3 h-3" />
                                                    ยกเลิกสิทธิ์แล้ว
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-3 align-top">
                                            <p className="text-sm text-slate-700 line-clamp-2 dark:text-slate-300" title={req.details}>{req.details}</p>
                                            <p className="text-xs text-amber-600 border border-amber-200 bg-amber-50 rounded p-1 mt-2 line-clamp-1 truncate dark:!border-amber-700/50 dark:!bg-amber-950/55 dark:!text-amber-200" title={req.reason}>เหตุผล: {req.reason}</p>
                                        </td>
                                        <td className="p-3 align-top">
                                            {getStatusBadge(req.status)}
                                        </td>
                                        <td className="p-3 align-top text-right whitespace-nowrap">
                                            <div className="flex min-w-max items-center justify-end gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => openDetailModal(req)}
                                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sky-600 transition-colors hover:bg-sky-600 hover:text-white dark:text-sky-300 dark:hover:bg-sky-500/20"
                                                title="ดูข้อมูล"
                                                aria-label="ดูข้อมูล"
                                            >
                                                <Eye className="h-4 w-4" />
                                            </button>
                                            {(canEditAllWork || canActOnRequest(req)) && (
                                                <button
                                                    type="button"
                                                    onClick={() => openDetailModal(req, { edit: true })}
                                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-amber-600 transition-colors hover:bg-amber-600 hover:text-white dark:text-amber-300 dark:hover:bg-amber-500/20"
                                                    title="แก้ไขข้อมูล"
                                                    aria-label="แก้ไขข้อมูล"
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </button>
                                            )}
                                            {req.status === 'Pending_User_Acceptance' && (
                                                <button type="button" onClick={() => showAcceptChangeRequestLinkDialog(req)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-indigo-500 transition-colors hover:bg-indigo-50 hover:text-indigo-700 dark:!text-indigo-300 dark:hover:!bg-indigo-950/60 dark:hover:!text-indigo-100" title="สร้างลิงก์เซ็นรับมอบงาน" aria-label="สร้างลิงก์เซ็นรับมอบงาน">
                                                    <Link className="w-4 h-4" />
                                                </button>
                                            )}
                                            {parseAttachments(req.attachments_json).length > 0 && (
                                                <button type="button" onClick={() => showAttachmentsDialog(req)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-emerald-600 transition-colors hover:bg-emerald-600 hover:text-white dark:text-emerald-300 dark:hover:bg-emerald-500/20" title="ดูไฟล์แนบเพิ่มเติม" aria-label="ดูไฟล์แนบเพิ่มเติม">
                                                    <Paperclip className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button type="button" onClick={() => setPreviewRequest(req)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 transition-colors hover:bg-indigo-100 dark:!bg-indigo-950/60 dark:!text-indigo-200 dark:hover:!bg-indigo-900/70" title="ดูเอกสาร" aria-label="ดูเอกสาร">
                                                <Printer className="w-4 h-4" />
                                            </button>
                                            {canDeleteRecord && (
                                                <button onClick={() => handleDelete(req.id)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-rose-500/10 dark:hover:text-rose-200" title="ลบข้อมูล" aria-label="ลบข้อมูล">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                            {(!canDeleteRecord || canEditAllWork) && !['Cancelled', 'Completed', 'Rejected'].includes(req.status) && (
                                                <button onClick={() => handleCancelRequest(req)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-rose-500 transition-colors hover:bg-rose-600 hover:text-white dark:text-rose-300 dark:hover:bg-rose-500/20" title="ตั้งสถานะยกเลิก" aria-label="ตั้งสถานะยกเลิก">
                                                    <XCircle className="w-4 h-4" />
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

            {detailRequest && (
                <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 backdrop-blur-sm sm:items-center sm:p-4">
                    <div className="w-full max-w-4xl max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-3xl border border-slate-100 bg-white p-5 shadow-2xl animate-fade-in dark:border-slate-700 dark:bg-slate-800 sm:p-6">
                        <div className="mb-5 flex items-start justify-between gap-3">
                            <div>
                                <h3 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-white">
                                    {isDetailActionMode ? <Edit className="h-5 w-5 text-sky-600" /> : <Eye className="h-5 w-5 text-slate-500" />}
                                    {isDetailActionMode ? 'แก้ไขข้อมูลคำร้องขอพัฒนา' : 'ดูข้อมูลคำร้องขอพัฒนา'}
                                </h3>
                                <p className="mt-1 text-sm text-slate-500">
                                    แก้ไขเฉพาะข้อมูลคำร้องและผลดำเนินการ โดยไม่แก้ไขลายเซ็น
                                </p>
                            </div>
                            <button onClick={() => { setDetailRequest(null); setIsDetailEditing(false); }} className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-rose-500 dark:hover:bg-slate-700">
                                <XCircle className="h-6 w-6" />
                            </button>
                        </div>

                        <div className="mb-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900/40 sm:grid-cols-3">
                            <div>
                                <div className="text-xs font-bold text-slate-400">สถานะ</div>
                                <div className="mt-1">{getStatusBadge(detailRequest.status)}</div>
                            </div>
                            <div>
                                <div className="text-xs font-bold text-slate-400">วันที่สร้าง</div>
                                <div className="mt-1 font-semibold text-slate-700 dark:text-slate-200">{detailRequest.created_at ? new Date(detailRequest.created_at).toLocaleString('th-TH') : '-'}</div>
                            </div>
                            <div>
                                <div className="text-xs font-bold text-slate-400">อัปเดตล่าสุด</div>
                                <div className="mt-1 font-semibold text-slate-700 dark:text-slate-200">{detailRequest.updated_at ? new Date(detailRequest.updated_at).toLocaleString('th-TH') : '-'}</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">เลขเอกสาร</label>
                                <input className="input-modern w-full" value={detailForm.ticket_number || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('ticket_number', event.target.value)} />
                            </div>
                            <div className="md:col-span-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                                <h4 className="mb-4 flex items-center gap-2 border-b border-slate-200 pb-2 text-lg font-bold text-slate-800 dark:border-slate-700 dark:text-white">
                                    <LayoutGrid className="h-5 w-5 text-emerald-500" />
                                    ความต้องการ
                                </h4>
                                <div className="flex flex-wrap items-center gap-3">
                                    {CHANGE_REQUEST_TYPE_OPTIONS.map((option) => (
                                        <label key={option.value} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 transition-all ${detailForm.req_type === option.value ? 'border-emerald-200 bg-emerald-50 font-medium text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'} ${!canEditDetailRequest ? 'cursor-default opacity-90' : ''}`}>
                                            <input
                                                type="radio"
                                                name="change-detail-req-type"
                                                value={option.value}
                                                checked={detailForm.req_type === option.value}
                                                disabled={!canEditDetailRequest}
                                                onChange={() => handleDetailFormChange('req_type', option.value)}
                                                className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                                            />
                                            <span>{option.label}</span>
                                        </label>
                                    ))}
                                    {detailForm.req_type === 'change' && (
                                        <input className="input-modern min-w-[220px] flex-1" placeholder="ระบุเพิ่มเติม..." value={detailForm.req_type_other || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('req_type_other', event.target.value)} />
                                    )}
                                </div>
                                <div className="mt-5 space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">ประเภทการร้องขอ</label>
                                    <div className="flex flex-wrap gap-3">
                                        {REQUEST_CATEGORY_OPTIONS.map((category) => (
                                            <label key={category} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 transition-all ${detailForm.request_category === category ? 'border-emerald-200 bg-emerald-50 font-medium text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'} ${!canEditDetailRequest ? 'cursor-default opacity-90' : ''}`}>
                                                <input
                                                    type="radio"
                                                    name="change-detail-request-category"
                                                    value={category}
                                                    checked={detailForm.request_category === category}
                                                    disabled={!canEditDetailRequest}
                                                    onChange={() => handleDetailFormChange('request_category', category)}
                                                    className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                                                />
                                                <span>{category}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="md:col-span-2 mt-2 border-b border-slate-100 pb-2 dark:border-slate-700">
                                <h4 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-white">
                                    <User className="h-5 w-5 text-emerald-500" />
                                    ส่วนที่ 1 : ข้อมูลผู้ร้องขอเปลี่ยนแปลงระบบ
                                </h4>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">รหัสพนักงาน</label>
                                <input className="input-modern w-full" value={detailForm.employee_id || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('employee_id', event.target.value)} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">ชื่อผู้ร้องขอ</label>
                                <input className="input-modern w-full" value={detailForm.requester_name || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('requester_name', event.target.value)} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">ตำแหน่งผู้ร้องขอ</label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                                        <Briefcase className="h-4 w-4" />
                                    </span>
                                    <input className="input-modern !pl-10 w-full" value={detailForm.requester_position || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('requester_position', event.target.value)} />
                                </div>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">แผนก</label>
                                <input className="input-modern w-full" value={detailForm.department || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('department', event.target.value)} />
                            </div>
                            <div className="md:col-span-2 mt-2 space-y-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                                <div>
                                    <label className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                                        <FileText className="h-4 w-4 text-emerald-500" />
                                        รายละเอียดของโปรเจ็กต์/ระบบที่ต้องการ
                                    </label>
                                    <textarea className="input-modern min-h-[100px] w-full p-4 text-sm" rows="3" value={detailForm.details || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('details', event.target.value)} />
                                </div>
                                <div>
                                    <label className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                                        <AlertCircle className="h-4 w-4 text-amber-500" />
                                        เหตุผลการขอพัฒนาโปรแกรม
                                    </label>
                                    <textarea className="input-modern min-h-[80px] w-full p-4 text-sm" rows="3" value={detailForm.reason || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('reason', event.target.value)} />
                                </div>
                            </div>
                            <div className="md:col-span-2 mt-2 border-b border-slate-100 pb-2 dark:border-slate-700">
                                <h4 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-white">
                                    <ClipboardPenLine className="h-5 w-5 text-emerald-500" />
                                    ข้อมูลการดำเนินการ
                                </h4>
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">วันที่รับคำร้อง</label>
                                <input type="date" className="input-modern w-full" value={detailForm.it_received_date || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('it_received_date', event.target.value)} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">วันที่เริ่มดำเนินการ</label>
                                <input type="date" className="input-modern w-full" value={detailForm.it_operation_date || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('it_operation_date', event.target.value)} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">วันที่นัดหมายแล้วเสร็จ</label>
                                <input type="date" className="input-modern w-full" value={detailForm.it_target_date || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('it_target_date', event.target.value)} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">ผลอนุมัติ IT Manager</label>
                                <input className="input-modern w-full" value={detailForm.it_approval_status || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('it_approval_status', event.target.value)} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">ชื่อ IT Manager</label>
                                <input className="input-modern w-full" value={detailForm.it_manager_name || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('it_manager_name', event.target.value)} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">ตำแหน่ง IT Manager</label>
                                <input className="input-modern w-full" value={detailForm.it_manager_position || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('it_manager_position', event.target.value)} />
                            </div>
                            <div className="md:col-span-2">
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">เหตุผลไม่อนุมัติ</label>
                                <textarea className="input-modern w-full" rows="2" value={detailForm.it_reject_reason || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('it_reject_reason', event.target.value)} />
                            </div>
                            <div className="md:col-span-2">
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">วิธีแก้ไข/พัฒนา</label>
                                <textarea className="input-modern w-full" rows="3" value={detailForm.it_solution || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('it_solution', event.target.value)} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">ผู้ดำเนินการ</label>
                                <input className="input-modern w-full" value={detailForm.it_staff_name || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('it_staff_name', event.target.value)} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">ตำแหน่งผู้ดำเนินการ</label>
                                <input className="input-modern w-full" value={detailForm.it_staff_position || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('it_staff_position', event.target.value)} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">ผลการรับมอบของผู้แจ้ง</label>
                                <input className="input-modern w-full" value={detailForm.user_acceptance || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('user_acceptance', event.target.value)} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">เหตุผลผู้แจ้งไม่รับมอบ</label>
                                <input className="input-modern w-full" value={detailForm.user_reject_reason || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('user_reject_reason', event.target.value)} />
                            </div>
                            <div className="md:col-span-2">
                                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">เหตุผลยกเลิก</label>
                                <textarea className="input-modern w-full" rows="2" value={detailForm.cancel_reason || ''} disabled={!canEditDetailRequest} onChange={(event) => handleDetailFormChange('cancel_reason', event.target.value)} />
                            </div>
                        </div>

                        {isDetailEditing && canActOnRequest(detailRequest) && getActionStatusOptions(detailRequest.status).length > 0 && (
                            <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
                                <div className="mb-4 flex items-start justify-between gap-3">
                                    <div>
                                        <h4 className="flex items-center gap-2 text-base font-bold text-emerald-800 dark:text-emerald-200">
                                            <ClipboardPenLine className="h-5 w-5" />
                                            บันทึกสถานะ/การดำเนินการ
                                        </h4>
                                        <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-200/80">
                                            ใช้ส่วนนี้แทนหน้าต่างเปลี่ยนสถานะเดิม และไม่แสดงช่องลายเซ็นในหน้าแก้ไข
                                        </p>
                                    </div>
                                    <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-700 shadow-sm dark:bg-emerald-950 dark:text-emerald-200">
                                        {detailRequest.ticket_number || '-'}
                                    </span>
                                </div>

                                <div className="mb-4">
                                    <label className="mb-1 block text-xs font-semibold text-emerald-900 dark:text-emerald-100">สถานะที่ต้องการเปลี่ยน</label>
                                    <Select value={selectedActionStatus} onValueChange={(value) => prepareActionForm(detailRequest, value)}>
                                        <SelectTrigger className="input-modern w-full bg-white dark:bg-slate-900">
                                            <SelectValue placeholder="เลือกสถานะ" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {getActionStatusOptions(detailRequest.status).map((option) => (
                                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {selectedActionStatus === 'Pending_IT_Manager' && actionType === 'it_intake' && (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">วันที่รับคำร้องขอ</label>
                                            <input type="date" className="input-modern w-full text-sm" value={itForm.receivedDate} onChange={e => setItForm({...itForm, receivedDate: e.target.value})} />
                                        </div>
                                        <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-200">
                                            บันทึกวันที่แล้วระบบจะส่งรายการต่อให้ IT Manager ลงนาม
                                        </div>
                                    </div>
                                )}

                                {selectedActionStatus === 'In_Progress' && actionType === 'it_manager' && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            <div>
                                                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">วันที่รับคำร้อง</label>
                                                <input type="date" className="input-modern w-full text-sm" value={itForm.receivedDate} onChange={e => setItForm({...itForm, receivedDate: e.target.value})} />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">วันที่นัดหมายแล้วเสร็จ</label>
                                                <input type="date" className="input-modern w-full text-sm" value={itForm.targetDate} onChange={e => setItForm({...itForm, targetDate: e.target.value})} />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-200">ผลการพิจารณา</label>
                                            <div className="flex flex-wrap gap-4 text-sm">
                                                <label className="flex items-center gap-2"><input type="radio" checked={itStatus === 'Approved'} onChange={() => setItStatus('Approved')} /> อนุมัติ</label>
                                                <label className="flex items-center gap-2"><input type="radio" checked={itStatus === 'Rejected'} onChange={() => setItStatus('Rejected')} /> ไม่อนุมัติ</label>
                                            </div>
                                        </div>
                                        {itStatus === 'Rejected' && (
                                            <textarea className="input-modern w-full p-3 text-sm" placeholder="ระบุสาเหตุที่ไม่อนุมัติ..." value={itForm.reason} onChange={e => setItForm({...itForm, reason: e.target.value})} />
                                        )}
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            <input type="text" className="input-modern" placeholder="ชื่อผู้อนุมัติ" value={itForm.managerName} onChange={e => setItForm({...itForm, managerName: e.target.value})} />
                                            <input type="text" className="input-modern" placeholder="ตำแหน่ง" value={itForm.managerPosition} onChange={e => setItForm({...itForm, managerPosition: e.target.value})} />
                                        </div>
                                    </div>
                                )}

                                {selectedActionStatus === 'In_Development' && actionType === 'it_schedule' && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            <div>
                                                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">วันที่ดำเนินการ</label>
                                                <input type="date" className="input-modern w-full text-sm" value={itForm.operationDate} onChange={e => setItForm({...itForm, operationDate: e.target.value})} />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">วันที่นัดหมายแล้วเสร็จ</label>
                                                <input type="date" className="input-modern w-full text-sm" value={itForm.targetDate} onChange={e => setItForm({...itForm, targetDate: e.target.value})} />
                                            </div>
                                        </div>
                                        <div className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs text-sky-700 dark:border-sky-800 dark:bg-slate-900 dark:text-sky-200">
                                            บันทึกวันที่แล้วระบบจะเปลี่ยนสถานะเป็นกำลังดำเนินการ
                                        </div>
                                    </div>
                                )}

                                {selectedActionStatus === 'Pending_User_Acceptance' && actionType === 'it_staff' && (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">วิธีแก้ไข/พัฒนา (Solution)</label>
                                            <textarea className="input-modern min-h-[100px] w-full p-3 text-sm" placeholder="ระบุวิธีแก้ไขหรือรายละเอียดที่ดำเนินการ..." value={itForm.solution} onChange={e => setItForm({...itForm, solution: e.target.value})} />
                                        </div>
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            <input type="text" className="input-modern" placeholder="ชื่อผู้ดำเนินการ" value={itForm.staffName} onChange={e => setItForm({...itForm, staffName: e.target.value})} />
                                            <input type="text" className="input-modern" placeholder="ตำแหน่ง" value={itForm.staffPosition} onChange={e => setItForm({...itForm, staffPosition: e.target.value})} />
                                        </div>
                                        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                                            <label className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                                                <Paperclip className="h-4 w-4 text-emerald-500" />
                                                ไฟล์แนบเพิ่มเติม <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
                                            </label>
                                            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 hover:border-emerald-300 hover:text-emerald-600 dark:border-slate-700 dark:bg-slate-950">
                                                <Paperclip className="h-4 w-4" />
                                                เลือกไฟล์
                                                <input type="file" multiple accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip" className="hidden" onChange={handleActionFileChange} />
                                            </label>
                                            {actionFiles.length > 0 && (
                                                <div className="mt-3 space-y-2">
                                                    {actionFiles.map((file) => (
                                                        <div key={file.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800">
                                                            <span className="min-w-0 truncate font-semibold text-slate-700 dark:text-slate-200">{file.name}</span>
                                                            <button type="button" onClick={() => removeActionFile(file.id)} className="shrink-0 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:!bg-rose-950/55 dark:hover:!text-rose-200" title="ลบไฟล์แนบ" aria-label="ลบไฟล์แนบ">
                                                                <X className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                            </div>
                        )}

                        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button onClick={() => { setDetailRequest(null); setIsDetailEditing(false); }} className="rounded-xl bg-slate-100 px-5 py-2.5 font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600">ปิด</button>
                            {isDetailEditing && (canEditDetailRequest || canActOnRequest(detailRequest)) && (
                                <button
                                    onClick={handleSaveDetailAndStatus}
                                    disabled={isSavingDetails || (!canEditDetailRequest && canActOnRequest(detailRequest) && !selectedActionStatus)}
                                    className="rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white shadow-md transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isSavingDetails
                                        ? 'กำลังบันทึก...'
                                        : selectedActionStatus
                                            ? 'บันทึกข้อมูลและสถานะ'
                                            : 'บันทึกข้อมูล'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {isActionModalOpen && selectedRequest && (
                <div className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center overflow-y-auto p-3 sm:p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl p-5 sm:p-6 w-full max-w-lg shadow-2xl animate-fade-in border overflow-y-auto max-h-[calc(100dvh-1.5rem)] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                <ClipboardPenLine className="w-6 h-6 text-emerald-500"/>
                                {getActionModalTitle()}
                            </h3>
                            <button onClick={() => { setIsActionModalOpen(false); setSelectedActionStatus(''); setActionFiles([]); }} className="text-slate-400 hover:text-rose-500"><XCircle className="w-6 h-6" /></button>
                        </div>
                        
                        <div className="bg-slate-50 p-3 rounded-lg text-sm mb-4 border border-slate-200 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
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
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:!border-emerald-700/50 dark:!bg-emerald-950/55 dark:!text-emerald-200">
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
                                <div className="border shadow-inner bg-slate-50 h-32 relative rounded-xl overflow-hidden dark:border-slate-700 dark:bg-slate-900">
                                     <SignatureCanvas ref={itManagerSignatureRef} canvasProps={{ className: 'w-full h-full xl-signature' }} />
                                     <div className="absolute top-2 right-2 text-xs text-red-500 cursor-pointer dark:text-rose-300" onClick={() => itManagerSignatureRef.current.clear()}>ล้าง</div>
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
                                <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700 dark:!border-sky-700/50 dark:!bg-sky-950/55 dark:!text-sky-200">
                                    บันทึกวันที่แล้วระบบจะเปลี่ยนสถานะเป็นกำลังดำเนินการ
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
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
                                    ลงวันที่: {new Date().toLocaleDateString('th-TH')}
                                </div>
                                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
                                    <label className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                                        <Paperclip className="h-4 w-4 text-emerald-500" />
                                        ไฟล์แนบเพิ่มเติม <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
                                    </label>
                                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 hover:border-emerald-300 hover:text-emerald-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-emerald-700 dark:hover:text-emerald-200">
                                        <Paperclip className="h-4 w-4" />
                                        เลือกไฟล์
                                        <input type="file" multiple accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip" className="hidden" onChange={handleActionFileChange} />
                                    </label>
                                    {actionFiles.length > 0 && (
                                        <div className="mt-3 space-y-2">
                                            {actionFiles.map((file) => (
                                                <div key={file.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs dark:bg-slate-800">
                                                    <span className="min-w-0 truncate font-semibold text-slate-700 dark:text-slate-200">{file.name}</span>
                                                    <button type="button" onClick={() => removeActionFile(file.id)} className="shrink-0 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:!bg-rose-950/55 dark:hover:!text-rose-200" title="ลบไฟล์แนบ" aria-label="ลบไฟล์แนบ">
                                                        <X className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="border shadow-inner bg-slate-50 h-32 relative rounded-xl overflow-hidden dark:border-slate-700 dark:bg-slate-900">
                                     <SignatureCanvas ref={staffSignatureRef} canvasProps={{ className: 'w-full h-full xl-signature' }} />
                                     <div className="absolute top-2 right-2 text-xs text-red-500 cursor-pointer dark:text-rose-300" onClick={() => staffSignatureRef.current.clear()}>ล้าง</div>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-3 mt-6">
                            <button onClick={() => { setIsActionModalOpen(false); setSelectedActionStatus(''); setActionFiles([]); }} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 font-bold rounded-xl text-slate-700 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600">ยกเลิก</button>
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
                        itStaffName: previewRequest.it_staff_name || '',
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
