import React, { useMemo, useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';
import SignatureCanvas from 'react-signature-canvas';
import { Clock, Edit, CheckCircle2, Download, FileSpreadsheet, Trash2, Search, Filter, AlertTriangle, Eye, Printer, FileSignature, MessageSquare, Monitor, ChevronDown, X, XCircle, Copy, ChevronLeft, ChevronRight, Settings, Save, ImagePlus, Paperclip, Link2, Ticket, Eraser, ZoomIn, ZoomOut } from 'lucide-react';
import { showBorrowReturnIssueLinkDialog, showCloseIssueLinkDialog, showWaitingPartsIssueLinkDialog } from '../utils/closeIssueLink';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Combobox } from './ui/combobox';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import PdfPreviewModal from './PdfPreviewModal';
import MaintenanceReportPdfPreview from './MaintenanceReportPdfPreview';
import IssueEvidenceReportPreview from './IssueEvidenceReportPreview';
import Swal from 'sweetalert2';
import { mysql, API_URL } from '../mysqlClient';
import { ISSUE_CATEGORIES } from '../config/issueOptions';
import { canDeleteRecords, canManageAllWork } from '../config/roles';
import { loadSignatureIntoCanvas } from '../utils/signatureCanvas';
import { toMysqlDateTime } from '../utils/dateTime';
import { getStatusBadgeClass, getStatusIconClass } from '../utils/statusStyles';
import { MAX_ATTACHMENT_FILES, uploadAttachmentFiles } from '../utils/fileUpload';

const DEFAULT_ITEMS_PER_PAGE = 10;
const MIN_ITEMS_PER_PAGE = 5;
const PDF_ITEMS_PER_PAGE = 6;
const STATUS_FLOW = ['Pending', 'In Progress', 'External Repair', 'Waiting for Parts', 'Resolved', 'Cancelled'];
const ASSIGNABLE_STATUSES = ['In Progress', 'External Repair', 'Waiting for Parts', 'Resolved'];
const IMAGE_ATTACHMENT_PATTERN = /\.(png|jpe?g|gif|webp|bmp|avif)(?:\?.*)?$/i;
const BORROW_IT_CATEGORY = 'ยืมคอมพิวเตอร์/อุปกรณ์IT';

const isIssueClosed = (issue) => issue?.status === 'Closed' || Boolean(issue?.userCloseSign || issue?.userClosedAt);
const normalizeBorrowCategory = (value) => String(value || '').replace(/\s+/g, '');
const isBorrowIssue = (issue) => normalizeBorrowCategory(issue?.category) === normalizeBorrowCategory(BORROW_IT_CATEGORY);
const isImageAttachment = (file) => {
    const mimeType = String(file?.type || file?.mimetype || file?.mimeType || '').toLowerCase();
    const fileRef = String(file?.url || file?.path || file?.name || '').toLowerCase();
    return mimeType.startsWith('image/') || IMAGE_ATTACHMENT_PATTERN.test(fileRef);
};
const getIssueEvidenceAttachments = (issue) => (Array.isArray(issue?.attachments) ? issue.attachments.filter(isImageAttachment) : []);

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

