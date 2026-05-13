import React, { useMemo, useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Clock, CheckCircle2, Edit, FileSpreadsheet, Search, Filter, X, Save, MessageSquare, Trash2, Printer, AlertTriangle, ChevronLeft, ChevronRight, Monitor, ChevronDown } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import PdfPreviewModal from './PdfPreviewModal';
import Swal from 'sweetalert2';
import { supabase } from '../supabaseClient';

const ITEMS_PER_PAGE = 10;

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
        assetId: '',
        assetName: ''
    });
    const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
    const [currentPdfIssue, setCurrentPdfIssue] = useState(null);

    // Asset and User states (for Edit Modal)
    const [computers, setComputers] = useState([]);
    const [glpiUsers, setGlpiUsers] = useState([]);
    const [glpiUsersRaw, setGlpiUsersRaw] = useState([]);
    const [isLoadingAssets, setIsLoadingAssets] = useState(false);
    const [assetError, setAssetError] = useState(false);
    const [assetSearchTerm, setAssetSearchTerm] = useState('');
    const [isAssetDropdownOpen, setIsAssetDropdownOpen] = useState(false);
    
    // For read more modal
    const [readMoreIssue, setReadMoreIssue] = useState(null);

    useEffect(() => {
        const fetchAssets = async () => {
            setIsLoadingAssets(true);
            try {
                const { data, error } = await supabase
                    .from('assets')
                    .select('glpi_id, name, serial, otherserial, users_id')
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
                const { data, error } = await supabase.from('glpi_users').select('*');
                if (error) throw error;
                setGlpiUsersRaw(data || []);
            } catch (error) {
                console.error("Failed to load users from Supabase:", error);
                setGlpiUsersRaw([]);
            }
        };

        fetchAssets();
        fetchUsers();
    }, []);

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
        const counts = { 'Pending': 0, 'In Progress': 0, 'Resolved': 0, 'External Repair': 0, 'Waiting for Parts': 0, 'Cancelled': 0 };
        issues.forEach(issue => {
            if (counts[issue.status] !== undefined) counts[issue.status]++;
        });
        return [
            { name: 'รอดำเนินการ (Pending)', value: counts['Pending'], color: '#f59e0b' }, // Amber
            { name: 'กำลังแก้ไข (In Progress)', value: counts['In Progress'], color: '#3b82f6' }, // Blue
            { name: 'เสร็จสิ้น (Resolved)', value: counts['Resolved'], color: '#10b981' }, // Emerald
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

    // Derived filtered issues based on search and filters
    const filteredIssues = useMemo(() => {
        setCurrentPage(1); // reset to page 1 when filter changes
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
            assetId: issue.assetId || '',
            assetName: issue.assetName || ''
        });
        setAssetSearchTerm(issue.assetName || issue.assetId || '');
        setIsRepairModalOpen(true);
    };

    const handleEditFormChange = (e) => {
        const { name, value } = e.target;
        if (name === 'name') {
            const newValue = value;
            if (newValue.trim() === '') {
                setEditFormData(prev => ({ ...prev, name: '', assetId: '', assetName: '' }));
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
                        setAssetSearchTerm(pc.name);
                    }
                } else if (userComputers.length > 1) {
                    if (!prev.assetId || !userComputers.find(c => String(c.id) === prev.assetId)) {
                        newState.assetId = ''; 
                        newState.assetName = '';
                        setAssetSearchTerm(adUsername);
                        setIsAssetDropdownOpen(true);
                    }
                } else if (prev.assetId) {
                    const currentAsset = computers.find(c => String(c.id) === prev.assetId);
                    if (currentAsset && normalize(currentAsset.users_id) !== normalize(adUsername)) {
                        if(normalize(currentAsset.users_id) !== normalizedInput) {
                            newState.assetId = '';
                            newState.assetName = '';
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

    const handleSaveRepairDetails = () => {
        if (currentRepairIssue) {
            updateIssueFullDetails(currentRepairIssue.id, editFormData);
            setIsRepairModalOpen(false);
            setCurrentRepairIssue(null);
        }
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

    const handleOpenPdfPreview = (issue) => {
        setCurrentPdfIssue(issue);
        setIsPdfModalOpen(true);
    };

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
            case 'External Repair': return 'ส่งซ่อมภายนอก';
            case 'Waiting for Parts': return 'รออะไหล่';
            case 'Cancelled': return 'ยกเลิก';
            default: return status || '-';
        }
    };

    // PDF function removed at user request


    // Empty state is handled inside the table body now.
    const getStatusBadge = (status) => {
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
                return <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-100/80 text-slate-700 border border-slate-200/50">{status}</span>;
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

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Stats Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
            <div className="glass-card p-4 sm:p-5 rounded-2xl flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center shadow-md shadow-indigo-100/30">
                <div className="w-full xl:w-1/3 relative lg:max-w-md">
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

                <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 w-full xl:w-auto flex-1 xl:justify-end">
                    <div className="flex items-center gap-1.5 mr-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                        <Filter className="w-4 h-4" /> <span className="hidden sm:inline">ตัวกรอง:</span>
                    </div>
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="flex-1 sm:flex-none sm:w-[130px] input-modern cursor-pointer py-1.5 px-3 text-sm appearance-none"
                    >
                        <option value="All">ทุกสถานะ</option>
                        <option value="Pending">รอดำเนินการ</option>
                        <option value="In Progress">กำลังแก้ไข</option>
                        <option value="External Repair">ส่งซ่อมภายนอก</option>
                        <option value="Waiting for Parts">รออะไหล่</option>
                        <option value="Resolved">เสร็จสิ้น</option>
                        <option value="Cancelled">ยกเลิก</option>
                    </select>
                    <select
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="flex-1 sm:flex-none sm:w-[170px] input-modern cursor-pointer py-1.5 px-3 text-sm appearance-none"
                    >
                        <option value="All">ทุกหมวดหมู่</option>
                        <option value="แก้ไขปัญหาด้าน Software D365">แก้ไขปัญหาด้าน Software D365</option>
                        <option value="ติดตั้งและแก้ไขปัญหาด้าน Hardware">ติดตั้งและแก้ไขปัญหาด้าน Hardware</option>
                        <option value="ซ่อมบำรุงอุปกรณ์ต่อพ่วง Hardware & Network">ซ่อมบำรุงอุปกรณ์ต่อพ่วง Hardware & Network</option>
                        <option value="ประชุม/อบรม/สัมนา">ประชุม/อบรม/สัมนา</option>
                        <option value="งานอื่น ๆ">งานอื่น ๆ</option>
                        <option value="กล้องวงจรปิด">กล้องวงจรปิด</option>
                        <option value="แก้ไขปัญหาด้าน Printer">แก้ไขปัญหาด้าน Printer</option>
                        <option value="ติดตั้งและแก้ปัญหาด้าน Software ทั่วไป">ติดตั้งและแก้ปัญหาด้าน Software ทั่วไป</option>
                        <option value="แก้ไขปัญหาด้านอีเมล">แก้ไขปัญหาด้านอีเมล</option>
                    </select>
                    
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
                    
                    <select
                        value={filterAdmin}
                        onChange={(e) => setFilterAdmin(e.target.value)}
                        className="flex-1 sm:flex-none sm:w-[140px] input-modern cursor-pointer py-1.5 px-3 text-sm appearance-none"
                        title="กรองตามผู้รับงาน"
                    >
                        <option value="">ผู้รับงานทั้งหมด</option>
                        {[...new Set(issues.map(i => i.assignedAdmin).filter(Boolean))].map(admin => (
                            <option key={admin} value={admin}>{admin}</option>
                        ))}
                    </select>
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
                <div className="overflow-x-auto overflow-y-hidden lg:overflow-visible">
                    <table className="block lg:table w-full text-left border-collapse">
                        <thead className="hidden lg:table-header-group bg-slate-50/50 dark:bg-slate-700/50">
                            <tr>
                                <th scope="col" className="px-4 lg:px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-600/60">วัน/เวลา</th>
                                <th scope="col" className="px-4 lg:px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-600/60">ผู้แจ้ง / แผนก</th>
                                <th scope="col" className="px-4 lg:px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-600/60">หมวดหมู่ / ความรุนแรง</th>
                                <th scope="col" className="px-4 lg:px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-600/60 w-[30%]">ปัญหา</th>
                                <th scope="col" className="px-4 lg:px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-600/60">สถานะ</th>
                                <th scope="col" className="px-4 lg:px-5 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-600/60">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody className="block lg:table-row-group bg-transparent lg:bg-white/40 dark:bg-transparent lg:dark:bg-slate-800/40 lg:divide-y lg:divide-slate-100 dark:divide-slate-700/50 space-y-4 lg:space-y-0 p-4 lg:p-0">
                            {isLoading ? (
                                <tr className="block lg:table-row">
                                    <td colSpan="6" className="block lg:table-cell px-6 py-16 text-center bg-white dark:bg-slate-800 rounded-2xl lg:rounded-none shadow-sm lg:shadow-none border border-slate-100 dark:border-slate-700 lg:border-none">
                                        <div className="flex flex-col items-center justify-center space-y-4">
                                            <div className="w-10 h-10 border-4 border-indigo-200 dark:border-indigo-900/50 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin"></div>
                                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 animate-pulse">กำลังโหลดข้อมูลการแจ้งซ่อม...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedIssues.map((issue) => (
                                <tr key={issue.id} className="block lg:table-row bg-white lg:bg-transparent dark:bg-slate-800 lg:dark:bg-transparent rounded-2xl lg:rounded-none shadow-sm lg:shadow-none border border-slate-100 dark:border-slate-700 lg:border-none hover:bg-indigo-50/40 dark:hover:bg-indigo-900/20 transition-colors relative">
                                    <td className="block lg:table-cell px-4 lg:px-5 py-3 lg:py-4 lg:whitespace-nowrap align-top border-b border-slate-100 dark:border-slate-700/50 lg:border-none">
                                        <div className="flex justify-between items-start lg:block">
                                            <div>
                                                <div className="text-sm font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/40 inline-block px-2 py-1 rounded border border-indigo-100 dark:border-indigo-800">{issue.id || 'N/A'}</div>
                                                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                                    {formatDate(issue.createdAt)}
                                                </div>
                                            </div>
                                            <div className="lg:hidden mt-0.5">
                                                {getStatusBadge(issue.status)}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="block lg:table-cell px-4 lg:px-5 py-3 lg:py-4 align-top lg:min-w-[140px]">
                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center lg:items-start lg:block gap-2 sm:gap-4">
                                            <div>
                                                <div className="text-sm font-bold text-slate-900 dark:text-white"><span className="lg:hidden text-slate-500 font-normal mr-1">ผู้แจ้ง:</span>{issue.name}</div>
                                                <div className="text-sm text-slate-500 dark:text-slate-400 font-medium"><span className="lg:hidden font-normal mr-1">แผนก:</span>{issue.department}</div>
                                            </div>
                                            <div className="text-left sm:text-right lg:text-left border-l-[3px] border-slate-100 dark:border-slate-700 pl-3 sm:border-none sm:pl-0 lg:border-none">
                                                <div className="text-sm text-slate-900 dark:text-white font-medium line-clamp-1 break-all sm:break-normal"><span className="lg:hidden text-slate-500 font-normal mr-1">หมวดหมู่:</span>{issue.category}</div>
                                                <div className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex sm:justify-end lg:block">{getSeverityBadge(issue.severity)}</div>
                                            </div>
                                        </div>
                                        {issue.assignedAdmin && (
                                            <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1.5 font-semibold flex items-center gap-1 lg:mt-1">
                                                <span>👤 ผู้รับงาน: {issue.assignedAdmin}</span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="hidden lg:table-cell px-4 lg:px-5 py-4 align-top lg:min-w-[140px]">
                                        <div className="text-sm text-slate-900 dark:text-white font-medium">{issue.category}</div>
                                        <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">{getSeverityBadge(issue.severity)}</div>
                                    </td>
                                    <td className="block lg:table-cell px-4 lg:px-5 py-3 lg:py-4 align-top border-b border-slate-100 dark:border-slate-700/50 lg:border-none pb-4 lg:pb-4">
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
                                    </td>
                                    <td className="hidden lg:table-cell px-4 lg:px-5 py-4 whitespace-nowrap align-top">
                                        {issue.status === 'Resolved' || issue.status === 'Cancelled' ? (
                                            getStatusBadge(issue.status)
                                        ) : (
                                            <div className="relative inline-block">
                                                <select
                                                    value={issue.status}
                                                    onChange={(e) => {
                                                        const newStatus = e.target.value;
                                                        const adminName = (newStatus === 'In Progress' && !issue.assignedAdmin) ? currentAdmin?.name : null;
                                                        updateIssueStatus(issue.id, newStatus, adminName);
                                                    }}
                                                    className={`block w-full sm:w-36 pl-3.5 pr-8 py-1.5 text-xs font-semibold border shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 rounded-full hover:shadow-md transition-all appearance-none cursor-pointer ${
                                                        issue.status === 'External Repair' ? 'bg-violet-100/80 text-violet-800 border-violet-300 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700' 
                                                        : issue.status === 'Waiting for Parts' ? 'bg-pink-100/80 text-pink-800 border-pink-300 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-700' 
                                                        : issue.status === 'In Progress' ? 'bg-indigo-100/80 text-indigo-800 border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-700'
                                                        : 'bg-amber-100/80 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700'
                                                    }`}
                                                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2364748b' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M5 8l5 5 5-5'/%3e%3c/svg%3e")`, backgroundPosition: `right 0.6rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.2em 1.2em` }}
                                                >
                                                    <option value="Pending">รอดำเนินการ</option>
                                                    <option value="In Progress">กำลังแก้ไข</option>
                                                    <option value="External Repair">ส่งซ่อมภายนอก</option>
                                                    <option value="Waiting for Parts">รออะไหล่</option>
                                                    <option value="Resolved">เสร็จสิ้น</option>
                                                    <option value="Cancelled">ยกเลิก</option>
                                                </select>
                                            </div>
                                        )}
                                    </td>
                                    <td className="block lg:table-cell px-4 lg:px-5 py-3 lg:py-4 whitespace-nowrap text-right text-sm font-medium align-top bg-slate-50/50 dark:bg-slate-700/20 lg:bg-transparent rounded-b-2xl lg:rounded-none">
                                        <div className="flex items-center justify-between lg:justify-end gap-2">
                                            <div className="lg:hidden text-left flex-1 items-center flex">
                                                {issue.status === 'Resolved' || issue.status === 'Cancelled' ? (
                                                    <span className="opacity-0 w-0"></span> /* hidden when resolved in td footer */
                                                ) : (
                                                    <div className="relative inline-block">
                                                        <select
                                                            value={issue.status}
                                                            onChange={(e) => {
                                                                const newStatus = e.target.value;
                                                                const adminName = (newStatus === 'In Progress' && !issue.assignedAdmin) ? currentAdmin?.name : null;
                                                                updateIssueStatus(issue.id, newStatus, adminName);
                                                            }}
                                                            className={`block w-[130px] pl-3.5 pr-8 py-1.5 text-xs font-semibold border shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 rounded-full hover:shadow-md transition-all appearance-none cursor-pointer ${
                                                                issue.status === 'External Repair' ? 'bg-violet-100/80 text-violet-800 border-violet-300 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700' 
                                                                : issue.status === 'Waiting for Parts' ? 'bg-pink-100/80 text-pink-800 border-pink-300 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-700' 
                                                                : issue.status === 'In Progress' ? 'bg-indigo-100/80 text-indigo-800 border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-700'
                                                                : 'bg-amber-100/80 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700'
                                                            }`}
                                                            style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2364748b' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M5 8l5 5 5-5'/%3e%3c/svg%3e")`, backgroundPosition: `right 0.6rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.2em 1.2em` }}
                                                        >
                                                            <option value="Pending">รอดำเนินการ</option>
                                                            <option value="In Progress">กำลังแก้ไข</option>
                                                            <option value="External Repair">ส่งซ่อมภายนอก</option>
                                                            <option value="Waiting for Parts">รออะไหล่</option>
                                                            <option value="Resolved">เสร็จสิ้น</option>
                                                            <option value="Cancelled">ยกเลิก</option>
                                                        </select>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                onClick={() => openRepairModal(issue)}
                                                className="w-9 h-9 flex items-center justify-center text-indigo-600 dark:text-indigo-400 hover:text-white bg-indigo-50 dark:bg-slate-800 hover:bg-indigo-600 dark:hover:bg-indigo-600 border border-indigo-200/80 dark:border-slate-700 hover:border-indigo-600 rounded-xl transition-all shadow-sm group"
                                                title="แก้ไขข้อมูลแจ้งซ่อม"
                                            >
                                                <Edit className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                            </button>
                                            <button
                                                onClick={() => handleOpenPdfPreview(issue)}
                                                className="w-9 h-9 flex items-center justify-center text-sky-600 dark:text-sky-400 hover:text-white bg-sky-50 dark:bg-slate-800 hover:bg-sky-600 dark:hover:bg-sky-600 border border-sky-200/80 dark:border-slate-700 hover:border-sky-600 rounded-xl transition-all shadow-sm group"
                                                title="เปิดหน้าปรับแต่งใบแจ้งซ่อม"
                                            >
                                                <Printer className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                            </button>
                                            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1"></div>
                                            <button
                                                onClick={() => handleDelete(issue.id)}
                                                className="w-9 h-9 flex items-center justify-center text-rose-600 dark:text-rose-400 hover:text-white bg-rose-50 dark:bg-slate-800 hover:bg-rose-600 dark:hover:bg-rose-600 border border-rose-200/80 dark:border-slate-700 hover:border-rose-600 rounded-xl transition-all shadow-sm group"
                                                title="ลบเอกสาร"
                                            >
                                                <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                            </button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))}

                            {!isLoading && filteredIssues.length === 0 && (
                                <tr className="block lg:table-row">
                                    <td colSpan="6" className="block lg:table-cell px-6 py-12 text-center text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 rounded-2xl lg:rounded-none shadow-sm lg:shadow-none border border-slate-100 dark:border-slate-700 lg:border-none">
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
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 dark:bg-slate-900/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-white/20 dark:border-slate-700 transform scale-100 transition-all mt-16 sm:mt-24">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/80">
                            <h3 className="text-lg font-bold text-indigo-950 dark:text-indigo-100 flex items-center gap-2">
                                <MessageSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /> บันทึกรายละเอียดการซ่อม
                            </h3>
                            <button
                                onClick={() => setIsRepairModalOpen(false)}
                                className="text-slate-400 hover:text-rose-500 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            <div className="bg-indigo-50/50 dark:bg-indigo-900/30 p-3 rounded-lg border border-indigo-100 dark:border-indigo-700/50 text-sm flex items-center gap-2">
                                <span className="font-semibold text-slate-700 dark:text-slate-300">เลขที่เอกสาร:</span> <span className="text-indigo-700 dark:text-indigo-400 font-bold px-2 py-0.5 bg-white dark:bg-slate-800 rounded border border-indigo-200 dark:border-slate-700">{currentRepairIssue?.id}</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                    <select
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
                                    </select>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">หมวดหมู่ปัญหา</label>
                                    <select
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
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">ระดับความรุนแรง</label>
                                    <select
                                        name="severity"
                                        value={editFormData.severity}
                                        onChange={handleEditFormChange}
                                        className="w-full input-modern cursor-pointer appearance-none"
                                        style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: `right 0.5rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.5em 1.5em`, paddingRight: `2.5rem` }}
                                    >
                                        <option value="Normal">ปกติ (Normal)</option>
                                        <option value="Urgent">ด่วน (Urgent)</option>
                                        <option value="Most Urgent">ด่วนที่สุด (Most Urgent)</option>
                                    </select>
                                </div>
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
                                    <div className="input-modern text-sm text-slate-400">⚠️ ยังไม่มีข้อมูลอุปกรณ์ (Admin กรุณากด Sync → Supabase ในหน้าทรัพย์สินก่อน)</div>
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
                                                        setEditFormData(prev => ({ ...prev, assetId: '', assetName: '', name: '' }));
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
                                                            setEditFormData(prev => ({ ...prev, assetId: '', assetName: '', name: '' }));
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
                                                                setEditFormData(prev => ({ ...prev, assetId: '', assetName: '', name: '' }));
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
                                <label className="block text-sm font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5 ml-1"><Edit className="w-4 h-4"/> รายละเอียดการทำงานของ Admin</label>
                                <textarea
                                    name="repairDetails"
                                    value={editFormData.repairDetails}
                                    onChange={handleEditFormChange}
                                    rows="4"
                                    className="w-full input-modern resize-y border-indigo-200 focus:ring-indigo-500"
                                    placeholder="พิมพ์บันทึกข้อความการทำงาน การตรวจสอบ หรือผลการซ่อมแซม..."
                                ></textarea>
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-700/30 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-700">
                            <button
                                onClick={() => setIsRepairModalOpen(false)}
                                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={handleSaveRepairDetails}
                                className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 flex items-center gap-2 transform hover:-translate-y-0.5 transition-all"
                            >
                                <Save className="w-4 h-4" /> บันทึกข้อมูล
                            </button>
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

            {/* Read More Modal */}
            {readMoreIssue && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 dark:bg-slate-900/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden border border-white/20 dark:border-slate-700 transform scale-100 transition-all mt-16 sm:mt-24">
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
                        <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                            <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 mb-2">เลขที่เอกสาร: <span className="text-slate-700 dark:text-slate-300">{readMoreIssue.id}</span></p>
                            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl text-slate-700 dark:text-slate-300 text-sm whitespace-pre-wrap leading-relaxed border border-slate-100 dark:border-slate-700">
                                {readMoreIssue.description}
                            </div>
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
        </div>
    );
};

export default IssueDashboard;
