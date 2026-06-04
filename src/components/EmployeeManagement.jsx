import React, { useEffect, useMemo, useRef, useState } from 'react';
import { mysql } from '../mysqlClient';
import {
    Briefcase,
    Edit2,
    Link as LinkIcon,
    MoveRight,
    Search,
    Trash2,
    UserMinus,
    UserPlus,
    Users,
    X
} from 'lucide-react';
import Swal from 'sweetalert2';
import SignatureCanvas from 'react-signature-canvas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toLocalDateInputValue, toMysqlDateTime } from '../utils/dateTime';

const DEPARTMENTS = [
    'แอดมิน',
    'บุคคลและธุรการ',
    'วิศวกรรม',
    'การตลาดและขาย (ในประเทศ)',
    'การตลาดและขาย (ต่างประเทศ)',
    'แอดมินการตลาด',
    'บัญชี',
    'การเงิน',
    'จัดซื้อ',
    'เทคโนโลยีสารสนเทศ และ ERP',
    'วางแผน',
    'ฝ่ายผลิต',
    'ตรวจสอบคุณภาพ',
    'ควบคุมคุณภาพ',
    'บริหารระบบ และ จป.',
    'ออกแบบ',
    'วิจัยและพัฒนาผลิตภัณฑ์',
    'คลังพัสดุและจัดส่ง',
    'ตรวจสอบ',
    'ซ่อมบำรุง',
    'สำนักงานกรรมการ',
    'อื่นๆ'
];

const EMPLOYEE_STATUS = {
    ACTIVE: 'ทำงาน',
    TRANSFERRED: 'โอนย้าย',
    RESIGNED: 'ลาออก'
};

const STATUS_OPTIONS = [
    {
        value: EMPLOYEE_STATUS.ACTIVE,
        label: 'ทำงาน',
        tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
        description: 'พนักงานยังทำงานตามปกติ'
    },
    {
        value: EMPLOYEE_STATUS.TRANSFERRED,
        label: 'โอนย้าย',
        tone: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
        description: 'พนักงานย้ายแผนกหรือย้ายตำแหน่ง'
    },
    {
        value: EMPLOYEE_STATUS.RESIGNED,
        label: 'ลาออก',
        tone: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
        description: 'พนักงานลาออกและยกเลิกคำร้องที่ยังค้างโดยอัตโนมัติ'
    }
];

const FINAL_REQUEST_STATUSES = ['Completed', 'Rejected', 'Cancelled'];

const emptyForm = {
    id: null,
    emp_id: '',
    name_th: '',
    department: '',
    start_date: '',
    status: EMPLOYEE_STATUS.ACTIVE,
    end_date: '',
    transfer_date: '',
    resignation_link: '',
    cancel_it_name: '',
    cancel_it_sign: ''
};

const getStatusMeta = (status) =>
    STATUS_OPTIONS.find((option) => option.value === status) || STATUS_OPTIONS[0];

const toDateInputValue = (value) => {
    if (!value) return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return toLocalDateInputValue(value);
};

