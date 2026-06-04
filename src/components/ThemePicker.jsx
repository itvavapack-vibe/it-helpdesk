import React, { useEffect, useState } from 'react';
import { Check, Palette, X } from 'lucide-react';

const THEME_STORAGE_KEY = 'it-helpdesk-color-theme';
const THEME_CHANGE_EVENT = 'it-helpdesk-theme-change';

const THEMES = [
    { id: 'indigo', label: 'ม่วงคราม', color: '#4f46e5' },
    { id: 'ocean', label: 'ฟ้า', color: '#0284c7' },
    { id: 'emerald', label: 'เขียว', color: '#059669' },
    { id: 'rose', label: 'ชมพู', color: '#e11d48' },
    { id: 'amber', label: 'ส้ม', color: '#d97706' }
];

const getStoredTheme = () => {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.some(theme => theme.id === storedTheme) ? storedTheme : 'indigo';
};

const ThemePicker = ({ variant = 'header', isCollapsed = false }) => {
    const [selectedTheme, setSelectedTheme] = useState(getStoredTheme);
    const [isOpen, setIsOpen] = useState(false);
    const [isObscuredByModal, setIsObscuredByModal] = useState(false);

    useEffect(() => {
        document.documentElement.dataset.appTheme = selectedTheme;
        localStorage.setItem(THEME_STORAGE_KEY, selectedTheme);
    }, [selectedTheme]);

    useEffect(() => {
        const handleThemeChange = (event) => setSelectedTheme(event.detail);
        window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
        return () => window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    }, []);

    useEffect(() => {
        const updateVisibility = () => {
            const shouldHide = Boolean(document.querySelector('.repair-modal-overlay'));
            setIsObscuredByModal(shouldHide);
            if (shouldHide) setIsOpen(false);
        };

        updateVisibility();
        const observer = new MutationObserver(updateVisibility);
        observer.observe(document.body, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, []);

    if (isObscuredByModal) return null;

    const isSidebar = variant === 'sidebar';

    return (
        <div className={`relative z-[70] ${isSidebar ? 'w-full' : 'shrink-0'}`}>
            {isOpen && (
                <div className={`absolute w-56 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95 ${isSidebar ? 'bottom-full left-0 mb-3' : 'right-0 top-full mt-3'}`}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">เลือกธีมระบบ</p>
                        <button type="button" onClick={() => setIsOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" aria-label="ปิดตัวเลือกธีม">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="grid gap-1">
                        {THEMES.map(theme => (
                            <button
                                key={theme.id}
                                type="button"
                                onClick={() => {
                                    setSelectedTheme(theme.id);
                                    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: theme.id }));
                                    setIsOpen(false);
                                }}
                                className={`flex items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-semibold transition-colors ${selectedTheme === theme.id ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/70'}`}
                            >
                                <span className="h-5 w-5 rounded-full ring-2 ring-white shadow" style={{ backgroundColor: theme.color }} />
                                <span className="flex-1">{theme.label}</span>
                                {selectedTheme === theme.id && <Check className="h-4 w-4 text-emerald-500" />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            <button
                type="button"
                onClick={() => setIsOpen(open => !open)}
                className={`flex items-center justify-center bg-[var(--theme-600)] text-white shadow-md shadow-slate-400/25 transition-transform hover:scale-[1.03] dark:shadow-slate-950/40 ${isSidebar ? `h-10 w-full rounded-xl ${isCollapsed ? 'px-0' : 'gap-2 px-3'}` : 'h-9 w-9 min-[360px]:h-10 min-[360px]:w-10 rounded-xl'}`}
                title="เลือกธีมระบบ"
                aria-label="เลือกธีมระบบ"
                aria-expanded={isOpen}
            >
                <Palette className="h-5 w-5" />
                {isSidebar && !isCollapsed && <span className="text-sm font-semibold">เลือกธีมระบบ</span>}
            </button>
        </div>
    );
};

export default ThemePicker;
