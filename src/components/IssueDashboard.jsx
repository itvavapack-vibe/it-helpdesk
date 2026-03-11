import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Clock, CheckCircle2, Edit, FileSpreadsheet, Search, Filter, X, Save, MessageSquare, Trash2, Printer, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import PdfPreviewModal from './PdfPreviewModal';
import Swal from 'sweetalert2';

const ITEMS_PER_PAGE = 10;

const IssueDashboard = ({ issues, currentAdmin, updateIssueStatus, updateIssueRepairDetails, deleteIssue, isLoading }) => {
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
    const [repairDetailsText, setRepairDetailsText] = useState('');
    const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
    const [currentPdfIssue, setCurrentPdfIssue] = useState(null);
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
        setRepairDetailsText(issue.repairDetails || '');
        setIsRepairModalOpen(true);
    };

    const handleSaveRepairDetails = () => {
        if (currentRepairIssue) {
            updateIssueRepairDetails(currentRepairIssue.id, repairDetailsText);
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
            <div className="glass-card p-4 sm:p-5 rounded-2xl flex flex-col lg:flex-row gap-4 justify-between items-center shadow-md shadow-indigo-100/30">
                <div className="w-full lg:w-1/3 relative">
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

                <div className="flex flex-col sm:flex-row w-full lg:w-auto gap-3 items-center flex-wrap">
                    <div className="flex items-center gap-2 w-full sm:w-auto text-sm font-semibold text-slate-600 dark:text-slate-300">
                        <Filter className="w-4 h-4" /> ตัวกรอง:
                    </div>
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="w-full sm:w-auto input-modern cursor-pointer py-1.5 px-3 text-sm appearance-none"
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
                        className="w-full sm:w-auto input-modern cursor-pointer py-1.5 px-3 text-sm appearance-none"
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
                    <input
                        type="date"
                        value={filterDateFrom}
                        onChange={(e) => setFilterDateFrom(e.target.value)}
                        className="w-full sm:w-auto input-modern cursor-pointer py-1.5 px-3 text-sm"
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
                    <select
                        value={filterAdmin}
                        onChange={(e) => setFilterAdmin(e.target.value)}
                        className="w-full sm:w-auto input-modern cursor-pointer py-1.5 px-3 text-sm appearance-none"
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
                <div className="overflow-x-auto">
                    <table className="min-w-full text-left border-collapse">
                        <thead className="bg-slate-50/50 dark:bg-slate-700/50">
                            <tr>
                                <th scope="col" className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-600/60">วัน/เวลา</th>
                                <th scope="col" className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-600/60">ผู้แจ้ง / แผนก</th>
                                <th scope="col" className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-600/60">หมวดหมู่ / ความรุนแรง</th>
                                <th scope="col" className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-600/60">ปัญหา</th>
                                <th scope="col" className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-600/60">สถานะ</th>
                                <th scope="col" className="px-6 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-600/60">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white/40 dark:bg-slate-800/40 divide-y divide-slate-100 dark:divide-slate-700/50">
                            {isLoading ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-16 text-center">
                                        <div className="flex flex-col items-center justify-center space-y-4">
                                            <div className="w-10 h-10 border-4 border-indigo-200 dark:border-indigo-900/50 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin"></div>
                                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 animate-pulse">กำลังโหลดข้อมูลการแจ้งซ่อม...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedIssues.map((issue) => (
                                <tr key={issue.id} className="hover:bg-indigo-50/40 dark:hover:bg-indigo-900/20 transition-colors">
                                    <td className="px-6 py-5 whitespace-nowrap">
                                        <div className="text-sm font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/40 inline-block px-2 py-1 rounded border border-indigo-100 dark:border-indigo-800">{issue.id || 'N/A'}</div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                            {formatDate(issue.createdAt)}
                                        </div>
                                    </td>
                                    <td className="px-6 py-5 whitespace-nowrap">
                                        <div className="text-sm font-bold text-slate-900 dark:text-white">{issue.name}</div>
                                        <div className="text-sm text-slate-500 dark:text-slate-400 font-medium">แผนก: {issue.department}</div>
                                        {issue.assignedAdmin && (
                                            <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-semibold flex items-center gap-1">
                                                <span>👤 ผู้รับงาน: {issue.assignedAdmin}</span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-5 whitespace-nowrap">
                                        <div className="text-sm text-slate-900 dark:text-white font-medium">{issue.category}</div>
                                        <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">{getSeverityBadge(issue.severity)}</div>
                                    </td>
                                    <td className="px-6 py-5">
                                        <div className="text-sm text-slate-800 dark:text-slate-300 line-clamp-2 max-w-xs leading-relaxed" title={issue.description}>
                                            <span className="font-semibold text-slate-500 dark:text-slate-400 mr-1">ปัญหา:</span> {issue.description}
                                        </div>
                                        {issue.assetName && (
                                            <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-1 flex items-center gap-1">
                                                <span>💻</span> <span className="font-medium">{issue.assetName}</span>
                                            </div>
                                        )}
                                        {issue.repairDetails && (
                                            <div className="text-xs text-indigo-700 dark:text-indigo-300 line-clamp-1 mt-1.5 flex items-center gap-1 bg-indigo-50/50 dark:bg-indigo-900/30 p-1.5 rounded-md border border-indigo-100/50 dark:border-indigo-700/50">
                                                <MessageSquare className="w-3 h-3 flex-shrink-0" /> <span className="italic">{issue.repairDetails}</span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-5 whitespace-nowrap">
                                        {getStatusBadge(issue.status)}
                                    </td>
                                    <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex flex-col items-end gap-2">
                                            {issue.status !== 'Resolved' && issue.status !== 'Cancelled' && (
                                                <select
                                                    value={issue.status}
                                                    onChange={(e) => {
                                                        const newStatus = e.target.value;
                                                        // Lock admin name only when first picking up the issue (→ In Progress)
                                                        const adminName = (newStatus === 'In Progress' && !issue.assignedAdmin) ? currentAdmin?.name : null;
                                                        updateIssueStatus(issue.id, newStatus, adminName);
                                                    }}
                                                    className={`block w-full sm:w-36 pl-3 pr-8 py-1.5 text-sm font-bold border-indigo-100 dark:border-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-lg hover:bg-white border cursor-pointer hover:shadow-sm transition-all appearance-none text-center ${issue.status === 'External Repair' ? 'bg-violet-50/70 text-violet-900 border-violet-200' : issue.status === 'Waiting for Parts' ? 'bg-pink-50/70 text-pink-900 border-pink-200' : 'bg-indigo-50/70 text-indigo-900 dark:bg-indigo-900/50 dark:text-indigo-200'} `}
                                                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%234f46e5' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M5 8l5 5 5-5'/%3e%3c/svg%3e")`, backgroundPosition: `right 0.5rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.2em 1.2em` }}
                                                >
                                                    <option value="Pending">รอดำเนินการ</option>
                                                    <option value="In Progress">กำลังแก้ไข</option>
                                                    <option value="External Repair">ส่งซ่อมภายนอก</option>
                                                    <option value="Waiting for Parts">รออะไหล่</option>
                                                    <option value="Resolved">เสร็จสิ้น</option>
                                                    <option value="Cancelled">ยกเลิก</option>
                                                </select>
                                            )}
                                            <div className="flex w-full gap-2 mt-1">
                                                <button
                                                    onClick={() => openRepairModal(issue)}
                                                    className="flex-1 text-indigo-600 dark:text-indigo-400 hover:text-white bg-white dark:bg-slate-800 hover:bg-indigo-600 dark:hover:bg-indigo-600 border border-indigo-200 dark:border-indigo-800 hover:border-indigo-600 px-2 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 shadow-sm flex items-center justify-center gap-1"
                                                    title="เพิ่มเติมรายละเอียด"
                                                >
                                                    <Edit className="w-3 h-3" /> เพิ่มเติม
                                                </button>
                                                <button
                                                    onClick={() => handleOpenPdfPreview(issue)}
                                                    className="flex-1 text-sky-600 dark:text-sky-400 hover:text-white bg-white dark:bg-slate-800 hover:bg-sky-600 dark:hover:bg-sky-600 border border-sky-200 dark:border-sky-800 hover:border-sky-600 px-2 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 shadow-sm flex items-center justify-center gap-1"
                                                    title="เปิดหน้าปรับแต่งใบแจ้งซ่อม"
                                                >
                                                    <Printer className="w-3 h-3" /> PDF
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(issue.id)}
                                                    className="flex-1 text-rose-600 dark:text-rose-400 hover:text-white bg-white dark:bg-slate-800 hover:bg-rose-600 border border-rose-200 dark:border-rose-900/50 hover:border-rose-600 px-2 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 shadow-sm flex items-center justify-center gap-1"
                                                    title="ลบเอกสาร"
                                                >
                                                    <Trash2 className="w-3 h-3" /> ลบ
                                                </button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))}

                            {!isLoading && filteredIssues.length === 0 && (
                                <tr className="dark:hover:bg-slate-800">
                                    <td colSpan="6" className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
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
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-slate-900/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-white/20 dark:border-slate-700 transform scale-100 transition-all">
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

                        <div className="p-6 space-y-4">
                            <div className="bg-indigo-50/50 dark:bg-indigo-900/30 p-3 rounded-lg border border-indigo-100 dark:border-indigo-700/50 text-sm">
                                <span className="font-semibold text-slate-700 dark:text-slate-300">เอกสาร:</span> <span className="text-indigo-700 dark:text-indigo-400 font-bold">{currentRepairIssue?.id}</span> <br />
                                <span className="font-semibold text-slate-700 dark:text-slate-300">ปัญหา:</span> <span className="text-slate-600 dark:text-slate-400">{currentRepairIssue?.description}</span>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">รายละเอียด / การดำเนินงาน</label>
                                <textarea
                                    value={repairDetailsText}
                                    onChange={(e) => setRepairDetailsText(e.target.value)}
                                    rows="5"
                                    className="w-full input-modern resize-y"
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
        </div>
    );
};

export default IssueDashboard;
