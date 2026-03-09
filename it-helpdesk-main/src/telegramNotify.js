const TELEGRAM_BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID;

const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

/**
 * ส่งข้อความไปยัง Telegram Group
 * @param {string} message - ข้อความ (รองรับ HTML)
 */
export const sendTelegramMessage = async (message) => {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.warn('Telegram config missing. Skipping notification.');
        return;
    }

    try {
        const response = await fetch(TELEGRAM_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML',
            }),
        });

        if (!response.ok) {
            const err = await response.json();
            console.error('Telegram API error:', err);
        }
    } catch (error) {
        console.error('Failed to send Telegram notification:', error);
    }
};

// --- Message Builders ---

const SEVERITY_EMOJI = {
    'ต่ำ': '🟢',
    'ปานกลาง': '🟡',
    'สูง': '🔴',
    'วิกฤต': '🚨',
};

const STATUS_EMOJI = {
    'รอดำเนินการ': '🕐',
    'กำลังดำเนินการ': '🔧',
    'เสร็จสิ้น': '✅',
    'ยกเลิก': '❌',
};

/**
 * สร้างข้อความแจ้งเตือนเมื่อมีการแจ้งซ่อมใหม่
 */
export const buildNewIssueMessage = (issue) => {
    const severityEmoji = SEVERITY_EMOJI[issue.severity] || '⚠️';
    const dateStr = new Date(issue.createdAt).toLocaleString('th-TH', {
        dateStyle: 'medium',
        timeStyle: 'short',
    });

    return (
        `🆕 <b>แจ้งซ่อมใหม่!</b>\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `📋 <b>เลขที่:</b> ${issue.id}\n` +
        `👤 <b>ผู้แจ้ง:</b> ${issue.name}\n` +
        `🏢 <b>แผนก:</b> ${issue.department}\n` +
        `🔧 <b>ประเภท:</b> ${issue.category}\n` +
        `${severityEmoji} <b>ความรุนแรง:</b> ${issue.severity}\n` +
        `📝 <b>รายละเอียด:</b> ${issue.description}\n` +
        `🕒 <b>เวลา:</b> ${dateStr}`
    );
};

/**
 * สร้างข้อความแจ้งเตือนเมื่ออัปเดตสถานะ
 */
export const buildStatusUpdateMessage = (issue, newStatus, adminName) => {
    const statusEmoji = STATUS_EMOJI[newStatus] || '🔄';

    return (
        `${statusEmoji} <b>อัปเดตสถานะแจ้งซ่อม</b>\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `📋 <b>เลขที่:</b> ${issue.id}\n` +
        `👤 <b>ผู้แจ้ง:</b> ${issue.name}\n` +
        `🏢 <b>แผนก:</b> ${issue.department}\n` +
        `🔧 <b>ประเภท:</b> ${issue.category}\n` +
        `📌 <b>สถานะใหม่:</b> ${newStatus}` +
        (adminName ? `\n👨‍💻 <b>ผู้ดำเนินการ:</b> ${adminName}` : '')
    );
};
