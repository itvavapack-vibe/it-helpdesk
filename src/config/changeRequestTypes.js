export const CHANGE_REQUEST_TYPE_OPTIONS = [
    { value: 'add', label: 'เพิ่ม' },
    { value: 'remove', label: 'นำออก' },
    { value: 'change', label: 'เปลี่ยนแปลงแก้ไข' },
];

export const CHANGE_REQUEST_TYPE_LABELS = CHANGE_REQUEST_TYPE_OPTIONS.reduce((labels, option) => {
    labels[option.value] = option.label;
    return labels;
}, {});

export const getChangeRequestTypeLabel = (type) => CHANGE_REQUEST_TYPE_LABELS[type] || type || '-';
