import { API_URL } from '../mysqlClient';

export const MAX_ATTACHMENT_FILES = 5;
export const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 1600;
export const IMAGE_UPLOAD_QUALITY = 0.82;

const RESIZABLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const resolveAttachmentUrl = (url) => {
    if (!url || /^(?:https?:|data:|blob:)/i.test(url)) return url;
    return `${API_URL}${url.startsWith('/') ? url : `/${url}`}`;
};

const loadImageFromFile = (file) => new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
    };
    image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('ไม่สามารถอ่านรูปภาพได้'));
    };
    image.src = objectUrl;
});

const buildOptimizedImageName = (file, targetType) => {
    const extension = targetType === 'image/webp' ? 'webp' : 'jpg';
    const baseName = String(file.name || 'attachment')
        .replace(/\.[^.]+$/, '')
        .replace(/[\\/:*?"<>|]+/g, '-')
        .trim() || 'attachment';
    return `${baseName}.${extension}`;
};

export const optimizeImageFile = async (file) => {
    if (!file || !RESIZABLE_IMAGE_TYPES.has(file.type)) return file;

    try {
        const image = await loadImageFromFile(file);
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        const largestSide = Math.max(sourceWidth, sourceHeight);
        const scale = largestSide > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / largestSide : 1;
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));

        if (scale >= 1 && file.size <= MAX_ATTACHMENT_SIZE) return file;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext('2d');
        if (!context) return file;

        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        const targetType = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
        const blob = await new Promise((resolve) => {
            canvas.toBlob(resolve, targetType, IMAGE_UPLOAD_QUALITY);
        });

        if (!blob || blob.size >= file.size) return file;

        return new File([blob], buildOptimizedImageName(file, targetType), {
            type: targetType,
            lastModified: Date.now()
        });
    } catch (error) {
        console.warn('Image optimization skipped:', error);
        return file;
    }
};

export const optimizeAttachmentFiles = async (files) => Promise.all(files.map(optimizeImageFile));

export const uploadAttachmentFiles = async (files, metadata = {}) => {
    if (!files.length) return [];
    if (files.length > MAX_ATTACHMENT_FILES) {
        throw new Error(`สามารถแนบไฟล์ได้สูงสุด ${MAX_ATTACHMENT_FILES} ไฟล์`);
    }

    const optimizedFiles = await optimizeAttachmentFiles(files);
    const oversizedFile = optimizedFiles.find((file) => file.size > MAX_ATTACHMENT_SIZE);
    if (oversizedFile) {
        throw new Error(`ไฟล์ ${oversizedFile.name} มีขนาดเกิน 5 MB`);
    }

    const body = new FormData();
    optimizedFiles.forEach((file) => body.append('files', file));

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
