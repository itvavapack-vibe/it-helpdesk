import React, { useState, useEffect } from 'react';
import { CheckCircle, Clock, Edit, CheckCircle2, Monitor, ChevronDown, X, ImagePlus, Paperclip } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Combobox } from './ui/combobox';
import Swal from 'sweetalert2';
import { mysql, API_URL } from '../mysqlClient';
import { DEFAULT_ISSUE_CATEGORY, ISSUE_CATEGORIES } from '../config/issueOptions';
const STATUS_ORDER = ['Pending', 'In Progress', 'Resolved'];

const DEPARTMENTS = [
    'แอดมิน', 'บุคคลและธุรการ', 'วิศวกรรม', 'การตลาดและขาย (ในประเทศ)',
    'การตลาดและขาย (ต่างประเทศ)', 'แอดมินการตลาด', 'บัญชี', 'การเงิน',
    'จัดซื้อ', 'เทคโนโลยีสารสนเทศ และ ERP', 'วางแผน', 'ฝ่ายผลิต',
    'ตรวจสอบคุณภาพ', 'ควบคุมคุณภาพ', 'บริหารระบบ และ จป.', 'ออกแบบ',
    'วิจัยและพัฒนาผลิตภัณฑ์', 'คลังพัสดุและจัดส่ง', 'ตรวจสอบ', 'ซ่อมบำรุง',
    'สำนักกรรมการ', 'อื่นๆ'
];

const getStatusBadge = (status) => {
    switch (status) {
        case 'Pending':
            return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200"><Clock className="w-3 h-3" /> รอดำเนินการ</span>;
        case 'In Progress':
            return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200"><Edit className="w-3 h-3" /> กำลังแก้ไข</span>;
        case 'Resolved':
            return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-3 h-3" /> เสร็จสิ้น</span>;
        default:
            return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">{status}</span>;
    }
};

