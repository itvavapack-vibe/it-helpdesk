import { ROLES, normalizeRoleValue } from './roles';

export const IT_CHAT_ASSIGNEES = [
    { key: 'joe', nickname: 'โจ้', roleLabel: 'ผู้จัดการแผนกไอที', role: ROLES.IT_MANAGER },
    { key: 'stamp', nickname: 'แสตมป์', roleLabel: 'หัวหน้าแผนกไอที', role: ROLES.IT_SUPERVISOR },
    { key: 'fight', nickname: 'ไฟท์', roleLabel: 'เจ้าหน้าที่แผนกไอที', role: ROLES.IT_SUPPORT },
    { key: 'base', nickname: 'เบศร', roleLabel: 'เจ้าหน้าที่โปรแกรมเมอร์', role: ROLES.IT_SOFTWARE },
    { key: 'pick', nickname: 'ปิ๊ก', roleLabel: 'เจ้าหน้าที่พัฒนาสื่อ', role: ROLES.IT_MEDIA },
];

export const getItChatAssigneeByKey = (key) =>
    IT_CHAT_ASSIGNEES.find((assignee) => assignee.key === key) || IT_CHAT_ASSIGNEES[0];

export const getItChatAssigneeForAdmin = (admin) => {
    const role = normalizeRoleValue(admin?.role);
    const name = String(`${admin?.name || ''} ${admin?.username || ''}`).toLowerCase();

    const nameMatch = IT_CHAT_ASSIGNEES.find((assignee) =>
        name.includes(assignee.key) || name.includes(assignee.nickname.toLowerCase())
    );
    if (nameMatch) return nameMatch;

    return IT_CHAT_ASSIGNEES.find((assignee) => assignee.role === role) || null;
};

export const canSeeAllItChatSessions = (admin) => normalizeRoleValue(admin?.role) === ROLES.SUPERADMIN;

export const canAdminSeeItChatSession = (admin, assigneeKey) => {
    if (canSeeAllItChatSessions(admin)) return true;
    const assignee = getItChatAssigneeForAdmin(admin);
    return Boolean(assignee && assignee.key === assigneeKey);
};