const FILTER_STATUS_CARDS = [
    { status: 'Pending', label: 'รอดำเนินการ', icon: Clock, iconClass: getStatusIconClass('Pending') },
    { status: 'In Progress', label: 'กำลังแก้ไข', icon: Edit, iconClass: getStatusIconClass('In Progress') },
    { status: 'External Repair', label: 'ส่งซ่อมภายนอก', icon: Settings, iconClass: getStatusIconClass('External Repair') },
    { status: 'Waiting for Parts', label: 'รออะไหล่', icon: Paperclip, iconClass: getStatusIconClass('Waiting for Parts') },
    { status: 'Resolved', label: 'เสร็จสิ้น', icon: CheckCircle2, iconClass: getStatusIconClass('Resolved') },
    { status: 'Closed', label: 'ปิดจบ', icon: FileSignature, iconClass: getStatusIconClass('Closed') },
    { status: 'Cancelled', label: 'ยกเลิก', icon: XCircle, iconClass: getStatusIconClass('Cancelled') },
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
    const [pageSize, setPageSize] = useState(DEFAULT_ITEMS_PER_PAGE);
    const [pageSizeInput, setPageSizeInput] = useState(String(DEFAULT_ITEMS_PER_PAGE));
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [isIssueListPdfPreviewOpen, setIsIssueListPdfPreviewOpen] = useState(false);

    // Page state for repair details
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
    const [isEvidenceReportOpen, setIsEvidenceReportOpen] = useState(false);
    const [currentEvidenceIssue, setCurrentEvidenceIssue] = useState(null);
    const [pendingEvidenceFiles, setPendingEvidenceFiles] = useState([]);
    const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);
    const [returnInfoIssue, setReturnInfoIssue] = useState(null);

    // Asset and User states for the repair details page
    const [computers, setComputers] = useState([]);
    const [glpiUsers, setGlpiUsers] = useState([]);
    const [glpiUsersRaw, setGlpiUsersRaw] = useState([]);
    const [isLoadingAssets, setIsLoadingAssets] = useState(false);
    const [assetError, setAssetError] = useState(false);
    const [assetSearchTerm, setAssetSearchTerm] = useState('');
    const [isAssetDropdownOpen, setIsAssetDropdownOpen] = useState(false);
    const inspectorSignatureRef = useRef(null);
    const evidenceInputRef = useRef(null);
    const repairListScrollYRef = useRef(0);
    const canDeleteRecord = canDeleteRecords(currentAdmin?.role);
    const canEditAllWork = canManageAllWork(currentAdmin?.role);
    const isLegacyAdminRole = String(currentAdmin?.role || '').trim().toLowerCase().replace(/[\s-]+/g, '_') === 'admin';
    const canEditRepairRecords = canEditAllWork || isLegacyAdminRole;
    const isRepairReadOnly = isIssueClosed(currentRepairIssue) && !canEditRepairRecords;
    
    // For read more modal
    const [readMoreIssue, setReadMoreIssue] = useState(null);

    // For image preview
    const [previewImage, setPreviewImage] = useState(null);
    const [previewZoom, setPreviewZoom] = useState(1);

    const openAttachmentPreview = (url) => {
        setPreviewImage(url);
        setPreviewZoom(1);
    };

    const closeAttachmentPreview = () => {
        setPreviewImage(null);
        setPreviewZoom(1);
    };

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
        if (editFormData.inspectorSign) {
            loadSignatureIntoCanvas(inspectorSignatureRef, editFormData.inspectorSign, 150);
            return;
        }
        if (ASSIGNABLE_STATUSES.includes(editFormData.status)) {
            loadSignatureIntoCanvas(inspectorSignatureRef, currentAdmin?.signature, 150);
        }
    }, [currentAdmin?.signature, editFormData.inspectorSign, editFormData.status, isRepairModalOpen]);

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
        resolved: issues.filter(i => i.status === 'Resolved' && !isIssueClosed(i)).length,
        closed: issues.filter(isIssueClosed).length,
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

    const exportToPdf = async () => {
        if (!filteredIssues.length || isExportingPdf) {
            if (!filteredIssues.length) Swal.fire('ไม่มีข้อมูล', 'ไม่พบรายการสำหรับสร้างไฟล์ PDF', 'info');
            return;
        }

        setIsExportingPdf(true);
        const printRoot = document.createElement('div');
        printRoot.style.cssText = 'position:fixed;left:-100000px;top:0;width:1123px;background:#fff;z-index:-1;';
        document.body.appendChild(printRoot);

        const pages = Array.from(
            { length: Math.ceil(filteredIssues.length / PDF_ITEMS_PER_PAGE) },
            (_, index) => filteredIssues.slice(index * PDF_ITEMS_PER_PAGE, (index + 1) * PDF_ITEMS_PER_PAGE)
        );

        const createCell = (text, width, { header = false, align = 'left' } = {}) => {
            const cell = document.createElement(header ? 'th' : 'td');
            cell.style.cssText = [
                `width:${width}%`,
                'border:1px solid #cbd5e1',
                'padding:6px 7px',
                `text-align:${align}`,
                'vertical-align:top',
                header ? 'background:#e2e8f0;font-weight:700;color:#1e293b;' : 'color:#334155;',
            ].join(';');
            const content = document.createElement('div');
            content.textContent = text || '-';
            content.style.cssText = header
                ? 'line-height:1.2;'
                : 'line-height:1.35;word-break:break-word;white-space:pre-wrap;';
            cell.appendChild(content);
            return cell;
        };

        try {
            await document.fonts?.ready;
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

            for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
                const page = document.createElement('section');
                page.style.cssText = [
                    'width:1123px',
                    'height:794px',
                    'box-sizing:border-box',
                    'padding:34px 38px 28px',
                    'background:#fff',
                    'font-family:Sarabun,Tahoma,"Segoe UI",sans-serif',
                    'position:relative',
                    'overflow:hidden',
                ].join(';');

                const heading = document.createElement('div');
                heading.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;';
                const titleGroup = document.createElement('div');
                const title = document.createElement('div');
                title.textContent = 'รายงานตารางรายการแจ้งซ่อม/ปัญหา/ขอติดตั้ง';
                title.style.cssText = 'font-size:22px;font-weight:700;color:#0f172a;';
                const subtitle = document.createElement('div');
                subtitle.textContent = `จำนวนทั้งหมด ${filteredIssues.length} รายการ${hasActiveFilters ? ' (ตามเงื่อนไขการกรอง)' : ''}`;
                subtitle.style.cssText = 'font-size:12px;color:#64748b;margin-top:3px;';
                const dateRangeDetails = document.createElement('div');
                dateRangeDetails.textContent = reportDateRangeText;
                dateRangeDetails.style.cssText = 'font-size:12px;font-weight:700;color:#334155;margin-top:4px;line-height:1.35;';
                const filterDetails = document.createElement('div');
                filterDetails.textContent = filterSummaryText;
                filterDetails.style.cssText = 'font-size:11px;color:#475569;margin-top:3px;max-width:800px;line-height:1.35;';
                titleGroup.append(title, subtitle, dateRangeDetails, filterDetails);

                const generated = document.createElement('div');
                generated.textContent = `วันที่พิมพ์ ${new Date().toLocaleDateString('th-TH')}`;
                generated.style.cssText = 'font-size:12px;color:#475569;text-align:right;';
                heading.append(titleGroup, generated);
                page.appendChild(heading);

                const table = document.createElement('table');
                table.style.cssText = 'width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px;';
                const thead = document.createElement('thead');
                const headerRow = document.createElement('tr');
                [
                    ['รหัส / วันที่', 10],
                    ['ผู้แจ้ง', 12],
                    ['แผนก', 12],
                    ['หมวดหมู่', 15],
                    ['ระดับ', 8],
                    ['รายละเอียดปัญหา', 25],
                    ['ผู้รับงาน', 10],
                    ['สถานะ', 8],
                ].forEach(([label, width]) => headerRow.appendChild(createCell(label, width, { header: true, align: 'center' })));
                thead.appendChild(headerRow);
                table.appendChild(thead);

                const tbody = document.createElement('tbody');
                pages[pageIndex].forEach((issue) => {
                    const row = document.createElement('tr');
                    const effectiveStatus = isIssueClosed(issue) ? 'Closed' : issue.status;
                    const values = [
                        [`${issue.id || '-'}\n${formatDate(issue.createdAt)}`, 10],
                        [issue.name, 12],
                        [issue.department, 12],
                        [issue.category, 15],
                        [getSeverityText(issue.severity), 8],
                        [issue.description, 25],
                        [issue.assignedAdmin || 'ยังไม่มีผู้รับงาน', 10],
                        [getPdfStatusText(effectiveStatus), 8],
                    ];
                    values.forEach(([value, width], index) => {
                        const cell = createCell(value, width, { align: index === 0 || index >= 6 ? 'center' : 'left' });
                        cell.firstChild.style.whiteSpace = 'pre-line';
                        row.appendChild(cell);
                    });
                    tbody.appendChild(row);
                });
                table.appendChild(tbody);
                page.appendChild(table);

                const footer = document.createElement('div');
                footer.textContent = `หน้า ${pageIndex + 1} / ${pages.length}`;
                footer.style.cssText = 'position:absolute;left:38px;right:38px;bottom:14px;text-align:center;font-size:11px;color:#64748b;';
                page.appendChild(footer);
                printRoot.replaceChildren(page);

                const canvas = await html2canvas(page, {
                    scale: 1.5,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                    logging: false,
                });
                if (pageIndex > 0) pdf.addPage('a4', 'landscape');
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, 297, 210);
            }

            pdf.save(`IT_Helpdesk_Issues_${new Date().toISOString().slice(0, 10)}.pdf`);
        } catch (error) {
            console.error('Error exporting issues PDF:', error);
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถสร้างไฟล์ PDF ได้', 'error');
        } finally {
            printRoot.remove();
            setIsExportingPdf(false);
        }
    };

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterStatus, filterCategory, filterDateFrom, filterDateTo, filterAdmin]);

    // Apply the non-status filters first so status cards keep showing useful counts.
    const issuesMatchingBaseFilters = useMemo(() => {
        if (!issues) return [];
        return issues.filter(issue => {
            const matchSearch = issue.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                issue.name?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchCategory = filterCategory === 'All' || issue.category === filterCategory;

            const issueDate = issue.createdAt ? new Date(issue.createdAt) : null;
            const matchDateFrom = !filterDateFrom || (issueDate && issueDate >= new Date(filterDateFrom));
            const matchDateTo = !filterDateTo || (issueDate && issueDate <= new Date(filterDateTo + 'T23:59:59'));

            const matchAdmin = !filterAdmin ||
                (issue.assignedAdmin?.toLowerCase().includes(filterAdmin.toLowerCase()));

            return matchSearch && matchCategory && matchDateFrom && matchDateTo && matchAdmin;
        });
    }, [issues, searchTerm, filterCategory, filterDateFrom, filterDateTo, filterAdmin]);

    const filteredIssues = useMemo(() => {
        if (filterStatus === 'All') return issuesMatchingBaseFilters;
        return issuesMatchingBaseFilters.filter((issue) => {
            const effectiveStatus = isIssueClosed(issue) ? 'Closed' : issue.status;
            return effectiveStatus === filterStatus;
        });
    }, [filterStatus, issuesMatchingBaseFilters]);

    const hasActiveFilters = Boolean(
        searchTerm.trim() ||
        filterStatus !== 'All' ||
        filterCategory !== 'All' ||
        filterDateFrom ||
        filterDateTo ||
        filterAdmin
    );

    const reportDateRangeText = useMemo(() => {
        const formatFilterDate = (value) => (
            value ? new Date(`${value}T00:00:00`).toLocaleDateString('th-TH') : 'ไม่ระบุ'
        );

        return `วันที่เริ่มต้น: ${formatFilterDate(filterDateFrom)}    วันที่สิ้นสุด: ${formatFilterDate(filterDateTo)}`;
    }, [filterDateFrom, filterDateTo]);

    const filterSummaryText = useMemo(() => {
        const details = [];
        if (filterStatus !== 'All') details.push(`สถานะ: ${getStatusLabel(filterStatus)}`);
        if (filterCategory !== 'All') details.push(`หมวดหมู่: ${filterCategory}`);
        if (filterAdmin.trim()) details.push(`ผู้รับงาน: ${filterAdmin.trim()}`);
        if (searchTerm.trim()) details.push(`คำค้น: ${searchTerm.trim()}`);

        return details.length ? `เงื่อนไขอื่น: ${details.join(' | ')}` : 'เงื่อนไขอื่น: ไม่มี';
    }, [filterAdmin, filterCategory, filterStatus, searchTerm]);

    const filteredStatusCounts = useMemo(() => {
        const counts = {
            Pending: 0,
            'In Progress': 0,
            'External Repair': 0,
            'Waiting for Parts': 0,
            Resolved: 0,
            Closed: 0,
            Cancelled: 0,
        };

        issuesMatchingBaseFilters.forEach((issue) => {
            const effectiveStatus = isIssueClosed(issue) ? 'Closed' : issue.status;
            if (counts[effectiveStatus] !== undefined) counts[effectiveStatus] += 1;
        });

        return counts;
    }, [issuesMatchingBaseFilters]);

    // Pagination
    const totalPages = Math.max(1, Math.ceil(filteredIssues.length / pageSize));
    const paginatedIssues = filteredIssues.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const firstVisibleIssue = filteredIssues.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const lastVisibleIssue = Math.min(currentPage * pageSize, filteredIssues.length);
    const paginationPages = useMemo(() => {
        if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

        const nearbyPages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
        if (currentPage <= 3) [2, 3, 4].forEach((page) => nearbyPages.add(page));
        if (currentPage >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((page) => nearbyPages.add(page));

        const pages = Array.from(nearbyPages)
            .filter((page) => page >= 1 && page <= totalPages)
            .sort((a, b) => a - b);

        return pages.flatMap((page, index) => {
            const previousPage = pages[index - 1];
            return previousPage && page - previousPage > 1 ? [`gap-${previousPage}-${page}`, page] : [page];
        });
    }, [currentPage, totalPages]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterStatus, filterCategory, filterDateFrom, filterDateTo, filterAdmin, pageSize]);

    useEffect(() => {
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [currentPage, totalPages]);

    const updatePageSizeInput = (value) => {
        const digitsOnly = value.replace(/\D/g, '');
        setPageSizeInput(digitsOnly);

        const nextPageSize = Number.parseInt(digitsOnly, 10);
        if (Number.isFinite(nextPageSize) && nextPageSize > 0) {
            setPageSize(Math.max(MIN_ITEMS_PER_PAGE, nextPageSize));
        }
    };

    const normalizePageSizeInput = () => {
        const nextPageSize = Number.parseInt(pageSizeInput, 10);
        if (!Number.isFinite(nextPageSize) || nextPageSize <= 0) {
            setPageSize(DEFAULT_ITEMS_PER_PAGE);
            setPageSizeInput(String(DEFAULT_ITEMS_PER_PAGE));
            return;
        }

        const normalizedPageSize = Math.max(MIN_ITEMS_PER_PAGE, nextPageSize);
        setPageSize(normalizedPageSize);
        setPageSizeInput(String(normalizedPageSize));
    };

    // Handlers for Repair Details Page
    const openRepairModal = (issue) => {
        repairListScrollYRef.current = window.scrollY;
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
            inspectorPosition: issue.inspectorPosition || currentAdmin?.position || '',
            inspectorSign: issue.inspectorSign || '',
            inspectorSignedAt: issue.inspectorSignedAt || ''
        });
        setAssetSearchTerm(issue.assetName || issue.assetId || '');
        setPendingEvidenceFiles([]);
        if (evidenceInputRef.current) evidenceInputRef.current.value = '';
        setIsRepairModalOpen(true);
        requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
    };

    const closeRepairPage = () => {
        setIsRepairModalOpen(false);
        setCurrentRepairIssue(null);
        setPendingEvidenceFiles([]);
        setIsUploadingEvidence(false);
        if (evidenceInputRef.current) evidenceInputRef.current.value = '';
        setIsAssetDropdownOpen(false);
        requestAnimationFrame(() => window.scrollTo({ top: repairListScrollYRef.current, behavior: 'auto' }));
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

    const handleEvidenceFileChange = (event) => {
        const selectedFiles = Array.from(event.target.files || []);
        if (!selectedFiles.length) return;

        const imageFiles = selectedFiles.filter((file) => file.type.startsWith('image/'));
        if (imageFiles.length !== selectedFiles.length) {
            Swal.fire('แนบได้เฉพาะรูปภาพ', 'กรุณาเลือกไฟล์รูปภาพเท่านั้น เช่น JPG, PNG หรือ WEBP', 'warning');
        }

        if (!imageFiles.length) {
            event.target.value = '';
            return;
        }

        setPendingEvidenceFiles((currentFiles) => {
            const availableSlots = Math.max(0, MAX_ATTACHMENT_FILES - currentFiles.length);
            if (availableSlots === 0) {
                Swal.fire('แนบได้สูงสุด 5 รูปต่อครั้ง', 'กรุณาบันทึกชุดนี้ก่อน แล้วค่อยแนบรูปเพิ่มเติม', 'info');
                return currentFiles;
            }

            if (imageFiles.length > availableSlots) {
                Swal.fire('เลือกเกินจำนวนที่กำหนด', `ระบบจะเพิ่มเฉพาะ ${availableSlots} รูปแรก`, 'info');
            }

            return [...currentFiles, ...imageFiles.slice(0, availableSlots)];
        });

        event.target.value = '';
    };

    const removePendingEvidenceFile = (indexToRemove) => {
        setPendingEvidenceFiles((currentFiles) => currentFiles.filter((_, index) => index !== indexToRemove));
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
        if (ASSIGNABLE_STATUSES.includes(status)) {
            const inspectorName = (fieldsToSave.inspectorName || currentAdmin?.name || '').trim();
            const hasNewInspectorSignature = inspectorSignatureRef.current && !inspectorSignatureRef.current.isEmpty();
            const inspectorSign = hasNewInspectorSignature
                ? inspectorSignatureRef.current.getCanvas().toDataURL('image/png')
                : fieldsToSave.inspectorSign || currentAdmin?.signature || '';

            if (!inspectorName || !fieldsToSave.inspectorPosition.trim() || (!inspectorSign && !isLegacyAdminRole)) {
                Swal.fire('ข้อมูลผู้ตรวจสอบไม่ครบ', isLegacyAdminRole ? 'กรุณาระบุชื่อและตำแหน่งผู้ตรวจสอบก่อนรับงาน' : 'กรุณาระบุชื่อ ตำแหน่ง และลายเซ็นผู้ตรวจสอบก่อนรับงาน', 'warning');
                return;
            }

            fieldsToSave.inspectorName = inspectorName;
            fieldsToSave.inspectorSign = inspectorSign;
            if (status === 'Resolved' && currentRepairIssue.status !== 'Resolved') {
                fieldsToSave.inspectorSignedAt = new Date().toISOString();
            } else if (hasNewInspectorSignature || !fieldsToSave.inspectorSignedAt) {
                fieldsToSave.inspectorSignedAt = new Date().toISOString();
            }
        }

        if (pendingEvidenceFiles.length > 0) {
            setIsUploadingEvidence(true);
            try {
                const uploadedEvidenceFiles = await uploadAttachmentFiles(pendingEvidenceFiles, {
                    uploadedBy: activeAdminName || 'IT',
                    uploadedByType: 'it',
                    source: 'repair_evidence',
                    evidenceType: 'repair_photo'
                });
                fieldsToSave.attachments = [
                    ...(Array.isArray(currentRepairIssue.attachments) ? currentRepairIssue.attachments : []),
                    ...uploadedEvidenceFiles
                ];
            } catch (error) {
                setIsUploadingEvidence(false);
                Swal.fire('อัปโหลดรูปหลักฐานไม่สำเร็จ', error?.message || 'กรุณาลองใหม่อีกครั้ง', 'error');
                return;
            }
        }

        const didSaveDetails = await updateIssueFullDetails(currentRepairIssue.id, fieldsToSave);
        if (didSaveDetails === false) {
            setIsUploadingEvidence(false);
            return;
        }

        const shouldShowWaitingPartsLink = editFormData.status === 'Waiting for Parts' && !currentRepairIssue.waitingPartsUserSign;
        let didShowWaitingPartsLink = false;

        if (editFormData.status && editFormData.status !== currentRepairIssue.status) {
            const adminName = shouldAssignCurrentAdmin ? activeAdminName : null;
            const didSaveStatus = await updateIssueStatus(currentRepairIssue.id, editFormData.status, adminName);
            if (didSaveStatus === false) {
                setIsUploadingEvidence(false);
                return;
            }
            if (shouldShowWaitingPartsLink) {
                didShowWaitingPartsLink = true;
                await showWaitingPartsIssueLinkDialog({
                    ...currentRepairIssue,
                    ...fieldsToSave,
                    status: editFormData.status
                });
            }
        }

        if (shouldShowWaitingPartsLink && !didShowWaitingPartsLink) {
            await showWaitingPartsIssueLinkDialog({
                ...currentRepairIssue,
                ...fieldsToSave,
                status: editFormData.status
            });
        }

        setPendingEvidenceFiles([]);
        setIsUploadingEvidence(false);
        closeRepairPage();
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

    const handleOpenEvidenceReport = (issue) => {
        setCurrentEvidenceIssue(issue);
        setIsEvidenceReportOpen(true);
    };

    const handleReceiveBorrowReturn = async (issue) => {
        if (!issue || !isBorrowIssue(issue) || !isIssueClosed(issue)) return;
        if (!issue.borrowReturnedAt && !issue.borrowReturnerSign) {
            Swal.fire('ยังไม่มีข้อมูลส่งคืน', 'ต้องให้ผู้แจ้งลงนามส่งคืนก่อนรับคืน', 'warning');
            return;
        }
        if (issue.borrowReceivedAt || issue.borrowReceiverSign) {
            Swal.fire('รับคืนแล้ว', 'รายการนี้มีการบันทึกรับคืนเรียบร้อยแล้ว', 'info');
            return;
        }
        if (!currentAdmin?.signature) {
            Swal.fire('ไม่พบลายเซ็นผู้รับคืน', 'กรุณาบันทึกลายเซ็นในโปรไฟล์ผู้ดูแลก่อนรับคืน', 'warning');
            return;
        }

        const result = await Swal.fire({
            title: 'ยืนยันรับคืนอุปกรณ์?',
            text: 'ระบบจะลงวันที่รับคืนเป็นวันที่กดปุ่มนี้ และดึงลายเซ็นจากโปรไฟล์ผู้ดูแล',
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#10b981',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'ยืนยันรับคืน',
            cancelButtonText: 'ยกเลิก',
            reverseButtons: true,
        });
        if (!result.isConfirmed) return;

        const receivedAt = toMysqlDateTime();
        const receiverName = currentAdmin.name || currentAdmin.username || '';
        const receiverPosition = currentAdmin.position || '';
        const ok = await updateIssueFullDetails(issue.id, {
            borrowReceiverName: receiverName,
            borrowReceiverPosition: receiverPosition,
            borrowReceiverSign: currentAdmin.signature,
            borrowReceivedAt: receivedAt,
        }, { silent: true });

        if (ok) {
            setReturnInfoIssue(current => current?.id === issue.id ? {
                ...current,
                borrowReceiverName: receiverName,
                borrowReceiverPosition: receiverPosition,
                borrowReceiverSign: currentAdmin.signature,
                borrowReceivedAt: receivedAt,
            } : current);
            Swal.fire('รับคืนแล้ว', 'บันทึกข้อมูลรับคืนอุปกรณ์เรียบร้อย', 'success');
        }
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
        const badgeStatus = isClosed ? 'Closed' : status;
        const badgeClass = `inline-flex items-center px-3 py-1 rounded-full border text-xs font-semibold ${getStatusBadgeClass(badgeStatus)}`;
        if (isClosed) {
            return <span className={badgeClass}><CheckCircle2 className="w-3 h-3 mr-1.5" /> ปิดจบ</span>;
        }
        switch (status) {
            case 'Pending':
                return <span className={badgeClass}><Clock className="w-3 h-3 mr-1.5" /> รอดำเนินการ</span>;
            case 'In Progress':
                return <span className={badgeClass}><Edit className="w-3 h-3 mr-1.5" /> กำลังแก้ไข</span>;
            case 'Resolved':
                return <span className={badgeClass}><CheckCircle2 className="w-3 h-3 mr-1.5" /> เสร็จสิ้น</span>;
            case 'External Repair':
                return <span className={badgeClass}><AlertTriangle className="w-3 h-3 mr-1.5" /> ส่งซ่อมภายนอก</span>;
            case 'Waiting for Parts':
                return <span className={badgeClass}><Clock className="w-3 h-3 mr-1.5" /> รออะไหล่</span>;
            case 'Cancelled':
                return <span className={badgeClass}><X className="w-3 h-3 mr-1.5" /> ยกเลิก</span>;
            default:
                return <span className={badgeClass}>{getStatusLabel(status)}</span>;
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
            {!isRepairModalOpen && (
            <>
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
                    <div className="w-11 h-11 rounded-xl bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center flex-shrink-0">
                        <FileSignature className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-slate-800 dark:text-white">{statsData.closed}</p>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">ปิดจบ</p>
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
                            {ISSUE_CATEGORIES.map(category => (
                                <SelectItem key={category} value={category}>{category}</SelectItem>
                            ))}
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

            {hasActiveFilters && (
                <section className="space-y-3">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <h3 className="text-base font-bold text-slate-800 dark:text-white">สรุปผลตามการกรอง</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">แสดงจำนวนจากรายการที่ตรงกับเงื่อนไขปัจจุบัน</p>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            รวม {filteredIssues.length} รายการ
                        </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
                        {FILTER_STATUS_CARDS.map(({ status, label, icon: Icon, iconClass }) => (
                            <button
                                key={status}
                                type="button"
                                onClick={() => setFilterStatus((current) => current === status ? 'All' : status)}
                                className={`glass-card flex min-h-[92px] items-center gap-3 rounded-2xl p-3 text-left transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg dark:hover:border-indigo-700 ${
                                    filterStatus === status
                                        ? 'border-indigo-400 bg-indigo-50/80 ring-2 ring-indigo-500/20 dark:border-indigo-600 dark:bg-indigo-950/30'
                                        : ''
                                }`}
                                aria-pressed={filterStatus === status}
                                title={`กรองสถานะ${label}`}
                            >
                                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
                                    <Icon className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xl font-bold text-slate-800 dark:text-white">{filteredStatusCounts[status]}</p>
                                    <p className="text-xs font-medium leading-tight text-slate-500 dark:text-slate-400">{label}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>
            )}

            {/* Main Table section */}
            <div className="glass-card rounded-3xl overflow-hidden border-t-0 shadow-xl shadow-indigo-100/50 dark:shadow-indigo-900/30">
                <div className="px-6 py-5 border-b border-indigo-100/60 dark:border-indigo-900/40 bg-white/40 dark:bg-slate-800/40 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <h3 className="text-lg font-bold text-indigo-950 dark:text-indigo-100 flex items-center gap-2">
                        <div className="w-2 h-6 bg-indigo-500 rounded-full"></div> รายการแจ้งซ่อมทั้งหมด <span className="text-sm font-medium text-slate-500 dark:text-slate-300 bg-white dark:bg-slate-700 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-600">{filteredIssues.length} รายการ</span>
                    </h3>
                    <div className="flex flex-wrap items-center justify-end gap-3">
                        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            <span>แสดง</span>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={pageSizeInput}
                                onChange={(event) => updatePageSizeInput(event.target.value)}
                                onBlur={normalizePageSizeInput}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') event.currentTarget.blur();
                                }}
                                className="h-8 w-20 rounded-full border border-slate-200 bg-slate-50 px-3 text-center text-sm font-semibold text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                                aria-label="จำนวนรายการต่อหน้า"
                            />
                            <span>รายการ</span>
                        </div>
                        <button
                            onClick={() => setIsIssueListPdfPreviewOpen(true)}
                            disabled={filteredIssues.length === 0}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white dark:bg-slate-800 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-700/50 rounded-full hover:bg-rose-50 dark:hover:bg-rose-900/40 hover:shadow-md transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                            title="ดูตัวอย่างตาราง PDF"
                        >
                            <Printer className="w-4 h-4" /> PDF
                        </button>
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
                    <table className="block xl:table w-full xl:table-fixed text-left border-collapse">
                        <colgroup>
                            <col className="hidden xl:table-column xl:w-[5%]" />
                            <col className="hidden xl:table-column xl:w-[12%]" />
                            <col className="hidden xl:table-column xl:w-[16%]" />
                            <col className="hidden xl:table-column xl:w-[14%]" />
                            <col className="hidden xl:table-column xl:w-[29%] 2xl:w-[32%]" />
                            <col className="hidden xl:table-column xl:w-[9%] 2xl:w-[8%]" />
                            <col className="hidden xl:table-column xl:w-[15%] 2xl:w-[13%]" />
                        </colgroup>
                        <thead className="hidden xl:table-header-group bg-slate-50/50 dark:bg-slate-700/50">
                            <tr>
                                <th scope="col" className="px-4 xl:px-5 py-4 text-center text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-600/60 w-20">ลำดับ</th>
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
                                    <td colSpan="7" className="block xl:table-cell px-6 py-16 text-center bg-white dark:bg-slate-800 rounded-2xl xl:rounded-none shadow-sm xl:shadow-none border border-slate-100 dark:border-slate-700 xl:border-none">
                                        <div className="flex flex-col items-center justify-center space-y-4">
                                            <div className="w-10 h-10 border-4 border-indigo-200 dark:border-indigo-900/50 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin"></div>
                                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 animate-pulse">กำลังโหลดข้อมูลการแจ้งซ่อม...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedIssues.map((issue, index) => (
                                <tr key={issue.id} className="block xl:table-row bg-white xl:bg-transparent dark:bg-slate-800 xl:dark:bg-transparent rounded-2xl xl:rounded-none shadow-sm xl:shadow-none border border-slate-100 dark:border-slate-700 xl:border-none hover:bg-indigo-50/40 dark:hover:bg-indigo-900/20 transition-colors relative">
                                    <td className="block xl:table-cell px-4 xl:px-5 py-3 xl:py-4 text-center align-top border-b border-slate-100 dark:border-slate-700/50 xl:border-none">
                                        <div className="flex items-center justify-between xl:justify-center">
                                            <span className="xl:hidden text-xs font-semibold text-slate-500 dark:text-slate-400">ลำดับ</span>
                                            <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-slate-100 px-2 text-sm font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-100">
                                                {(currentPage - 1) * pageSize + index + 1}
                                            </span>
                                        </div>
                                    </td>
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
                                                        onClick={() => openAttachmentPreview(file.url)}
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
                                                {issue.status === 'Waiting for Parts' && !issue.waitingPartsUserSign && (
                                                    <button
                                                        type="button"
                                                        onClick={() => showWaitingPartsIssueLinkDialog(issue)}
                                                        className="w-9 h-9 flex items-center justify-center text-pink-600 dark:text-pink-400 hover:text-white bg-pink-50 dark:bg-slate-800 hover:bg-pink-600 dark:hover:bg-pink-600 border border-pink-200/80 dark:border-slate-700 hover:border-pink-600 rounded-xl transition-all shadow-sm"
                                                        title="คัดลอกลิงก์เซ็นรับทราบเปิด PR ขอซื้ออะไหล่"
                                                    >
                                                        <Link2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {isBorrowIssue(issue) && isIssueClosed(issue) && !issue.borrowReturnedAt && !issue.borrowReturnerSign && (
                                                    <button
                                                        type="button"
                                                        onClick={() => showBorrowReturnIssueLinkDialog(issue)}
                                                        className="w-9 h-9 flex items-center justify-center text-amber-600 dark:text-amber-400 hover:text-white bg-amber-50 dark:bg-slate-800 hover:bg-amber-600 dark:hover:bg-amber-600 border border-amber-200/80 dark:border-slate-700 hover:border-amber-600 rounded-xl transition-all shadow-sm"
                                                        title="บันทึกส่งคืนส่วนผู้แจ้ง"
                                                    >
                                                        <Link2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {isBorrowIssue(issue) && isIssueClosed(issue) && (issue.borrowReturnedAt || issue.borrowReturnerSign) && !issue.borrowReceivedAt && !issue.borrowReceiverSign && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleReceiveBorrowReturn(issue)}
                                                        className="w-9 h-9 flex items-center justify-center text-emerald-600 dark:text-emerald-400 hover:text-white bg-emerald-50 dark:bg-slate-800 hover:bg-emerald-600 dark:hover:bg-emerald-600 border border-emerald-200/80 dark:border-slate-700 hover:border-emerald-600 rounded-xl transition-all shadow-sm"
                                                        title="รับคืน"
                                                    >
                                                        <CheckCircle2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {isBorrowIssue(issue) && isIssueClosed(issue) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setReturnInfoIssue(issue)}
                                                        className="w-9 h-9 flex items-center justify-center text-violet-600 dark:text-violet-400 hover:text-white bg-violet-50 dark:bg-slate-800 hover:bg-violet-600 dark:hover:bg-violet-600 border border-violet-200/80 dark:border-slate-700 hover:border-violet-600 rounded-xl transition-all shadow-sm"
                                                        title="ดูข้อมูลส่งคืน/รับคืน"
                                                    >
                                                        <Ticket className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => openRepairModal(issue)}
                                                    className={`w-9 h-9 flex items-center justify-center hover:text-white dark:bg-slate-800 border dark:border-slate-700 rounded-xl transition-all shadow-sm group ${(!isIssueClosed(issue) || canEditRepairRecords) ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 hover:bg-indigo-600 dark:hover:bg-indigo-600 border-indigo-200/80 hover:border-indigo-600' : 'text-sky-600 dark:text-sky-400 bg-sky-50 hover:bg-sky-600 dark:hover:bg-sky-600 border-sky-200/80 hover:border-sky-600'}`}
                                                    title={(!isIssueClosed(issue) || canEditRepairRecords) ? 'แก้ไขข้อมูลแจ้งซ่อม' : 'ดูรายละเอียด'}
                                                >
                                                    {(!isIssueClosed(issue) || canEditRepairRecords) ? <Edit className="w-4 h-4 group-hover:scale-110 transition-transform" /> : <Eye className="w-4 h-4 group-hover:scale-110 transition-transform" />}
                                                </button>
                                            <button
                                                onClick={() => handleOpenMaintenanceReport(issue)}
                                                className="w-9 h-9 flex items-center justify-center text-amber-600 dark:text-amber-400 hover:text-white bg-amber-50 dark:bg-slate-800 hover:bg-amber-600 dark:hover:bg-amber-600 border border-amber-200/80 dark:border-slate-700 hover:border-amber-600 rounded-xl transition-all shadow-sm group"
                                                title="ดูรายงานใบแจ้งซ่อม"
                                            >
                                                <Printer className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleOpenEvidenceReport(issue)}
                                                className="w-9 h-9 flex items-center justify-center text-cyan-600 dark:text-cyan-400 hover:text-white bg-cyan-50 dark:bg-slate-800 hover:bg-cyan-600 dark:hover:bg-cyan-600 border border-cyan-200/80 dark:border-slate-700 hover:border-cyan-600 rounded-xl transition-all shadow-sm group"
                                                title={`รายงานรูปหลักฐาน (${getIssueEvidenceAttachments(issue).length} รูป)`}
                                            >
                                                <ImagePlus className="w-4 h-4 group-hover:scale-110 transition-transform" />
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
                                            {(!canDeleteRecord || canEditAllWork) && issue.status !== 'Cancelled' && issue.status !== 'Closed' && (
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
                                    <td colSpan="7" className="block xl:table-cell px-6 py-12 text-center text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 rounded-2xl xl:rounded-none shadow-sm xl:shadow-none border border-slate-100 dark:border-slate-700 xl:border-none">
                                        ไม่พบรายการแจ้งซ่อมที่ค้นหา
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {filteredIssues.length > 0 && (
                    <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex flex-col gap-3 bg-white/40 dark:bg-slate-800/40 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            แสดง {firstVisibleIssue}-{lastVisibleIssue} จาก {filteredIssues.length} รายการ
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            {paginationPages.map(page => (
                                typeof page === 'string' ? (
                                    <span key={page} className="px-1 text-sm font-semibold text-slate-400 dark:text-slate-500">
                                        ...
                                    </span>
                                ) : (
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
                                )
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
            </>
            )}

            {/* Repair Details Page */}
            {isRepairModalOpen && (
                <div className="animate-fade-in space-y-4">
                    <button
                        type="button"
                        onClick={closeRepairPage}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-indigo-700 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-300"
                    >
                        <ChevronLeft className="h-4 w-4" />
                        ย้อนกลับไปหน้ารายการแจ้งซ่อม
                    </button>

                    <div className="w-full overflow-visible rounded-3xl border border-slate-200 bg-white shadow-xl shadow-indigo-100/40 dark:border-slate-700 dark:bg-slate-800 dark:shadow-indigo-950/20">
                        <div className="px-5 py-4 sm:px-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/80 rounded-t-3xl">
                            <h3 className="text-lg font-bold text-indigo-950 dark:text-indigo-100 flex items-center gap-2">
                                {isRepairReadOnly ? <Eye className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /> : <MessageSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />} {isRepairReadOnly ? 'รายละเอียดงานแจ้งซ่อม' : 'บันทึกรายละเอียดการซ่อม'}
                            </h3>
                            <button
                                onClick={closeRepairPage}
                                className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                <span className="hidden sm:inline">ย้อนกลับ</span>
                            </button>
                        </div>

                        {isRepairReadOnly ? (
                            <div className="px-5 py-4 sm:px-6 sm:py-5">
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
                        <fieldset disabled={isRepairReadOnly} className="m-0 min-w-0 border-0 p-5 sm:p-6 space-y-4 disabled:cursor-default">
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

                            {false && (
                                <div className="space-y-4 rounded-2xl border border-pink-100 bg-pink-50/50 p-4 dark:border-pink-800/60 dark:bg-pink-950/20">
                                    <div className="flex items-start gap-2 text-sm font-bold text-pink-700 dark:text-pink-300">
                                        <FileSignature className="mt-0.5 h-4 w-4" />
                                        <div>
                                            <div>ลายเซ็นผู้แจ้งรับทราบเพื่อเปิด PR ขอซื้ออะไหล่</div>
                                            <p className="mt-1 text-xs font-medium text-pink-600/80 dark:text-pink-200/80">
                                                ใช้ใบแจ้งซ่อมที่มีลายเซ็นนี้แนบเป็นหลักฐานประกอบการเปิด PR ขอซื้ออะไหล่
                                            </p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        <div className="space-y-1">
                                            <label htmlFor="waiting-parts-user-name" className="ml-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                                                ชื่อผู้แจ้ง <span className="text-rose-500">*</span>
                                            </label>
                                            <input
                                                id="waiting-parts-user-name"
                                                type="text"
                                                name="waitingPartsUserName"
                                                value={editFormData.waitingPartsUserName}
                                                onChange={handleEditFormChange}
                                                className="w-full input-modern"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label htmlFor="waiting-parts-user-position" className="ml-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                                                ตำแหน่ง
                                            </label>
                                            <input
                                                id="waiting-parts-user-position"
                                                type="text"
                                                name="waitingPartsUserPosition"
                                                value={editFormData.waitingPartsUserPosition}
                                                onChange={handleEditFormChange}
                                                className="w-full input-modern"
                                                placeholder="-"
                                            />
                                        </div>
                                    </div>
                                    {editFormData.waitingPartsUserSign && (
                                        <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                            มีลายเซ็นผู้แจ้งรับทราบการเปิด PR ขอซื้ออะไหล่เดิมแล้ว เซ็นใหม่เฉพาะเมื่อต้องการแทนที่
                                        </p>
                                    )}
                                    <div>
                                        <div className="mb-2 flex items-center justify-between">
                                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">ลายเซ็นผู้แจ้ง</span>
                                            <button
                                                type="button"
                                                onClick={() => waitingPartsSignatureRef.current?.clear()}
                                                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-500"
                                            >
                                                <Eraser className="h-3.5 w-3.5" />
                                                ล้างลายเซ็น
                                            </button>
                                        </div>
                                        <div className="h-36 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
                                            <SignatureCanvas ref={waitingPartsSignatureRef} canvasProps={{ className: 'h-full w-full', 'aria-label': 'ลายเซ็นผู้แจ้งรับทราบเพื่อเปิด PR ขอซื้ออะไหล่' }} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="rounded-2xl border border-cyan-100 bg-cyan-50/50 p-4 dark:border-cyan-800/60 dark:bg-cyan-900/20">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 text-sm font-bold text-cyan-800 dark:text-cyan-200">
                                            <ImagePlus className="h-4 w-4" />
                                            รูปหลักฐานการซ่อมโดย IT
                                        </div>
                                        <p className="mt-1 text-xs text-cyan-700 dark:text-cyan-300">
                                            แนบรูปหลักฐานการซ่อมก่อนส่งลิงก์ให้ผู้แจ้งเซ็นปิดจบงาน
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            รูปหลักฐานในระบบแล้ว {getIssueEvidenceAttachments(currentRepairIssue).length} รูป
                                        </p>
                                    </div>
                                    <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-white px-4 py-2 text-sm font-semibold text-cyan-700 shadow-sm transition hover:bg-cyan-50 dark:border-cyan-700 dark:bg-slate-800 dark:text-cyan-300 dark:hover:bg-cyan-900/40">
                                        <ImagePlus className="h-4 w-4" />
                                        เพิ่มรูปหลักฐาน IT
                                        <input
                                            ref={evidenceInputRef}
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            className="hidden"
                                            onChange={handleEvidenceFileChange}
                                        />
                                    </label>
                                </div>
                                {pendingEvidenceFiles.length > 0 && (
                                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        {pendingEvidenceFiles.map((file, index) => (
                                            <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm dark:border-cyan-800/50 dark:bg-slate-900/70">
                                                <div className="min-w-0">
                                                    <div className="truncate font-semibold text-slate-700 dark:text-slate-200">{file.name}</div>
                                                    <div className="text-xs text-slate-500 dark:text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => removePendingEvidenceFile(index)}
                                                    className="shrink-0 rounded-full p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-900/30"
                                                    title="เอารูปนี้ออก"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
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
                                        value={currentRepairIssue?.inspectorSignedAt ? formatDate(currentRepairIssue.inspectorSignedAt) : '-'}
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

                            {(ASSIGNABLE_STATUSES.includes(editFormData.status) || editFormData.inspectorSign) && (
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

                            <div className="repair-modal-actions mt-5 flex gap-3 border-t border-slate-100 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.25rem)] dark:border-slate-700">
                                <button
                                    type="button"
                                    onClick={closeRepairPage}
                                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveRepairDetails}
                                    disabled={isUploadingEvidence}
                                    className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 flex items-center justify-center gap-2 transform hover:-translate-y-0.5 transition-all disabled:cursor-not-allowed disabled:opacity-60 disabled:transform-none"
                                >
                                    <Save className="w-4 h-4" /> บันทึกข้อมูล
                                </button>
                            </div>
                        </fieldset>
                        )}

                        {isRepairReadOnly && (
                            <div className="px-4 sm:px-6 py-3 sm:py-4 bg-slate-50/95 dark:bg-slate-700/95 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-700 rounded-b-3xl">
                                <button
                                    onClick={closeRepairPage}
                                    className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                                >
                                    ย้อนกลับ
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {isIssueListPdfPreviewOpen && (
                <div className="fixed inset-0 z-[130] flex flex-col bg-slate-900/80 backdrop-blur-sm animate-fade-in">
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-700 bg-slate-900 px-4 py-3 sm:px-6">
                        <div>
                            <h2 className="text-base font-bold text-white sm:text-lg">ตัวอย่างรายงานรายการแจ้งซ่อม</h2>
                            <p className="text-xs text-slate-400">{filteredIssues.length} รายการ</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={exportToPdf}
                                disabled={isExportingPdf}
                                className="inline-flex h-10 items-center gap-2 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60"
                            >
                                <Download className="h-4 w-4" />
                                {isExportingPdf ? 'กำลังสร้าง...' : 'ดาวน์โหลด PDF'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsIssueListPdfPreviewOpen(false)}
                                className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-slate-300 transition hover:bg-slate-700 hover:text-white"
                                title="ปิดตัวอย่าง"
                                aria-label="ปิดตัวอย่าง"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto bg-slate-200 p-3 sm:p-6">
                        <div className="mx-auto flex min-w-[1000px] max-w-[1123px] flex-col gap-6">
                            {Array.from(
                                { length: Math.ceil(filteredIssues.length / PDF_ITEMS_PER_PAGE) },
                                (_, pageIndex) => {
                                    const pageRows = filteredIssues.slice(
                                        pageIndex * PDF_ITEMS_PER_PAGE,
                                        (pageIndex + 1) * PDF_ITEMS_PER_PAGE
                                    );
                                    const totalPdfPages = Math.ceil(filteredIssues.length / PDF_ITEMS_PER_PAGE);

                                    return (
                                        <section
                                            key={pageIndex}
                                            className="relative overflow-hidden bg-white px-[38px] pb-[28px] pt-[34px] text-slate-700 shadow-2xl"
                                            style={{
                                                width: '1123px',
                                                height: '794px',
                                                fontFamily: 'Sarabun, Tahoma, "Segoe UI", sans-serif',
                                            }}
                                        >
                                            <div className="mb-3 flex items-start justify-between">
                                                <div>
                                                    <h3 className="text-[22px] font-bold text-slate-900">รายงานตารางรายการแจ้งซ่อม/ปัญหา/ขอติดตั้ง</h3>
                                                    <p className="mt-1 text-xs text-slate-500">
                                                        จำนวนทั้งหมด {filteredIssues.length} รายการ{hasActiveFilters ? ' (ตามเงื่อนไขการกรอง)' : ''}
                                                    </p>
                                                    <p className="mt-1 text-xs font-bold text-slate-700">
                                                        {reportDateRangeText}
                                                    </p>
                                                    <p className="mt-1 max-w-[800px] text-[11px] leading-snug text-slate-600">
                                                        {filterSummaryText}
                                                    </p>
                                                </div>
                                                <p className="text-right text-xs text-slate-600">วันที่พิมพ์ {new Date().toLocaleDateString('th-TH')}</p>
                                            </div>

                                            <table className="w-full table-fixed border-collapse text-[11px]">
                                                <thead>
                                                    <tr className="bg-slate-200 text-center font-bold text-slate-800">
                                                        <th className="w-[10%] border border-slate-300 p-1.5">รหัส / วันที่</th>
                                                        <th className="w-[12%] border border-slate-300 p-1.5">ผู้แจ้ง</th>
                                                        <th className="w-[12%] border border-slate-300 p-1.5">แผนก</th>
                                                        <th className="w-[15%] border border-slate-300 p-1.5">หมวดหมู่</th>
                                                        <th className="w-[8%] border border-slate-300 p-1.5">ระดับ</th>
                                                        <th className="w-[25%] border border-slate-300 p-1.5">รายละเอียดปัญหา</th>
                                                        <th className="w-[10%] border border-slate-300 p-1.5">ผู้รับงาน</th>
                                                        <th className="w-[8%] border border-slate-300 p-1.5">สถานะ</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {pageRows.map((issue) => (
                                                        <tr key={issue.id}>
                                                            <td className="border border-slate-300 p-1.5 text-center align-top">
                                                                <div className="max-h-8 overflow-hidden whitespace-pre-line leading-tight">{issue.id || '-'}{'\n'}{formatDate(issue.createdAt)}</div>
                                                            </td>
                                                            <td className="border border-slate-300 p-1.5 align-top"><div className="max-h-8 overflow-hidden leading-tight">{issue.name || '-'}</div></td>
                                                            <td className="border border-slate-300 p-1.5 align-top"><div className="max-h-8 overflow-hidden leading-tight">{issue.department || '-'}</div></td>
                                                            <td className="border border-slate-300 p-1.5 align-top"><div className="max-h-8 overflow-hidden leading-tight">{issue.category || '-'}</div></td>
                                                            <td className="border border-slate-300 p-1.5 text-center align-top"><div className="max-h-8 overflow-hidden leading-tight">{getSeverityText(issue.severity)}</div></td>
                                                            <td className="border border-slate-300 p-1.5 align-top"><div className="whitespace-pre-wrap break-words leading-relaxed">{issue.description || '-'}</div></td>
                                                            <td className="border border-slate-300 p-1.5 text-center align-top"><div className="max-h-8 overflow-hidden leading-tight">{issue.assignedAdmin || 'ยังไม่มีผู้รับงาน'}</div></td>
                                                            <td className="border border-slate-300 p-1.5 text-center align-top">
                                                                <div className="max-h-8 overflow-hidden leading-tight">{getPdfStatusText(isIssueClosed(issue) ? 'Closed' : issue.status)}</div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>

                                            <div className="absolute bottom-[14px] left-[38px] right-[38px] text-center text-[11px] text-slate-500">
                                                หน้า {pageIndex + 1} / {totalPdfPages}
                                            </div>
                                        </section>
                                    );
                                }
                            )}
                        </div>
                    </div>
                </div>
            )}

            {returnInfoIssue && (
                <div className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center overflow-y-auto p-3 sm:p-4 bg-slate-900/40 dark:bg-slate-900/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[calc(100dvh-1.5rem)] overflow-hidden border border-white/20 dark:border-slate-700 transform scale-100 transition-all flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/80">
                            <h3 className="text-lg font-bold text-indigo-950 dark:text-indigo-100 flex items-center gap-2">
                                <Ticket className="w-5 h-5 text-violet-600 dark:text-violet-400" /> ข้อมูลส่งคืน/รับคืนอุปกรณ์
                            </h3>
                            <button
                                onClick={() => setReturnInfoIssue(null)}
                                className="text-slate-400 hover:text-rose-500 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 sm:p-6 overflow-y-auto custom-scrollbar flex-1 min-h-0 space-y-5">
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900/40">
                                <div className="font-bold text-slate-800 dark:text-slate-100">เลขที่เอกสาร: {returnInfoIssue.id}</div>
                                <div className="mt-1 text-slate-500 dark:text-slate-400">ผู้แจ้ง: {returnInfoIssue.name || '-'}</div>
                                <div className="mt-1 text-slate-500 dark:text-slate-400">หมวดหมู่: {returnInfoIssue.category || '-'}</div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
                                    <h4 className="font-bold text-amber-800 dark:text-amber-200">ส่วนผู้ส่งคืน</h4>
                                    <div className="mt-3 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                                        <div>ชื่อ: {displayValue(returnInfoIssue.borrowReturnerName)}</div>
                                        <div>ตำแหน่ง: {displayValue(returnInfoIssue.borrowReturnerPosition)}</div>
                                        <div>วันที่ส่งคืน: {displayDate(returnInfoIssue.borrowReturnedAt)}</div>
                                    </div>
                                    <div className="mt-4 flex h-28 items-center justify-center rounded-xl border border-dashed border-amber-200 bg-white dark:border-amber-900/50 dark:bg-slate-950">
                                        {returnInfoIssue.borrowReturnerSign ? (
                                            <img src={returnInfoIssue.borrowReturnerSign} alt="ลายเซ็นผู้ส่งคืน" className="h-24 w-full object-contain" />
                                        ) : (
                                            <span className="text-sm text-slate-400">ยังไม่มีลายเซ็นผู้ส่งคืน</span>
                                        )}
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                                    <h4 className="font-bold text-emerald-800 dark:text-emerald-200">ส่วนผู้รับคืน</h4>
                                    <div className="mt-3 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                                        <div>ชื่อ: {displayValue(returnInfoIssue.borrowReceiverName)}</div>
                                        <div>ตำแหน่ง: {displayValue(returnInfoIssue.borrowReceiverPosition)}</div>
                                        <div>วันที่รับคืน: {displayDate(returnInfoIssue.borrowReceivedAt)}</div>
                                    </div>
                                    <div className="mt-4 flex h-28 items-center justify-center rounded-xl border border-dashed border-emerald-200 bg-white dark:border-emerald-900/50 dark:bg-slate-950">
                                        {returnInfoIssue.borrowReceiverSign ? (
                                            <img src={returnInfoIssue.borrowReceiverSign} alt="ลายเซ็นผู้รับคืน" className="h-24 w-full object-contain" />
                                        ) : (
                                            <span className="text-sm text-slate-400">ยังไม่มีลายเซ็นผู้รับคืน</span>
                                        )}
                                    </div>
                                </div>
                            </div>
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

            <IssueEvidenceReportPreview
                isOpen={isEvidenceReportOpen}
                onClose={() => setIsEvidenceReportOpen(false)}
                issue={currentEvidenceIssue}
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
                                                onClick={() => openAttachmentPreview(file.url)}
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
                    onClick={closeAttachmentPreview}
                >
                    <div className="relative flex h-[90vh] w-full max-w-6xl flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="mb-3 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setPreviewZoom((zoom) => Math.max(0.5, Number((zoom - 0.25).toFixed(2))))}
                                disabled={previewZoom <= 0.5}
                                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                                title="ย่อรูป"
                            >
                                <ZoomOut className="h-5 w-5" />
                            </button>
                            <div className="min-w-16 rounded-full bg-white/10 px-3 py-2 text-center text-xs font-bold text-white backdrop-blur-md">
                                {Math.round(previewZoom * 100)}%
                            </div>
                            <button
                                type="button"
                                onClick={() => setPreviewZoom((zoom) => Math.min(3, Number((zoom + 0.25).toFixed(2))))}
                                disabled={previewZoom >= 3}
                                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                                title="ขยายรูป"
                            >
                                <ZoomIn className="h-5 w-5" />
                            </button>
                        <button
                            onClick={closeAttachmentPreview}
                                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20 hover:text-rose-300"
                                title="ปิด"
                        >
                                <X className="h-6 w-6" />
                        </button>
                        </div>
                        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-xl">
                            <img
                                src={resolveAttachmentUrl(previewImage)}
                                alt="Preview"
                                className="origin-center rounded-lg object-contain shadow-2xl transition-transform duration-150"
                                style={{
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    transform: `scale(${previewZoom})`
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default IssueDashboard;
