import React, { useMemo, useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import SignatureCanvas from 'react-signature-canvas';
import { Clock, Edit, CheckCircle2, FileSpreadsheet, Trash2, Search, Filter, AlertTriangle, Eye, Printer, FileSignature, MessageSquare, Monitor, ChevronDown, X, XCircle, Copy, ChevronLeft, ChevronRight, Settings, Save, ImagePlus, Paperclip, Link2, Ticket, Eraser } from 'lucide-react';
import { showCloseIssueLinkDialog } from '../utils/closeIssueLink';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Combobox } from './ui/combobox';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import PdfPreviewModal from './PdfPreviewModal';
import MaintenanceReportPdfPreview from './MaintenanceReportPdfPreview';
import Swal from 'sweetalert2';
import { mysql, API_URL } from '../mysqlClient';
import { ISSUE_CATEGORIES } from '../config/issueOptions';
import { canDeleteRecords } from '../config/roles';

const ITEMS_PER_PAGE = 10;
const STATUS_FLOW = ['Pending', 'In Progress', 'External Repair', 'Waiting for Parts', 'Resolved', 'Closed', 'Cancelled'];
const ASSIGNABLE_STATUSES = ['In Progress', 'External Repair', 'Waiting for Parts', 'Resolved'];

const isIssueClosed = (issue) => issue?.status === 'Closed' || Boolean(issue?.userCloseSign || issue?.userClosedAt);

const toDateTimeLocalValue = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = number => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const resolveAttachmentUrl = (url) => {
    if (!url) return '';
    if (/^(data:|blob:|https?:\/\/)/i.test(url)) return url;
    return `${API_URL}${url}`;
};

const getStatusLabel = (status) => {
    switch (status) {
        case 'Pending': return 'รอดำเนินการ';
        case 'In Progress': return 'กำลังแก้ไข';
        case 'Resolved': return 'เสร็จสิ้น';
        case 'Closed': return 'ปิดจบ';
        case 'External Repair': return 'ส่งซ่อมภายนอก';
        case 'Waiting for Parts': return 'รออะไหล่';
        case 'Cancelled': return 'ยกเลิก';
        default: return status || '-';
    }
};

const getAllowedStatusOptions = (currentStatus) => {
    const startIndex = Math.max(0, STATUS_FLOW.indexOf(currentStatus));
    const options = startIndex >= 0 ? STATUS_FLOW.slice(startIndex) : [currentStatus].filter(Boolean);
    return Array.from(new Set(options));
};

const DEPARTMENTS = [
    'แอดมิน', 'บุคคลและธุรการ', 'วิศวกรรม', 'การตลาดและขาย (ในประเทศ)',
    'การตลาดและขาย (ต่างประเทศ)', 'แอดมินการตลาด', 'บัญชี', 'การเงิน',
    'จัดซื้อ', 'เทคโนโลยีสารสนเทศ และ ERP', 'วางแผน', 'ฝ่ายผลิต',
    'ตรวจสอบคุณภาพ', 'ควบคุมคุณภาพ', 'บริหารระบบ และ จป.', 'ออกแบบ',
    'วิจัยและพัฒนาผลิตภัณฑ์', 'คลังพัสดุและจัดส่ง', 'ตรวจสอบ', 'ซ่อมบำรุง',
    'สำนักกรรมการ', 'อื่นๆ'
];