const IssueForm = ({ addIssue, issues = [], isLoading = false, qrParams = null }) => {
    const [formData, setFormData] = useState({
        name: '',
        department: '',
        category: DEFAULT_ISSUE_CATEGORY,
        description: '',
        severity: 'Normal',
        assetId: '',
        assetName: '',
    });
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [computers, setComputers] = useState([]);
    const [glpiUsers, setGlpiUsers] = useState([]);
    const [glpiUsersRaw, setGlpiUsersRaw] = useState([]); // เก็บ object เต็มไว้แปลง AD Username เป็น ชื่อจริง
    const [isLoadingAssets, setIsLoadingAssets] = useState(false);
    const [assetError, setAssetError] = useState(false);

    // Autocomplete dropdown states
    const [assetSearchTerm, setAssetSearchTerm] = useState('');
    const [isAssetDropdownOpen, setIsAssetDropdownOpen] = useState(false);
    const [recentSearchTerm, setRecentSearchTerm] = useState('');

    // Initial load effects
    useEffect(() => {
        const fetchAssets = async () => {
            setIsLoadingAssets(true);
            try {
                const { data, error } = await mysql
                    .from('assets')
                    .select('glpi_id, name, serial, otherserial, users_id')
                    .order('name');
                if (error) throw error;
                // แปลง glpi_id → id เพื่อให้ใช้ร่วมกับโครงสร้างเดิมได้
                setComputers((data || []).map(c => ({ ...c, id: c.glpi_id })));
            } catch {
                setAssetError(true);
            } finally {
                setIsLoadingAssets(false);
            }
        };

        const fetchUsers = async () => {
            try {
                // ดึงข้อมูล User จาก MySQL (ที่ Admin เพิ่งจะ Sync มาจาก GLPI)
                const { data, error } = await mysql.from('glpi_users').select('*');
                if (error) throw error;
                
                // เราไม่ต้อง filter เองแล้วเพราะรายชื่อที่ Sync มาใน db เลือกเฉพาะคนที่ active
                setGlpiUsersRaw(data || []);
            } catch (error) {
                console.error("Failed to load users from MySQL:", error);
                setGlpiUsersRaw([]);
            }
        };

        fetchAssets();
        fetchUsers();
    }, []);

    // Effect For Filtering Users based on Assets
    useEffect(() => {
        if (glpiUsersRaw.length === 0) return;

        // ข้อมูล owner จากเครื่องทั้งหมด 
        const assetUserIds = new Set(computers.map(c => c.users_id).filter(Boolean));

        // กรองหาเฉพาะผู้ใช้งานที่มี id (AD username) อยู่ในรายการเจ้าของเครื่อง
        const usersWithComputers = glpiUsersRaw.filter(u => assetUserIds.has(u.name));

        const uniqueSortedUsers = Array.from(new Set(usersWithComputers.map(u => u.formattedName || u.name))).sort();
        setGlpiUsers(uniqueSortedUsers);
    }, [glpiUsersRaw, computers]);

    // อ่าน QR Code params ที่ส่งมาจาก App.jsx (เก็บไว้ก่อน URL จะถูกลบ)
    useEffect(() => {
        // ต้องรอข้อมูลคอมพิวเตอร์และ User โหลดเสร็จก่อน จึงจะแมพหาชื่อจริงเจอ
        if (computers.length === 0 || glpiUsersRaw.length === 0) return;
        if (!qrParams) return;

        const { assetId, assetName } = qrParams;
        
        if (assetId && assetName) {
            // เมื่อสแกน QR Code ให้หา user ที่เป็นเจ้าของเครื่องนี้มาแสดงด้วยเลย (ถ้ามี)
            const matchedComputer = computers.find(c => String(c.id) === String(assetId));
            let ownerName = formData.name;
            
            if (matchedComputer && matchedComputer.users_id) {
                // แปลง AD username เป็นชื่อจริง 
                const normalize = (str) => (str || '').toLowerCase().replace(/\s+/g, '');
                const userObj = glpiUsersRaw.find(u => normalize(u.name) === normalize(matchedComputer.users_id));
                ownerName = userObj ? (userObj.formattedName || userObj.name) : matchedComputer.users_id;
            }

            setFormData(prev => ({ ...prev, assetId, assetName, name: ownerName }));
            setAssetSearchTerm(assetName);
        }
    }, [computers, glpiUsersRaw, qrParams]);

    // Helper for filtering assets in dropdown
    const filteredAssets = computers.filter(c => {
        const search = assetSearchTerm.toLowerCase();
        return (c.name || '').toLowerCase().includes(search) ||
            (c.serial || '').toLowerCase().includes(search) ||
            (c.users_id || '').toLowerCase().includes(search);
    });

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (!e.target.closest('.asset-dropdown-container')) {
                setIsAssetDropdownOpen(false);
                // Reset search term to selected asset name if closed without selecting
                if (formData.assetName) {
                    setAssetSearchTerm(formData.assetName);
                } else if (!formData.assetId) {
                    setAssetSearchTerm('');
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [formData.assetName, formData.assetId]);

    const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        // Limit to 5 files
        if (selectedFiles.length + files.length > 5) {
            Swal.fire('เกินกำหนด', 'สามารถแนบรูปภาพได้สูงสุด 5 รูป', 'warning');
            return;
        }

        const newFiles = files.map(file => ({
            id: Math.random().toString(36).substr(2, 9),
            file,
            preview: URL.createObjectURL(file)
        }));

        setSelectedFiles(prev => [...prev, ...newFiles]);
    };

    const removeFile = (id) => {
        setSelectedFiles(prev => {
            const filtered = prev.filter(f => f.id !== id);
            // Cleanup preview URL
            const removed = prev.find(f => f.id === id);
            if (removed) URL.revokeObjectURL(removed.preview);
            return filtered;
        });
    };

    const uploadFiles = async () => {
        if (selectedFiles.length === 0) return [];
        
        setIsUploading(true);
        const formData = new FormData();
        selectedFiles.forEach(f => {
            formData.append('files', f.file);
        });

        try {
            const response = await fetch(`${API_URL}/api/upload`, {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            if (result.error) throw new Error(result.error);
            return result.data; // [{name, url}]
        } catch (error) {
            console.error('Upload failed:', error);
            throw error;
        } finally {
            setIsUploading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'assetId') {
            const selected = computers.find(c => String(c.id) === value);
            
            let ownerName = formData.name;
            if (selected && selected.users_id) {
                 // แปลง AD username จากเครื่อง เป็นชื่อจริง แบบไม่สนใจช่องว่างและพิมพ์เล็กใหญ่
                 const normalize = (str) => (str || '').toLowerCase().replace(/\s+/g, '');
                 const userObj = glpiUsersRaw.find(u => normalize(u.name) === normalize(selected.users_id));
                 ownerName = userObj ? (userObj.formattedName || userObj.name) : selected.users_id;
            }

            setFormData(prev => ({ 
                ...prev, 
                assetId: value, 
                assetName: selected ? selected.name : '',
                // Auto-fill ชื่อถ้ายังไม่ได้กรอก และเครื่องมีเจ้าของ
                name: prev.name || ownerName
            }));
        } else if (name === 'name') {
            const newValue = value;
            
            // ถ้าลบชื่อออกจนหมด ให้เคลียร์เครื่องทิ้งด้วยเลย
            if (newValue.trim() === '') {
                setFormData(prev => ({ 
                    ...prev, 
                    name: '',
                    assetId: '',
                    assetName: ''
                }));
                setAssetSearchTerm('');
                return;
            }

            const normalize = (str) => (str || '').toLowerCase().replace(/\s+/g, '');
            const normalizedInput = normalize(newValue);

            // หา AD Username ของชื่อที่ผู้ใช้พิมพ์มา 
            // 1. ลองหาจาก formattedName (ชื่อจริง)
            // 2. ลองหาจาก name (AD Username ตรงๆ)
            // 3. Fallback เผื่อพิมพ์ชื่อภาษาอังกฤษแล้วตรงกับส่วนหนึ่งของ AD
            const matchedUserObj = glpiUsersRaw.find(u => 
                normalize(u.formattedName) === normalizedInput || 
                normalize(u.name) === normalizedInput ||
                (u.formattedName && u.formattedName.toLowerCase().includes(newValue.toLowerCase()))
            );
            
            const adUsername = matchedUserObj ? matchedUserObj.name : newValue;

            // ตรวจสอบเครื่องที่เกี่ยวข้องกันกับ AD Username นี้
            const userComputers = computers.filter(c => 
                normalize(c.users_id) === normalize(adUsername)
            );
            
            setFormData(prev => {
                const newState = { ...prev, [name]: newValue };
                
                // ถ้าเจอเครื่องของคนนี้แค่ 1 เครื่อง ให้ auto-select ทับไปเลยทันที
                if (userComputers.length === 1) {
                    const pc = userComputers[0];
                    if (prev.assetId !== String(pc.id)) {
                        newState.assetId = String(pc.id);
                        newState.assetName = pc.name;
                        setAssetSearchTerm(pc.name);
                    }
                } else if (userComputers.length > 1) {
                    // ถ้ามีหลายเครื่อง ให้เปิด dropdown และกรองชื่อเครื่องเฉพาะของคนนี้
                    // แต่ถ้าเขาเลือกเครื่องไว้อยู่แล้วแบบตั้งใจ เราก็ไม่ต้องเคลียร์ ให้เขาเปลี่ยนเอง
                    if (!prev.assetId || !userComputers.find(c => String(c.id) === prev.assetId)) {
                        newState.assetId = ''; 
                        newState.assetName = '';
                        setAssetSearchTerm(adUsername); // Search by owner
                        setIsAssetDropdownOpen(true);   // Auto-open dropdown
                    }
                } else if (prev.assetId) {
                    // ป้องกันการเอาเครื่องออกในกรณีที่เปลี่ยนชื่อนิดเดียวหรือพิมพ์ยังไม่เสร็จ
                    // ถ้าชื่อใหม่ที่ถูกพิมพ์ ไม่ได้เป็นเจ้าของเครื่องที่เลือกอยู่ปัจจุบัน ให้ปลดเครื่องออก
                    const currentAsset = computers.find(c => String(c.id) === prev.assetId);
                    if (currentAsset && normalize(currentAsset.users_id) !== normalize(adUsername)) {
                        // เช็คอีกรอบ เผื่อว่าชื่อที่พิมพ์มาใหม่ มันคือ AD username ของเครื่องเดิม
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
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name || !formData.department || !formData.description) {
            Swal.fire({
                title: 'ข้อมูลไม่ครบถ้วน',
                text: 'กรุณากรอกข้อมูลที่มีเครื่องหมาย * ให้ครบถ้วน',
                icon: 'warning',
                confirmButtonColor: '#4f46e5',
            });
            return;
        }

        if (!DEPARTMENTS.includes(formData.department)) {
            Swal.fire({
                title: 'แผนกไม่ถูกต้อง',
                text: 'กรุณาเลือกชื่อแผนกจากตัวเลือกที่กำหนดให้เท่านั้น (ห้ามพิมพ์แผนกมั่วเอง)',
                icon: 'error',
                confirmButtonColor: '#4f46e5',
            });
            return;
        }

        const confirm = await Swal.fire({
            title: 'ยืนยันการส่งข้อมูล?',
            text: "ตรวจสอบข้อมูลการแจ้งซ่อมของคุณให้ถูกต้องก่อนกดยืนยัน",
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#4f46e5',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'ยืนยันการส่ง',
            cancelButtonText: 'ยกเลิก',
            reverseButtons: true
        });

        if (confirm.isConfirmed) {
            try {
                // Upload files first
                const attachments = await uploadFiles();

                const newIssue = {
                    ...formData,
                    id: Date.now().toString(),
                    status: 'Pending',
                    attachments: attachments,
                    createdAt: new Date().toISOString(),
                };

                addIssue(newIssue);
                setFormData({
                    name: '',
                    department: '',
                    category: DEFAULT_ISSUE_CATEGORY,
                    description: '',
                    severity: 'Normal',
                    assetId: '',
                    assetName: '',
                });
                setSelectedFiles([]);

                Swal.fire({
                    title: 'ส่งข้อมูลสำเร็จ!',
                    text: 'ได้รับข้อมูลแจ้งซ่อมของคุณเรียบร้อยแล้ว',
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false
                });
            } catch (error) {
                Swal.fire('Error', 'ไม่สามารถอัปโหลดไฟล์ได้: ' + error.message, 'error');
            }
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const filteredRecentIssues = issues
        .filter((issue) => {
            const term = recentSearchTerm.trim().toLowerCase();
            if (!term) return true;
            return [
                issue.id,
                issue.name,
                issue.department,
                issue.category,
                issue.description,
                issue.status,
                issue.assignedAdmin,
            ]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(term));
        })
        .slice(0, 10);

    return (
        <div className="space-y-8">
            {/* Issue Report Form */}
            <div className="max-w-2xl mx-auto glass-card p-8 sm:p-10 rounded-3xl relative">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-indigo-950 dark:text-indigo-100 tracking-tight text-center">แจ้งปัญหาการใช้งาน<br /><span className="text-lg font-medium text-slate-500 dark:text-slate-400 mt-1 block">Report Support Issue</span></h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label htmlFor="name" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 ml-1">ชื่อ-นามสกุล <span className="text-rose-500 dark:text-rose-400">*</span></label>
                            <Combobox
                                options={glpiUsers.map(name => ({ label: name, value: name }))}
                                value={formData.name}
                                onValueChange={(value) => handleChange({ target: { name: 'name', value } })}
                                placeholder="นาย สมชาย ใจดี"
                                searchPlaceholder="ค้นหาชื่อ..."
                            />
                        </div>
                        <div className="space-y-1">
                            <label htmlFor="department" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 ml-1">แผนก <span className="text-rose-500 dark:text-rose-400">*</span></label>
                            <Combobox
                                options={DEPARTMENTS.map(dept => ({ label: dept, value: dept }))}
                                value={formData.department}
                                onValueChange={(value) => handleChange({ target: { name: 'department', value } })}
                                placeholder="แอดมิน"
                                searchPlaceholder="ค้นหาแผนก..."
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1">
                            <label htmlFor="category" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 ml-1">หมวดหมู่ปัญหา</label>
                            <Select
                                value={formData.category}
                                onValueChange={(value) => handleChange({ target: { name: 'category', value } })}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="เลือกหมวดหมู่ปัญหา" />
                                </SelectTrigger>
                                <SelectContent>
                                    {ISSUE_CATEGORIES.map(category => (
                                        <SelectItem key={category} value={category}>{category}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <label htmlFor="severity" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 ml-1">ระดับความรุนแรง</label>
                            <Select
                                value={formData.severity}
                                onValueChange={(value) => handleChange({ target: { name: 'severity', value } })}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="เลือกระดับความรุนแรง" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Normal">ปกติ (Normal)</SelectItem>
                                    <SelectItem value="Urgent">ด่วน (Urgent)</SelectItem>
                                    <SelectItem value="Most Urgent">ด่วนที่สุด (Most Urgent)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* GLPI Asset Selector */}
                    <div className="space-y-1">
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
                            <Combobox
                                options={computers.map(c => ({
                                    label: `${c.name} ${c.serial ? `(S/N: ${c.serial})` : ''} ${c.users_id ? `[👩‍💻 ${c.users_id}]` : ''}`,
                                    value: String(c.id)
                                }))}
                                value={String(formData.assetId)}
                                onValueChange={(value) => handleChange({ target: { name: 'assetId', value } })}
                                placeholder="-- ไม่ระบุอุปกรณ์ --"
                                searchPlaceholder="พิมพ์ค้นหาอุปกรณ์..."
                            />
                        )}
                    </div>

                    <div className="space-y-1">
                        <label htmlFor="description" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 ml-1">รายละเอียดปัญหา <span className="text-rose-500 dark:text-rose-400">*</span></label>
                        <textarea
                            id="description"
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            rows="4"
                            className="w-full input-modern resize-y"
                            placeholder="อธิบายปัญหาที่พบอย่างละเอียด..."
                        ></textarea>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 ml-1 flex items-center gap-1.5">
                            <ImagePlus className="w-4 h-4 text-indigo-400" /> แนบรูปภาพประกอบ
                            <span className="text-xs font-normal text-slate-400">(สูงสุด 5 รูป)</span>
                        </label>
                        
                        <div className="flex flex-wrap gap-3">
                            {selectedFiles.map(file => (
                                <div key={file.id} className="relative group w-20 h-20 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
                                    <img src={file.preview} alt="preview" className="w-full h-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => removeFile(file.id)}
                                        className="absolute top-1 right-1 bg-rose-500 text-white rounded-full p-0.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                            
                            {selectedFiles.length < 5 && (
                                <label className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group">
                                    <ImagePlus className="w-6 h-6 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                                    <span className="text-[10px] text-slate-400 mt-1">เพิ่มรูป</span>
                                    <input
                                        type="file"
                                        multiple
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleFileChange}
                                        disabled={isUploading}
                                    />
                                </label>
                            )}
                        </div>
                    </div>

                    <div className="pt-6 flex justify-center">
                        <button
                            type="submit"
                            disabled={isUploading}
                            className="w-full sm:w-auto bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold py-3 px-8 rounded-xl shadow-lg shadow-indigo-200/50 dark:shadow-indigo-900/30 transform hover:-translate-y-0.5 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isUploading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    กำลังส่งข้อมูล...
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-5 h-5" /> ส่งข้อมูลแจ้งซ่อม
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>

            {/* Recent Issues List */}
            <div className="max-w-4xl mx-auto">
                <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-indigo-500" />
                    รายการแจ้งซ่อมล่าสุด
                </h3>

                <div className="mb-4">
                    <input
                        type="text"
                        value={recentSearchTerm}
                        onChange={(e) => setRecentSearchTerm(e.target.value)}
                        className="w-full input-modern"
                        placeholder="ค้นหาจากชื่อ, รหัสแจ้งซ่อม, รายละเอียด, แผนก, หมวดหมู่ หรือสถานะ"
                    />
                </div>

                {isLoading ? (
                    <div className="glass-card rounded-2xl p-10 flex justify-center items-center">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                            <p className="text-sm text-slate-500 dark:text-slate-400 animate-pulse">กำลังโหลดข้อมูล...</p>
                        </div>
                    </div>
                ) : filteredRecentIssues.length === 0 ? (
                    <div className="glass-card rounded-2xl p-10 text-center text-slate-400 dark:text-slate-500">
                        ยังไม่มีรายการแจ้งซ่อม
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredRecentIssues.map((issue) => (
                            <div key={issue.id} className="glass-card rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 hover:shadow-lg transition-shadow">
                                {/* Left: ID + Date */}
                                <div className="shrink-0">
                                    <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/40 px-2.5 py-1 rounded-lg border border-indigo-100 dark:border-indigo-800 inline-block">
                                        {issue.id}
                                    </div>
                                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{formatDate(issue.createdAt)}</div>
                                </div>

                                {/* Middle: Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{issue.description}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        {issue.name} · {issue.department} · {issue.category}
                                    </p>
                                    {issue.assignedAdmin && (
                                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-semibold">
                                            👤 ผู้รับงาน: {issue.assignedAdmin}
                                        </p>
                                    )}
                                </div>

                                {/* Right: Status */}
                                <div className="shrink-0 flex flex-col items-end gap-2">
                                    {getStatusBadge(issue.status)}
                                    {issue.status === 'Resolved' && issue.userCloseSign && (
                                        <span className="text-xs text-emerald-600 font-medium">✓ เซ็นปิดงานแล้ว</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default IssueForm;
