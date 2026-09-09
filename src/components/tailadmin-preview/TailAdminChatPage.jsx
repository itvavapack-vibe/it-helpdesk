import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircle, Paperclip, RefreshCw, SearchX, UserRound } from 'lucide-react';
import { mysql } from '../../mysqlClient';
import { canAdminSeeItChatSession } from '../../config/itChatAssignees';
import { SystemPageHeader, SystemStatusBadge } from '../system-ui';

const parseAttachments = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
};
const formatDateTime = (value) => {
    const date = new Date(value || 0);
    return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
};
const groupSessions = (messages) => {
    const grouped = new Map();
    messages.forEach((message) => {
        const current = grouped.get(message.session_id) || { id: message.session_id, messages: [] };
        current.messages.push(message);
        if (!current.latestAt || new Date(message.created_at) >= new Date(current.latestAt)) {
            Object.assign(current, {
                requesterName: message.requester_name || message.sender_name || '-',
                documentNo: message.document_no || '', category: message.category || '-',
                assigneeKey: message.assignee_key || '', assigneeName: message.assignee_name || '',
                assigneeRole: message.assignee_role || '', status: message.status || 'Open',
                latestAt: message.created_at,
                latestText: message.message_text || (parseAttachments(message.attachments_json).length ? 'ส่งไฟล์แนบ' : ''),
            });
        }
        grouped.set(message.session_id, current);
    });
    return [...grouped.values()].map((item) => ({ ...item, messages: item.messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)) })).sort((a, b) => new Date(b.latestAt) - new Date(a.latestAt));
};

export default function TailAdminChatPage({ query, currentAdmin, onOpenLegacy }) {
    const [messages, setMessages] = useState([]);
    const [selectedId, setSelectedId] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const loadMessages = useCallback(async () => {
        setLoading(true); setError('');
        const { data, error: loadError } = await mysql.from('it_chat_messages').select('*').order('created_at', { ascending: false }).limit(300);
        if (loadError) { setError(loadError.message || 'โหลดแชทไม่สำเร็จ'); setMessages([]); } else setMessages(data || []);
        setLoading(false);
    }, []);
    useEffect(() => { loadMessages(); }, [loadMessages]);
    const sessions = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return groupSessions(messages).filter((item) => canAdminSeeItChatSession(currentAdmin, item.assigneeKey))
            .filter((item) => !needle || [item.requesterName, item.documentNo, item.category, item.assigneeName, item.latestText].some((value) => String(value || '').toLowerCase().includes(needle)));
    }, [currentAdmin, messages, query]);
    useEffect(() => { if (!sessions.some((item) => item.id === selectedId)) setSelectedId(sessions[0]?.id || ''); }, [selectedId, sessions]);
    const selected = sessions.find((item) => item.id === selectedId) || sessions[0];

    return <>
        <SystemPageHeader breadcrumb="IT Helpdesk / Communication" title="แชทติดต่อ IT" meta="กล่องสนทนาที่ส่งถึงผู้รับผิดชอบตามสิทธิ์" actions={<div className="tap-page-actions"><button type="button" className="tap-secondary-button" disabled={loading} onClick={loadMessages}><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> รีเฟรช</button><button type="button" className="tap-primary-button" onClick={onOpenLegacy}><MessageCircle size={17} /> เปิดแชทเดิม</button></div>} />
        {error && <div className="tap-inline-error tap-chat-error">{error}</div>}
        <section className="tap-chat-layout tap-card">
            <aside className="tap-chat-list"><header><div><MessageCircle size={18} /><strong>การสนทนา</strong></div><SystemStatusBadge tone="info">{sessions.length}</SystemStatusBadge></header><div>
                {sessions.map((item) => <button key={item.id} type="button" className={selected?.id === item.id ? 'is-selected' : ''} onClick={() => setSelectedId(item.id)}><span className="tap-chat-avatar">{String(item.requesterName || '?').slice(0, 1)}</span><div><strong>{item.requesterName}</strong><small>{item.documentNo || 'ไม่ระบุเอกสาร'} · {item.assigneeName || 'IT'}</small><p>{item.latestText || 'ไฟล์แนบ'}</p></div><time>{formatDateTime(item.latestAt)}</time></button>)}
                {!loading && !sessions.length && <div className="tap-chat-empty"><SearchX size={22} /><span>ไม่พบการสนทนา</span></div>}
            </div></aside>
            <article className="tap-chat-thread">{selected ? <><header><div className="tap-chat-avatar"><UserRound size={18} /></div><div><strong>{selected.requesterName}</strong><span>{selected.documentNo || 'ไม่ระบุเอกสาร'} · {selected.category}</span></div><SystemStatusBadge tone={selected.status === 'Closed' ? 'neutral' : 'success'}>{selected.status === 'Closed' ? 'ปิดแล้ว' : 'กำลังสนทนา'}</SystemStatusBadge></header><div className="tap-chat-messages">{selected.messages.map((message) => { const admin = message.sender_type === 'admin'; const attachments = parseAttachments(message.attachments_json); return <div key={message.id} className={`tap-chat-message ${admin ? 'is-admin' : ''}`}><div><small>{message.sender_name || (admin ? 'IT Admin' : selected.requesterName)} · {formatDateTime(message.created_at)}</small><p>{message.message_text || 'ส่งไฟล์แนบ'}</p>{attachments.length > 0 && <span><Paperclip size={13} /> {attachments.length} ไฟล์</span>}</div></div>; })}</div><footer><div><span>ตอบกลับและแนบไฟล์ได้จาก workflow เดิม</span><strong>{selected.assigneeName || 'ทีม IT'}</strong></div><button type="button" className="tap-primary-button" onClick={onOpenLegacy}>เปิดเพื่อพิมพ์ตอบ</button></footer></> : <div className="tap-chat-placeholder"><MessageCircle size={32} /><strong>เลือกการสนทนา</strong><span>รายละเอียดข้อความจะแสดงที่นี่</span></div>}</article>
        </section>
    </>;
}
