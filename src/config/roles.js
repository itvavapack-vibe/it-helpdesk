export const ROLES = {
    PUBLIC: 'public',
    SUPERADMIN: 'superadmin',
    IT_SUPPORT: 'it_support',
    IT_SUPERVISOR: 'it_supervisor',
    IT_MANAGER: 'it_manager',
    IT_SOFTWARE: 'it_software',
    IT_MEDIA: 'it_media',
    HR: 'hr',
};

export const LEGACY_ROLE_MAP = {
    super_admin: ROLES.SUPERADMIN,
    admin: ROLES.IT_SUPPORT,
    it: ROLES.IT_SUPPORT,
    support: ROLES.IT_SUPPORT,
    supervisor: ROLES.IT_SUPERVISOR,
    manager: ROLES.IT_MANAGER,
    software: ROLES.IT_SOFTWARE,
    media: ROLES.IT_MEDIA,
    itsoftware: ROLES.IT_SOFTWARE,
    itmedia: ROLES.IT_MEDIA,
};

export const VALID_ROLE_VALUES = new Set(Object.values(ROLES));

export const normalizeRoleValue = (role) => {
    const normalizedRole = String(role || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
    const mappedRole = LEGACY_ROLE_MAP[normalizedRole] || normalizedRole;
    return VALID_ROLE_VALUES.has(mappedRole) ? mappedRole : ROLES.IT_SUPPORT;
};

export const ROLE_LABELS = {
    [ROLES.SUPERADMIN]: 'Super Admin',
    [ROLES.IT_SUPPORT]: 'IT Support',
    [ROLES.IT_SUPERVISOR]: 'IT Supervisor',
    [ROLES.IT_MANAGER]: 'IT Manager',
    [ROLES.IT_SOFTWARE]: 'IT Software',
    [ROLES.IT_MEDIA]: 'IT Media',
    [ROLES.HR]: 'HR',
    admin: 'IT Support',
    it: 'IT Support',
    support: 'IT Support',
    supervisor: 'IT Supervisor',
    manager: 'IT Manager',
    software: 'IT Software',
    media: 'IT Media',
};

export const ROLE_OPTIONS = [
    { value: ROLES.SUPERADMIN, label: 'Super Admin', description: 'เห็นทุกอย่างและจัดการผู้ใช้งานได้ทั้งหมด' },
    { value: ROLES.IT_SUPPORT, label: 'IT Support', description: 'ดูแลงานแจ้งซ่อมและคำร้องขอสิทธิ์ขั้นแรก' },
    { value: ROLES.IT_SUPERVISOR, label: 'IT Supervisor', description: 'ตรวจสอบคำร้องขอสิทธิ์ก่อนส่ง IT Manager' },
    { value: ROLES.IT_MANAGER, label: 'IT Manager', description: 'อนุมัติขั้นสุดท้ายของคำร้อง IT' },
    { value: ROLES.IT_SOFTWARE, label: 'IT Software', description: 'ดูแลคำร้องขอพัฒนาโปรแกรมขั้นแรก' },
    { value: ROLES.IT_MEDIA, label: 'IT Media', description: 'ดูแลคำร้องขอพัฒนาสื่อขั้นแรก' },
    { value: ROLES.HR, label: 'HR', description: 'เห็นเฉพาะส่วนพนักงาน' },
];

export const isItRole = (role) => [
    ROLES.IT_SUPPORT,
    ROLES.IT_SUPERVISOR,
    ROLES.IT_MANAGER,
    ROLES.IT_SOFTWARE,
    ROLES.IT_MEDIA,
].includes(normalizeRoleValue(role));

export const canManageAdminUsers = (role) => normalizeRoleValue(role) === ROLES.SUPERADMIN;

export const canManageAllWork = (role) => normalizeRoleValue(role) === ROLES.SUPERADMIN;

export const canDeleteRecords = (role) => {
    const rawRole = String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    return rawRole === 'admin' || normalizeRoleValue(role) === ROLES.SUPERADMIN;
};

export const ACCESS_QUEUE_STATUS_BY_ROLE = {
    [ROLES.SUPERADMIN]: ['Pending_IT'],
    [ROLES.IT_SUPPORT]: ['Pending_IT'],
};

export const CHANGE_QUEUE_STATUS_BY_ROLE = {
    [ROLES.SUPERADMIN]: ['Pending_IT', 'In_Progress', 'In_Development'],
    [ROLES.IT_SOFTWARE]: ['Pending_IT', 'In_Progress', 'In_Development'],
    [ROLES.IT_MEDIA]: ['Pending_IT', 'In_Progress', 'In_Development'],
};

export const APPROVAL_QUEUE_STATUS_BY_ROLE = {
    [ROLES.SUPERADMIN]: ['Pending_IT_Supervisor', 'Pending_IT_Manager'],
    [ROLES.IT_SUPERVISOR]: ['Pending_IT_Supervisor'],
    [ROLES.IT_MANAGER]: ['Pending_IT_Manager'],
};

export const visibleQueueStatuses = (role, queueMap) => {
    const normalized = normalizeRoleValue(role);
    return queueMap[normalized] || [];
};

export const canHandleChangeRequestCategory = (role, item) => {
    const normalized = normalizeRoleValue(role);
    const category = item?.request_category;
    if (normalized === ROLES.IT_SOFTWARE) return category === 'พัฒนาโปรแกรม';
    if (normalized === ROLES.IT_MEDIA) return category === 'พัฒนาสื่อ';
    return true;
};

export const countVisibleQueue = (items, role, queueMap, itemFilter = () => true) => {
    const statuses = visibleQueueStatuses(role, queueMap);
    return items.filter((item) => statuses.includes(item.status) && itemFilter(role, item)).length;
};
