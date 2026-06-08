import React, { useRef, useState } from 'react';
import { Bot, Image as ImageIcon, Loader2, Search, Send, Sparkles, UserRound, X } from 'lucide-react';
import { API_URL } from '../mysqlClient';

const GREETING_MESSAGE = 'สวัสดีครับ ผมคือ AI Helpdesk ผู้ช่วยแก้ไขปัญหาด้าน IT ของบริษัท ลองพิมพ์อาการหรือปัญหาที่เจอ หรือส่งรูปปัญหามาได้เลยครับ';

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
    if (!file) {
        resolve('');
        return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Cannot read image'));
    reader.readAsDataURL(file);
});

const ChatBubble = ({ message }) => {
    const isUser = message.role === 'user';
    const Icon = isUser ? UserRound : Bot;

    return (
        <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
            {!isUser && (
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300">
                    <Icon className="h-5 w-5" />
                </div>
            )}
            <div className={`max-w-[88%] rounded-3xl px-4 py-3 shadow-sm ${isUser ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'}`}>
                {message.imageName && (
                    <div className={`mb-2 inline-flex items-center gap-2 rounded-2xl px-3 py-1.5 text-xs font-semibold ${isUser ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200'}`}>
                        <ImageIcon className="h-4 w-4" />
                        {message.imageName}
                    </div>
                )}
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</div>
            </div>
            {isUser && (
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                    <Icon className="h-5 w-5" />
                </div>
            )}
        </div>
    );
};

const AIHelpdesk = () => {
    const [isAsking, setIsAsking] = useState(false);
    const [input, setInput] = useState('');
    const [selectedImage, setSelectedImage] = useState(null);
    const [messages, setMessages] = useState([
        {
            role: 'assistant',
            text: GREETING_MESSAGE
        }
    ]);
    const chatEndRef = useRef(null);

    const scrollToLatestMessage = () => {
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        const question = input.trim();
        if ((!question && !selectedImage) || isAsking) return;

        const query = question || `ผู้ใช้แนบรูปปัญหา ${selectedImage?.name || ''}`;
        const imageName = selectedImage?.name || '';
        const userText = question || 'ส่งรูปปัญหาให้ตรวจสอบ';
        const imageFile = selectedImage;

        setMessages((current) => [
            ...current,
            { role: 'user', text: userText, imageName }
        ]);
        setInput('');
        setSelectedImage(null);
        setIsAsking(true);
        scrollToLatestMessage();

        try {
            const imageDataUrl = imageFile ? await fileToDataUrl(imageFile) : '';
            const response = await fetch(`${API_URL}/api/ai-helpdesk/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: query, imageDataUrl })
            });
            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(payload?.error || response.statusText || 'AI Helpdesk error');
            }

            const result = payload?.data || {};
            setMessages((current) => [
                ...current,
                {
                    role: 'assistant',
                    text: result.answer || 'ไม่พบแนวทางแก้ไขที่ใกล้เคียงในฐานข้อมูลแจ้งซ่อม กรุณาติดต่อแผนกเทคโนโลยีสารสนเทศ',
                    source: result.source,
                    externalAiUsed: result.externalAiUsed
                }
            ]);
        } catch (error) {
            console.error('AI Helpdesk chat failed:', error);
            setMessages((current) => [
                ...current,
                {
                    role: 'assistant',
                    text: 'ขออภัยครับ ระบบ AI Helpdesk ยังไม่สามารถวิเคราะห์ได้ในตอนนี้ กรุณาติดต่อแผนกเทคโนโลยีสารสนเทศ'
                }
            ]);
        } finally {
            setIsAsking(false);
            scrollToLatestMessage();
        }
    };

    return (
        <div className="mx-auto max-w-7xl space-y-6 animate-fade-in">
            <div className="overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-600 via-violet-600 to-sky-600 p-6 text-white shadow-xl shadow-indigo-200/40 dark:border-indigo-900 dark:shadow-indigo-950/40">
                <div className="flex items-start gap-4">
                    <div className="rounded-2xl bg-white/15 p-3 backdrop-blur">
                        <Sparkles className="h-8 w-8" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">AI Helpdesk</h1>
                        <p className="mt-2 max-w-4xl text-sm font-medium text-indigo-50">
                            Chat AI ผู้ช่วยในการแก้ไขปัญหาด้าน IT ของบริษัท วาวาแพค จำกัด
                        </p>
                    </div>
                </div>
            </div>

            <div>
                <div className="flex min-h-[calc(100dvh-18rem)] flex-col rounded-3xl border border-slate-200 bg-slate-50/80 shadow-sm dark:border-slate-700 dark:bg-slate-900/40">
                    <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300">
                                <Bot className="h-5 w-5" />
                            </div>
                            <div>
                                <h2 className="font-bold text-slate-800 dark:text-white">Chat AI</h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {isAsking ? 'กำลังวิเคราะห์จากฐานข้อมูลแจ้งซ่อม...' : 'พร้อมช่วยวิเคราะห์แนวทางแก้ไข'}
                                </p>
                            </div>
                        </div>
                        {isAsking && <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />}
                    </div>

                    <div className="flex-1 space-y-4 overflow-y-auto p-4">
                        {messages.map((message, index) => (
                            <ChatBubble key={`${message.role}-${index}`} message={message} />
                        ))}
                        <div ref={chatEndRef} />
                    </div>

                    <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/80">
                        {selectedImage && (
                            <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-200">
                                <div className="flex min-w-0 items-center gap-2">
                                    <ImageIcon className="h-4 w-4 shrink-0" />
                                    <span className="truncate font-semibold">{selectedImage.name}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedImage(null)}
                                    className="rounded-full p-1 transition hover:bg-indigo-100 dark:hover:bg-indigo-900/60"
                                    aria-label="ลบรูปที่แนบ"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500 dark:hover:text-indigo-300">
                                <ImageIcon className="h-4 w-4" />
                                รูป
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    disabled={isAsking}
                                    onChange={(event) => setSelectedImage(event.target.files?.[0] || null)}
                                />
                            </label>
                            <div className="relative flex-1">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    value={input}
                                    onChange={(event) => setInput(event.target.value)}
                                    className="input-modern w-full !pl-9"
                                    placeholder="พิมพ์อาการ หรือแนบรูปปัญหา เช่น เปิดเครื่องไม่ติด, ปริ้นไม่ได้, เข้าโปรแกรมไม่ได้..."
                                    disabled={isAsking}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isAsking || (!input.trim() && !selectedImage)}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white shadow-md shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 dark:shadow-indigo-950/40"
                            >
                                <Send className="h-4 w-4" />
                                ส่ง
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default AIHelpdesk;
