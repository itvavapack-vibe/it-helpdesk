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
        'External Repair': '⚠️ ส่งซ่อมภายนอก',
        'Waiting for Parts': '⏳ รออะไหล่',
        'Resolved': '✅ เสร็จสิ้น',
        'Cancelled': '❌ ยกเลิก',
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

export const notifyGlpiSync = (stats) => {
    const hasChanges = stats.assetsAdded > 0 || stats.assetsUpdated > 0 || stats.assetsDeleted > 0 || 
                       stats.usersAdded > 0 || stats.usersUpdated > 0 || stats.usersDeleted > 0;
                       
    if (!hasChanges) return Promise.resolve(); // ไม่ต้องส่งถ้าไม่มีอะไรเปลี่ยน

    const message =
        `🔄 <b>อัปเดตข้อมูลจาก GLPI</b>\n` +
        `━━━━━━━━━━━━━━\n` +
        `🖥️ <b>ข้อมูลเครื่องคอมพิวเตอร์:</b>\n` +
        `   ➕ เพิ่มใหม่: ${stats.assetsAdded}\n` +
        `   ♻️ อัปเดต: ${stats.assetsUpdated}\n` +
        `   🗑️ ลบออก: ${stats.assetsDeleted}\n\n` +
        `👤 <b>ข้อมูลผู้ใช้งาน:</b>\n` +
        `   ➕ เพิ่มใหม่: ${stats.usersAdded}\n` +
        `   ♻️ อัปเดต: ${stats.usersUpdated}\n` +
        `   🗑️ ลบออก: ${stats.usersDeleted}\n` +
        `━━━━━━━━━━━━━━\n` +
        `💡 <i>อัปเดตข้อมูลล่าสุดเมื่อ: ${new Date().toLocaleTimeString('th-TH')}</i>`;
        
    return sendTelegramMessage(message);
};

export const notifyNewAccessRequest = (data) => {
    const requestedSystemsList = Object.keys(data.systems)
        .filter(key => data.systems[key] && key !== 'other')
        .map(key => key.toUpperCase())
        .join(', ');
        
    const otherSystem = data.systems.other ? `อื่นๆ (${data.otherSystemDetails})` : '';
    const allRequestedSystems = [requestedSystemsList, otherSystem].filter(Boolean).join(', ');

    const message =
        `🔑 <b>คำร้องขอสิทธิ์ใช้งาน (อนุมัติแล้ว) ✅</b>\n` +
        `━━━━━━━━━━━━━━\n` +
        `🔖 <b>เลขที่ใบแจ้ง:</b> ${data.ticketNumber || 'ยังไม่มีเลขที่'}\n` +
        `👤 <b>ผู้ขอ:</b> ${data.nameTh}\n` +
        `🏢 <b>แผนก:</b> ${data.department}\n` +
        `💼 <b>ตำแหน่ง:</b> ${data.position}\n` +
        `📞 <b>เบอร์ภายใน:</b> ${data.internalPhone || '-'}\n` +
        `💻 <b>ระบบที่ร้องขอ:</b> ${allRequestedSystems}\n` +
        `📝 <b>รายละเอียด:</b> ${data.requestDetails || 'ไม่ได้ระบุวิจารณญาณ'}`;
    return sendTelegramMessage(message);
};
