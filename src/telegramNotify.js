const BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
const CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID;

const sendTelegramMessage = async (message) => {
    if (!BOT_TOKEN || !CHAT_ID) {
        console.error('[Telegram] ❌ BOT_TOKEN หรือ CHAT_ID ยังไม่ได้ตั้งค่า');
        return;
    }
    if (BOT_TOKEN.includes('ใส่') || CHAT_ID.includes('ใส่')) {
        console.error('[Telegram] ❌ BOT_TOKEN หรือ CHAT_ID ยังเป็นค่า placeholder');
        return;
    }

    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: message,
                parse_mode: 'HTML',
            }),
        });
        const result = await response.json();
        if (!result.ok) {
            console.error('[Telegram] ❌ API error:', result);
        }
    } catch (error) {
        console.error('[Telegram] ❌ ส่งข้อความไม่สำเร็จ:', error);
    }
};

export const notifyNewIssue = (issue) => {
    const severityEmoji = issue.severity === 'Most Urgent' ? '🔴' : issue.severity === 'Urgent' ? '🟡' : '🟢';
    const message =
        `📋 <b>แจ้งซ่อมใหม่!</b>\n` +
        `━━━━━━━━━━━━━━\n` +
        `🔖 <b>เลขที่:</b> ${issue.id}\n` +
        `👤 <b>ผู้แจ้ง:</b> ${issue.name}\n` +
        `🏢 <b>แผนก:</b> ${issue.department}\n` +
        `🗂️ <b>หมวดหมู่:</b> ${issue.category}\n` +
        `${severityEmoji} <b>ความเร่งด่วน:</b> ${issue.severity}\n` +
        (issue.assetName ? `💻 <b>อุปกรณ์:</b> ${issue.assetName}\n` : '') +
        `📝 <b>ปัญหา:</b> ${issue.description}`;
    return sendTelegramMessage(message);
};

export const notifyStatusChange = (issue, newStatus) => {
    const statusMap = {
        'Pending': '⏳ รอดำเนินการ',
        'In Progress': '🔧 กำลังแก้ไข',
        'Resolved': '✅ เสร็จสิ้น',
    };
    const message =
        `🔔 <b>อัปเดตสถานะการซ่อม</b>\n` +
        `━━━━━━━━━━━━━━\n` +
        `🔖 <b>เลขที่:</b> ${issue.id}\n` +
        `👤 <b>ผู้แจ้ง:</b> ${issue.name}\n` +
        `📌 <b>สถานะใหม่:</b> ${statusMap[newStatus] || newStatus}` +
        (issue.assignedAdmin ? `\n👨‍💻 <b>ผู้รับงาน:</b> ${issue.assignedAdmin}` : '');
    return sendTelegramMessage(message);
};

export const notifyRepairUpdate = (issue, details) => {
    const message =
        `🔧 <b>บันทึกรายละเอียดการซ่อม</b>\n` +
        `━━━━━━━━━━━━━━\n` +
        `🔖 <b>เลขที่:</b> ${issue.id}\n` +
        `👤 <b>ผู้แจ้ง:</b> ${issue.name}\n` +
        `📝 <b>รายละเอียด:</b> ${details}` +
        (issue.assignedAdmin ? `\n👨‍💻 <b>ผู้รับงาน:</b> ${issue.assignedAdmin}` : '');
    return sendTelegramMessage(message);
};
