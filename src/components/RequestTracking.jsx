import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Search } from 'lucide-react';
import Swal from 'sweetalert2';
import { mysql } from '../mysqlClient';
import { buildManagerApprovalLink, copyText } from '../utils/closeIssueLink';
import { getStatusBadgeClass } from '../utils/statusStyles';

const STATUS_LABELS = {
    Pending_Manager: 'ผู้จัดการของผู้แจ้ง',
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
    Cancelled: 'ยกเลิก',
};

const statusBadgeClass = (status) => {
    return getStatusBadgeClass(status);
};

const ACCESS_TRACKING_LIST_COLUMNS = [
    'id',
    'ticket_number',
    'name_th',
    'department',
    'request_details',
    'other_system_details',
    'status',
    'created_at',
].join(',');

const CHANGE_TRACKING_LIST_COLUMNS = [
    'id',
    'ticket_number',
    'requester_name',
    'department',
    'details',
    'status',
    'created_at',
].join(',');

const RequestTracking = ({ initialType = 'access' }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [requests, setRequests] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchRequests = async () => {
            setIsLoading(true);
            const [accessResult, changeResult] = await Promise.all([
                mysql.from('access_requests').select(ACCESS_TRACKING_LIST_COLUMNS).order('created_at', { ascending: false }),
                mysql.from('change_requests').select(CHANGE_TRACKING_LIST_COLUMNS).order('created_at', { ascending: false }),
            ]);

            const accessRequests = (accessResult.data || []).map((request) => ({
                id: `access-${request.id}`,
                rawId: request.id,
                type: 'access',
                ticketNumber: request.ticket_number,
                requester: request.name_th,
                department: request.department,
                details: request.request_details || request.other_system_details || '',
                status: request.status,
                createdAt: request.created_at,
            }));
            const changeRequests = (changeResult.data || []).map((request) => ({
                id: `change-${request.id}`,
                rawId: request.id,
                type: 'change',
                ticketNumber: request.ticket_number,
                requester: request.requester_name,
                department: request.department,
                details: request.details || '',
                status: request.status,
                createdAt: request.created_at,
            }));
            setRequests([...accessRequests, ...changeRequests]);
            setIsLoading(false);
        };

        fetchRequests();
    }, []);

    const filteredRequests = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        return requests
            .filter((request) => request.type === initialType)
            .filter((request) => !keyword || [
                request.ticketNumber,
                request.requester,
                request.department,
                request.details,
                request.status,
            ].filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword)))
            .slice(0, 10);
    }, [initialType, requests, searchTerm]);

    const handleCopyManagerLink = async (request) => {
        await copyText(buildManagerApprovalLink(request.rawId, request.type));
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: 'คัดลอกลิงก์แล้ว',
            showConfirmButton: false,
            timer: 1800,
        });
    };

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <div className="glass-card rounded-3xl p-5 sm:p-7">
                <h2 className="text-2xl font-bold text-indigo-950 dark:text-indigo-100">
                    {initialType === 'change' ? 'ติดตามสถานะขอพัฒนา' : 'ติดตามสถานะขอสิทธิ์'}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">ค้นหาและตรวจสอบสถานะล่าสุดของคำร้อง</p>
                <div className="relative mt-4">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input type="text" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="input-modern w-full !pl-9" placeholder="ค้นหาจากเลขเอกสาร, ชื่อ, แผนก หรือรายละเอียด" />
                </div>
            </div>

            {isLoading ? (
                <div className="glass-card rounded-2xl p-10 text-center text-slate-500">กำลังโหลดข้อมูล...</div>
            ) : filteredRequests.length === 0 ? (
                <div className="glass-card rounded-2xl p-10 text-center text-slate-400">ไม่พบรายการคำร้อง</div>
            ) : (
                <div className="space-y-3">
                    {filteredRequests.map((request) => (
                        <div key={request.id} className="glass-card flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center">
                            <div className="shrink-0">
                                <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{request.ticketNumber || '-'}</div>
                                <div className="mt-1 text-xs text-slate-400">{new Date(request.createdAt).toLocaleDateString('th-TH')}</div>
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{request.requester || '-'}</p>
                                <p className="mt-0.5 text-xs text-slate-500">{request.department || '-'}</p>
                                <p className="mt-1 truncate text-xs text-slate-500">{request.details || '-'}</p>
                            </div>
                            <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(request.status)}`}>
                                    {STATUS_LABELS[request.status] || request.status || '-'}
                                </span>
                                {request.status === 'Pending_Manager' && (
                                    <button
                                        type="button"
                                        onClick={() => handleCopyManagerLink(request)}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-600 hover:text-white dark:border-indigo-700/40 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
                                        title="คัดลอกลิงก์ให้ผู้จัดการเซ็น"
                                    >
                                        <Copy className="h-3.5 w-3.5" />
                                        คัดลอกลิงก์เซ็น
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default RequestTracking;
