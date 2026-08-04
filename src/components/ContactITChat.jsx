import React, { useEffect, useRef, useState } from 'react';
import { Bot, FileText, MessageCircle, Paperclip, RefreshCw, RotateCcw, Send, UserRound, X } from 'lucide-react';
import Swal from 'sweetalert2';
import { mysql } from '../mysqlClient';
import { ISSUE_CATEGORIES } from '../config/issueOptions';
import { IT_CHAT_ASSIGNEES, getItChatAssigneeByKey } from '../config/itChatAssignees';
import { MAX_ATTACHMENT_FILES, MAX_ATTACHMENT_SIZE, resolveAttachmentUrl, uploadAttachmentFiles } from '../utils/fileUpload';

const SESSION_STORAGE_KEY = 'it-helpdesk-contact-chat-session';
const NAME_STORAGE_KEY = 'it-helpdesk-contact-chat-name';
const DOCUMENT_STORAGE_KEY = 'it-helpdesk-contact-chat-document';
const CATEGORY_STORAGE_KEY = 'it-helpdesk-contact-chat-category';
const ASSIGNEE_STORAGE_KEY = 'it-helpdesk-contact-chat-assignee';
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

const createSessionId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const getStoredSessionId = () => {
    const saved = localStorage.getItem(SESSION_STORAGE_KEY);
    if (saved) return saved;
    const next = createSessionId();
    localStorage.setItem(SESSION_STORAGE_KEY, next);
    return next;
};

const formatTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
};

