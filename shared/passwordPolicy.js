export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_POLICY_TEXT = 'อย่างน้อย 8 ตัว และต้องมีตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และอักขระพิเศษ';

export const getPasswordPolicyErrors = (password) => {
    const value = String(password || '');
    const errors = [];

    if (value.length < PASSWORD_MIN_LENGTH) errors.push(`อย่างน้อย ${PASSWORD_MIN_LENGTH} ตัว`);
    if (!/[A-Z]/.test(value)) errors.push('ตัวพิมพ์ใหญ่');
    if (!/[a-z]/.test(value)) errors.push('ตัวพิมพ์เล็ก');
    if (!/\d/.test(value)) errors.push('ตัวเลข');
    if (!/[^A-Za-z0-9]/.test(value)) errors.push('อักขระพิเศษ');

    return errors;
};

export const isPasswordValid = (password) => getPasswordPolicyErrors(password).length === 0;
