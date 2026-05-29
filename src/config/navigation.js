import {
    ClipboardList,
    Code,
    FileCheck2,
    Home,
    Key,
    Monitor,
    Settings,
    Ticket,
    TrendingUp,
    UserPlus,
    Users,
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
    { id: 'home', label: 'หน้าแรก', icon: Home, tab: 'home', roles: [NAV_ROLES.PUBLIC, ...ALL_IT_ROLES] },
    { id: 'user', label: 'แจ้งซ่อม', icon: ClipboardList, tab: 'user', roles: [NAV_ROLES.PUBLIC, ...ALL_IT_ROLES] },
    { id: 'access_request', label: 'ขอสิทธิ์ใช้งาน', icon: UserPlus, tab: 'access_request', roles: [NAV_ROLES.PUBLIC, ...ALL_IT_ROLES] },
    { id: 'change_request', label: 'ขอพัฒนาโปรแกรม', icon: Code, tab: 'change_request', roles: [NAV_ROLES.PUBLIC, ...ALL_IT_ROLES] },
    { id: 'admin', label: 'เข้าระบบ', icon: Settings, tab: 'admin', roles: [NAV_ROLES.PUBLIC, ...ALL_IT_ROLES, NAV_ROLES.HR], needsRefresh: true, variant: 'primary' },
];

export const HOME_QUICK_ACTIONS = [
    { id: 'repair', label: 'แจ้งซ่อมเดี๋ยวนี้', icon: ClipboardList, tab: 'user', roles: [NAV_ROLES.PUBLIC, ...ALL_IT_ROLES] },
    { id: 'access', label: 'ขอสิทธิ์ใช้งาน', icon: UserPlus, tab: 'access_request', roles: [NAV_ROLES.PUBLIC, ...ALL_IT_ROLES] },
    { id: 'change', label: 'ใบขอพัฒนาโปรแกรม', icon: Code, tab: 'change_request', roles: [NAV_ROLES.PUBLIC, ...ALL_IT_ROLES] },
    { id: 'admin', label: 'Admin', icon: Settings, tab: 'admin', roles: [...ALL_IT_ROLES, NAV_ROLES.HR] },
];

export const ADMIN_SUB_TABS = [
    { id: 'issues', label: 'แจ้งซ่อม', icon: Ticket, roles: ALL_IT_ROLES },
    { id: 'assets', label: 'ทรัพย์สิน', icon: Monitor, roles: ALL_IT_ROLES },
    { id: 'access_requests', label: 'ขอสิทธิ์', icon: Key, roles: ALL_IT_ROLES },
    { id: 'change_requests', label: 'ขอพัฒนาโปรแกรม', icon: Code, roles: ALL_IT_ROLES },
    { id: 'approved_documents', label: 'เอกสารอนุมัติ', icon: FileCheck2, roles: ALL_IT_ROLES },
    { id: 'stats', label: 'สถิติ', icon: TrendingUp, roles: ALL_IT_ROLES },
    { id: 'employees', label: 'พนักงาน', icon: Users, roles: [...ALL_IT_ROLES, NAV_ROLES.HR] },
    { id: 'users', label: 'ผู้ใช้งาน', icon: Users, roles: [NAV_ROLES.SUPERADMIN] },
];
