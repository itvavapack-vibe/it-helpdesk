import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileText, MessageCircle, Paperclip, RefreshCw, Send, UserRound, X } from 'lucide-react';
import Swal from 'sweetalert2';
import { mysql } from '../mysqlClient';
import { canAdminSeeItChatSession, canSeeAllItChatSessions, getItChatAssigneeForAdmin } from '../config/itChatAssignees';
import { MAX_ATTACHMENT_FILES, MAX_ATTACHMENT_SIZE, resolveAttachmentUrl, uploadAttachmentFiles } from '../utils/fileUpload';

const CHAT_ATTACHMENT_ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip';

const formatFileSize = (size) => {
    const bytes = Number(size || 0);
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const parseAttachments = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn('Invalid IT chat attachments:', error);
        return [];
    }
};

const formatDateTime = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('th-TH', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const MessageAttachments = ({ attachments, isAdmin }) => {
    if (!attachments.length) return null;

    return (
        <div className="mt-3 space-y-2">
            {attachments.map((file, index) => {
                const name = file.originalName || file.originalname || file.name || file.filename || 'ไฟล์แนบ';
                const url = resolveAttachmentUrl(file.url || file.path || file.filePath);
                const isImage = /^image\//i.test(file.mimetype || file.type || '') || /\.(png|jpe?g|gif|webp)$/i.test(name);
                const linkClass = isAdmin
                    ? 'border-white/25 bg-white/10 text-white hover:bg-white/20'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100 dark:hover:bg-slate-900';

                return (
                    <a
                        key={`${name}-${index}`}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${linkClass}`}
                    >
                        {isImage && url ? (
                            <img src={url} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                        ) : (
                            <FileText className="h-4 w-4 shrink-0" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{name}</span>
                        <span className="shrink-0 opacity-70">{formatFileSize(file.size)}</span>
                    </a>
                );
            })}
        </div>
    );
};

const groupSessions = (messages = []) => {
    const grouped = new Map();

    messages.forEach((message) => {
        const session = grouped.get(message.session_id) || {
            id: message.session_id,
            requesterName: message.requester_name || message.sender_name || '-',
            documentNo: message.document_no || '',
            category: message.category || '-',
            assigneeKey: message.assignee_key || '',
            assigneeName: message.assignee_name || '',
            assigneeRole: message.assignee_role || '',
            status: message.status || 'Open',
            latestAt: message.created_at,
            latestText: message.message_text || (parseAttachments(message.attachments_json).length ? 'ส่งไฟล์แนบ' : ''),
            messages: [],
        };

        session.messages.push(message);
        if (!session.latestAt || new Date(message.created_at) >= new Date(session.latestAt)) {
            session.latestAt = message.created_at;
            session.latestText = message.message_text || (parseAttachments(message.attachments_json).length ? 'ส่งไฟล์แนบ' : '');
            session.status = message.status || session.status;
            session.requesterName = message.requester_name || session.requesterName;
            session.documentNo = message.document_no || session.documentNo;
            session.category = message.category || session.category;
            session.assigneeKey = message.assignee_key || session.assigneeKey;
            session.assigneeName = message.assignee_name || session.assigneeName;
            session.assigneeRole = message.assignee_role || session.assigneeRole;
        }
        grouped.set(message.session_id, session);
    });

    return Array.from(grouped.values())
        .map((session) => ({
            ...session,
            messages: session.messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
            userMessageCount: session.messages.filter((message) => message.sender_type === 'user').length,
            adminMessageCount: session.messages.filter((message) => message.sender_type === 'admin').length,
        }))
        .sort((a, b) => new Date(b.latestAt) - new Date(a.latestAt));
};

const ChatBubble = ({ message }) => {
    const isAdmin = message.sender_type === 'admin';
    const attachments = parseAttachments(message.attachments_json);

    return (
        <div className={`flex gap-3 ${isAdmin ? 'justify-end' : 'justify-start'}`}>
            {!isAdmin && (
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                    <UserRound className="h-5 w-5" />
                </div>
            )}
            <div className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${isAdmin ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'}`}>
                <div className="mb-1 text-[11px] font-bold opacity-75">
                    {message.sender_name || (isAdmin ? 'IT Admin' : 'ผู้ติดต่อ')} {formatDateTime(message.created_at)}
                </div>
                <div className="whitespace-pre-wrap">{message.message_text}</div>
                <MessageAttachments attachments={attachments} isAdmin={isAdmin} />
            </div>
        </div>
    );
};

const AdminITChat = ({ currentAdmin }) => {
    const [messages, setMessages] = useState([]);
    const [selectedSessionId, setSelectedSessionId] = useState('');
    const [replyText, setReplyText] = useState('');
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const chatEndRef = useRef(null);
    const fileInputRef = useRef(null);

    const adminAssignee = getItChatAssigneeForAdmin(currentAdmin);
    const canSeeAllSessions = canSeeAllItChatSessions(currentAdmin);
    const sessions = useMemo(
        () => groupSessions(messages).filter((session) => canAdminSeeItChatSession(currentAdmin, session.assigneeKey)),
        [currentAdmin, messages]
    );
    const selectedSession = sessions.find((session) => session.id === selectedSessionId) || sessions[0] || null;

    const scrollToLatest = () => {
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
    };

    const loadMessages = async ({ quiet = false } = {}) => {
        if (!quiet) setIsLoading(true);
        const { data, error } = await mysql
            .from('it_chat_messages')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(300);

        if (error) {
            console.error('Load admin IT chat failed:', error);
            if (!quiet) Swal.fire('โหลดแชทไม่สำเร็จ', 'กรุณาตรวจสอบว่ารัน migration it_chat แล้ว', 'error');
        } else {
            setMessages(Array.isArray(data) ? data : []);
        }
        if (!quiet) setIsLoading(false);
    };

    useEffect(() => {
        loadMessages();
        const timer = setInterval(() => loadMessages({ quiet: true }), 5000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!selectedSessionId && sessions[0]?.id) {
            setSelectedSessionId(sessions[0].id);
        }
    }, [sessions, selectedSessionId]);

    useEffect(() => {
        scrollToLatest();
    }, [selectedSession?.messages?.length]);

    const handleReply = async (event) => {
        event.preventDefault();
        const text = replyText.trim();
        const filesToSend = selectedFiles;
        if ((!text && filesToSend.length === 0) || !selectedSession || isSending) return;

        setIsSending(true);
        const adminName = currentAdmin?.name || currentAdmin?.username || 'IT Admin';
        try {
            const attachments = filesToSend.length
                ? await uploadAttachmentFiles(filesToSend, {
                    source: 'it_chat',
                    uploadedByType: 'admin',
                    uploadedByName: adminName,
                })
                : [];
            const attachmentsJson = attachments.length ? JSON.stringify(attachments) : null;
            const outgoingText = text || 'ส่งไฟล์แนบ';

            const { error } = await mysql.from('it_chat_messages').insert([{
                session_id: selectedSession.id,
                sender_type: 'admin',
                sender_name: adminName,
                requester_name: selectedSession.requesterName,
                document_no: selectedSession.documentNo,
                category: selectedSession.category,
                assignee_key: selectedSession.assigneeKey,
                assignee_name: selectedSession.assigneeName,
                assignee_role: selectedSession.assigneeRole,
                message_text: outgoingText,
                attachments_json: attachmentsJson,
                status: selectedSession.status || 'Open',
            }]);

            if (error) throw error;
            setReplyText('');
            setSelectedFiles([]);
            await loadMessages({ quiet: true });
        } catch (error) {
            console.error('Send admin IT chat reply failed:', error);
            Swal.fire('ส่งข้อความไม่สำเร็จ', error?.message || 'กรุณาลองใหม่อีกครั้ง', 'error');
        } finally {
            setIsSending(false);
        }
    };

    const handleFileSelect = (event) => {
        const nextFiles = Array.from(event.target.files || []);
        event.target.value = '';
        if (!nextFiles.length) return;

        if (selectedFiles.length + nextFiles.length > MAX_ATTACHMENT_FILES) {
            Swal.fire('แนบไฟล์ได้ไม่เกินกำหนด', `แนบได้สูงสุด ${MAX_ATTACHMENT_FILES} ไฟล์ต่อข้อความ`, 'warning');
            return;
        }

        const oversizedFile = nextFiles.find((file) => file.size > MAX_ATTACHMENT_SIZE);
        if (oversizedFile) {
            Swal.fire('ไฟล์ใหญ่เกินไป', `ไฟล์ ${oversizedFile.name} มีขนาดเกิน 5 MB`, 'warning');
            return;
        }

        setSelectedFiles((current) => [...current, ...nextFiles]);
    };

    const removeSelectedFile = (indexToRemove) => {
        setSelectedFiles((current) => current.filter((_, index) => index !== indexToRemove));
    };

    const setSessionStatus = async (status) => {
        if (!selectedSession) return;
        const { error } = await mysql
            .from('it_chat_messages')
            .update({ status })
            .eq('session_id', selectedSession.id);

        if (error) {
            console.error('Update IT chat status failed:', error);
            Swal.fire('อัปเดตสถานะไม่สำเร็จ', 'กรุณาลองใหม่อีกครั้ง', 'error');
        } else {
            await loadMessages({ quiet: true });
        }
    };

    return (
        <div className="grid min-h-[calc(100dvh-8rem)] grid-cols-1 gap-5 animate-fade-in xl:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                        <MessageCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
                        <h2 className="font-extrabold text-slate-900 dark:text-white">แชทติดต่อไอที</h2>
                    </div>
                    <button
                        type="button"
                        onClick={() => loadMessages()}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
                        title="รีเฟรช"
                    >
                        <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                <div className="max-h-[calc(100dvh-13rem)] overflow-y-auto p-3">
                    <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                        {canSeeAllSessions
                            ? 'กำลังแสดงแชททั้งหมด'
                            : adminAssignee
                                ? `กำลังแสดงเฉพาะแชทของ ${adminAssignee.nickname} - ${adminAssignee.roleLabel}`
                                : 'บัญชีนี้ยังไม่ได้ผูกกับปลายทางแชท'}
                    </div>
                    {sessions.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400 dark:border-slate-700">
                            ยังไม่มีแชทเข้ามา
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {sessions.map((session) => (
                                <button
                                    key={session.id}
                                    type="button"
                                    onClick={() => {
                                        setSelectedSessionId(session.id);
                                        setSelectedFiles([]);
                                    }}
                                    className={`w-full rounded-xl border p-3 text-left transition ${selectedSession?.id === session.id ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30' : 'border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:bg-slate-900'}`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{session.requesterName}</div>
                                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${session.status === 'Closed' ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200'}`}>
                                            {session.status === 'Closed' ? 'ปิดแล้ว' : 'เปิดอยู่'}
                                        </span>
                                    </div>
                                    <div className="mt-1 truncate text-xs font-extrabold text-slate-700 dark:text-slate-200">
                                        เอกสาร {session.documentNo || '-'}
                                    </div>
                                    <div className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{session.category}</div>
                                    <div className="mt-1 truncate text-[11px] font-bold text-emerald-600 dark:text-emerald-300">
                                        ถึง {session.assigneeName || '-'} {session.assigneeRole ? `· ${session.assigneeRole}` : ''}
                                    </div>
                                    <div className="mt-2 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{session.latestText}</div>
                                    <div className="mt-2 text-[11px] font-semibold text-slate-400">{formatDateTime(session.latestAt)}</div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </aside>

            <section className="flex overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm dark:border-slate-700 dark:bg-slate-900/40">
                {selectedSession ? (
                    <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                            <div className="min-w-0">
                                <h3 className="truncate font-extrabold text-slate-900 dark:text-white">{selectedSession.requesterName}</h3>
                                <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    เอกสาร {selectedSession.documentNo || '-'} · {selectedSession.category} · ถึง {selectedSession.assigneeName || '-'} · รหัส {selectedSession.id.slice(0, 8)}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSessionStatus(selectedSession.status === 'Closed' ? 'Open' : 'Closed')}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                <CheckCircle2 className="h-4 w-4" />
                                {selectedSession.status === 'Closed' ? 'เปิดแชทอีกครั้ง' : 'ปิดแชท'}
                            </button>
                        </div>

                        <div className="flex-1 space-y-4 overflow-y-auto p-4">
                            {selectedSession.messages.map((message) => (
                                <ChatBubble key={message.id} message={message} />
                            ))}
                            <div ref={chatEndRef} />
                        </div>

                        <form onSubmit={handleReply} className="border-t border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                            {selectedFiles.length > 0 && (
                                <div className="mb-3 flex flex-wrap gap-2">
                                    {selectedFiles.map((file, index) => (
                                        <span
                                            key={`${file.name}-${index}`}
                                            className="inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                        >
                                            <FileText className="h-4 w-4 shrink-0" />
                                            <span className="max-w-52 truncate">{file.name}</span>
                                            <span className="shrink-0 text-slate-400">{formatFileSize(file.size)}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeSelectedFile(index)}
                                                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white"
                                                title="ลบไฟล์"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            <div className="flex gap-3">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    accept={CHAT_ATTACHMENT_ACCEPT}
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isSending}
                                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                                    title={`แนบไฟล์ สูงสุด ${MAX_ATTACHMENT_FILES} ไฟล์ ไฟล์ละไม่เกิน 5 MB`}
                                >
                                    <Paperclip className="h-4 w-4" />
                                </button>
                                <input
                                    value={replyText}
                                    onChange={(event) => setReplyText(event.target.value)}
                                    className="input-modern flex-1"
                                    placeholder="พิมพ์ตอบกลับผู้ติดต่อ"
                                    disabled={isSending}
                                />
                                <button
                                    type="submit"
                                    disabled={(!replyText.trim() && selectedFiles.length === 0) || isSending}
                                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    title="ส่งข้อความ"
                                >
                                    <Send className="h-4 w-4" />
                                </button>
                            </div>
                        </form>
                    </div>
                ) : (
                    <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-400">
                        เลือกห้องแชทจากรายการด้านซ้าย
                    </div>
                )}
            </section>
        </div>
    );
};

export default AdminITChat;
