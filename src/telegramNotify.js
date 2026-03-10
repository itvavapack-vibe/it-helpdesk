const BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
const CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID;

const sendTelegramMessage = async (message) => {
    // Debug: แสดงสถานะ env vars (จะเห็นใน browser console)
    console.log('[Telegram] BOT_TOKEN:', BOT_TOKEN ? '✅ มีค่า' : '❌ ไม่มีค่า');
    console.log('[Telegram] CHAT_ID:', CHAT_ID ? '✅ มีค่า' : '❌ ไม่มีค่า');

    if (!BOT_TOKEN || !CHAT_ID) {
        console.error('[Telegram] ❌ BOT_TOKEN หรือ CHAT_ID ยังไม่ได้ตั้งค่า กรุณาตั้งค่า Environment Variables บน hosting');
        return;
    }

    // ตรวจสอบว่าค่าไม่ใช่ placeholder
    if (BOT_TOKEN.includes('ใส่') || CHAT_ID.includes('ใส่')) {
        console.error('[Telegram] ❌ BOT_TOKEN หรือ CHAT_ID ยังเป็นค่า placeholder กรุณาใส่ค่าจริง');
        return;
    }

    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        console.log('[Telegram] 📤 กำลังส่งข้อความ...');
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
        if (result.ok) {
            console.log('[Telegram] ✅ ส่งข้อความสำเร็จ');
        } else {
            console.error('[Telegram] ❌ API ตอบกลับ error:', result);
        }
    } catch (error) {
        console.error('[Telegram] ❌ ส่งข้อความไม่สำเร็จ (อาจเป็น CORS หรือ network error):', error);
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