const IssueDashboard = ({ issues, currentAdmin, updateIssueStatus, updateIssueRepairDetails, updateIssueFullDetails, deleteIssue, isLoading }) => {
    // Filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('All');
    const [filterCategory, setFilterCategory] = useState('All');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [filterAdmin, setFilterAdmin] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    // Modal state for repair details
    const [isRepairModalOpen, setIsRepairModalOpen] = useState(false);
    const [currentRepairIssue, setCurrentRepairIssue] = useState(null);
    const [editFormData, setEditFormData] = useState({
        name: '',
        department: '',
        category: '',
        severity: '',
        description: '',
        repairDetails: '',
        status: '',
        assetId: '',
        assetName: '',
        assetType: '',
        assetLocation: '',
        operationStartedAt: '',
        budget: '',
        inspectorName: '',
        inspectorPosition: '',
        inspectorSign: '',
        inspectorSignedAt: ''
    });
    const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
    const [currentPdfIssue, setCurrentPdfIssue] = useState(null);
    const [isMaintenanceReportOpen, setIsMaintenanceReportOpen] = useState(false);
    const [currentMaintenanceIssue, setCurrentMaintenanceIssue] = useState(null);

    // Asset and User states (for Edit Modal)
    const [computers, setComputers] = useState([]);
    const [glpiUsers, setGlpiUsers] = useState([]);
    const [glpiUsersRaw, setGlpiUsersRaw] = useState([]);
    const [isLoadingAssets, setIsLoadingAssets] = useState(false);
    const [assetError, setAssetError] = useState(false);
    const [assetSearchTerm, setAssetSearchTerm] = useState('');
    const [isAssetDropdownOpen, setIsAssetDropdownOpen] = useState(false);
    const inspectorSignatureRef = useRef(null);
    const canDeleteRecord = canDeleteRecords(currentAdmin?.role);
    const isRepairReadOnly = isIssueClosed(currentRepairIssue);
    
    // For read more modal
    const [readMoreIssue, setReadMoreIssue] = useState(null);

    // For image preview
    const [previewImage, setPreviewImage] = useState(null);

    useEffect(() => {
        const fetchAssets = async () => {
            setIsLoadingAssets(true);
            try {
                const { data, error } = await mysql
                    .from('assets')
                    .select('glpi_id, name, serial, otherserial, users_id, computermodels_id, computertypes_id, locations_id')
                    .order('name');
                if (error) throw error;
                setComputers((data || []).map(c => ({ ...c, id: c.glpi_id })));
            } catch {
                setAssetError(true);
            } finally {
                setIsLoadingAssets(false);
            }
        };

        const fetchUsers = async () => {
            try {
                const { data, error } = await mysql.from('glpi_users').select('*');
                if (error) throw error;
                setGlpiUsersRaw(data || []);
            } catch (error) {
                console.error("Failed to load users from MySQL:", error);
                setGlpiUsersRaw([]);
            }
        };

        fetchAssets();
        fetchUsers();
    }, []);

    useEffect(() => {
        if (isRepairModalOpen) {
            inspectorSignatureRef.current?.clear();
        }
    }, [isRepairModalOpen, currentRepairIssue?.id]);

    useEffect(() => {
        if (!isRepairModalOpen) return;
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.body.classList.add('repair-modal-open');
        return () => {
            document.body.style.overflow = originalOverflow;
            document.body.classList.remove('repair-modal-open');
        };
    }, [isRepairModalOpen]);

    useEffect(() => {
        if (glpiUsersRaw.length === 0) return;
        const assetUserIds = new Set(computers.map(c => c.users_id).filter(Boolean));
        const usersWithComputers = glpiUsersRaw.filter(u => assetUserIds.has(u.name));
        const uniqueSortedUsers = Array.from(new Set(usersWithComputers.map(u => u.formattedName || u.name))).sort();
        setGlpiUsers(uniqueSortedUsers);
    }, [glpiUsersRaw, computers]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (!e.target.closest('.asset-dropdown-container-edit')) {
                setIsAssetDropdownOpen(false);
                if (editFormData.assetName) {
                    setAssetSearchTerm(editFormData.assetName);
                } else if (!editFormData.assetId) {
                    setAssetSearchTerm('');
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [editFormData.assetName, editFormData.assetId]);

    const filteredAssets = computers.filter(c => {
        const search = assetSearchTerm.toLowerCase();
        return (c.name || '').toLowerCase().includes(search) ||
            (c.serial || '').toLowerCase().includes(search) ||
            (c.users_id || '').toLowerCase().includes(search);
    });
    // Stats summary
    const statsData = useMemo(() => ({
        pending: issues.filter(i => i.status === 'Pending').length,
        inProgress: issues.filter(i => i.status === 'In Progress').length,
        resolved: issues.filter(i => i.status === 'Resolved').length,
        mostUrgent: issues.filter(i => i.severity === 'Most Urgent').length,
    }), [issues]);

    // Function to process data for the pie chart
    const statusData = useMemo(() => {
        const counts = { 'Pending': 0, 'In Progress': 0, 'Resolved': 0, 'Closed': 0, 'External Repair': 0, 'Waiting for Parts': 0, 'Cancelled': 0 };
        issues.forEach(issue => {
            if (counts[issue.status] !== undefined) counts[issue.status]++;
        });
        return [
            { name: 'รอดำเนินการ (Pending)', value: counts['Pending'], color: '#f59e0b' }, // Amber
            { name: 'กำลังแก้ไข (In Progress)', value: counts['In Progress'], color: '#3b82f6' }, // Blue
            { name: 'เสร็จสิ้น (Resolved)', value: counts['Resolved'], color: '#10b981' }, // Emerald
            { name: 'ปิดจบ (Closed)', value: counts['Closed'], color: '#059669' },
            { name: 'ส่งซ่อมภายนอก', value: counts['External Repair'], color: '#8b5cf6' }, // Violet
            { name: 'รออะไหล่', value: counts['Waiting for Parts'], color: '#ec4899' }, // Pink
            { name: 'ยกเลิก', value: counts['Cancelled'], color: '#64748b' } // Slate
        ].filter(item => item.value > 0);
    }, [issues]);

    // Function to process data for the bar chart
    const categoryData = useMemo(() => {
        const counts = {};
        issues.forEach(issue => {
            counts[issue.category] = (counts[issue.category] || 0) + 1;
        });
        return Object.keys(counts).map(key => ({
            name: key,
            value: counts[key]
        })).sort((a, b) => b.value - a.value);
    }, [issues]);

    const exportToExcel = () => {
        if (!filteredIssues || filteredIssues.length === 0) return;

        // Format data for Excel
        const dataForExport = filteredIssues.map(issue => ({
            'รหัสอ้างอิง (ID)': issue.id,
            'วันที่แจ้ง (Date)': formatDate(issue.createdAt),
            'ผู้แจ้ง (Name)': issue.name,
            'แผนก (Department)': issue.department,
            'อุปกรณ์ (Asset)': issue.assetName || '-',
            'ประเภทอุปกรณ์ (Asset Type)': issue.assetType || '-',
            'สถานที่ติดตั้ง (Location)': issue.assetLocation || '-',
            'หมวดหมู่ (Category)': issue.category,
            'ความรุนแรง (Severity)': issue.severity,
            'รายละเอียด (Description)': issue.description,
            'สถานะ (Status)': issue.status,
            'ผู้รับงาน (Admin)': issue.assignedAdmin || '-',
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataForExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Issues Report");
        XLSX.writeFile(workbook, `IT_Helpdesk_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterStatus, filterCategory, filterDateFrom, filterDateTo, filterAdmin]);

    // Derived filtered issues based on search and filters
    const filteredIssues = useMemo(() => {
        if (!issues) return [];
        return issues.filter(issue => {
            const matchSearch = issue.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                issue.name?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchStatus = filterStatus === 'All' || issue.status === filterStatus;
            const matchCategory = filterCategory === 'All' || issue.category === filterCategory;

            const issueDate = issue.createdAt ? new Date(issue.createdAt) : null;
            const matchDateFrom = !filterDateFrom || (issueDate && issueDate >= new Date(filterDateFrom));
            const matchDateTo = !filterDateTo || (issueDate && issueDate <= new Date(filterDateTo + 'T23:59:59'));

            const matchAdmin = !filterAdmin ||
                (issue.assignedAdmin?.toLowerCase().includes(filterAdmin.toLowerCase()));

            return matchSearch && matchStatus && matchCategory && matchDateFrom && matchDateTo && matchAdmin;
        });
    }, [issues, searchTerm, filterStatus, filterCategory, filterDateFrom, filterDateTo, filterAdmin]);

    // Pagination
    const totalPages = Math.ceil(filteredIssues.length / ITEMS_PER_PAGE);
    const paginatedIssues = filteredIssues.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    // Handlers for Repair Details Modal
    const openRepairModal = (issue) => {
        setCurrentRepairIssue(issue);
        setEditFormData({
            name: issue.name || '',
            department: issue.department || '',
            category: issue.category || '',
            severity: issue.severity || '',
            description: issue.description || '',
            repairDetails: issue.repairDetails || '',
            status: issue.status || 'Pending',
            assetId: issue.assetId || '',
            assetName: issue.assetName || '',
            assetType: issue.assetType || '',
            assetLocation: issue.assetLocation || '',
            operationStartedAt: toDateTimeLocalValue(issue.operationStartedAt),
            budget: issue.budget ?? '',
            inspectorName: issue.inspectorName || currentAdmin?.name || '',
            inspectorPosition: issue.inspectorPosition || '',
            inspectorSign: issue.inspectorSign || '',
            inspectorSignedAt: issue.inspectorSignedAt || ''
        });
        setAssetSearchTerm(issue.assetName || issue.assetId || '');
        setIsRepairModalOpen(true);
    };

    const handleEditFormChange = (e) => {
        const { name, value } = e.target;
        if (name === 'name') {
            const newValue = value;
            if (newValue.trim() === '') {
                setEditFormData(prev => ({ ...prev, name: '', assetId: '', assetName: '', assetType: '', assetLocation: '' }));
                setAssetSearchTerm('');
                return;
            }

            const normalize = (str) => (str || '').toLowerCase().replace(/\s+/g, '');
            const normalizedInput = normalize(newValue);

            const matchedUserObj = glpiUsersRaw.find(u => 
                normalize(u.formattedName) === normalizedInput || 
                normalize(u.name) === normalizedInput ||
                (u.formattedName && u.formattedName.toLowerCase().includes(newValue.toLowerCase()))
            );
            
            const adUsername = matchedUserObj ? matchedUserObj.name : newValue;
            const userComputers = computers.filter(c => normalize(c.users_id) === normalize(adUsername));
            
            setEditFormData(prev => {
                const newState = { ...prev, [name]: newValue };
                
                if (userComputers.length === 1) {
                    const pc = userComputers[0];
                    if (prev.assetId !== String(pc.id)) {
                        newState.assetId = String(pc.id);
                        newState.assetName = pc.name;
                        newState.assetType = pc.computertypes_id || pc.computermodels_id || '';
                        newState.assetLocation = pc.locations_id || '';
                        setAssetSearchTerm(pc.name);
                    }
                } else if (userComputers.length > 1) {
                    if (!prev.assetId || !userComputers.find(c => String(c.id) === prev.assetId)) {
                        newState.assetId = ''; 
                        newState.assetName = '';
                        newState.assetType = '';
                        newState.assetLocation = '';
                        setAssetSearchTerm(adUsername);
                        setIsAssetDropdownOpen(true);
                    }
                } else if (prev.assetId) {
                    const currentAsset = computers.find(c => String(c.id) === prev.assetId);
                    if (currentAsset && normalize(currentAsset.users_id) !== normalize(adUsername)) {
                        if(normalize(currentAsset.users_id) !== normalizedInput) {
                            newState.assetId = '';
                            newState.assetName = '';
                            newState.assetType = '';
                            newState.assetLocation = '';
                            setAssetSearchTerm('');
                        }
                    }
                }
                return newState;
            });
        } else {
            setEditFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSaveRepairDetails = async () => {
        if (!currentRepairIssue) return;

        const allowedStatuses = getAllowedStatusOptions(currentRepairIssue.status);
        if (editFormData.status && !allowedStatuses.includes(editFormData.status)) {
            Swal.fire({
                icon: 'warning',
                title: 'สถานะย้อนกลับไม่ได้',
                text: 'กรุณาเลือกสถานะที่เป็นขั้นถัดไปหรือสถานะปัจจุบันเท่านั้น',
                confirmButtonColor: '#4f46e5'
            });
            return;
        }

        const { status, ...fieldsToSave } = editFormData;
        const activeAdminName = (currentAdmin?.name || currentAdmin?.username || '').trim();
        const shouldAssignCurrentAdmin =
            Boolean(activeAdminName) &&
            !currentRepairIssue.assignedAdmin &&
            ASSIGNABLE_STATUSES.includes(status);
        if (shouldAssignCurrentAdmin) {
            fieldsToSave.assignedAdmin = activeAdminName;
        }
        if (status === 'Resolved') {
            const inspectorName = (fieldsToSave.inspectorName || currentAdmin?.name || '').trim();
            const hasNewInspectorSignature = inspectorSignatureRef.current && !inspectorSignatureRef.current.isEmpty();
            const inspectorSign = hasNewInspectorSignature
                ? inspectorSignatureRef.current.getCanvas().toDataURL('image/png')
                : fieldsToSave.inspectorSign;

            if (!inspectorName || !fieldsToSave.inspectorPosition.trim() || !inspectorSign) {
                Swal.fire('ข้อมูลผู้ตรวจสอบไม่ครบ', 'กรุณาระบุชื่อ ตำแหน่ง และลายเซ็นผู้ตรวจสอบก่อนเปลี่ยนสถานะเป็นเสร็จสิ้น', 'warning');
                return;
            }

            fieldsToSave.inspectorName = inspectorName;
            fieldsToSave.inspectorSign = inspectorSign;
            if (hasNewInspectorSignature) {
                fieldsToSave.inspectorSignedAt = new Date().toISOString();
            }
        }
        const didSaveDetails = await updateIssueFullDetails(currentRepairIssue.id, fieldsToSave);
        if (didSaveDetails === false) return;

        if (editFormData.status && editFormData.status !== currentRepairIssue.status) {
            const adminName = shouldAssignCurrentAdmin ? activeAdminName : null;
            const didSaveStatus = await updateIssueStatus(currentRepairIssue.id, editFormData.status, adminName);
            if (didSaveStatus === false) return;
        }

        setIsRepairModalOpen(false);
        setCurrentRepairIssue(null);
    };

    const handleDelete = (id) => {
        Swal.fire({
            title: 'ยืนยันการลบเอกสาร?',
            text: "คุณต้องการลบรายการแจ้งซ่อมนี้ใช่หรือไม่? การกระทำนี้ไม่สามารถกู้คืนได้",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'ใช่, ลบเลย',
            cancelButtonText: 'ยกเลิก',
            reverseButtons: true
        }).then((result) => {
            if (result.isConfirmed) {
                deleteIssue(id);
                Swal.fire({
                    title: 'ลบสำเร็จ!',
                    text: 'เอกสารของคุณถูกลบออกจากระบบแล้ว',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });
            }
        });
    };

    const handleCancelIssue = async (issue) => {
        if (!issue || issue.status === 'Cancelled') return;
        const result = await Swal.fire({
            title: 'ยืนยันการยกเลิกรายการ?',
            text: 'ระบบจะเปลี่ยนสถานะรายการนี้เป็นยกเลิก โดยไม่ลบข้อมูลออกจากระบบ',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#e11d48',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'ยืนยันยกเลิก',
            cancelButtonText: 'ปิด',
            reverseButtons: true
        });
        if (!result.isConfirmed) return;
        await updateIssueStatus(issue.id, 'Cancelled');
    };

    const handleOpenPdfPreview = (issue) => {
        setCurrentPdfIssue(issue);
        setIsPdfModalOpen(true);
    };

    const handleOpenMaintenanceReport = (issue) => {
        setCurrentMaintenanceIssue(issue);
        setIsMaintenanceReportOpen(true);
    };

    const allowedStatusOptions = currentRepairIssue ? getAllowedStatusOptions(currentRepairIssue.status) : [];
    const repairCategoryOptions = useMemo(() => {
        const currentCategory = editFormData.category || currentRepairIssue?.category;
        if (currentCategory && !ISSUE_CATEGORIES.includes(currentCategory)) {
            return [currentCategory, ...ISSUE_CATEGORIES];
        }
        return ISSUE_CATEGORIES;
    }, [editFormData.category, currentRepairIssue?.category]);

    const getSeverityText = (severity) => {
        switch (severity) {
            case 'Most Urgent': return 'ด่วนที่สุด';
            case 'Urgent': return 'ด่วน';
            default: return 'ปกติ';
        }
    };

    const getPdfStatusText = (status) => {
        switch (status) {
            case 'Pending': return 'รอดำเนินการ';
            case 'In Progress': return 'กำลังแก้ไข';
            case 'Resolved': return 'เสร็จสิ้น';
            case 'Closed': return 'ปิดจบ';
            case 'External Repair': return 'ส่งซ่อมภายนอก';
            case 'Waiting for Parts': return 'รออะไหล่';
            case 'Cancelled': return 'ยกเลิก';
            default: return status || '-';
        }
    };

    // PDF function removed at user request


    // Empty state is handled inside the table body now.
    const getStatusBadge = (status, isClosed = false) => {
        if (isClosed) {
            return <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100/80 text-emerald-700 border border-emerald-200/50"><CheckCircle2 className="w-3 h-3 mr-1.5" /> ปิดจบ</span>;
        }
        switch (status) {
            case 'Pending':
                return <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100/80 text-amber-700 border border-amber-200/50"><Clock className="w-3 h-3 mr-1.5" /> รอดำเนินการ</span>;
            case 'In Progress':
                return <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100/80 text-indigo-700 border border-indigo-200/50"><Edit className="w-3 h-3 mr-1.5" /> กำลังแก้ไข</span>;
            case 'Resolved':
                return <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100/80 text-emerald-700 border border-emerald-200/50"><CheckCircle2 className="w-3 h-3 mr-1.5" /> เสร็จสิ้น</span>;
            case 'External Repair':
                return <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-violet-100/80 text-violet-700 border border-violet-200/50"><AlertTriangle className="w-3 h-3 mr-1.5" /> ส่งซ่อมภายนอก</span>;
            case 'Waiting for Parts':
                return <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-pink-100/80 text-pink-700 border border-pink-200/50"><Clock className="w-3 h-3 mr-1.5" /> รออะไหล่</span>;
            case 'Cancelled':
                return <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-100/80 text-slate-700 border border-slate-200/50"><X className="w-3 h-3 mr-1.5" /> ยกเลิก</span>;
            default:
                return <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-100/80 text-slate-700 border border-slate-200/50">{getStatusLabel(status)}</span>;
        }
    };

    const getSeverityBadge = (severity) => {
        switch (severity) {
            case 'Most Urgent': return <span className="text-red-600 font-medium">ด่วนที่สุด</span>;
            case 'Urgent': return <span className="text-orange-500 font-medium">ด่วน</span>;
            default: return <span className="text-slate-500">ปกติ</span>;
        }
    }

    const formatDate = (dateString) => {
        const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        return new Date(dateString).toLocaleDateString('th-TH', options);
    };

    const displayValue = (value) => {
        if (value === null || value === undefined || value === '') return '-';
        return value;
    };

    const displayDate = (value) => {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return formatDate(value);
    };

    const displayBudget = (value) => {
        if (value === null || value === undefined || value === '') return '-';
        const amount = Number(value);
        if (Number.isNaN(amount)) return value;
        return `${amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
    };

    const DetailItem = ({ label, value, full = false }) => (
        <div className={`min-w-0 border-b border-slate-100 py-3 last:border-b-0 dark:border-slate-700/60 ${full ? 'sm:col-span-2' : ''}`}>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</div>
            <div className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-slate-800 dark:text-slate-100">{displayValue(value)}</div>
        </div>
    );

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="glass-card rounded-3xl p-5 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-rose-100 p-2.5 text-rose-600 dark:bg-rose-900/50 dark:text-rose-300">
                        <Ticket className="h-6 w-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">รายการแจ้งซ่อม</h2>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">ติดตามและจัดการงานแจ้งซ่อมทั้งหมด</p>
                    </div>
                </div>
            </div>

            {/* Stats Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 xl:gap-4">
                <div className="glass-card rounded-2xl p-4 flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                        <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-slate-800 dark:text-white">{statsData.pending}</p>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">รอดำเนินการ</p>
                    </div>
                </div>
                <div className="glass-card rounded-2xl p-4 flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
                        <Edit className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-slate-800 dark:text-white">{statsData.inProgress}</p>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">กำลังแก้ไข</p>
                    </div>
                </div>
                <div className="glass-card rounded-2xl p-4 flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-slate-800 dark:text-white">{statsData.resolved}</p>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">เสร็จสิ้น</p>
                    </div>
                </div>
                <div className="glass-card rounded-2xl p-4 flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-slate-800 dark:text-white">{statsData.mostUrgent}</p>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">ด่วนที่สุด</p>
                    </div>
                </div>
            </div>


            {/* Filter and Search Bar section */}
            <div className="glass-card p-4 sm:p-5 rounded-2xl flex flex-col gap-4 items-start shadow-md shadow-indigo-100/30">
                <div className="w-full relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="ค้นหาจากเลขที่เอกสาร หรือ ชื่อผู้แจ้ง..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="!pl-10 w-full input-modern"
                    />
                </div>

                <div className="flex w-full flex-wrap items-center gap-2.5 sm:gap-3">
                    <div className="flex items-center gap-1.5 mr-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                        <Filter className="w-4 h-4" /> <span className="hidden sm:inline">ตัวกรอง:</span>
                    </div>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger className="flex-1 sm:flex-none sm:w-[130px] h-9">
                            <SelectValue placeholder="ทุกสถานะ" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">ทุกสถานะ</SelectItem>
                            <SelectItem value="Pending">รอดำเนินการ</SelectItem>
                            <SelectItem value="In Progress">กำลังแก้ไข</SelectItem>
                            <SelectItem value="External Repair">ส่งซ่อมภายนอก</SelectItem>
                            <SelectItem value="Waiting for Parts">รออะไหล่</SelectItem>
                            <SelectItem value="Resolved">เสร็จสิ้น</SelectItem>
                            <SelectItem value="Closed">ปิดจบ</SelectItem>
                            <SelectItem value="Cancelled">ยกเลิก</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={filterCategory} onValueChange={setFilterCategory}>
                        <SelectTrigger className="flex-1 sm:flex-none sm:w-[170px] h-9">
                            <SelectValue placeholder="ทุกหมวดหมู่" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">ทุกหมวดหมู่</SelectItem>
                            <SelectItem value="แก้ไขปัญหาด้าน Software D365">แก้ไขปัญหาด้าน Software D365</SelectItem>
                            <SelectItem value="ติดตั้งและแก้ไขปัญหาด้าน Hardware">ติดตั้งและแก้ไขปัญหาด้าน Hardware</SelectItem>
                            <SelectItem value="ซ่อมบำรุงอุปกรณ์ต่อพ่วง Hardware & Network">ซ่อมบำรุงอุปกรณ์ต่อพ่วง Hardware & Network</SelectItem>
                            <SelectItem value="ประชุม/อบรม/สัมนา">ประชุม/อบรม/สัมนา</SelectItem>
                            <SelectItem value="งานอื่น ๆ">งานอื่น ๆ</SelectItem>
                            <SelectItem value="กล้องวงจรปิด">กล้องวงจรปิด</SelectItem>
                            <SelectItem value="แก้ไขปัญหาด้าน Printer">แก้ไขปัญหาด้าน Printer</SelectItem>
                            <SelectItem value="ติดตั้งและแก้ปัญหาด้าน Software ทั่วไป">ติดตั้งและแก้ปัญหาด้าน Software ทั่วไป</SelectItem>
                            <SelectItem value="แก้ไขปัญหาด้านอีเมล">แก้ไขปัญหาด้านอีเมล</SelectItem>
                        </SelectContent>
                    </Select>
                    
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <input
                            type="date"
                            value={filterDateFrom}
                            onChange={(e) => setFilterDateFrom(e.target.value)}
                            className="flex-1 sm:w-[130px] input-modern cursor-pointer py-1.5 px-2 text-sm"
                            title="วันที่เริ่มต้น"
                        placeholder="จากวันที่"
                    />
                    <span className="text-slate-400 text-sm hidden sm:block">—</span>
                    <input
                        type="date"
                        value={filterDateTo}
                        onChange={(e) => setFilterDateTo(e.target.value)}
                        className="w-full sm:w-auto input-modern cursor-pointer py-1.5 px-3 text-sm"
                            title="วันที่สิ้นสุด"
                            placeholder="ถึงวันที่"
                        />
                    </div>
                    
                    <Select value={filterAdmin || 'All'} onValueChange={(val) => setFilterAdmin(val === 'All' ? '' : val)}>
                        <SelectTrigger className="flex-1 sm:flex-none sm:w-[140px] h-9">
                            <SelectValue placeholder="ผู้รับงานทั้งหมด" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">ผู้รับงานทั้งหมด</SelectItem>
                            {[...new Set(issues.map(i => i.assignedAdmin).filter(Boolean))].map(admin => (
                                <SelectItem key={admin} value={admin}>{admin}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {(filterStatus !== 'All' || filterCategory !== 'All' || filterDateFrom || filterDateTo || filterAdmin) && (
                        <button
                            onClick={() => { setFilterStatus('All'); setFilterCategory('All'); setFilterDateFrom(''); setFilterDateTo(''); setFilterAdmin(''); }}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg hover:bg-rose-100 transition-colors"
                        >
                            <X className="w-3 h-3" /> ล้างตัวกรอง
                        </button>
                    )}
                </div>
            </div>

            {/* Main Table section */}
            <div className="glass-card rounded-3xl overflow-hidden border-t-0 shadow-xl shadow-indigo-100/50 dark:shadow-indigo-900/30">
                <div className="px-6 py-5 border-b border-indigo-100/60 dark:border-indigo-900/40 bg-white/40 dark:bg-slate-800/40 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <h3 className="text-lg font-bold text-indigo-950 dark:text-indigo-100 flex items-center gap-2">
                        <div className="w-2 h-6 bg-indigo-500 rounded-full"></div> รายการแจ้งซ่อมทั้งหมด <span className="text-sm font-medium text-slate-500 dark:text-slate-300 bg-white dark:bg-slate-700 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-600">{filteredIssues.length} รายการ</span>
                    </h3>
                    <div className="flex gap-3">
                        <button
                            onClick={exportToExcel}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700/50 rounded-full hover:bg-emerald-50 dark:hover:bg-emerald-900/40 hover:shadow-md transition-all duration-200"
                            title="ส่งออกเป็นไฟล์ Excel"
                        >
                            <FileSpreadsheet className="w-4 h-4" /> Excel
                        </button>
                    </div>
                </div>
                <div className="overflow-x-auto overflow-y-hidden xl:overflow-visible">
                    <table className="block xl:table w-full text-left border-collapse">
                        <thead className="hidden xl:table-header-group bg-slate-50/50 dark:bg-slate-700/50">
                            <tr>
                                <th scope="col" className="px-4 xl:px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-600/60">วัน/เวลา</th>
                                <th scope="col" className="px-4 xl:px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-600/60">ผู้แจ้ง / แผนก</th>
                                <th scope="col" className="px-4 xl:px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-600/60">หมวดหมู่ / ความรุนแรง</th>
                                <th scope="col" className="px-4 xl:px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-600/60 w-[30%]">ปัญหา</th>
                                <th scope="col" className="px-4 xl:px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-600/60">สถานะ</th>
                                <th scope="col" className="px-4 xl:px-5 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-600/60">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody className="block xl:table-row-group bg-transparent xl:bg-white/40 dark:bg-transparent xl:dark:bg-slate-800/40 xl:divide-y xl:divide-slate-100 dark:divide-slate-700/50 space-y-4 xl:space-y-0 p-4 xl:p-0">
                            {isLoading ? (
                                <tr className="block xl:table-row">
                                    <td colSpan="6" className="block xl:table-cell px-6 py-16 text-center bg-white dark:bg-slate-800 rounded-2xl xl:rounded-none shadow-sm xl:shadow-none border border-slate-100 dark:border-slate-700 xl:border-none">
                                        <div className="flex flex-col items-center justify-center space-y-4">
                                            <div className="w-10 h-10 border-4 border-indigo-200 dark:border-indigo-900/50 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin"></div>
                                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 animate-pulse">กำลังโหลดข้อมูลการแจ้งซ่อม...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedIssues.map((issue) => (
                                <tr key={issue.id} className="block xl:table-row bg-white xl:bg-transparent dark:bg-slate-800 xl:dark:bg-transparent rounded-2xl xl:rounded-none shadow-sm xl:shadow-none border border-slate-100 dark:border-slate-700 xl:border-none hover:bg-indigo-50/40 dark:hover:bg-indigo-900/20 transition-colors relative">
                                    <td className="block xl:table-cell px-4 xl:px-5 py-3 xl:py-4 xl:whitespace-nowrap align-top border-b border-slate-100 dark:border-slate-700/50 xl:border-none">
                                        <div className="flex justify-between items-start xl:block">
                                            <div>
                                                <div className="text-sm font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/40 inline-block px-2 py-1 rounded border border-indigo-100 dark:border-indigo-800">{issue.id || 'N/A'}</div>
                                                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                                    {formatDate(issue.createdAt)}
                                                </div>
                                            </div>
                                            <div className="xl:hidden mt-0.5">
                                                {getStatusBadge(issue.status, isIssueClosed(issue))}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="block xl:table-cell px-4 xl:px-5 py-3 xl:py-4 align-top xl:min-w-[140px]">
                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center xl:items-start xl:block gap-2 sm:gap-4">
                                            <div>
                                                <div className="text-sm font-bold text-slate-900 dark:text-white"><span className="xl:hidden text-slate-500 font-normal mr-1">ผู้แจ้ง:</span>{issue.name}</div>
                                                <div className="text-sm text-slate-500 dark:text-slate-400 font-medium"><span className="xl:hidden font-normal mr-1">แผนก:</span>{issue.department}</div>
                                            </div>
                                            <div className="text-left sm:text-right xl:text-left border-l-[3px] border-slate-100 dark:border-slate-700 pl-3 sm:border-none sm:pl-0 xl:border-none">
                                                <div className="text-sm text-slate-900 dark:text-white font-medium line-clamp-1 break-all sm:break-normal"><span className="xl:hidden text-slate-500 font-normal mr-1">หมวดหมู่:</span>{issue.category}</div>
                                                <div className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex sm:justify-end xl:block">{getSeverityBadge(issue.severity)}</div>
                                            </div>
                                        </div>
                                        <div className={`text-xs mt-1.5 font-semibold flex items-center gap-1 xl:mt-1 ${issue.assignedAdmin ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                            <span>👤 ผู้รับงาน: {issue.assignedAdmin || 'ยังไม่มีผู้รับงาน'}</span>
                                        </div>
                                    </td>
                                    <td className="hidden xl:table-cell px-4 xl:px-5 py-4 align-top xl:min-w-[140px]">
                                        <div className="text-sm text-slate-900 dark:text-white font-medium">{issue.category}</div>
                                        <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">{getSeverityBadge(issue.severity)}</div>
                                    </td>
                                    <td className="block xl:table-cell px-4 xl:px-5 py-3 xl:py-4 align-top border-b border-slate-100 dark:border-slate-700/50 xl:border-none pb-4 xl:pb-4">
                                        <div className="text-sm text-slate-800 dark:text-slate-300 leading-relaxed break-words">
                                            <span className="font-semibold text-slate-500 dark:text-slate-400 mr-1">ปัญหา:</span> 
                                            {!issue.description || issue.description.length <= 150 ? (
                                                <span className="whitespace-pre-wrap">{issue.description}</span>
                                            ) : (
                                                <>
                                                    <span className="whitespace-pre-wrap">{`${issue.description.substring(0, 150)}...`} </span>
                                                    <button
                                                        onClick={() => setReadMoreIssue(issue)}
                                                        className="inline-flex items-center text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold text-xs px-2 py-0.5 mt-1 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-full transition-colors focus:outline-none"
                                                    >
                                                        อ่านเพิ่ม
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                        {issue.assetName && (
                                            <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-2 flex items-center gap-1">
                                                <span>💻</span> <span className="font-medium">{issue.assetName}</span>
                                            </div>
                                        )}
                                        {issue.repairDetails && (
                                            <div className="text-xs text-indigo-700 dark:text-indigo-300 mt-1.5 flex flex-col gap-1 bg-indigo-50/50 dark:bg-indigo-900/30 p-2 rounded-lg border border-indigo-100/50 dark:border-indigo-700/50">
                                                <div className="flex items-center gap-1 font-semibold"><MessageSquare className="w-3 h-3" /> แอดมิน:</div>
                                                <span className="italic whitespace-pre-wrap line-clamp-2" title={issue.repairDetails}>{issue.repairDetails}</span>
                                            </div>
                                        )}
                                        {/* Attachment section */}
                                        {issue.attachments && issue.attachments.length > 0 && (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {issue.attachments.map((file, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => setPreviewImage(file.url)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/50 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all shadow-sm"
                                                    >
                                                        <Paperclip className="w-3.5 h-3.5" />
                                                        <span>ไฟล์แนบ {issue.attachments.length > 1 ? idx + 1 : ''}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td className="hidden xl:table-cell px-4 xl:px-5 py-4 whitespace-nowrap align-top">
                                        {getStatusBadge(issue.status, isIssueClosed(issue))}
                                    </td>
                                    <td className="block xl:table-cell px-4 xl:px-5 py-3 xl:py-4 whitespace-nowrap text-right text-sm font-medium align-top bg-slate-50/50 dark:bg-slate-700/20 xl:bg-transparent rounded-b-2xl xl:rounded-none">
                                        <div className="flex items-center justify-between xl:justify-end gap-2">
                                            <div className="xl:hidden text-left flex-1 items-center flex">
                                                <span className="opacity-0 w-0"></span>
                                            </div>
                                            <div className="flex items-center justify-end gap-2">
                                                {issue.status === 'Resolved' && !isIssueClosed(issue) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => showCloseIssueLinkDialog(issue)}
                                                        className="w-9 h-9 flex items-center justify-center text-emerald-600 dark:text-emerald-400 hover:text-white bg-emerald-50 dark:bg-slate-800 hover:bg-emerald-600 dark:hover:bg-emerald-600 border border-emerald-200/80 dark:border-slate-700 hover:border-emerald-600 rounded-xl transition-all shadow-sm"
                                                        title="คัดลอกลิงก์เซ็นปิดจบงาน"
                                                    >
                                                        <Link2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => openRepairModal(issue)}
                                                    className={`w-9 h-9 flex items-center justify-center hover:text-white dark:bg-slate-800 border dark:border-slate-700 rounded-xl transition-all shadow-sm group ${isIssueClosed(issue) ? 'text-sky-600 dark:text-sky-400 bg-sky-50 hover:bg-sky-600 dark:hover:bg-sky-600 border-sky-200/80 hover:border-sky-600' : 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 hover:bg-indigo-600 dark:hover:bg-indigo-600 border-indigo-200/80 hover:border-indigo-600'}`}
                                                    title={isIssueClosed(issue) ? 'ดูรายละเอียด' : 'แก้ไขข้อมูลแจ้งซ่อม'}
                                                >
                                                    {isIssueClosed(issue) ? <Eye className="w-4 h-4 group-hover:scale-110 transition-transform" /> : <Edit className="w-4 h-4 group-hover:scale-110 transition-transform" />}
                                                </button>
                                            <button
                                                onClick={() => handleOpenMaintenanceReport(issue)}
                                                className="w-9 h-9 flex items-center justify-center text-amber-600 dark:text-amber-400 hover:text-white bg-amber-50 dark:bg-slate-800 hover:bg-amber-600 dark:hover:bg-amber-600 border border-amber-200/80 dark:border-slate-700 hover:border-amber-600 rounded-xl transition-all shadow-sm group"
                                                title="ดูรายงานใบแจ้งซ่อม"
                                            >
                                                <Printer className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                            </button>
                                            {canDeleteRecord && (
                                                <>
                                                    <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1"></div>
                                                    <button
                                                        onClick={() => handleDelete(issue.id)}
                                                        className="w-9 h-9 flex items-center justify-center text-rose-600 dark:text-rose-400 hover:text-white bg-rose-50 dark:bg-slate-800 hover:bg-rose-600 dark:hover:bg-rose-600 border border-rose-200/80 dark:border-slate-700 hover:border-rose-600 rounded-xl transition-all shadow-sm group"
                                                        title="ลบเอกสาร"
                                                    >
                                                        <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                                    </button>
                                                </>
                                            )}
                                            {!canDeleteRecord && issue.status !== 'Cancelled' && issue.status !== 'Closed' && (
                                                <>
                                                    <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1"></div>
                                                    <button
                                                        onClick={() => handleCancelIssue(issue)}
                                                        className="w-9 h-9 flex items-center justify-center text-rose-600 dark:text-rose-400 hover:text-white bg-rose-50 dark:bg-slate-800 hover:bg-rose-600 dark:hover:bg-rose-600 border border-rose-200/80 dark:border-slate-700 hover:border-rose-600 rounded-xl transition-all shadow-sm group"
                                                        title="ตั้งสถานะยกเลิก"
                                                    >
                                                        <XCircle className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                                    </button>
                                                </>
                                            )}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))}

                            {!isLoading && filteredIssues.length === 0 && (
                                <tr className="block xl:table-row">
                                    <td colSpan="6" className="block xl:table-cell px-6 py-12 text-center text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 rounded-2xl xl:rounded-none shadow-sm xl:shadow-none border border-slate-100 dark:border-slate-700 xl:border-none">
                                        ไม่พบรายการแจ้งซ่อมที่ค้นหา
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between bg-white/40 dark:bg-slate-800/40">
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            แสดง {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredIssues.length)} จาก {filteredIssues.length} รายการ
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                <button
                                    key={page}
                                    onClick={() => setCurrentPage(page)}
                                    className={`w-8 h-8 rounded-lg text-sm font-semibold transition-all ${currentPage === page
                                        ? 'bg-indigo-600 text-white shadow-md'
                                        : 'border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/40'
                                        }`}
                                >
                                    {page}
                                </button>
                            ))}
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Repair Details Modal */}
            {isRepairModalOpen && (
                <div className="repair-modal-overlay fixed inset-0 z-[120] flex items-start sm:items-center justify-center overflow-y-auto p-3 sm:p-4 bg-slate-900/40 dark:bg-slate-900/80 backdrop-blur-sm animate-fade-in">
                    <div className="repair-modal-card bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl h-[calc(100dvh-1.5rem)] sm:h-auto sm:max-h-[calc(100dvh-2rem)] overflow-hidden border border-white/20 dark:border-slate-700 transform scale-100 transition-all grid grid-rows-[auto,minmax(0,1fr),auto]">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/80">
                            <h3 className="text-lg font-bold text-indigo-950 dark:text-indigo-100 flex items-center gap-2">
                                {isRepairReadOnly ? <Eye className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /> : <MessageSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />} {isRepairReadOnly ? 'รายละเอียดงานแจ้งซ่อม' : 'บันทึกรายละเอียดการซ่อม'}
                            </h3>
                            <button
                                onClick={() => setIsRepairModalOpen(false)}
                                className="text-slate-400 hover:text-rose-500 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {isRepairReadOnly ? (
                            <div className="min-h-0 overflow-y-auto custom-scrollbar px-5 py-4 sm:px-6 sm:py-5">
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-700">
                                    <div>
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">เลขที่เอกสาร</div>
                                        <div className="mt-1 text-lg font-bold text-indigo-700 dark:text-indigo-300">{displayValue(currentRepairIssue?.id)}</div>
                                    </div>
                                    {getStatusBadge(currentRepairIssue?.status, true)}
                                </div>

                                <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                                    <DetailItem label="ผู้แจ้ง" value={currentRepairIssue?.name} />
                                    <DetailItem label="แผนก" value={currentRepairIssue?.department} />
                                    <DetailItem label="หมวดหมู่" value={currentRepairIssue?.category} />
                                    <DetailItem label="ระดับความสำคัญ" value={getSeverityText(currentRepairIssue?.severity)} />
                                    <DetailItem label="อุปกรณ์" value={currentRepairIssue?.assetName || currentRepairIssue?.assetId} />
                                    <DetailItem label="ประเภทอุปกรณ์" value={currentRepairIssue?.assetType} />
                                    <DetailItem label="สถานที่ติดตั้ง" value={currentRepairIssue?.assetLocation} />
                                    <DetailItem label="ผู้รับงาน" value={currentRepairIssue?.assignedAdmin} />
                                    <DetailItem label="วันที่แจ้ง" value={displayDate(currentRepairIssue?.createdAt)} />
                                    <DetailItem label="วันที่ดำเนินการ" value={displayDate(currentRepairIssue?.operationStartedAt)} />
                                    <DetailItem label="วันที่ปิดจบ" value={displayDate(currentRepairIssue?.userClosedAt)} />
                                    <DetailItem label="งบประมาณ" value={displayBudget(currentRepairIssue?.budget)} />
                                    <DetailItem label="รายละเอียดปัญหา" value={currentRepairIssue?.description} full />
                                    <DetailItem label="แนวทางแก้ไข / ความคิดเห็น" value={currentRepairIssue?.repairDetails} full />
                                    <DetailItem label="ผู้ตรวจสอบ" value={currentRepairIssue?.inspectorName} />
                                    <DetailItem label="ตำแหน่งผู้ตรวจสอบ" value={currentRepairIssue?.inspectorPosition} />
                                    <DetailItem label="วันที่ผู้ตรวจสอบเซ็น" value={displayDate(currentRepairIssue?.inspectorSignedAt)} />
                                    <DetailItem label="ผู้เซ็นปิดจบ" value={currentRepairIssue?.userCloseName} />
                                    <DetailItem label="ตำแหน่งผู้เซ็นปิดจบ" value={currentRepairIssue?.userClosePosition} />
                                    <DetailItem label="หมายเหตุปิดจบ" value={currentRepairIssue?.userCloseNote} />
                                </div>

                                {(currentRepairIssue?.inspectorSign || currentRepairIssue?.userCloseSign) && (
                                    <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        {currentRepairIssue?.inspectorSign && (
                                            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                                                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">ลายเซ็นผู้ตรวจสอบ</div>
                                                <img src={currentRepairIssue.inspectorSign} alt="ลายเซ็นผู้ตรวจสอบ" className="h-28 w-full object-contain" />
                                            </div>
                                        )}
                                        {currentRepairIssue?.userCloseSign && (
                                            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                                                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">ลายเซ็นผู้แจ้งปิดจบ</div>
                                                <img src={currentRepairIssue.userCloseSign} alt="ลายเซ็นผู้แจ้งปิดจบ" className="h-28 w-full object-contain" />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                        <fieldset disabled={isRepairReadOnly} className="m-0 min-w-0 min-h-0 border-0 p-5 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar disabled:cursor-default">
                            <div className="bg-indigo-50/50 dark:bg-indigo-900/30 p-3 rounded-lg border border-indigo-100 dark:border-indigo-700/50 text-sm flex items-center gap-2">
                                <span className="font-semibold text-slate-700 dark:text-slate-300">เลขที่เอกสาร:</span> <span className="text-indigo-700 dark:text-indigo-400 font-bold px-2 py-0.5 bg-white dark:bg-slate-800 rounded border border-indigo-200 dark:border-slate-700">{currentRepairIssue?.id}</span>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">ชื่อ-นามสกุล <span className="text-rose-500">*</span></label>
                                    <input
                                        type="text"
                                        name="name"
                                        list="edit-name-list"
                                        value={editFormData.name}
                                        onChange={handleEditFormChange}
                                        className="w-full input-modern"
                                        autoComplete="off"
                                    />
                                    <datalist id="edit-name-list">
                                        {glpiUsers.map(name => (
                                            <option key={name} value={name} />
                                        ))}
                                    </datalist>
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">แผนก <span className="text-rose-500">*</span></label>
                                    {false && <select
                                        name="department"
                                        value={editFormData.department}
                                        onChange={handleEditFormChange}
                                        className="w-full input-modern cursor-pointer appearance-none"
                                        style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: `right 0.5rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.5em 1.5em`, paddingRight: `2.5rem` }}
                                    >
                                        <option value="">เลือกแผนก</option>
                                        {DEPARTMENTS.map(dept => (
                                            <option key={dept} value={dept}>{dept}</option>
                                        ))}
                                    </select>}
                                    <Select
                                        value={editFormData.department}
                                        onValueChange={(value) => handleEditFormChange({ target: { name: 'department', value } })}
                                    >
                                        <SelectTrigger className="w-full input-modern">
                                            <SelectValue placeholder="Select department" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {DEPARTMENTS.map(dept => (
                                                <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">หมวดหมู่ปัญหา</label>
                                    {false && <select
                                        name="category"
                                        value={editFormData.category}
                                        onChange={handleEditFormChange}
                                        className="w-full input-modern cursor-pointer appearance-none"
                                        style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: `right 0.5rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.5em 1.5em`, paddingRight: `2.5rem` }}
                                    >
                                        <option value="แก้ไขปัญหาด้าน Software D365">แก้ไขปัญหาด้าน Software D365</option>
                                        <option value="ติดตั้งและแก้ไขปัญหาด้าน Hardware">ติดตั้งและแก้ไขปัญหาด้าน Hardware</option>
                                        <option value="ซ่อมบำรุงอุปกรณ์ต่อพ่วง Hardware & Network">ซ่อมบำรุงอุปกรณ์ต่อพ่วง Hardware & Network</option>
                                        <option value="ประชุม/อบรม/สัมนา">ประชุม/อบรม/สัมนา</option>
                                        <option value="งานอื่น ๆ">งานอื่น ๆ</option>
                                        <option value="กล้องวงจรปิด">กล้องวงจรปิด</option>
                                        <option value="แก้ไขปัญหาด้าน Printer">แก้ไขปัญหาด้าน Printer</option>
                                        <option value="ติดตั้งและแก้ปัญหาด้าน Software ทั่วไป">ติดตั้งและแก้ปัญหาด้าน Software ทั่วไป</option>
                                        <option value="แก้ไขปัญหาด้านอีเมล">แก้ไขปัญหาด้านอีเมล</option>
                                    </select>}
                                    <Select
                                        value={editFormData.category}
                                        onValueChange={(value) => handleEditFormChange({ target: { name: 'category', value } })}
                                    >
                                        <SelectTrigger className="w-full input-modern">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {repairCategoryOptions.map(category => (
                                                <SelectItem key={category} value={category}>{category}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">ระดับความรุนแรง</label>
                                    {false && <select
                                        name="severity"
                                        value={editFormData.severity}
                                        onChange={handleEditFormChange}
                                        className="w-full input-modern cursor-pointer appearance-none"
                                        style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: `right 0.5rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.5em 1.5em`, paddingRight: `2.5rem` }}
                                    >
                                        <option value="Normal">ปกติ (Normal)</option>
                                        <option value="Urgent">ด่วน (Urgent)</option>
                                        <option value="Most Urgent">ด่วนที่สุด (Most Urgent)</option>
                                    </select>}
                                    <Select
                                        value={editFormData.severity}
                                        onValueChange={(value) => handleEditFormChange({ target: { name: 'severity', value } })}
                                    >
                                        <SelectTrigger className="w-full input-modern">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Normal">ปกติ (Normal)</SelectItem>
                                            <SelectItem value="Urgent">ด่วน (Urgent)</SelectItem>
                                            <SelectItem value="Most Urgent">ด่วนที่สุด (Most Urgent)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            
                            <div className="space-y-1">
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">
                                    สถานะการซ่อม <span className="text-rose-500">*</span>
                                </label>
                                <Select
                                    value={editFormData.status}
                                    onValueChange={(value) => setEditFormData(prev => ({ ...prev, status: value }))}
                                >
                                    <SelectTrigger className="w-full input-modern">
                                        <SelectValue placeholder="เลือกสถานะ" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {allowedStatusOptions.map(status => (
                                            <SelectItem key={status} value={status}>
                                                {getStatusLabel(status)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-slate-400 dark:text-slate-500 ml-1">
                                    เลือกได้เฉพาะสถานะปัจจุบันหรือสถานะถัดไปเท่านั้น
                                </p>
                            </div>

                            {/* GLPI Asset Selector for Edit form */}
                            <div className="space-y-1 mt-4">
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 ml-1 flex items-center gap-1.5">
                                    <Monitor className="w-4 h-4 text-indigo-400" /> เลือกอุปกรณ์ที่มีปัญหา
                                    <span className="text-xs font-normal text-slate-400">(ถ้ามี)</span>
                                </label>
                                {isLoadingAssets ? (
                                    <div className="input-modern flex items-center gap-2 text-slate-400 text-sm">
                                        <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                                        กำลังโหลดข้อมูลจาก GLPI...
                                    </div>
                                ) : assetError || computers.length === 0 ? (
                                    <div className="input-modern text-sm text-slate-400">⚠️ ยังไม่มีข้อมูลอุปกรณ์ (Admin กรุณากด Sync ในหน้าทรัพย์สินก่อน)</div>
                                ) : (
                                    <div className="relative asset-dropdown-container-edit">
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <Monitor className="h-4 w-4 text-indigo-400" />
                                            </div>
                                            <input
                                                type="text"
                                                placeholder="พิมพ์ชื่อเครื่อง, รหัสทรัพย์สิน หรือผู้ใช้งานเพื่อค้นหา..."
                                                className="w-full input-modern !pl-10 !pr-10"
                                                value={assetSearchTerm}
                                                onChange={(e) => {
                                                    setAssetSearchTerm(e.target.value);
                                                    setIsAssetDropdownOpen(true);
                                                    if (e.target.value === '') {
                                                        setEditFormData(prev => ({ ...prev, assetId: '', assetName: '', assetType: '', assetLocation: '', name: '' }));
                                                    }
                                                }}
                                                onFocus={() => setIsAssetDropdownOpen(true)}
                                            />
                                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center gap-1">
                                                {editFormData.assetId && (
                                                    <button
                                                        type="button"
                                                        className="text-slate-400 hover:text-rose-500 transition-colors p-1"
                                                        onClick={() => {
                                                            setEditFormData(prev => ({ ...prev, assetId: '', assetName: '', assetType: '', assetLocation: '', name: '' }));
                                                            setAssetSearchTerm('');
                                                            setIsAssetDropdownOpen(false);
                                                        }}
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className="text-slate-400 hover:text-indigo-500 transition-colors p-1"
                                                    onClick={() => setIsAssetDropdownOpen(!isAssetDropdownOpen)}
                                                >
                                                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isAssetDropdownOpen ? 'rotate-180' : ''}`} />
                                                </button>
                                            </div>
                                        </div>
                                        {isAssetDropdownOpen && (
                                            <div className="absolute z-[200] w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-40 sm:max-h-60 overflow-y-auto animate-fade-in custom-scrollbar will-change-transform">
                                                {filteredAssets.length === 0 ? (
                                                    <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">ไม่พบอุปกรณ์ที่ค้นหา</div>
                                                ) : (
                                                    <ul className="py-1">
                                                        <li
                                                            className={`px-4 py-2 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700/50 ${!editFormData.assetId ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 font-medium' : ''}`}
                                                            onClick={() => {
                                                                setEditFormData(prev => ({ ...prev, assetId: '', assetName: '', assetType: '', assetLocation: '', name: '' }));
                                                                setAssetSearchTerm('');
                                                                setIsAssetDropdownOpen(false);
                                                            }}
                                                        >
                                                            -- ไม่ระบุอุปกรณ์ --
                                                        </li>
                                                        {filteredAssets.map(c => {
                                                            const isSelected = String(editFormData.assetId) === String(c.id);
                                                            return (
                                                                <li
                                                                    key={c.id}
                                                                    className={`px-4 py-2.5 text-sm cursor-pointer border-b border-slate-50 dark:border-slate-700/30 last:border-0 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 transition-colors flex items-center justify-between group ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/40' : ''}`}
                                                                    onClick={() => {
                                                                        let ownerName = editFormData.name;
                                                                        if (c.users_id) {
                                                                            const userObj = glpiUsersRaw.find(u => u.name === c.users_id);
                                                                            ownerName = userObj ? (userObj.formattedName || userObj.name) : c.users_id;
                                                                        }
                                                                        setEditFormData(prev => ({ 
                                                                            ...prev, 
                                                                            assetId: c.id, 
                                                                            assetName: c.name || '',
                                                                            assetType: c.computertypes_id || c.computermodels_id || '',
                                                                            assetLocation: c.locations_id || '',
                                                                            name: prev.name || ownerName
                                                                        }));
                                                                        setAssetSearchTerm(c.name || '');
                                                                        setIsAssetDropdownOpen(false);
                                                                    }}
                                                                >
                                                                    <div className="flex flex-col min-w-0">
                                                                        <span className={`font-semibold truncate ${isSelected ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200 group-hover:text-indigo-700 dark:group-hover:text-indigo-300'}`}>
                                                                            {c.name}
                                                                        </span>
                                                                        {(c.serial || c.users_id) && (
                                                                            <span className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                                                                {c.serial ? `S/N: ${c.serial}` : ''}
                                                                                {c.serial && c.users_id ? ' · ' : ''}
                                                                                {c.users_id ? `👩‍💻 ${c.users_id}` : ''}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-500 flex-shrink-0 ml-2" />}
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label htmlFor="edit-asset-type" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">ประเภทอุปกรณ์</label>
                                    <input
                                        id="edit-asset-type"
                                        type="text"
                                        value={editFormData.assetType || ''}
                                        readOnly
                                        className="w-full input-modern bg-slate-50 dark:bg-slate-900/40"
                                        placeholder="-"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label htmlFor="edit-asset-location" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">สถานที่ติดตั้ง</label>
                                    <input
                                        id="edit-asset-location"
                                        type="text"
                                        value={editFormData.assetLocation || ''}
                                        readOnly
                                        className="w-full input-modern bg-slate-50 dark:bg-slate-900/40"
                                        placeholder="-"
                                    />
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">รายละเอียดปัญหา (ที่ผู้ใช้แจ้ง) <span className="text-rose-500">*</span></label>
                                <textarea
                                    name="description"
                                    value={editFormData.description}
                                    onChange={handleEditFormChange}
                                    rows="3"
                                    className="w-full input-modern resize-y"
                                ></textarea>
                            </div>

                            <hr className="border-slate-100 dark:border-slate-700/50 my-4" />

                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5 ml-1"><Edit className="w-4 h-4"/> แนวทางแก้ไข/ความคิดเห็น</label>
                                <textarea
                                    name="repairDetails"
                                    value={editFormData.repairDetails}
                                    onChange={handleEditFormChange}
                                    rows="4"
                                    className="w-full input-modern resize-y border-indigo-200 focus:ring-indigo-500"
                                    placeholder="พิมพ์บันทึกข้อความการทำงาน การตรวจสอบ หรือผลการซ่อมแซม..."
                                ></textarea>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <label htmlFor="edit-operation-started-at" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">วันที่ดำเนินการ</label>
                                    <input
                                        id="edit-operation-started-at"
                                        type="datetime-local"
                                        name="operationStartedAt"
                                        value={editFormData.operationStartedAt}
                                        onChange={handleEditFormChange}
                                        className="w-full input-modern"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label htmlFor="edit-user-closed-at" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">วันที่แล้วเสร็จ</label>
                                    <input
                                        id="edit-user-closed-at"
                                        type="text"
                                        value={currentRepairIssue?.userClosedAt ? formatDate(currentRepairIssue.userClosedAt) : '-'}
                                        readOnly
                                        className="w-full input-modern bg-slate-50 dark:bg-slate-900/40"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label htmlFor="edit-budget" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">งบประมาณ</label>
                                    <input
                                        id="edit-budget"
                                        type="number"
                                        name="budget"
                                        value={editFormData.budget}
                                        onChange={handleEditFormChange}
                                        min="0"
                                        step="0.01"
                                        className="w-full input-modern"
                                        placeholder="-"
                                    />
                                </div>
                            </div>

                            {(editFormData.status === 'Resolved' || editFormData.inspectorSign) && (
                                <div className="space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 dark:border-indigo-800/60 dark:bg-indigo-900/20">
                                    <div className="flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-indigo-300">
                                        <FileSignature className="w-4 h-4" />
                                        ลายเซ็นผู้ตรวจสอบดำเนินการ
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label htmlFor="edit-inspector-name" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">ชื่อผู้ตรวจสอบ</label>
                                            <input
                                                id="edit-inspector-name"
                                                type="text"
                                                name="inspectorName"
                                                value={editFormData.inspectorName}
                                                onChange={handleEditFormChange}
                                                className="w-full input-modern"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label htmlFor="edit-inspector-position" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">ตำแหน่ง</label>
                                            <input
                                                id="edit-inspector-position"
                                                type="text"
                                                name="inspectorPosition"
                                                value={editFormData.inspectorPosition}
                                                onChange={handleEditFormChange}
                                                className="w-full input-modern"
                                                placeholder="ระบุตำแหน่งผู้ตรวจสอบ"
                                            />
                                        </div>
                                    </div>
                                    {editFormData.inspectorSign && (
                                        <p className="text-xs text-emerald-600 dark:text-emerald-400">มีลายเซ็นผู้ตรวจสอบเดิมแล้ว เซ็นใหม่เฉพาะเมื่อต้องการแทนที่</p>
                                    )}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">ลายเซ็น</span>
                                            <button
                                                type="button"
                                                onClick={() => inspectorSignatureRef.current?.clear()}
                                                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-500"
                                            >
                                                <Eraser className="w-3.5 h-3.5" />
                                                ล้างลายเซ็น
                                            </button>
                                        </div>
                                        <div className="h-36 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
                                            <SignatureCanvas ref={inspectorSignatureRef} canvasProps={{ className: 'w-full h-full', 'aria-label': 'ลายเซ็นผู้ตรวจสอบดำเนินการ' }} />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </fieldset>
                        )}

                        <div className="repair-modal-footer sticky bottom-0 z-20 shrink-0 px-4 sm:px-6 py-3 sm:py-4 bg-slate-50/95 dark:bg-slate-700/95 backdrop-blur-md flex justify-end gap-3 border-t border-slate-100 dark:border-slate-700 shadow-[0_-8px_20px_rgba(15,23,42,0.08)]">
                            <button
                                onClick={() => setIsRepairModalOpen(false)}
                                className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                            >
                                {isRepairReadOnly ? 'ปิด' : 'ยกเลิก'}
                            </button>
                            {!isRepairReadOnly && (
                                <button
                                    onClick={handleSaveRepairDetails}
                                    className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 flex items-center justify-center gap-2 transform hover:-translate-y-0.5 transition-all"
                                >
                                    <Save className="w-4 h-4" /> บันทึกข้อมูล
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Custom PDF Preview Modal */}
            <PdfPreviewModal
                isOpen={isPdfModalOpen}
                onClose={() => setIsPdfModalOpen(false)}
                issue={currentPdfIssue}
            />

            {/* Maintenance Report PDF Modal */}
            <MaintenanceReportPdfPreview
                isOpen={isMaintenanceReportOpen}
                onClose={() => setIsMaintenanceReportOpen(false)}
                formData={currentMaintenanceIssue}
            />

            {/* Read More Modal */}
            {readMoreIssue && (
                <div className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center overflow-y-auto p-3 sm:p-4 bg-slate-900/40 dark:bg-slate-900/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[calc(100dvh-1.5rem)] overflow-hidden border border-white/20 dark:border-slate-700 transform scale-100 transition-all flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/80">
                            <h3 className="text-lg font-bold text-indigo-950 dark:text-indigo-100 flex items-center gap-2">
                                <MessageSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /> รายละเอียดปัญหาเพิ่มเติม
                            </h3>
                            <button
                                onClick={() => setReadMoreIssue(null)}
                                className="text-slate-400 hover:text-rose-500 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 sm:p-6 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                            <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 mb-2">เลขที่เอกสาร: <span className="text-slate-700 dark:text-slate-300">{readMoreIssue.id}</span></p>
                            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl text-slate-700 dark:text-slate-300 text-sm whitespace-pre-wrap leading-relaxed border border-slate-100 dark:border-slate-700">
                                {readMoreIssue.description}
                            </div>

                            {readMoreIssue.attachments && readMoreIssue.attachments.length > 0 && (
                                <div className="mt-6">
                                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                                        <ImagePlus className="w-4 h-4 text-indigo-500" /> รูปภาพประกอบ ({readMoreIssue.attachments.length})
                                    </p>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                        {readMoreIssue.attachments.map((file, idx) => (
                                            <button 
                                                key={idx} 
                                                onClick={() => setPreviewImage(file.url)}
                                                className="group relative aspect-video rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all"
                                            >
                                                <img 
                                                    src={resolveAttachmentUrl(file.url)}
                                                    alt={file.name} 
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                                                />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <Eye className="w-6 h-6 text-white" />
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-700/30 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-700">
                            <button
                                onClick={() => setReadMoreIssue(null)}
                                className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all"
                            >
                                ปิด
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Image Preview Modal */}
            {previewImage && (
                <div 
                    className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-slate-900/90 backdrop-blur-sm animate-fade-in"
                    onClick={() => setPreviewImage(null)}
                >
                    <div className="relative max-w-5xl w-full max-h-[90vh] flex items-center justify-center">
                        <button
                            onClick={() => setPreviewImage(null)}
                            className="absolute -top-12 right-0 text-white hover:text-rose-400 transition-colors bg-white/10 p-2 rounded-full backdrop-blur-md"
                        >
                            <X className="w-8 h-8" />
                        </button>
                        <img 
                            src={resolveAttachmentUrl(previewImage)}
                            alt="Preview" 
                            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default IssueDashboard;
