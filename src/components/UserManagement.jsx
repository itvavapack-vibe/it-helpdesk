import React, { useEffect, useMemo, useState } from 'react';
import { Check, Edit2, Search, Shield, Trash2, User, UserPlus, Users, X } from 'lucide-react';
import Swal from 'sweetalert2';
import { mysql } from '../mysqlClient';
import { ROLE_LABELS, ROLE_OPTIONS, ROLES, canManageAdminUsers, normalizeRoleValue } from '../config/roles';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

const normalizeRole = normalizeRoleValue;
const canDeleteUsers = (admin) => canManageAdminUsers(admin?.role);
const canManageRoles = (admin) => canManageAdminUsers(admin?.role);
const getRoleOption = (role) => ROLE_OPTIONS.find((option) => option.value === normalizeRole(role)) || ROLE_OPTIONS[1];

const UserManagement = ({ currentAdmin, onAuthExpired, onCurrentAdminUpdated }) => {
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('add');
    const [formData, setFormData] = useState({
        id: null,
        username: '',
        password: '',
        name: '',
        role: ROLES.IT_SUPPORT
    });

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        setIsLoading(true);

        const startTime = Date.now();
        const { data, error, status } = await mysql
            .from('admins')
            .select('id, username, name, role, created_at')
            .order('created_at', { ascending: false });

        const elapsedTime = Date.now() - startTime;
        if (elapsedTime < 500) {
            await new Promise((resolve) => setTimeout(resolve, 500 - elapsedTime));
        }

        if (error) {
            console.error('Error fetching users:', error);
            setUsers([]);

            if (status === 401) {
                await Swal.fire('Session expired', 'Please log in again to manage users.', 'warning');
                onAuthExpired?.();
                setIsLoading(false);
                return;
            }

            if (status === 403) {
                Swal.fire('Permission denied', 'Only Super Admin accounts can manage users.', 'error');
                setIsLoading(false);
                return;
            }

            Swal.fire('Error', 'ไม่สามารถโหลดข้อมูลผู้ใช้งานได้', 'error');
        } else {
            const nextUsers = data || [];
            setUsers(nextUsers);

            const freshCurrentAdmin = nextUsers.find((user) => user.id === currentAdmin?.id);
            if (freshCurrentAdmin && normalizeRole(freshCurrentAdmin.role) !== normalizeRole(currentAdmin?.role)) {
                onCurrentAdminUpdated?.(freshCurrentAdmin);
            }
        }

        setIsLoading(false);
    };

    const filteredUsers = useMemo(() => {
        return (users || []).filter((user) =>
            user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.name?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [users, searchTerm]);

    const handleOpenModal = (mode, user = null) => {
        setModalMode(mode);

        if (mode === 'edit' && user) {
            setFormData({
                id: user.id,
                username: user.username,
                password: '',
                name: user.name,
                role: normalizeRole(user.role)
            });
        } else {
            setFormData({
                id: null,
                username: '',
                password: '',
                name: '',
                role: ROLES.IT_SUPPORT
            });
        }

        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    const handleInputChange = (event) => {
        const { name, value } = event.target;
        setFormData((previous) => ({ ...previous, [name]: value }));
    };

    const handleAdminApiError = async (error, status, fallbackMessage) => {
        if (!error) return false;

        if (status === 401) {
            await Swal.fire('Session expired', 'Please log in again to manage users.', 'warning');
            onAuthExpired?.();
            return true;
        }

        if (status === 403) {
            Swal.fire('Permission denied', 'Only Super Admin accounts can manage users.', 'error');
            return true;
        }

        Swal.fire('Error', fallbackMessage, 'error');
        return true;
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (modalMode === 'add') {
            if (!formData.username || !formData.password || !formData.name) {
                Swal.fire('แจ้งเตือน', 'กรุณากรอกข้อมูลให้ครบถ้วน', 'warning');
                return;
            }

            const { data: existingUsers, error: existingUserError, status: existingUserStatus } = await mysql
                .from('admins')
                .select('username')
                .eq('username', formData.username)
                .limit(1);

            if (await handleAdminApiError(existingUserError, existingUserStatus, 'ไม่สามารถตรวจสอบชื่อผู้ใช้งานซ้ำได้')) {
                return;
            }

            if ((existingUsers || []).length > 0) {
                Swal.fire('แจ้งเตือน', 'ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว', 'warning');
                return;
            }

            const { error } = await mysql
                .from('admins')
                .insert([{
                    username: formData.username,
                    password: formData.password,
                    name: formData.name,
                    role: canManageRoles(currentAdmin) ? formData.role : ROLES.IT_SUPPORT
                }]);

            if (error) {
                console.error('Error adding user:', error);
                Swal.fire('Error', 'ไม่สามารถเพิ่มผู้ใช้งานได้', 'error');
                return;
            }

            Swal.fire({
                icon: 'success',
                title: 'เพิ่มผู้ดูแลระบบสำเร็จ',
                showConfirmButton: false,
                timer: 1500
            });
            fetchUsers();
            handleCloseModal();
            return;
        }

        if (!formData.username || !formData.name) {
            Swal.fire('แจ้งเตือน', 'กรุณากรอกข้อมูลให้ครบถ้วน', 'warning');
            return;
        }

        const updateData = {
            username: formData.username,
            name: formData.name
        };

        if (canManageRoles(currentAdmin)) {
            updateData.role = formData.role;
        }

        if (formData.password.trim() !== '') {
            updateData.password = formData.password;
        }

        const { error } = await mysql
            .from('admins')
            .update(updateData)
            .eq('id', formData.id);

        if (error) {
            console.error('Error updating user:', error);
            Swal.fire('Error', 'ไม่สามารถแก้ไขผู้ใช้งานได้', 'error');
            return;
        }

        Swal.fire({
            icon: 'success',
            title: 'แก้ไขข้อมูลสำเร็จ',
            showConfirmButton: false,
            timer: 1500
        });

        if (formData.id === currentAdmin?.id) {
            onCurrentAdminUpdated?.({
                username: formData.username,
                name: formData.name,
                ...(updateData.role ? { role: updateData.role } : {})
            });
        }

        fetchUsers();
        handleCloseModal();
    };

    const handleDelete = (id, username, role) => {
        if (!canDeleteUsers(currentAdmin)) {
            Swal.fire('สิทธิ์ไม่เพียงพอ', 'เฉพาะ Super Admin เท่านั้นที่ลบผู้ใช้งานได้', 'error');
            return;
        }

        if (id === currentAdmin?.id) {
            Swal.fire('แจ้งเตือน', 'ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่ได้', 'warning');
            return;
        }

        if (normalizeRole(role) === ROLES.SUPERADMIN && !canDeleteUsers(currentAdmin)) {
            Swal.fire('สิทธิ์ไม่เพียงพอ', 'คุณไม่มีสิทธิ์ลบบัญชีระดับ Super Admin', 'error');
            return;
        }

        Swal.fire({
            title: 'ยืนยันการลบผู้ใช้?',
            text: `คุณต้องการลบผู้ใช้ "${username}" ใช่หรือไม่?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'ใช่, ลบเลย',
            cancelButtonText: 'ยกเลิก',
            reverseButtons: true
        }).then(async (result) => {
            if (!result.isConfirmed) return;

            const { error } = await mysql
                .from('admins')
                .delete()
                .eq('id', id);

            if (error) {
                console.error('Error deleting user:', error);
                Swal.fire('Error', 'ไม่สามารถลบผู้ใช้งานได้', 'error');
                return;
            }

            Swal.fire({
                title: 'ลบสำเร็จ!',
                text: 'ผู้ใช้งานถูกลบออกจากระบบแล้ว',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            });
            fetchUsers();
        });
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    return (
        <div className="space-y-6 animate-fade-in relative z-10 w-full">
            <div className="glass-card p-6 rounded-3xl flex flex-col sm:flex-row justify-between items-center gap-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)]">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-fuchsia-100 dark:bg-fuchsia-900/50 flex items-center justify-center text-fuchsia-600 dark:text-fuchsia-300 shadow-lg shadow-fuchsia-100 dark:shadow-fuchsia-950/30">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-violet-700 dark:from-indigo-400 dark:to-violet-400">ระบบจัดการผู้ใช้งาน</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">จัดการบัญชีผู้ดูแลระบบและสิทธิ์การเข้าถึง</p>
                    </div>
                </div>
                <button
                    onClick={() => handleOpenModal('add')}
                    className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30 flex items-center justify-center gap-2 transform hover:-translate-y-0.5 transition-all duration-200"
                >
                    <UserPlus className="w-4 h-4" /> เพิ่มผู้ดูแลระบบ
                </button>
            </div>

            <div className="glass-card p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="w-full sm:w-1/2 md:w-1/3 relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="ค้นหาชื่อ หรือ Username..."
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        className="!pl-10 w-full input-modern"
                    />
                </div>

                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">{filteredUsers.length}</span> รายการ
                </div>
            </div>

            <div className="glass-card rounded-3xl overflow-hidden shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-left border-collapse">
                        <thead className="bg-slate-50/80 dark:bg-slate-800/80 backdrop-blur-sm border-b justify-between border-slate-200 dark:border-slate-700">
                            <tr>
                                <th scope="col" className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">ชื่อผู้ใช้ (Username)</th>
                                <th scope="col" className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">ชื่อ-นามสกุล (Name)</th>
                                <th scope="col" className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">สิทธิ์การใช้งาน (Role)</th>
                                <th scope="col" className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">วันที่สร้าง</th>
                                <th scope="col" className="px-6 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50 bg-white/40 dark:bg-slate-900/40">
                            {isLoading ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-16 text-center">
                                        <div className="flex flex-col items-center justify-center space-y-4">
                                            <div className="w-10 h-10 border-4 border-indigo-200 dark:border-indigo-900/50 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin"></div>
                                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 animate-pulse">กำลังโหลดข้อมูลผู้ใช้งาน...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredUsers.length > 0 ? (
                                filteredUsers.map((user) => (
                                    <tr key={user.id} className="hover:bg-indigo-50/40 dark:hover:bg-indigo-900/20 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold border border-slate-200 dark:border-slate-700">
                                                    {user.username.charAt(0).toUpperCase()}
                                                </div>
                                                <span className="font-semibold text-slate-800 dark:text-slate-200">{user.username}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{user.name}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {normalizeRole(user.role) === ROLES.SUPERADMIN ? (
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                                                    <Shield className="w-3 h-3 mr-1" /> Super Admin
                                                </span>
                                            ) : normalizeRole(user.role) === ROLES.HR ? (
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                                    <User className="w-3 h-3 mr-1" /> HR
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                                    <User className="w-3 h-3 mr-1" /> {ROLE_LABELS[normalizeRole(user.role)] || 'IT Support'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-slate-500 dark:text-slate-400">{formatDate(user.created_at)}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => handleOpenModal('edit', user)}
                                                    className="p-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 rounded-lg transition-colors"
                                                    title="แก้ไขข้อมูล"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                {canDeleteUsers(currentAdmin) && user.id !== currentAdmin?.id && (
                                                    <button
                                                        onClick={() => handleDelete(user.id, user.username, user.role)}
                                                        className="p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/40 rounded-lg transition-colors"
                                                        title="ลบผู้ใช้งาน"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                                        ไม่พบรายชื่อผู้ใช้งาน
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center overflow-y-auto p-3 sm:p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto border border-white/20 dark:border-slate-700">
                        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/80">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                {modalMode === 'add' ? <UserPlus className="w-5 h-5 text-indigo-500" /> : <Edit2 className="w-5 h-5 text-indigo-500" />}
                                {modalMode === 'add' ? 'เพิ่มผู้ดูแลระบบ' : 'แก้ไขข้อมูลผู้ดูแลระบบ'}
                            </h3>
                            <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">ชื่อผู้ใช้ (Username)</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        name="username"
                                        value={formData.username}
                                        onChange={handleInputChange}
                                        className="w-full input-modern"
                                        placeholder="เช่น admin_smith"
                                        disabled={modalMode === 'edit'}
                                    />
                                    {modalMode === 'edit' && <span className="absolute right-3 top-2.5 text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">แก้ไขไม่ได้</span>}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">ชื่อ-นามสกุล (Name)</label>
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleInputChange}
                                    className="w-full input-modern"
                                    placeholder="ชื่อที่จะแสดงในระบบ"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">รหัสผ่าน (Password)</label>
                                <input
                                    type="password"
                                    name="password"
                                    value={formData.password}
                                    onChange={handleInputChange}
                                    className="w-full input-modern"
                                    placeholder={modalMode === 'add' ? 'กำหนดรหัสผ่าน' : 'เว้นว่างไว้หากไม่ต้องการเปลี่ยน'}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">ระดับสิทธิ์ (Role)</label>
                                <Select
                                    value={formData.role}
                                    onValueChange={(value) => setFormData((previous) => ({ ...previous, role: value }))}
                                    disabled={!canManageRoles(currentAdmin)}
                                >
                                    <SelectTrigger className="w-full input-modern cursor-pointer">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {ROLE_OPTIONS.map((role) => (
                                            <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-slate-500 dark:text-slate-400 ml-1">
                                    {getRoleOption(formData.role).description}
                                </p>
                            </div>

                            <div className="pt-4 flex gap-3 border-t border-slate-100 dark:border-slate-700 mt-6">
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 flex items-center justify-center gap-2 transition-all"
                                >
                                    <Check className="w-4 h-4" /> บันทึก
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagement;
