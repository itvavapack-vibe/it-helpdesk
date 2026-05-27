import {
    Home,
    ClipboardList,
    UserPlus,
    Code,
    Settings,
    Ticket,
    Monitor,
    Key,
    TrendingUp,
    Users,
} from 'lucide-react';

export const NAV_ROLES = {
    PUBLIC: 'public',
    IT: 'it',
    HR: 'hr',
    SUPERADMIN: 'superadmin',
};

export const normalizeRole = (admin) => {
    if (!admin) return NAV_ROLES.PUBLIC;
    if (admin.role === NAV_ROLES.SUPERADMIN) return NAV_ROLES.SUPERADMIN;
    if (admin.role === NAV_ROLES.HR) return NAV_ROLES.HR;
    return NAV_ROLES.IT;
};

export const canSee = (itemRoles = [], role = NAV_ROLES.PUBLIC) => {
    if (!itemRoles.length) return true;
    return itemRoles.includes(role);
};

export const MAIN_NAV_ITEMS = [
    { id: 'home', label: 'หน้าแรก', icon: Home, tab: 'home', roles: [NAV_ROLES.PUBLIC, NAV_ROLES.IT, NAV_ROLES.SUPERADMIN] },
    { id: 'user', label: 'แจ้งซ่อม', icon: ClipboardList, tab: 'user', roles: [NAV_ROLES.PUBLIC, NAV_ROLES.IT, NAV_ROLES.SUPERADMIN] },
    { id: 'access_request', label: 'ขอสิทธิ์ใช้งาน', icon: UserPlus, tab: 'access_request', roles: [NAV_ROLES.PUBLIC, NAV_ROLES.IT, NAV_ROLES.SUPERADMIN] },
    { id: 'change_request', label: 'ขอพัฒนาโปรแกรม', icon: Code, tab: 'change_request', roles: [NAV_ROLES.PUBLIC, NAV_ROLES.IT, NAV_ROLES.SUPERADMIN] },
    { id: 'admin', label: 'เข้าสู่ระบบ', icon: Settings, tab: 'admin', roles: [NAV_ROLES.PUBLIC, NAV_ROLES.IT, NAV_ROLES.HR, NAV_ROLES.SUPERADMIN], needsRefresh: true, variant: 'primary' },
];

export const HOME_QUICK_ACTIONS = [
    { id: 'repair', label: 'แจ้งซ่อมเดี๋ยวนี้', icon: ClipboardList, tab: 'user', roles: [NAV_ROLES.PUBLIC, NAV_ROLES.IT, NAV_ROLES.SUPERADMIN] },
    { id: 'access', label: 'ขอสิทธิ์ใช้งาน', icon: UserPlus, tab: 'access_request', roles: [NAV_ROLES.PUBLIC, NAV_ROLES.IT, NAV_ROLES.SUPERADMIN] },
    { id: 'change', label: 'ใบขอพัฒนาโปรแกรม', icon: Code, tab: 'change_request', roles: [NAV_ROLES.PUBLIC, NAV_ROLES.IT, NAV_ROLES.SUPERADMIN] },
    { id: 'admin', label: 'Admin', icon: Settings, tab: 'admin', roles: [NAV_ROLES.IT, NAV_ROLES.HR, NAV_ROLES.SUPERADMIN] },
];

export const ADMIN_SUB_TABS = [
    { id: 'issues', label: 'แจ้งซ่อม', icon: Ticket, roles: [NAV_ROLES.IT, NAV_ROLES.SUPERADMIN] },
    { id: 'assets', label: 'ทรัพย์สิน', icon: Monitor, roles: [NAV_ROLES.IT, NAV_ROLES.SUPERADMIN] },
    { id: 'access_requests', label: 'ขอสิทธิ์', icon: Key, roles: [NAV_ROLES.IT, NAV_ROLES.SUPERADMIN] },
    { id: 'change_requests', label: 'ขอพัฒนาโปรแกรม', icon: Code, roles: [NAV_ROLES.IT, NAV_ROLES.SUPERADMIN] },
    { id: 'stats', label: 'สถิติ', icon: TrendingUp, roles: [NAV_ROLES.IT, NAV_ROLES.SUPERADMIN] },
    { id: 'users', label: 'ผู้ใช้งาน', icon: Users, roles: [NAV_ROLES.IT, NAV_ROLES.SUPERADMIN] },
    { id: 'employees', label: 'พนักงาน', icon: Users, roles: [NAV_ROLES.HR, NAV_ROLES.IT, NAV_ROLES.SUPERADMIN] },
];
