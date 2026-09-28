import React, { useEffect, useMemo, useState } from 'react';
import { mysql } from '@/mysqlClient';
import {
    BellRing,
    Briefcase,
    Check,
    CheckCheck,
    Edit2,
    MoveRight,
    RefreshCw,
    Search,
    Trash2,
    UserMinus,
    UserPlus,
    Users,
    X
} from 'lucide-react';
import Swal from 'sweetalert2';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { toLocalDateInputValue, toMysqlDateTime } from '@/utils/dateTime';
import { ROLES, normalizeRoleValue } from '@/config/roles';

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
    'ประกันคุณภาพ',
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

const NOTIFICATION_TYPES = {
    hired: { label: 'พนักงานเข้าใหม่', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' },
    transferred: { label: 'พนักงานโอนย้าย', tone: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300' },
    resigned: { label: 'พนักงานลาออก', tone: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300' },
    active: { label: 'กลับเข้าทำงาน', tone: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300' },
};

const emptyForm = {
    id: null,
    emp_id: '',
    name_th: '',
    name_en: '',
    department: '',
    position: '',
    start_date: '',
    status: EMPLOYEE_STATUS.ACTIVE,
    end_date: '',
    transfer_date: '',
    transfer_department: '',
    transfer_position: '',
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

const MONTH_OPTIONS = [
    { value: '01', label: 'มกราคม' },
    { value: '02', label: 'กุมภาพันธ์' },
    { value: '03', label: 'มีนาคม' },
    { value: '04', label: 'เมษายน' },
    { value: '05', label: 'พฤษภาคม' },
    { value: '06', label: 'มิถุนายน' },
    { value: '07', label: 'กรกฎาคม' },
    { value: '08', label: 'สิงหาคม' },
    { value: '09', label: 'กันยายน' },
    { value: '10', label: 'ตุลาคม' },
    { value: '11', label: 'พฤศจิกายน' },
    { value: '12', label: 'ธันวาคม' }
];

const getDepartmentOptions = (...currentDepartments) => {
    const extraDepartments = currentDepartments
        .map((department) => String(department || '').trim())
        .filter(Boolean);

    return [...new Set([...DEPARTMENTS, ...extraDepartments])];
};

const EmployeeManagement = ({ currentAdmin }) => {
    const [employees, setEmployees] = useState([]);
    const [transferHistories, setTransferHistories] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [monthlyEventFilter, setMonthlyEventFilter] = useState('All');
    const currentMonthFilter = toLocalDateInputValue().slice(0, 7);
    const initialMonthFilter = '';
    const [monthFilter, setMonthFilter] = useState(initialMonthFilter);
    const [monthInput, setMonthInput] = useState(currentMonthFilter.slice(5, 7));
    const [yearInput, setYearInput] = useState(currentMonthFilter.slice(0, 4));
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('add');
    const [formData, setFormData] = useState(emptyForm);
    const [employeeNotifications, setEmployeeNotifications] = useState([]);
    const [notificationFilter, setNotificationFilter] = useState('unread');
    const [notificationError, setNotificationError] = useState('');
    const [isNotificationLoading, setIsNotificationLoading] = useState(false);
    const isItHardwareRole = normalizeRoleValue(currentAdmin?.role) === ROLES.IT_SUPPORT;
    const isHrRole = normalizeRoleValue(currentAdmin?.role) === ROLES.HR;

    useEffect(() => {
        fetchEmployees();
        fetchTransferHistories();
        if (isItHardwareRole) fetchEmployeeNotifications();

        const subscription = mysql
            .channel('employees_changes')
            .on('mysql_changes', { event: '*', schema: 'public', table: 'employees' }, fetchEmployees)
            .subscribe();

        return () => {
            mysql.removeChannel(subscription);
        };
    }, [isItHardwareRole]);

    useEffect(() => {
        const intervalId = setInterval(() => {
            if (document.visibilityState === 'visible') {
                fetchEmployees({ silent: true });
                fetchTransferHistories({ silent: true });
                if (isItHardwareRole) fetchEmployeeNotifications({ silent: true });
            }
        }, 10000);

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                fetchEmployees({ silent: true });
                fetchTransferHistories({ silent: true });
                if (isItHardwareRole) fetchEmployeeNotifications({ silent: true });
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isItHardwareRole]);

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

    const fetchTransferHistories = async ({ silent = true } = {}) => {
        try {
            const { data, error } = await mysql
                .from('employee_transfers')
                .select('*')
                .order('transfer_date', { ascending: false });

            if (error) throw error;
            setTransferHistories(data || []);
        } catch (error) {
            console.error('Error fetching employee transfer history:', error);
            if (!silent) {
                Swal.fire('ไม่พบตารางประวัติโอนย้าย', 'กรุณารัน migration employee transfer history ก่อน', 'warning');
            }
        }
    };

    const fetchEmployeeNotifications = async ({ silent = false } = {}) => {
        if (!isItHardwareRole) return;
        if (!silent) setIsNotificationLoading(true);
        setNotificationError('');
        try {
            const { data, error } = await mysql
                .from('employee_status_notifications')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            setEmployeeNotifications(data || []);
        } catch (error) {
            console.error('Error fetching employee status notifications:', error);
            setNotificationError('ไม่สามารถโหลดการแจ้งเตือนสถานะพนักงานได้');
        } finally {
            if (!silent) setIsNotificationLoading(false);
        }
    };

    const isSameMonth = (dateValue) => {
        if (!dateValue || !monthFilter) return false;
        return toDateInputValue(dateValue).slice(0, 7) === monthFilter;
    };

    const yearFilter = /^\d{4}$/.test(yearInput) ? yearInput : '';

    const isSameYear = (dateValue) => {
        if (!dateValue || !yearFilter) return false;
        return toDateInputValue(dateValue).slice(0, 4) === yearFilter;
    };

    const hasTransferInSelectedYear = (employee) => {
        const employeeId = String(employee?.emp_id || '').trim();
        if (!employeeId || !yearFilter) return false;

        if (isSameYear(employee.transfer_date)) return true;

        return transferHistories.some((transfer) =>
            String(transfer.emp_id || '').trim() === employeeId &&
            isSameYear(transfer.transfer_date)
        );
    };

    const isActiveInSelectedYear = (employee) => {
        if (employee.status !== EMPLOYEE_STATUS.ACTIVE) return false;
        if (!yearFilter) return true;

        const startYear = toDateInputValue(employee.start_date).slice(0, 4);
        return !startYear || startYear <= yearFilter;
    };

    const hasTransferInSelectedMonth = (employee) => {
        const employeeId = String(employee?.emp_id || '').trim();
        if (!employeeId) return false;

        if (isSameMonth(employee.transfer_date)) return true;

        return transferHistories.some((transfer) =>
            String(transfer.emp_id || '').trim() === employeeId &&
            isSameMonth(transfer.transfer_date)
        );
    };

    const isEmployeeInSelectedMonth = (employee) => {
        return (
            isSameMonth(employee.start_date) ||
            (employee.status === EMPLOYEE_STATUS.RESIGNED && isSameMonth(employee.end_date)) ||
            hasTransferInSelectedMonth(employee)
        );
    };

    const monthlyStats = useMemo(() => {
        if (!monthFilter) return { newJoiners: [], exits: [], transfers: [] };

        const newJoiners = employees.filter((employee) => isSameMonth(employee.start_date));
        const exits = employees.filter((employee) => employee.status === EMPLOYEE_STATUS.RESIGNED && isSameMonth(employee.end_date));
        const transfers = employees.filter(hasTransferInSelectedMonth);

        return { newJoiners, exits, transfers };
    }, [employees, transferHistories, monthFilter]);

    const yearlyStats = useMemo(() => ({
        total: employees.length,
        active: employees.filter(isActiveInSelectedYear).length,
        resigned: employees.filter((employee) => employee.status === EMPLOYEE_STATUS.RESIGNED && (!yearFilter || isSameYear(employee.end_date))).length,
        transferred: employees.filter((employee) => !yearFilter
            ? employee.status === EMPLOYEE_STATUS.TRANSFERRED
            : hasTransferInSelectedYear(employee)).length
    }), [employees, transferHistories, yearFilter]);

    const filteredEmployees = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        return employees.filter((employee) => {
            const matchesSearch =
                !keyword ||
                employee.emp_id?.includes(keyword) ||
                employee.name_th?.toLowerCase().includes(keyword) ||
                employee.name_en?.toLowerCase().includes(keyword) ||
                employee.department?.toLowerCase().includes(keyword) ||
                employee.position?.toLowerCase().includes(keyword) ||
                employee.transfer_department?.toLowerCase().includes(keyword) ||
                employee.transfer_position?.toLowerCase().includes(keyword);
            const matchesStatus =
                statusFilter === 'All' ||
                (statusFilter === EMPLOYEE_STATUS.ACTIVE && !monthFilter && yearFilter
                    ? isActiveInSelectedYear(employee)
                    : statusFilter === EMPLOYEE_STATUS.RESIGNED && !monthFilter && yearFilter
                        ? employee.status === EMPLOYEE_STATUS.RESIGNED && isSameYear(employee.end_date)
                        : statusFilter === EMPLOYEE_STATUS.TRANSFERRED && monthFilter
                            ? hasTransferInSelectedMonth(employee)
                            : statusFilter === EMPLOYEE_STATUS.TRANSFERRED && yearFilter
                                ? hasTransferInSelectedYear(employee)
                                : employee.status === statusFilter);
            const matchesMonth = !monthFilter || isEmployeeInSelectedMonth(employee);
            const matchesMonthlyEvent =
                monthlyEventFilter === 'All' ||
                (monthlyEventFilter === 'newJoiners' && isSameMonth(employee.start_date)) ||
                (monthlyEventFilter === 'exits' && employee.status === EMPLOYEE_STATUS.RESIGNED && isSameMonth(employee.end_date)) ||
                (monthlyEventFilter === 'transfers' && hasTransferInSelectedMonth(employee));
            return matchesSearch && matchesStatus && matchesMonth && matchesMonthlyEvent;
        });
    }, [employees, transferHistories, searchTerm, statusFilter, monthFilter, monthlyEventFilter, yearFilter]);

    const departmentOptions = useMemo(
        () => getDepartmentOptions(formData.department, formData.transfer_department),
        [formData.department, formData.transfer_department]
    );

    const transferHistoriesByEmployee = useMemo(() => {
        const map = new Map();
        transferHistories.forEach((transfer) => {
            const employeeId = String(transfer.emp_id || '').trim();
            if (!employeeId) return;
            if (!map.has(employeeId)) map.set(employeeId, []);
            map.get(employeeId).push(transfer);
        });
        return map;
    }, [transferHistories]);

    const updateMonthFilterPart = (part, value) => {
        const nextMonth = part === 'month' ? value : monthInput;
        const nextYear = part === 'year' ? value.replace(/\D/g, '').slice(0, 4) : yearInput;

        if (part === 'month') setMonthInput(nextMonth);
        if (part === 'year') setYearInput(nextYear);

        if (!nextMonth || nextYear.length !== 4) {
            setMonthFilter('');
            setMonthlyEventFilter('All');
            return;
        }

        setMonthFilter(`${nextYear}-${nextMonth}`);
    };

    const openModal = (employee = null) => {
        if (employee) {
            setModalMode('edit');
            setFormData({
                id: employee.id,
                emp_id: employee.emp_id || '',
                name_th: employee.name_th || '',
                name_en: employee.name_en || '',
                department: employee.department || '',
                position: employee.position || '',
                start_date: toDateInputValue(employee.start_date),
                status: employee.status || EMPLOYEE_STATUS.ACTIVE,
                end_date: toDateInputValue(employee.end_date),
                transfer_date: toDateInputValue(employee.transfer_date),
                transfer_department: employee.transfer_department || '',
                transfer_position: employee.transfer_position || '',
                resignation_link: employee.resignation_link || '',
                cancel_it_name: '',
                cancel_it_sign: ''
            });
        } else {
            setModalMode('add');
            setFormData(emptyForm);
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setFormData(emptyForm);
    };

    const updateFormField = (field, value) => {
        setFormData((prev) => {
            const next = { ...prev, [field]: value };

            if (field === 'status') {
                if (value === EMPLOYEE_STATUS.ACTIVE) {
                    next.end_date = '';
                    next.transfer_date = '';
                    next.transfer_department = '';
                    next.transfer_position = '';
                    next.resignation_link = '';
                }
                if (value === EMPLOYEE_STATUS.TRANSFERRED) {
                    next.end_date = '';
                    next.resignation_link = '';
                    next.transfer_department = prev.transfer_department || prev.department || '';
                    next.transfer_position = prev.transfer_position || prev.position || '';
                }
                if (value === EMPLOYEE_STATUS.RESIGNED) {
                    next.transfer_date = '';
                    next.transfer_department = '';
                    next.transfer_position = '';
                    next.cancel_it_name = prev.cancel_it_name || currentAdmin?.name || currentAdmin?.username || '';
                }
            }

            return next;
        });
    };

    const syncEmployeeProfileToReports = async (employeeId, department, position) => {
        const targets = [
            { table: 'access_requests', payload: { department, position } },
            { table: 'change_requests', payload: { department, requester_position: position } }
        ];

        for (const target of targets) {
            const { error } = await mysql
                .from(target.table)
                .update(target.payload)
                .eq('employee_id', employeeId);

            if (error) throw error;
        }
    };

    const addTransferHistory = async (employeeId, originalEmployee, transferData) => {
        const { error } = await mysql.from('employee_transfers').insert([{
            emp_id: employeeId,
            transfer_date: toDateInputValue(transferData.transferDate),
            from_department: originalEmployee?.department || null,
            from_position: originalEmployee?.position || null,
            to_department: transferData.toDepartment,
            to_position: transferData.toPosition
        }]);

        if (error) throw error;
    };

    const createEmployeeStatusNotification = async ({ original, payload, changeType, effectiveDate, employeeRecordId }) => {
        if (!isHrRole) return true;
        const eventKeySuffix = changeType === 'transferred' || changeType === 'active'
            ? `${effectiveDate || 'no-date'}:${Date.now()}`
            : effectiveDate || 'no-date';
        const { error } = await mysql.from('employee_status_notifications').insert([{
            event_key: `${changeType}:${payload.emp_id}:${eventKeySuffix}`,
            employee_id: employeeRecordId || original?.id || null,
            emp_id: payload.emp_id,
            employee_name: payload.name_th,
            change_type: changeType,
            from_status: original?.status || null,
            to_status: payload.status,
            from_department: original?.department || null,
            to_department: payload.department || null,
            from_position: original?.position || null,
            to_position: payload.position || null,
            effective_date: effectiveDate || null,
            source_admin_id: currentAdmin?.id || null,
            source_admin_name: currentAdmin?.name || currentAdmin?.username || 'ฝ่ายบุคคล',
        }]);
        if (error) {
            console.error('Error creating employee status notification:', error);
            return false;
        }
        return true;
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
        if (!formData.emp_id || !formData.name_th || !formData.department || !formData.position || !formData.start_date) {
            Swal.fire('ข้อมูลไม่ครบถ้วน', 'กรุณากรอกข้อมูลหลักให้ครบ: รหัส, ชื่อ, แผนก, ตำแหน่ง และวันที่เริ่มงาน', 'warning');
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

        if (modalMode === 'edit' && formData.status === EMPLOYEE_STATUS.TRANSFERRED && (!formData.transfer_department || !formData.transfer_position.trim())) {
            Swal.fire('ข้อมูลสถานะไม่ครบ', 'กรุณาระบุแผนกโอนย้ายและตำแหน่งโอนย้าย', 'warning');
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
                Swal.fire('ข้อมูลยกเลิกไม่ครบ', 'กรุณาระบุผู้แจ้ง', 'warning');
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

        const isTransferUpdate = modalMode === 'edit' && formData.status === EMPLOYEE_STATUS.TRANSFERRED;
        const nextDepartment = isTransferUpdate ? formData.transfer_department : formData.department;
        const nextPosition = isTransferUpdate ? formData.transfer_position.trim() : formData.position.trim();

        const payload = {
            emp_id: formData.emp_id,
            name_th: formData.name_th.trim(),
            name_en: formData.name_en.trim() || null,
            department: nextDepartment,
            position: nextPosition,
            start_date: toDateInputValue(formData.start_date),
            status: modalMode === 'add' ? EMPLOYEE_STATUS.ACTIVE : formData.status,
            end_date: modalMode === 'edit' && formData.status === EMPLOYEE_STATUS.RESIGNED ? toDateInputValue(formData.end_date) || null : null,
            transfer_date: modalMode === 'edit' && formData.status === EMPLOYEE_STATUS.TRANSFERRED ? toDateInputValue(formData.transfer_date) || null : null,
            transfer_department: modalMode === 'edit' && formData.status === EMPLOYEE_STATUS.TRANSFERRED ? formData.transfer_department || null : null,
            transfer_position: modalMode === 'edit' && formData.status === EMPLOYEE_STATUS.TRANSFERRED ? formData.transfer_position.trim() || null : null,
            resignation_link: modalMode === 'edit' && formData.status === EMPLOYEE_STATUS.RESIGNED ? formData.resignation_link || null : null
        };

        try {
            if (modalMode === 'add') {
                const { error } = await mysql.from('employees').insert([payload]);
                if (error) throw error;
                const notificationSaved = await createEmployeeStatusNotification({
                    original: null,
                    payload,
                    changeType: 'hired',
                    effectiveDate: payload.start_date,
                });
                Swal.fire(
                    notificationSaved ? 'เพิ่มพนักงานแล้ว' : 'เพิ่มพนักงานแล้ว แต่ส่งแจ้งเตือนไม่สำเร็จ',
                    notificationSaved ? (isHrRole ? 'สร้างข้อมูลพนักงานใหม่และแจ้ง IT Hardware เรียบร้อย' : 'สร้างข้อมูลพนักงานใหม่เรียบร้อย') : 'ข้อมูลพนักงานถูกบันทึกแล้ว กรุณาตรวจสอบตารางแจ้งเตือน',
                    notificationSaved ? 'success' : 'warning'
                );
            } else {
                const original = employees.find((employee) => employee.id === formData.id);
                const wasResigned = original?.status === EMPLOYEE_STATUS.RESIGNED;
                const becomesResigned = formData.status === EMPLOYEE_STATUS.RESIGNED;
                const departmentChanged = original?.department !== payload.department;
                const positionChanged = (original?.position || '') !== payload.position;
                const { error } = await mysql.from('employees').update(payload).eq('id', formData.id);
                if (error) throw error;

                if (isTransferUpdate) {
                    await addTransferHistory(formData.emp_id, original, {
                        transferDate: formData.transfer_date,
                        toDepartment: payload.department,
                        toPosition: payload.position
                    });
                }

                if (departmentChanged || positionChanged || formData.status === EMPLOYEE_STATUS.TRANSFERRED) {
                    await syncEmployeeProfileToReports(formData.emp_id, payload.department, payload.position);
                }

                if (becomesResigned && !wasResigned) {
                    await cancelEmployeeRequests(formData.emp_id, {
                        cancelItName: formData.cancel_it_name.trim(),
                        cancelItSign: null
                    });
                }

                const statusChange = isTransferUpdate
                    ? { type: 'transferred', date: payload.transfer_date }
                    : becomesResigned && !wasResigned
                        ? { type: 'resigned', date: payload.end_date }
                        : original?.status !== payload.status && payload.status === EMPLOYEE_STATUS.ACTIVE
                            ? { type: 'active', date: toLocalDateInputValue() }
                            : null;
                const notificationSaved = statusChange
                    ? await createEmployeeStatusNotification({ original, payload, changeType: statusChange.type, effectiveDate: statusChange.date, employeeRecordId: formData.id })
                    : true;
                const successText = becomesResigned && !wasResigned
                    ? (isHrRole ? 'บันทึกสถานะลาออก ยกเลิกคำร้องที่ค้าง และแจ้ง IT Hardware เรียบร้อย' : 'บันทึกสถานะลาออกและยกเลิกคำร้องที่ยังค้างเรียบร้อย')
                    : statusChange && isHrRole
                        ? 'อัปเดตสถานะและแจ้ง IT Hardware เรียบร้อย'
                        : 'อัปเดตข้อมูลพนักงานเรียบร้อย';
                Swal.fire(
                    notificationSaved ? 'บันทึกแล้ว' : 'บันทึกแล้ว แต่ส่งแจ้งเตือนไม่สำเร็จ',
                    notificationSaved ? successText : 'ข้อมูลพนักงานถูกบันทึกแล้ว กรุณาตรวจสอบตารางแจ้งเตือน',
                    notificationSaved ? 'success' : 'warning'
                );
            }

            closeModal();
            fetchEmployees();
            fetchTransferHistories();
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

    const renderResignationDate = (employee) => (
        employee.status === EMPLOYEE_STATUS.RESIGNED ? formatDate(employee.end_date) : '-'
    );

    const statusMeta = getStatusMeta(formData.status);
    const savedTransferHistory = transferHistoriesByEmployee.get(String(formData.emp_id || '').trim()) || [];
    const fallbackTransferHistory = savedTransferHistory.length === 0 && (
        formData.transfer_date ||
        formData.transfer_department ||
        formData.transfer_position
    )
        ? [{
            id: 'current-transfer',
            transfer_date: formData.transfer_date,
            from_department: '',
            from_position: '',
            to_department: formData.transfer_department,
            to_position: formData.transfer_position
        }]
        : [];
    const currentTransferHistory = savedTransferHistory.length ? savedTransferHistory : fallbackTransferHistory;
    const hasTransferHistory = modalMode === 'edit' && (
        formData.status === EMPLOYEE_STATUS.TRANSFERRED ||
        currentTransferHistory.length > 0
    );
    const unreadNotifications = employeeNotifications.filter((item) => !item.reviewed_at);
    const displayedNotifications = employeeNotifications.filter((item) => {
        if (notificationFilter === 'unread') return !item.reviewed_at;
        if (notificationFilter === 'all') return true;
        return item.change_type === notificationFilter;
    });

    const markNotificationReviewed = async (notification) => {
        if (notification.reviewed_at) return;
        const reviewedAt = toMysqlDateTime();
        const payload = {
            reviewed_at: reviewedAt,
            reviewed_by_admin_id: currentAdmin?.id || null,
            reviewed_by_name: currentAdmin?.name || currentAdmin?.username || 'IT Hardware',
        };
        const { error } = await mysql.from('employee_status_notifications').update(payload).eq('id', notification.id);
        if (error) {
            setNotificationError('บันทึกการตรวจสอบไม่สำเร็จ กรุณาลองใหม่');
            return;
        }
        setEmployeeNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, ...payload } : item));
    };

    const markAllNotificationsReviewed = async () => {
        if (!unreadNotifications.length) return;
        const reviewedAt = toMysqlDateTime();
        const payload = {
            reviewed_at: reviewedAt,
            reviewed_by_admin_id: currentAdmin?.id || null,
            reviewed_by_name: currentAdmin?.name || currentAdmin?.username || 'IT Hardware',
        };
        setIsNotificationLoading(true);
        const { error } = await mysql.from('employee_status_notifications').update(payload).is('reviewed_at', null);
        setIsNotificationLoading(false);
        if (error) {
            setNotificationError('บันทึกการตรวจสอบทั้งหมดไม่สำเร็จ กรุณาลองใหม่');
            return;
        }
        setEmployeeNotifications((current) => current.map((item) => item.reviewed_at ? item : { ...item, ...payload }));
    };

    const inspectEmployee = (notification) => {
        setSearchTerm(notification.emp_id || notification.employee_name || '');
        setStatusFilter('All');
        setMonthlyEventFilter('All');
        setMonthFilter('');
        setMonthInput('');
        markNotificationReviewed(notification);
    };

    const getNotificationDetail = (notification) => {
        if (notification.change_type === 'transferred') {
            return `${notification.from_department || '-'} / ${notification.from_position || '-'} → ${notification.to_department || '-'} / ${notification.to_position || '-'}`;
        }
        if (notification.change_type === 'resigned') return `วันที่พ้นสภาพ ${formatDate(notification.effective_date)}`;
        if (notification.change_type === 'hired') return `วันที่เริ่มงาน ${formatDate(notification.effective_date)} · ${notification.to_department || '-'} / ${notification.to_position || '-'}`;
        return `${notification.to_department || '-'} / ${notification.to_position || '-'}`;
    };

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

                    <Select
                        value={statusFilter}
                        onValueChange={(value) => {
                            setStatusFilter(value);
                            setMonthlyEventFilter('All');
                        }}
                    >
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

                    <select
                        value={monthInput}
                        onChange={(event) => updateMonthFilterPart('month', event.target.value)}
                        className="input-modern !py-2 !text-sm w-full sm:w-40"
                        title="เลือกเดือนสำหรับสรุป"
                    >
                        <option value="">เลือกเดือน</option>
                        {MONTH_OPTIONS.map((month) => (
                            <option key={month.value} value={month.value}>{month.label}</option>
                        ))}
                    </select>

                    <input
                        type="text"
                        inputMode="numeric"
                        value={yearInput}
                        onChange={(event) => updateMonthFilterPart('year', event.target.value)}
                        className="input-modern !py-2 !text-sm w-full sm:w-28"
                        placeholder="ปี ค.ศ."
                        title="กรอกปี ค.ศ. สำหรับสรุป"
                    />

                    <button
                        type="button"
                        onClick={() => {
                            setMonthInput('');
                            setYearInput('');
                            setMonthFilter('');
                            setStatusFilter('All');
                            setMonthlyEventFilter('All');
                        }}
                        disabled={!monthFilter}
                        className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:text-blue-300"
                    >
                        <Users className="w-4 h-4" />
                        แสดงพนักงานทั้งหมด
                    </button>

                    <button
                        onClick={() => openModal()}
                        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl transition-colors duration-200 font-medium text-sm whitespace-nowrap"
                    >
                        <UserPlus className="w-4 h-4" />
                        เพิ่มพนักงาน
                    </button>
                </div>
            </div>

            {isItHardwareRole && (
                <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm dark:border-amber-900/60 dark:bg-slate-800">
                    <div className="flex flex-col gap-4 border-b border-amber-100 bg-amber-50/70 p-5 dark:border-amber-900/40 dark:bg-amber-950/20 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-3">
                            <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"><BellRing className="h-5 w-5" />{unreadNotifications.length > 0 && <b className="absolute -right-2 -top-2 min-w-6 rounded-full bg-rose-500 px-1.5 py-0.5 text-center text-[10px] text-white">{unreadNotifications.length > 99 ? '99+' : unreadNotifications.length}</b>}</span>
                            <div><h3 className="font-bold text-slate-900 dark:text-white">แจ้งเตือนเปลี่ยนสถานะพนักงานจากฝ่ายบุคคล</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">สำหรับ IT Hardware ตรวจสอบพนักงานเข้าใหม่ โอนย้าย ลาออก และกลับเข้าทำงาน</p></div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => fetchEmployeeNotifications()} disabled={isNotificationLoading} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:text-blue-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"><RefreshCw className={`h-4 w-4 ${isNotificationLoading ? 'animate-spin' : ''}`} />รีเฟรช</button>
                            <button type="button" onClick={markAllNotificationsReviewed} disabled={!unreadNotifications.length || isNotificationLoading} className="inline-flex h-9 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><CheckCheck className="h-4 w-4" />ตรวจแล้วทั้งหมด</button>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-700">
                        {[
                            ['unread', `ยังไม่ได้ตรวจ (${unreadNotifications.length})`],
                            ['all', `ทั้งหมด (${employeeNotifications.length})`],
                            ['hired', 'เข้าใหม่'],
                            ['transferred', 'โอนย้าย'],
                            ['resigned', 'ลาออก'],
                            ['active', 'กลับเข้าทำงาน'],
                        ].map(([value, label]) => <button key={value} type="button" onClick={() => setNotificationFilter(value)} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${notificationFilter === value ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:text-slate-300'}`}>{label}</button>)}
                    </div>
                    {notificationError && <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">{notificationError}</div>}
                    <div className="max-h-[430px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-700">
                        {isNotificationLoading && !employeeNotifications.length ? <div className="p-8 text-center text-sm text-slate-500">กำลังโหลดการแจ้งเตือน...</div> : displayedNotifications.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">ไม่มีรายการในหมวดนี้</div> : displayedNotifications.map((notification) => {
                            const meta = NOTIFICATION_TYPES[notification.change_type] || { label: notification.to_status || 'เปลี่ยนสถานะ', tone: 'border-slate-200 bg-slate-50 text-slate-600' };
                            return <article key={notification.id} className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${notification.reviewed_at ? 'bg-white dark:bg-slate-800' : 'bg-amber-50/35 dark:bg-amber-950/10'}`}>
                                <button type="button" onClick={() => inspectEmployee(notification)} className="min-w-0 flex-1 text-left">
                                    <span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-900 dark:text-white">{notification.employee_name}</strong><span className="font-mono text-xs text-slate-500">{notification.emp_id}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.tone}`}>{meta.label}</span>{!notification.reviewed_at && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">ใหม่</span>}</span>
                                    <span className="mt-1 block text-xs leading-5 text-slate-600 dark:text-slate-300">{getNotificationDetail(notification)}</span>
                                    <span className="mt-1 block text-[11px] text-slate-400">แจ้งโดย {notification.source_admin_name || 'ฝ่ายบุคคล'} · {formatDate(notification.created_at)}</span>
                                </button>
                                {notification.reviewed_at ? <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300"><Check className="h-4 w-4" />ตรวจแล้วโดย {notification.reviewed_by_name || 'IT Hardware'}</span> : <button type="button" onClick={() => markNotificationReviewed(notification)} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"><Check className="h-4 w-4" />ตรวจแล้ว</button>}
                            </article>;
                        })}
                    </div>
                </section>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {[
                    { label: 'พนักงานทั้งหมด', value: yearlyStats.total, status: 'All', icon: Users, className: 'bg-slate-100 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200' },
                    { label: 'ทำงานประจำปี', value: yearlyStats.active, status: EMPLOYEE_STATUS.ACTIVE, icon: Briefcase, className: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300' },
                    { label: 'ลาออกประจำปี', value: yearlyStats.resigned, status: EMPLOYEE_STATUS.RESIGNED, icon: UserMinus, className: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300' },
                    { label: 'โอนย้ายประจำปี', value: yearlyStats.transferred, status: EMPLOYEE_STATUS.TRANSFERRED, icon: MoveRight, className: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300' }
                ].map((item) => {
                    const Icon = item.icon;
                    const isSelected = statusFilter === item.status && monthlyEventFilter === 'All';
                    return (
                        <button
                            key={item.label}
                            type="button"
                            onClick={() => {
                                setMonthInput('');
                                setMonthFilter('');
                                setMonthlyEventFilter('All');
                                setStatusFilter((currentStatus) => (
                                    item.status !== 'All' && currentStatus === item.status ? 'All' : item.status
                                ));
                            }}
                            aria-pressed={isSelected}
                            className={`glass-card rounded-2xl p-5 flex items-center gap-4 text-left transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                                isSelected
                                    ? 'border-blue-400 ring-2 ring-blue-200 dark:border-blue-500 dark:ring-blue-900/60'
                                    : ''
                            }`}
                        >
                            <div className={`p-3 rounded-xl ${item.className}`}>
                                <Icon className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{item.label}</p>
                                <p className="text-3xl font-extrabold text-slate-800 dark:text-white">{item.value}</p>
                            </div>
                        </button>
                    );
                })}
            </div>

            {monthFilter && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                        { label: 'เข้าใหม่เดือนนี้', value: monthlyStats.newJoiners.length, filter: 'newJoiners', icon: UserPlus, className: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300' },
                        { label: 'ลาออกเดือนนี้', value: monthlyStats.exits.length, filter: 'exits', icon: UserMinus, className: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300' },
                        { label: 'โอนย้ายเดือนนี้', value: monthlyStats.transfers.length, filter: 'transfers', icon: MoveRight, className: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300' }
                    ].map((item) => {
                        const Icon = item.icon;
                        const isSelected = monthlyEventFilter === item.filter;
                        return (
                            <button
                                key={item.label}
                                type="button"
                                onClick={() => {
                                    setStatusFilter('All');
                                    setMonthlyEventFilter((currentFilter) => currentFilter === item.filter ? 'All' : item.filter);
                                }}
                                aria-pressed={isSelected}
                                className={`glass-card rounded-2xl p-5 flex items-center gap-4 text-left transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                                    isSelected
                                        ? 'border-blue-400 ring-2 ring-blue-200 dark:border-blue-500 dark:ring-blue-900/60'
                                        : ''
                                }`}
                            >
                                <div className={`p-3 rounded-xl ${item.className}`}>
                                    <Icon className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{item.label}</p>
                                    <p className="text-2xl font-extrabold text-slate-800 dark:text-white">{item.value}</p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

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
                                    <th className="p-4 whitespace-nowrap">ตำแหน่ง</th>
                                    <th className="p-4 whitespace-nowrap">เริ่มงาน</th>
                                    <th className="p-4 whitespace-nowrap">วันที่ลาออก</th>
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
                                            {employee.name_en && (
                                                <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{employee.name_en}</span>
                                            )}
                                        </td>
                                        <td className="p-4 align-middle text-slate-700 dark:text-slate-300">{employee.department}</td>
                                        <td className="p-4 align-middle text-slate-700 dark:text-slate-300">{employee.position || '-'}</td>
                                        <td className="p-4 align-middle whitespace-nowrap text-slate-600 dark:text-slate-400 text-sm">{formatDate(employee.start_date)}</td>
                                        <td className="p-4 align-middle whitespace-nowrap text-slate-600 dark:text-slate-400 text-sm">{renderResignationDate(employee)}</td>
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
                                    ชื่อ-นามสกุล อังกฤษ
                                </label>
                                <input
                                    type="text"
                                    value={formData.name_en}
                                    onChange={(event) => updateFormField('name_en', event.target.value)}
                                    placeholder="English full name"
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
                                        {departmentOptions.map((department) => (
                                            <SelectItem key={department} value={department}>{department}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                    ตำแหน่ง <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.position}
                                    onChange={(event) => updateFormField('position', event.target.value)}
                                    placeholder="ระบุตำแหน่ง"
                                    className="input-modern w-full"
                                />
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

                                {hasTransferHistory && (
                                    <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
                                        <div className="mb-3 flex items-center gap-2">
                                            <div className="rounded-xl bg-blue-100 p-2 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                                <MoveRight className="h-4 w-4" />
                                            </div>
                                            <h5 className="font-bold text-slate-800 dark:text-white">ประวัติการแจ้งโอนย้าย</h5>
                                        </div>
                                        <div className="space-y-2">
                                            {[...currentTransferHistory]
                                                .sort((a, b) => new Date(a.transfer_date || 0) - new Date(b.transfer_date || 0))
                                                .map((transfer, index) => (
                                                <div key={transfer.id || `${transfer.transfer_date}-${index}`} className="grid grid-cols-1 gap-3 rounded-xl border border-blue-100 bg-white p-3 text-sm dark:border-blue-900/40 dark:bg-slate-800 sm:grid-cols-5">
                                                    <div>
                                                        <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">ย้ายจากตำแหน่ง</span>
                                                        <span className="font-semibold text-slate-800 dark:text-slate-100">{transfer.from_position || '-'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">ย้ายจากแผนก</span>
                                                        <span className="font-semibold text-slate-800 dark:text-slate-100">{transfer.from_department || '-'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">ตำแหน่งโอนย้าย</span>
                                                        <span className="font-semibold text-slate-800 dark:text-slate-100">{transfer.to_position || '-'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">แผนกโอนย้าย</span>
                                                        <span className="font-semibold text-slate-800 dark:text-slate-100">{transfer.to_department || '-'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">วันที่โอนย้าย</span>
                                                        <span className="font-semibold text-blue-700 dark:text-blue-300">{formatDate(transfer.transfer_date)}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {formData.status === EMPLOYEE_STATUS.TRANSFERRED && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                                แผนกโอนย้าย <span className="text-red-500">*</span>
                                            </label>
                                            <Select value={formData.transfer_department} onValueChange={(value) => updateFormField('transfer_department', value)}>
                                                <SelectTrigger className="input-modern w-full">
                                                    <SelectValue placeholder="เลือกแผนกโอนย้าย" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {departmentOptions.map((department) => (
                                                        <SelectItem key={department} value={department}>{department}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="sm:col-span-2">
                                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                                ตำแหน่งโอนย้าย <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.transfer_position}
                                                onChange={(event) => updateFormField('transfer_position', event.target.value)}
                                                placeholder="ระบุตำแหน่งโอนย้าย"
                                                className="input-modern w-full"
                                            />
                                        </div>
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
                                                ผู้แจ้ง <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.cancel_it_name}
                                                onChange={(event) => updateFormField('cancel_it_name', event.target.value)}
                                                placeholder="ระบุชื่อผู้แจ้ง"
                                                className="input-modern w-full"
                                            />
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