const EmployeeManagement = () => {
    const [employees, setEmployees] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [monthFilter, setMonthFilter] = useState(() => toLocalDateInputValue().slice(0, 7));
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('add');
    const [formData, setFormData] = useState(emptyForm);
    const cancelSignatureRef = useRef(null);

    useEffect(() => {
        fetchEmployees();

        const subscription = mysql
            .channel('employees_changes')
            .on('mysql_changes', { event: '*', schema: 'public', table: 'employees' }, fetchEmployees)
            .subscribe();

        return () => {
            mysql.removeChannel(subscription);
        };
    }, []);

    useEffect(() => {
        const intervalId = setInterval(() => {
            if (document.visibilityState === 'visible') {
                fetchEmployees({ silent: true });
            }
        }, 10000);

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                fetchEmployees({ silent: true });
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    const fetchEmployees = async ({ silent = false } = {}) => {
        if (!silent) setIsLoading(true);
        try {
            const { data, error } = await mysql
                .from('employees')
                .select('*')
                .order('emp_id', { ascending: true });

            if (error) throw error;
            setEmployees(data || []);
        } catch (error) {
            console.error('Error fetching employees:', error);
            if (!silent) {
                Swal.fire({
                    title: 'ไม่พบตารางข้อมูล',
                    text: 'กรุณาสร้างตาราง employees ใน MySQL ก่อน',
                    icon: 'warning',
                    confirmButtonColor: '#4f46e5'
                });
            }
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    const filteredEmployees = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        return employees.filter((employee) => {
            const matchesSearch =
                !keyword ||
                employee.emp_id?.includes(keyword) ||
                employee.name_th?.toLowerCase().includes(keyword) ||
                employee.department?.toLowerCase().includes(keyword);
            const matchesStatus = statusFilter === 'All' || employee.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [employees, searchTerm, statusFilter]);

    const isSameMonth = (dateValue) => {
        if (!dateValue || !monthFilter) return false;
        return String(dateValue).slice(0, 7) === monthFilter;
    };

    const monthlyStats = useMemo(() => {
        const newJoiners = employees.filter((employee) => isSameMonth(employee.start_date));
        const exits = employees.filter((employee) => employee.status === EMPLOYEE_STATUS.RESIGNED && isSameMonth(employee.end_date));
        const transfers = employees.filter((employee) => employee.status === EMPLOYEE_STATUS.TRANSFERRED && isSameMonth(employee.transfer_date || employee.updated_at));

        return { newJoiners, exits, transfers };
    }, [employees, monthFilter]);

    const openModal = (employee = null) => {
        if (employee) {
            setModalMode('edit');
            setFormData({
                id: employee.id,
                emp_id: employee.emp_id || '',
                name_th: employee.name_th || '',
                department: employee.department || '',
                start_date: toDateInputValue(employee.start_date),
                status: employee.status || EMPLOYEE_STATUS.ACTIVE,
                end_date: toDateInputValue(employee.end_date),
                transfer_date: toDateInputValue(employee.transfer_date),
                resignation_link: employee.resignation_link || '',
                cancel_it_name: '',
                cancel_it_sign: ''
            });
        } else {
            setModalMode('add');
            setFormData(emptyForm);
        }
        setIsModalOpen(true);
        setTimeout(() => cancelSignatureRef.current?.clear(), 50);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setFormData(emptyForm);
        cancelSignatureRef.current?.clear();
    };

    const updateFormField = (field, value) => {
        setFormData((prev) => {
            const next = { ...prev, [field]: value };

            if (field === 'status') {
                if (value === EMPLOYEE_STATUS.ACTIVE) {
                    next.end_date = '';
                    next.transfer_date = '';
                    next.resignation_link = '';
                }
                if (value === EMPLOYEE_STATUS.TRANSFERRED) {
                    next.end_date = '';
                    next.resignation_link = '';
                }
                if (value === EMPLOYEE_STATUS.RESIGNED) {
                    next.transfer_date = '';
                }
            }

            return next;
        });
    };

    const syncEmployeeDepartmentToReports = async (employeeId, department) => {
        for (const table of ['access_requests', 'change_requests']) {
            const { error } = await mysql
                .from(table)
                .update({ department })
                .eq('employee_id', employeeId);

            if (error) throw error;
        }
    };

    const cancelEmployeeRequests = async (employeeId, cancelData = {}) => {
        const cancelPayload = {
            status: 'Cancelled',
            cancelled_at: toMysqlDateTime(),
            cancel_reason: `ยกเลิกอัตโนมัติ เนื่องจากพนักงานรหัส ${employeeId} มีสถานะลาออก`,
            cancel_it_name: cancelData.cancelItName || null,
            cancel_it_sign: cancelData.cancelItSign || null
        };

        for (const table of ['access_requests', 'change_requests']) {
            const { error } = await mysql
                .from(table)
                .update(cancelPayload)
                .eq('employee_id', employeeId)
                .not('status', FINAL_REQUEST_STATUSES[0])
                .not('status', FINAL_REQUEST_STATUSES[1])
                .not('status', FINAL_REQUEST_STATUSES[2]);

            if (error) throw error;
        }
    };

    const validateForm = () => {
        if (!formData.emp_id || !formData.name_th || !formData.department || !formData.start_date) {
            Swal.fire('ข้อมูลไม่ครบถ้วน', 'กรุณากรอกข้อมูลหลักให้ครบ: รหัส, ชื่อ, แผนก และวันที่เริ่มงาน', 'warning');
            return false;
        }

        if (!/^\d{6}$/.test(formData.emp_id)) {
            Swal.fire('รหัสพนักงานไม่ถูกต้อง', 'รหัสพนักงานต้องเป็นตัวเลข 6 หลัก', 'warning');
            return false;
        }

        if (modalMode === 'edit' && formData.status === EMPLOYEE_STATUS.TRANSFERRED && !formData.transfer_date) {
            Swal.fire('ข้อมูลสถานะไม่ครบ', 'กรุณาระบุวันที่โอนย้าย', 'warning');
            return false;
        }

        if (modalMode === 'edit' && formData.status === EMPLOYEE_STATUS.RESIGNED && !formData.end_date) {
            Swal.fire('ข้อมูลสถานะไม่ครบ', 'กรุณาระบุวันที่ลาออก', 'warning');
            return false;
        }

        if (
            modalMode === 'edit' &&
            formData.status === EMPLOYEE_STATUS.RESIGNED &&
            employees.find((employee) => employee.id === formData.id)?.status !== EMPLOYEE_STATUS.RESIGNED
        ) {
            if (!formData.cancel_it_name.trim()) {
                Swal.fire('ข้อมูลยกเลิกไม่ครบ', 'กรุณาระบุชื่อ IT ผู้ยกเลิกสิทธิ์', 'warning');
                return false;
            }

            if (!cancelSignatureRef.current || cancelSignatureRef.current.isEmpty()) {
                Swal.fire('ข้อมูลยกเลิกไม่ครบ', 'กรุณาให้ IT ลงนามยกเลิกสิทธิ์', 'warning');
                return false;
            }
        }

        return true;
    };

    const saveEmployee = async () => {
        if (!validateForm()) return;
        if (modalMode === 'edit' && !formData.id) {
            Swal.fire('Error', 'ไม่พบรหัสรายการพนักงานที่ต้องการแก้ไข', 'error');
            return;
        }

        const payload = {
            emp_id: formData.emp_id,
            name_th: formData.name_th.trim(),
            department: formData.department,
            start_date: toDateInputValue(formData.start_date),
            status: modalMode === 'add' ? EMPLOYEE_STATUS.ACTIVE : formData.status,
            end_date: modalMode === 'edit' && formData.status === EMPLOYEE_STATUS.RESIGNED ? toDateInputValue(formData.end_date) || null : null,
            transfer_date: modalMode === 'edit' && formData.status === EMPLOYEE_STATUS.TRANSFERRED ? toDateInputValue(formData.transfer_date) || null : null,
            resignation_link: modalMode === 'edit' && formData.status === EMPLOYEE_STATUS.RESIGNED ? formData.resignation_link || null : null
        };

        try {
            if (modalMode === 'add') {
                const { error } = await mysql.from('employees').insert([payload]);
                if (error) throw error;
                Swal.fire('เพิ่มพนักงานแล้ว', 'สร้างข้อมูลพนักงานใหม่เรียบร้อย', 'success');
            } else {
                const original = employees.find((employee) => employee.id === formData.id);
                const wasResigned = original?.status === EMPLOYEE_STATUS.RESIGNED;
                const becomesResigned = formData.status === EMPLOYEE_STATUS.RESIGNED;
                const departmentChanged = original?.department !== formData.department;
                const cancelItSign = becomesResigned && !wasResigned
                    ? cancelSignatureRef.current.getCanvas().toDataURL('image/png')
                    : null;

                const { error } = await mysql.from('employees').update(payload).eq('id', formData.id);
                if (error) throw error;

                if (departmentChanged || formData.status === EMPLOYEE_STATUS.TRANSFERRED) {
                    await syncEmployeeDepartmentToReports(formData.emp_id, formData.department);
                }

                if (becomesResigned && !wasResigned) {
                    await cancelEmployeeRequests(formData.emp_id, {
                        cancelItName: formData.cancel_it_name.trim(),
                        cancelItSign: cancelItSign
                    });
                    Swal.fire('อัปเดตสถานะแล้ว', 'บันทึกสถานะลาออก และยกเลิกคำร้องที่ยังค้างของพนักงานคนนี้แล้ว', 'success');
                } else {
                    Swal.fire('บันทึกแล้ว', 'อัปเดตข้อมูลพนักงานเรียบร้อย', 'success');
                }
            }

            closeModal();
            fetchEmployees();
        } catch (error) {
            console.error('Error saving employee:', error);
            const message = String(error?.message || error);
            const friendlyMessage = message.includes('Duplicate')
                ? 'รหัสพนักงานนี้มีอยู่ในระบบแล้ว'
                : 'ไม่สามารถบันทึกข้อมูลพนักงานได้';
            Swal.fire('Error', friendlyMessage, 'error');
        }
    };

    const deleteEmployee = async (id) => {
        const result = await Swal.fire({
            title: 'ยืนยันการลบ?',
            text: 'ต้องการลบพนักงานคนนี้ใช่ไหม? การทำงานนี้ย้อนกลับไม่ได้',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'ลบข้อมูล',
            cancelButtonText: 'ยกเลิก'
        });

        if (!result.isConfirmed) return;

        try {
            const { error } = await mysql.from('employees').delete().eq('id', id);
            if (error) throw error;
            setEmployees((prev) => prev.filter((employee) => employee.id !== id));
            Swal.fire('ลบสำเร็จ', 'ลบข้อมูลพนักงานเรียบร้อยแล้ว', 'success');
        } catch (error) {
            console.error('Error deleting employee:', error);
            Swal.fire('Error', 'ไม่สามารถลบข้อมูลพนักงานได้', 'error');
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const renderStatusBadge = (status) => {
        const meta = getStatusMeta(status);
        return <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${meta.tone}`}>{meta.label}</span>;
    };

    const renderStatusDate = (employee) => {
        if (employee.status === EMPLOYEE_STATUS.RESIGNED) return formatDate(employee.end_date);
        if (employee.status === EMPLOYEE_STATUS.TRANSFERRED) return formatDate(employee.transfer_date);
        return '-';
    };

    const statusMeta = getStatusMeta(formData.status);

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="flex flex-col items-start gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-100 dark:bg-blue-900/50 rounded-xl text-blue-600 dark:text-blue-300">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">ข้อมูลพนักงาน</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">เพิ่มพนักงานและจัดการสถานะการทำงาน</p>
                    </div>
                </div>

                <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <div className="relative w-full sm:min-w-64 sm:flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="ค้นหารหัส ชื่อ หรือแผนก..."
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            className="input-modern !pl-9 !py-2 !text-sm w-full"
                        />
                    </div>

                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="input-modern !py-2 !text-sm w-full sm:w-44">
                            <SelectValue placeholder="สถานะทั้งหมด" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">สถานะทั้งหมด</SelectItem>
                            {STATUS_OPTIONS.map((status) => (
                                <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <input
                        type="month"
                        value={monthFilter}
                        onChange={(event) => setMonthFilter(event.target.value)}
                        className="input-modern !py-2 !text-sm w-full sm:w-40"
                        title="เลือกเดือนสำหรับสรุป"
                    />

                    <button
                        onClick={() => openModal()}
                        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl transition-colors duration-200 font-medium text-sm whitespace-nowrap"
                    >
                        <UserPlus className="w-4 h-4" />
                        เพิ่มพนักงาน
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                    { label: 'เข้าใหม่เดือนนี้', value: monthlyStats.newJoiners.length, icon: UserPlus, className: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300' },
                    { label: 'ลาออกเดือนนี้', value: monthlyStats.exits.length, icon: UserMinus, className: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300' },
                    { label: 'โอนย้ายเดือนนี้', value: monthlyStats.transfers.length, icon: MoveRight, className: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300' }
                ].map((item) => {
                    const Icon = item.icon;
                    return (
                        <div key={item.label} className="glass-card rounded-2xl p-5 flex items-center gap-4">
                            <div className={`p-3 rounded-xl ${item.className}`}>
                                <Icon className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{item.label}</p>
                                <p className="text-2xl font-extrabold text-slate-800 dark:text-white">{item.value}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {isLoading ? (
                <div className="flex justify-center items-center py-20">
                    <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                </div>
            ) : filteredEmployees.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 p-10 rounded-2xl text-center border border-slate-100 dark:border-slate-700">
                    <Users className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-2">ไม่พบพนักงาน</h3>
                    <p className="text-slate-500 dark:text-slate-400">ยังไม่มีข้อมูลพนักงานในระบบ หรือไม่พบตามเงื่อนไขการค้นหา</p>
                </div>
            ) : (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold uppercase tracking-wider">
                                    <th className="p-4 whitespace-nowrap">รหัส</th>
                                    <th className="p-4 whitespace-nowrap">ชื่อ-สกุล</th>
                                    <th className="p-4 whitespace-nowrap">แผนก</th>
                                    <th className="p-4 whitespace-nowrap">เริ่มงาน</th>
                                    <th className="p-4 whitespace-nowrap">วันที่สถานะ</th>
                                    <th className="p-4 whitespace-nowrap">ใบลาออก</th>
                                    <th className="p-4 whitespace-nowrap">สถานะ</th>
                                    <th className="p-4 text-right whitespace-nowrap">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                {filteredEmployees.map((employee) => (
                                    <tr key={employee.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="p-4 align-middle whitespace-nowrap">
                                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{employee.emp_id}</span>
                                        </td>
                                        <td className="p-4 align-middle">
                                            <span className="font-medium text-slate-800 dark:text-slate-100">{employee.name_th}</span>
                                        </td>
                                        <td className="p-4 align-middle text-slate-700 dark:text-slate-300">{employee.department}</td>
                                        <td className="p-4 align-middle whitespace-nowrap text-slate-600 dark:text-slate-400 text-sm">{formatDate(employee.start_date)}</td>
                                        <td className="p-4 align-middle whitespace-nowrap text-slate-600 dark:text-slate-400 text-sm">{renderStatusDate(employee)}</td>
                                        <td className="p-4 align-middle whitespace-nowrap text-sm">
                                            {employee.resignation_link ? (
                                                <a href={employee.resignation_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold">
                                                    <LinkIcon className="w-4 h-4" />
                                                    เปิดลิงก์
                                                </a>
                                            ) : '-'}
                                        </td>
                                        <td className="p-4 align-middle whitespace-nowrap">{renderStatusBadge(employee.status)}</td>
                                        <td className="p-4 align-middle">
                                            <div className="flex gap-2 justify-end">
                                                <button
                                                    onClick={() => openModal(employee)}
                                                    className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                                                    title="แก้ไขข้อมูลและสถานะ"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => deleteEmployee(employee.id)}
                                                    className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                                    title="ลบ"
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

            {isModalOpen && (
                <div className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center overflow-y-auto p-3 sm:p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl p-5 sm:p-8 space-y-6 border border-slate-200 dark:border-slate-700 max-h-[calc(100dvh-1.5rem)] overflow-y-auto custom-scrollbar">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-2xl font-bold text-slate-800 dark:text-white">
                                    {modalMode === 'add' ? 'เพิ่มพนักงานใหม่' : 'แก้ไขข้อมูลพนักงาน'}
                                </h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                    {modalMode === 'add'
                                        ? 'พนักงานใหม่จะถูกสร้างด้วยสถานะทำงาน'
                                        : 'แก้ไขข้อมูลพื้นฐานและปรับสถานะได้ในฟอร์มเดียว'}
                                </p>
                            </div>
                            <button
                                onClick={closeModal}
                                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                <X className="w-6 h-6 text-slate-500" />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                    รหัสพนักงาน <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.emp_id}
                                    onChange={(event) => updateFormField('emp_id', event.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="เช่น 001234"
                                    maxLength="6"
                                    inputMode="numeric"
                                    className="input-modern w-full"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                    ชื่อ-นามสกุล <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.name_th}
                                    onChange={(event) => updateFormField('name_th', event.target.value)}
                                    placeholder="ชื่อพนักงาน"
                                    className="input-modern w-full"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                    แผนก <span className="text-red-500">*</span>
                                </label>
                                <Select value={formData.department} onValueChange={(value) => updateFormField('department', value)}>
                                    <SelectTrigger className="input-modern w-full">
                                        <SelectValue placeholder="เลือกแผนก" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {DEPARTMENTS.map((department) => (
                                            <SelectItem key={department} value={department}>{department}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                    วันที่เริ่มงาน <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    value={formData.start_date}
                                    onChange={(event) => updateFormField('start_date', event.target.value)}
                                    className="input-modern w-full"
                                />
                            </div>
                        </div>

                        {modalMode === 'edit' && (
                            <div className="space-y-4 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50/80 dark:bg-slate-900/30">
                                <div className="flex items-start gap-3">
                                    <div className={`p-2 rounded-xl ${statusMeta.tone}`}>
                                        <Briefcase className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-800 dark:text-white">สถานะพนักงาน</h4>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">{statusMeta.description}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {STATUS_OPTIONS.map((status) => (
                                        <button
                                            key={status.value}
                                            type="button"
                                            onClick={() => updateFormField('status', status.value)}
                                            className={`text-left rounded-xl border px-4 py-3 transition ${
                                                formData.status === status.value
                                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-300'
                                            }`}
                                        >
                                            <span className="block font-bold text-slate-800 dark:text-white">{status.label}</span>
                                            <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1">{status.description}</span>
                                        </button>
                                    ))}
                                </div>

                                {formData.status === EMPLOYEE_STATUS.TRANSFERRED && (
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                            วันที่โอนย้าย <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="date"
                                            value={formData.transfer_date}
                                            onChange={(event) => updateFormField('transfer_date', event.target.value)}
                                            className="input-modern w-full"
                                        />
                                    </div>
                                )}

                                {formData.status === EMPLOYEE_STATUS.RESIGNED && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                                วันที่ลาออก <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="date"
                                                value={formData.end_date}
                                                onChange={(event) => updateFormField('end_date', event.target.value)}
                                                className="input-modern w-full"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                                ลิงก์ใบแจ้งลาออก
                                            </label>
                                            <input
                                                type="url"
                                                value={formData.resignation_link}
                                                onChange={(event) => updateFormField('resignation_link', event.target.value)}
                                                placeholder="https://..."
                                                className="input-modern w-full"
                                            />
                                        </div>
                                        <div className="sm:col-span-2">
                                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                                ชื่อ IT ผู้ยกเลิกสิทธิ์ <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.cancel_it_name}
                                                onChange={(event) => updateFormField('cancel_it_name', event.target.value)}
                                                placeholder="ระบุชื่อเจ้าหน้าที่ IT"
                                                className="input-modern w-full"
                                            />
                                        </div>
                                        <div className="sm:col-span-2">
                                            <div className="flex justify-between items-center mb-2">
                                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                                                    ลายเซ็น IT ผู้ยกเลิกสิทธิ์ <span className="text-red-500">*</span>
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => cancelSignatureRef.current?.clear()}
                                                    className="text-xs text-red-500 font-bold hover:underline"
                                                >
                                                    ล้างลายเซ็น
                                                </button>
                                            </div>
                                            <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900/50 relative overflow-hidden" style={{ height: '140px' }}>
                                                <SignatureCanvas
                                                    ref={cancelSignatureRef}
                                                    penColor="black"
                                                    canvasProps={{ className: 'w-full h-full xl-signature' }}
                                                />
                                                <div className="absolute bottom-2 right-3 text-slate-400 text-xs pointer-events-none opacity-50">เซ็นชื่อผู้ยกเลิกสิทธิ์ที่นี่</div>
                                            </div>
                                        </div>
                                        <div className="sm:col-span-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-900/20 dark:border-rose-900/40 dark:text-rose-300">
                                            เมื่อบันทึกสถานะลาออก ระบบจะยกเลิกคำร้องขอสิทธิ์และคำร้องขอพัฒนาโปรแกรมที่ยังค้างของพนักงานรหัสนี้โดยอัตโนมัติ
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                            <button
                                onClick={closeModal}
                                className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium"
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={saveEmployee}
                                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium"
                            >
                                {modalMode === 'add' ? 'เพิ่มพนักงาน' : 'บันทึกข้อมูล'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EmployeeManagement;
