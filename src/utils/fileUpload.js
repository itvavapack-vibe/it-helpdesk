import { API_URL } from '../mysqlClient';

export const MAX_ATTACHMENT_FILES = 5;
export const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

export const resolveAttachmentUrl = (url) => {
    if (!url || /^(?:https?:|data:|blob:)/i.test(url)) return url;
    return `${API_URL}${url.startsWith('/') ? url : `/${url}`}`;
};

export const uploadAttachmentFiles = async (files, metadata = {}) => {
    if (!files.length) return [];
    if (files.length > MAX_ATTACHMENT_FILES) {
        throw new Error(`สามารถแนบไฟล์ได้สูงสุด ${MAX_ATTACHMENT_FILES} ไฟล์`);
    }

    const oversizedFile = files.find((file) => file.size > MAX_ATTACHMENT_SIZE);
    if (oversizedFile) {
        throw new Error(`ไฟล์ ${oversizedFile.name} มีขนาดเกิน 5 MB`);
    }

    const body = new FormData();
    files.forEach((file) => body.append('files', file));

    const response = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        body,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.error) {
        throw new Error(result?.error || response.statusText || 'ไม่สามารถอัปโหลดไฟล์ได้');
    }

    return (result.data || []).map((file) => ({
        ...file,
        ...metadata,
        uploadedAt: file.uploadedAt || new Date().toISOString(),
    }));
};
