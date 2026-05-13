import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { Users, UserPlus, Search, Edit2, Trash2, X, AlertCircle } from 'lucide-react';
import Swal from 'sweetalert2';

const EmployeeManagement = () => {
    const [employees, setEmployees] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');

    // Modal states
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('add'); // 'add' or 'edit'

    // Form states
    const [formData, setFormData] = useState({
        id: null,
        emp_id: '',
        name_th: '',
        department: '',
        start_date: '',
        status: 'ทำงาน'
    });

    const DEPARTMENTS = [
        'แอดมิน', 'บุคคลและธุรการ', 'วิศวกรรม', 'การตลาดและขาย (ในประเทศ)',
        'การตลาดและขาย (ต่างประเทศ)', 'แอดมินการตลาด', 'บัญชี', 'การเงิน',
        'จัดซื้อ', 'เทคโนโลยีสารสนเทศ และ ERP', 'วางแผน', 'ฝ่ายผลิต',
        'ตรวจสอบคุณภาพ', 'ควบคุมคุณภาพ', 'บริหารระบบ และ จป.', 'ออกแบบ',
        'วิจัยและพัฒนาผลิตภัณฑ์', 'คลังพัสดุและจัดส่ง', 'ตรวจสอบ', 'ซ่อมบำรุง',
        'สำนักกรรมการ', 'อื่นๆ'
    ];

    const STATUSES = ['ทำงาน', 'โอนย้าย', 'ลาออก'];

    useEffect(() => {
        fetchEmployees();

        // Subscribe to real-time changes
        const subscription = supabase
            .channel('employees_changes')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'employees' }, 
                () => {
                    fetchEmployees();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, []);

    const fetchEmployees = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('employees')
                .select('*')
                .order('emp_id', { ascending: true });

            if (error) throw error;
            setEmployees(data || []);
        } catch (error) {
            console.error('Error fetching employees:', error);
            Swal.fire({
                title: 'ไม่พบตารางข้อมูล',
                text: 'กรุณาสร้างตาราง employees ใน Supabase ก่อน',
                icon: 'warning',
                confirmButtonColor: '#4f46e5'
            });
        } finally {
            setIsLoading(false);
        }
    };

    const filteredEmployees = useMemo(() => {
        return employees.filter(emp => {
            const matchesSearch = emp.emp_id?.includes(searchTerm) ||
                                emp.name_th?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                emp.department?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesStatus = statusFilter === 'All' || emp.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [employees, searchTerm, statusFilter]);

    const handleOpenModal = (employee = null) => {
        if (employee) {
            setModalMode('edit');
            setFormData({
                id: employee.id,
                emp_id: employee.emp_id,
                name_th: employee.name_th,
                department: employee.department,
                start_date: employee.start_date,
                status: employee.status
            });
        } else {
            setModalMode('add');
            setFormData({
                id: null,
                emp_id: '',
                name_th: '',
                department: '',
                start_date: '',
                status: 'ทำงาน'
            });
        }
        setIsModalOpen(true);
    };

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
        if (!formData.emp_id || !formData.name_th || !formData.department || !formData.start_date) {
            Swal.fire({
                title: 'ข้อมูลไม่ครบถ้วน',
                text: 'กรุณากรอกข้อมูลทั้งหมดให้ครบ',
                icon: 'warning',
                confirmButtonColor: '#4f46e5'
            });
            return;
        }

        // Validate emp_id is 6 digits
        if (!/^\d{6}$/.test(formData.emp_id)) {
            Swal.fire({
                title: 'รหัสพนักงานไม่ถูกต้อง',
                text: 'รหัสพนักงานต้องเป็นตัวเลข 6 หลักเท่านั้น',
                icon: 'error',
                confirmButtonColor: '#4f46e5'
            });
            return;
        }

        try {
            if (modalMode === 'add') {
                const { error } = await supabase
                    .from('employees')
                    .insert([{
                        emp_id: formData.emp_id,
                        name_th: formData.name_th,
                        department: formData.department,
                        start_date: formData.start_date,
                        status: formData.status
                    }]);

                if (error) throw error;
                Swal.fire('สำเร็จ!', 'เพิ่มพนักงานเรียบร้อย', 'success');
            } else {
                const { error } = await supabase
                    .from('employees')
                    .update({
                        emp_id: formData.emp_id,
                        name_th: formData.name_th,
                        department: formData.department,
                        start_date: formData.start_date,
                        status: formData.status
                    })
                    .eq('id', formData.id);

                if (error) throw error;
                Swal.fire('สำเร็จ!', 'อัปเดตข้อมูลพนักงานเรียบร้อย', 'success');
            }

            setIsModalOpen(false);
            fetchEmployees();
        } catch (error) {
            console.error('Error saving employee:', error);
            Swal.fire('Error', 'เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
        }
    };

    const handleDelete = async (id) => {
        const result = await Swal.fire({
            title: 'ยืนยันการลบ?',
            text: 'คุณต้องการลบพนักงานคนนี้ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'ลบข้อมูล',
            cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed) {
            try {
                const { error } = await supabase
                    .from('employees')
                    .delete()
                    .eq('id', id);

                if (error) throw error;
                Swal.fire('ลบสำเร็จ!', 'ลบพนักงานเรียบร้อยแล้ว', 'success');
                fetchEmployees();
            } catch (error) {
                console.error('Error deleting employee:', error);
                Swal.fire('Error', 'ไม่สามารถลบข้อมูลได้', 'error');
            }
        }
    };

    const getStatusBadge = (status) => {
        const badges = {
            'ทำงาน': <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">ทำงาน</span>,
            'โอนย้าย': <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">โอนย้าย</span>,
            'ลาออก': <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">ลาออก</span>
        };
        return badges[status] || <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-semibold">{status}</span>;
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            {/* Header & Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-100 dark:bg-blue-900/50 rounded-xl text-blue-600 dark:text-blue-400">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">ข้อมูลพนักงาน</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">จัดการข้อมูลและสถานะพนักงาน</p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="ค้นหารหัส ชื่อ หรือแผนก..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="input-modern !pl-9 !py-2 !text-sm w-full"
                        />
                    </div>

                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="input-modern !py-2 !text-sm w-full sm:w-40"
                    >
                        <option value="All">ทุกสถานะ</option>
                        {STATUSES.map(status => (
                            <option key={status} value={status}>{status}</option>
                        ))}
                    </select>

                    <button
                        onClick={() => handleOpenModal()}
                        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl transition-colors duration-200 font-medium text-sm whitespace-nowrap"
                    >
                        <UserPlus className="w-4 h-4" />
                        เพิ่มพนักงาน
                    </button>
                </div>
            </div>

            {/* Content Area */}
            {isLoading ? (
                <div className="flex justify-center items-center py-20">
                    <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                </div>
            ) : filteredEmployees.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 p-10 rounded-2xl text-center border border-slate-100 dark:border-slate-700">
                    <Users className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-2">ไม่พบพนักงาน</h3>
                    <p className="text-slate-500 dark:text-slate-400">ยังไม่มีข้อมูลพนักงานในระบบ หรือไม่พบในเงื่อนไขการค้นหา</p>
                </div>
            ) : (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold uppercase tracking-wider">
                                    <th className="p-4 whitespace-nowrap">รหัสพนักงาน</th>
                                    <th className="p-4 whitespace-nowrap">ชื่อ-นามสกุล</th>
                                    <th className="p-4 whitespace-nowrap">แผนก</th>
                                    <th className="p-4 whitespace-nowrap">วันที่เริ่มงาน</th>
                                    <th className="p-4 whitespace-nowrap">สถานะ</th>
                                    <th className="p-4 text-right whitespace-nowrap">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                {filteredEmployees.map((emp) => (
                                    <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="p-4 align-middle whitespace-nowrap">
                                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{emp.emp_id}</span>
                                        </td>
                                        <td className="p-4 align-middle">
                                            <span className="font-medium text-slate-800 dark:text-slate-100">{emp.name_th}</span>
                                        </td>
                                        <td className="p-4 align-middle text-slate-700 dark:text-slate-300">
                                            {emp.department}
                                        </td>
                                        <td className="p-4 align-middle whitespace-nowrap text-slate-600 dark:text-slate-400 text-sm">
                                            {formatDate(emp.start_date)}
                                        </td>
                                        <td className="p-4 align-middle whitespace-nowrap">
                                            {getStatusBadge(emp.status)}
                                        </td>
                                        <td className="p-4 align-middle">
                                            <div className="flex gap-2 justify-end">
                                                <button
                                                    onClick={() => handleOpenModal(emp)}
                                                    className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                                                    title="แก้ไข"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(emp.id)}
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

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-lg p-8 space-y-6 border border-slate-200 dark:border-slate-700 max-h-96 overflow-y-auto custom-scrollbar">
                        <div className="flex items-center justify-between">
                            <h3 className="text-2xl font-bold text-slate-800 dark:text-white">
                                {modalMode === 'add' ? 'เพิ่มพนักงานใหม่' : 'แก้ไขข้อมูลพนักงาน'}
                            </h3>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                <X className="w-6 h-6 text-slate-500" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                    รหัสพนักงาน (6 หลัก) <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    name="emp_id"
                                    value={formData.emp_id}
                                    onChange={handleFormChange}
                                    placeholder="เช่น 001234"
                                    maxLength="6"
                                    className="input-modern w-full"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                    ชื่อ-นามสกุล <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    name="name_th"
                                    value={formData.name_th}
                                    onChange={handleFormChange}
                                    placeholder="นาย สมชาย ใจดี"
                                    className="input-modern w-full"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                    แผนก <span className="text-red-500">*</span>
                                </label>
                                <select
                                    name="department"
                                    value={formData.department}
                                    onChange={handleFormChange}
                                    className="input-modern w-full"
                                >
                                    <option value="">-- เลือกแผนก --</option>
                                    {DEPARTMENTS.map(dept => (
                                        <option key={dept} value={dept}>{dept}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                    วันที่เริ่มงาน <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    name="start_date"
                                    value={formData.start_date}
                                    onChange={handleFormChange}
                                    className="input-modern w-full"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                    สถานะ <span className="text-red-500">*</span>
                                </label>
                                <select
                                    name="status"
                                    value={formData.status}
                                    onChange={handleFormChange}
                                    className="input-modern w-full"
                                >
                                    {STATUSES.map(status => (
                                        <option key={status} value={status}>{status}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium"
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={handleSave}
                                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium"
                            >
                                {modalMode === 'add' ? 'เพิ่ม' : 'อัปเดต'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EmployeeManagement;