const MessageAttachments = ({ attachments, isUser }) => {
    if (!attachments.length) return null;

    return (
        <div className="mt-3 space-y-2">
            {attachments.map((file, index) => {
                const name = file.originalName || file.originalname || file.name || file.filename || 'ไฟล์แนบ';
                const url = resolveAttachmentUrl(file.url || file.path || file.filePath);
                const isImage = /^image\//i.test(file.mimetype || file.type || '') || /\.(png|jpe?g|gif|webp)$/i.test(name);
                const linkClass = isUser
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

const ChatBubble = ({ message }) => {
    const isUser = message.sender_type === 'user';
    const Icon = isUser ? UserRound : Bot;
    const attachments = parseAttachments(message.attachments_json);

    return (
        <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
            {!isUser && (
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200">
                    <Icon className="h-5 w-5" />
                </div>
            )}
            <div className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${isUser ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950' : 'border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'}`}>
                <div className="mb-1 text-[11px] font-bold opacity-70">
                    {isUser ? 'คุณ' : message.sender_name || 'IT Admin'} {formatTime(message.created_at)}
                </div>
                <div className="whitespace-pre-wrap">{message.message_text}</div>
                <MessageAttachments attachments={attachments} isUser={isUser} />
            </div>
            {isUser && (
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                    <Icon className="h-5 w-5" />
                </div>
            )}
        </div>
    );
};

const ContactITChat = ({ compact = false }) => {
    const [sessionId, setSessionId] = useState(getStoredSessionId);
    const [requesterName, setRequesterName] = useState(() => localStorage.getItem(NAME_STORAGE_KEY) || '');
    const [documentNo, setDocumentNo] = useState(() => localStorage.getItem(DOCUMENT_STORAGE_KEY) || '');
    const [category, setCategory] = useState(() => localStorage.getItem(CATEGORY_STORAGE_KEY) || ISSUE_CATEGORIES[0] || 'ทั่วไป');
    const [assigneeKey, setAssigneeKey] = useState(() => localStorage.getItem(ASSIGNEE_STORAGE_KEY) || IT_CHAT_ASSIGNEES[0].key);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const chatEndRef = useRef(null);
    const fileInputRef = useRef(null);

    const scrollToLatest = () => {
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
    };

    const loadMessages = async ({ quiet = false } = {}) => {
        if (!quiet) setIsLoading(true);
        const { data, error } = await mysql
            .from('it_chat_messages')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Load IT chat messages failed:', error);
            if (!quiet) Swal.fire('โหลดแชทไม่สำเร็จ', 'กรุณาตรวจสอบว่ารัน migration it_chat แล้ว', 'error');
        } else {
            setMessages(Array.isArray(data) ? data : []);
            scrollToLatest();
        }
        if (!quiet) setIsLoading(false);
    };

    useEffect(() => {
        loadMessages();
        const timer = setInterval(() => loadMessages({ quiet: true }), 5000);
        return () => clearInterval(timer);
    }, [sessionId]);

    useEffect(() => {
        localStorage.setItem(NAME_STORAGE_KEY, requesterName);
    }, [requesterName]);

    useEffect(() => {
        localStorage.setItem(DOCUMENT_STORAGE_KEY, documentNo);
    }, [documentNo]);

    useEffect(() => {
        localStorage.setItem(CATEGORY_STORAGE_KEY, category);
    }, [category]);

    useEffect(() => {
        localStorage.setItem(ASSIGNEE_STORAGE_KEY, assigneeKey);
    }, [assigneeKey]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        const text = input.trim();
        const filesToSend = selectedFiles;
        if ((!text && filesToSend.length === 0) || isSending) return;

        if (!requesterName.trim()) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณาระบุชื่อผู้ติดต่อก่อนส่งข้อความ', 'warning');
            return;
        }

        if (!documentNo.trim()) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณาระบุเลขที่เอกสารแจ้งซ่อมหรือร้องขอก่อนส่งข้อความ', 'warning');
            return;
        }

        const assignee = getItChatAssigneeByKey(assigneeKey);
        setIsSending(true);
        let optimisticMessage = null;

        try {
            const attachments = filesToSend.length
                ? await uploadAttachmentFiles(filesToSend, {
                    source: 'it_chat',
                    uploadedByType: 'user',
                    uploadedByName: requesterName.trim(),
                })
                : [];
            const attachmentsJson = attachments.length ? JSON.stringify(attachments) : null;
            const outgoingText = text || 'ส่งไฟล์แนบ';

            optimisticMessage = {
                id: `local-${Date.now()}`,
                session_id: sessionId,
                sender_type: 'user',
                sender_name: requesterName.trim(),
                requester_name: requesterName.trim(),
                document_no: documentNo.trim(),
                category,
                assignee_key: assignee.key,
                assignee_name: assignee.nickname,
                assignee_role: assignee.roleLabel,
                message_text: outgoingText,
                attachments_json: attachmentsJson,
                status: 'Open',
                created_at: new Date().toISOString(),
            };
            setMessages((current) => [...current, optimisticMessage]);
            setInput('');
            setSelectedFiles([]);
            scrollToLatest();

            const { error } = await mysql.from('it_chat_messages').insert([{
                session_id: sessionId,
                sender_type: 'user',
                sender_name: requesterName.trim(),
                requester_name: requesterName.trim(),
                document_no: documentNo.trim(),
                category,
                assignee_key: assignee.key,
                assignee_name: assignee.nickname,
                assignee_role: assignee.roleLabel,
                message_text: outgoingText,
                attachments_json: attachmentsJson,
                status: 'Open',
            }]);

            if (error) throw error;
            await loadMessages({ quiet: true });
        } catch (error) {
            console.error('Send IT chat failed:', error);
            if (optimisticMessage) {
                setMessages((current) => current.filter((message) => message.id !== optimisticMessage.id));
                setInput(text);
                setSelectedFiles(filesToSend);
            }
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

    const startNewChat = () => {
        const nextSessionId = createSessionId();
        localStorage.setItem(SESSION_STORAGE_KEY, nextSessionId);
        setSessionId(nextSessionId);
        setMessages([]);
        setInput('');
        setDocumentNo('');
        setSelectedFiles([]);
    };

    if (compact) {
        return (
            <div className="flex h-full min-h-0 flex-col bg-slate-50 dark:bg-slate-900">
                <div className="border-b border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                    <div className="grid grid-cols-1 gap-2">
                        <input
                            value={requesterName}
                            onChange={(event) => setRequesterName(event.target.value)}
                            className="input-modern h-10 w-full text-sm"
                            placeholder="ชื่อผู้ติดต่อ / แผนก"
                        />
                        <input
                            value={documentNo}
                            onChange={(event) => setDocumentNo(event.target.value)}
                            className="input-modern h-10 w-full text-sm"
                            placeholder="เลขที่เอกสาร เช่น IT-2607-193"
                            required
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <select
                                value={category}
                                onChange={(event) => setCategory(event.target.value)}
                                className="input-modern h-10 w-full text-sm"
                            >
                                {ISSUE_CATEGORIES.map((item) => (
                                    <option key={item} value={item}>{item}</option>
                                ))}
                            </select>
                            <select
                                value={assigneeKey}
                                onChange={(event) => setAssigneeKey(event.target.value)}
                                className="input-modern h-10 w-full text-sm"
                            >
                                {IT_CHAT_ASSIGNEES.map((assignee) => (
                                    <option key={assignee.key} value={assignee.key}>
                                        {assignee.nickname}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                    {messages.length === 0 ? (
                        <div className="flex h-full min-h-44 items-center justify-center text-center">
                            <div className="max-w-xs rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                                <Bot className="mx-auto mb-2 h-7 w-7 text-emerald-500" />
                                พิมพ์ข้อความหรือแนบไฟล์เพื่อคุยกับ IT
                            </div>
                        </div>
                    ) : (
                        messages.map((message) => (
                            <ChatBubble key={message.id} message={message} />
                        ))
                    )}
                    <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                    {selectedFiles.length > 0 && (
                        <div className="mb-2 flex max-h-20 flex-wrap gap-2 overflow-y-auto">
                            {selectedFiles.map((file, index) => (
                                <span
                                    key={`${file.name}-${index}`}
                                    className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                >
                                    <FileText className="h-3.5 w-3.5 shrink-0" />
                                    <span className="max-w-32 truncate">{file.name}</span>
                                    <button
                                        type="button"
                                        onClick={() => removeSelectedFile(index)}
                                        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white"
                                        title="ลบไฟล์"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                    <div className="flex gap-2">
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
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                            title={`แนบไฟล์ สูงสุด ${MAX_ATTACHMENT_FILES} ไฟล์ ไฟล์ละไม่เกิน 5 MB`}
                        >
                            <Paperclip className="h-4 w-4" />
                        </button>
                        <input
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            className="input-modern h-10 min-w-0 flex-1 text-sm"
                            placeholder="พิมพ์ข้อความ..."
                            disabled={isSending}
                        />
                        <button
                            type="submit"
                            disabled={(!input.trim() && selectedFiles.length === 0) || isSending}
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                            title="ส่งข้อความ"
                        >
                            <Send className="h-4 w-4" />
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    return (
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-5 animate-fade-in xl:grid-cols-[340px_minmax(0,1fr)]">
            <aside className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <div className="mb-4 flex items-center gap-2">
                        <MessageCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
                        <h1 className="font-extrabold text-slate-900 dark:text-white">ติดต่อไอที</h1>
                    </div>
                    <div className="space-y-3">
                        <label className="block">
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">ชื่อผู้ติดต่อ / แผนก</span>
                            <input
                                value={requesterName}
                                onChange={(event) => setRequesterName(event.target.value)}
                                className="input-modern mt-1 w-full"
                                placeholder="เช่น สมชาย แผนกบัญชี"
                            />
                        </label>
                        <label className="block">
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">เลขที่เอกสารแจ้งซ่อม / ร้องขอ <span className="text-rose-500">*</span></span>
                            <input
                                value={documentNo}
                                onChange={(event) => setDocumentNo(event.target.value)}
                                className="input-modern mt-1 w-full"
                                placeholder="เช่น IT-2607-193 หรือ ITU 2606-130"
                                required
                            />
                        </label>
                        <label className="block">
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">หมวดหมู่</span>
                            <select
                                value={category}
                                onChange={(event) => setCategory(event.target.value)}
                                className="input-modern mt-1 w-full"
                            >
                                {ISSUE_CATEGORIES.map((item) => (
                                    <option key={item} value={item}>{item}</option>
                                ))}
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">ต้องการติดต่อ</span>
                            <select
                                value={assigneeKey}
                                onChange={(event) => setAssigneeKey(event.target.value)}
                                className="input-modern mt-1 w-full"
                            >
                                {IT_CHAT_ASSIGNEES.map((assignee) => (
                                    <option key={assignee.key} value={assignee.key}>
                                        {assignee.nickname} - {assignee.roleLabel}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <button
                        type="button"
                        onClick={startNewChat}
                        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                        <RotateCcw className="h-4 w-4" />
                        เริ่มแชทใหม่
                    </button>
                </div>

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-100">
                    แชทนี้ส่งถึงแอดมิน IT โดยตรง เมื่อแอดมินตอบกลับ ข้อความจะแสดงในหน้านี้อัตโนมัติภายในไม่กี่วินาที
                </div>
            </aside>

            <section className="flex min-h-[calc(100dvh-9rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm dark:border-slate-700 dark:bg-slate-900/40">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                    <div>
                        <h2 className="font-extrabold text-slate-900 dark:text-white">แชทกับแอดมิน IT</h2>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {messages.length ? `เอกสาร ${documentNo || messages[0]?.document_no || '-'} · รหัสแชท ${sessionId.slice(0, 8)} · ถึง ${getItChatAssigneeByKey(assigneeKey).nickname}` : 'เริ่มพิมพ์ข้อความเพื่อเปิดห้องแชท'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => loadMessages()}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                        title="รีเฟรช"
                    >
                        <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto p-4">
                    {messages.length === 0 ? (
                        <div className="flex h-full min-h-80 items-center justify-center text-center">
                            <div className="max-w-md rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                                <Bot className="mx-auto mb-3 h-8 w-8 text-emerald-500" />
                                พิมพ์ปัญหาที่ต้องการติดต่อ IT ได้เลย เช่น เข้าโปรแกรมไม่ได้, ปริ้นไม่ออก, อินเทอร์เน็ตช้า หรือขอยืมอุปกรณ์
                            </div>
                        </div>
                    ) : (
                        messages.map((message) => (
                            <ChatBubble key={message.id} message={message} />
                        ))
                    )}
                    <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
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
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            className="input-modern flex-1"
                            placeholder="พิมพ์ข้อความถึงแอดมิน IT"
                            disabled={isSending}
                        />
                        <button
                            type="submit"
                            disabled={(!input.trim() && selectedFiles.length === 0) || isSending}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                            title="ส่งข้อความ"
                        >
                            <Send className="h-4 w-4" />
                        </button>
                    </div>
                </form>
            </section>
        </div>
    );
};

export default ContactITChat;
