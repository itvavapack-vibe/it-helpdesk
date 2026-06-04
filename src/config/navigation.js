import {
    ClipboardList,
    FileCheck2,
    Home,
    Key,
    Monitor,
    Settings,
    Ticket,
    TrendingUp,
    UserPlus,
    Users,
    ClipboardPenLine,
} from 'lucide-react';
import { ROLES, normalizeRoleValue } from './roles';

export const NAV_ROLES = {
    PUBLIC: ROLES.PUBLIC,
    IT_SUPPORT: ROLES.IT_SUPPORT,
    IT_SUPERVISOR: ROLES.IT_SUPERVISOR,
    IT_MANAGER: ROLES.IT_MANAGER,
    IT_SOFTWARE: ROLES.IT_SOFTWARE,
    IT_MEDIA: ROLES.IT_MEDIA,
    HR: ROLES.HR,
    SUPERADMIN: ROLES.SUPERADMIN,
};

const ALL_IT_ROLES = [
    NAV_ROLES.IT_SUPPORT,
    NAV_ROLES.IT_SOFTWARE,
    NAV_ROLES.IT_MEDIA,
    NAV_ROLES.IT_SUPERVISOR,
    NAV_ROLES.IT_MANAGER,
    NAV_ROLES.SUPERADMIN,
];

export const normalizeRole = (admin) => {
    if (!admin) return NAV_ROLES.PUBLIC;
    return normalizeRoleValue(admin.role);
};

export const canSee = (itemRoles = [], role = NAV_ROLES.PUBLIC) => {
    if (!itemRoles.length) return true;
    return itemRoles.includes(role);
};

export const MAIN_NAV_ITEMS = [
    { id: 'home', label: 'หน้าแรก', icon: Home, iconColor: 'text-sky-500 dark:text-sky-300', iconAura: '14, 165, 233', tab: 'home', roles: [NAV_ROLES.PUBLIC, ...ALL_IT_ROLES] },
    { id: 'user', label: 'แจ้งซ่อม/ปัญหา', icon: ClipboardList, iconColor: 'text-rose-500 dark:text-rose-300', iconAura: '244, 63, 94', tab: 'user', roles: [NAV_ROLES.PUBLIC, ...ALL_IT_ROLES] },
    { id: 'access_request', label: 'ขอสิทธิ์ใช้งาน', icon: UserPlus, iconColor: 'text-amber-500 dark:text-amber-300', iconAura: '245, 158, 11', tab: 'access_request', roles: [NAV_ROLES.PUBLIC, ...ALL_IT_ROLES] },
    { id: 'change_request', label: 'ขอพัฒนาระบบ', icon: ClipboardPenLine, iconColor: 'text-emerald-500 dark:text-emerald-300', iconAura: '16, 185, 129', tab: 'change_request', roles: [NAV_ROLES.PUBLIC, ...ALL_IT_ROLES] },
    { id: 'admin', label: 'เข้าระบบ', icon: Settings, iconColor: 'text-indigo-100', iconAura: '99, 102, 241', tab: 'admin', roles: [NAV_ROLES.PUBLIC, ...ALL_IT_ROLES, NAV_ROLES.HR], needsRefresh: true, variant: 'primary' },
];

export const HOME_QUICK_ACTIONS = [
    { id: 'repair', label: 'แจ้งซ่อมเดี๋ยวนี้', icon: ClipboardList, tab: 'user', roles: [NAV_ROLES.PUBLIC, ...ALL_IT_ROLES] },
    { id: 'access', label: 'ขอสิทธิ์ใช้งาน', icon: UserPlus, tab: 'access_request', roles: [NAV_ROLES.PUBLIC, ...ALL_IT_ROLES] },
    { id: 'change', label: 'ใบขอพัฒนาโปรแกรม', icon: ClipboardPenLine, tab: 'change_request', roles: [NAV_ROLES.PUBLIC, ...ALL_IT_ROLES] },
    { id: 'admin', label: 'Admin', icon: Settings, tab: 'admin', roles: [...ALL_IT_ROLES, NAV_ROLES.HR] },
];

export const ADMIN_SUB_TABS = [
    { id: 'issues', label: 'แจ้งซ่อม/ปัญหา', icon: Ticket, iconColor: 'text-rose-600 dark:text-rose-300', iconAura: '244, 63, 94', roles: ALL_IT_ROLES },
    { id: 'assets', label: 'ทรัพย์สิน', icon: Monitor, iconColor: 'text-sky-600 dark:text-sky-300', iconAura: '14, 165, 233', roles: ALL_IT_ROLES },
    { id: 'access_requests', label: 'ขอสิทธิ์', icon: Key, iconColor: 'text-amber-600 dark:text-amber-300', iconAura: '245, 158, 11', roles: ALL_IT_ROLES },
    { id: 'change_requests', label: 'ขอพัฒนาระบบ', icon: ClipboardPenLine, iconColor: 'text-emerald-600 dark:text-emerald-300', iconAura: '16, 185, 129', roles: ALL_IT_ROLES },
    { id: 'approved_documents', label: 'เอกสารอนุมัติ', icon: FileCheck2, iconColor: 'text-violet-600 dark:text-violet-300', iconAura: '139, 92, 246', roles: [NAV_ROLES.IT_SUPERVISOR, NAV_ROLES.IT_MANAGER, NAV_ROLES.SUPERADMIN] },
    { id: 'stats', label: 'สถิติ', icon: TrendingUp, iconColor: 'text-orange-600 dark:text-orange-300', iconAura: '249, 115, 22', roles: ALL_IT_ROLES },
    { id: 'employees', label: 'พนักงาน', icon: Users, iconColor: 'text-blue-600 dark:text-blue-300', iconAura: '37, 99, 235', roles: [...ALL_IT_ROLES, NAV_ROLES.HR] },
    { id: 'users', label: 'ผู้ใช้งาน', icon: Users, iconColor: 'text-fuchsia-600 dark:text-fuchsia-300', iconAura: '192, 38, 211', roles: [NAV_ROLES.SUPERADMIN] },
];
