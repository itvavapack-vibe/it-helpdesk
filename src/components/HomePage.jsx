import React from 'react';
import { ClipboardList, ClipboardPenLine, Key } from 'lucide-react';
import { Button } from '@/components/ui';
import { HOME_QUICK_ACTIONS, canSee } from '../config/navigation';

const TRACKING_TONES = {
    repair: {
        icon: 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/60 dark:bg-rose-950/35 dark:text-rose-300',
        border: 'hover:border-rose-300 dark:hover:border-rose-800',
    },
    access: {
        icon: 'border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-900/60 dark:bg-sky-950/35 dark:text-sky-300',
        border: 'hover:border-sky-300 dark:hover:border-sky-800',
    },
    change: {
        icon: 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-300',
        border: 'hover:border-emerald-300 dark:hover:border-emerald-800',
    },
};

const TrackingLink = ({ icon: Icon, title, desc, tone = 'repair', onClick }) => {
    const toneClass = TRACKING_TONES[tone] || TRACKING_TONES.repair;

    return (
        <button
            type="button"
            onClick={onClick}
            className={`group flex w-full items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800/80 ${toneClass.border}`}
        >
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${toneClass.icon}`}>
                <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{title}</h3>
                <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">{desc}</p>
            </div>
            <span className="mt-1 text-xs font-semibold text-indigo-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-indigo-300">
                ดูสถานะ
            </span>
        </button>
    );
};

const HomePage = ({ onNavigateTo, currentRole = 'public' }) => {
    const visibleActions = HOME_QUICK_ACTIONS.filter(
        (item) => item.id === 'repair' && canSee(item.roles, currentRole)
    );

    return (
        <div className="space-y-10 animate-fade-in">
            <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-8 xl:p-14">
                <div className="relative z-10 grid grid-cols-1 xl:grid-cols-12 gap-8 xl:gap-12 items-center">
                    <div className="xl:col-span-7 text-center xl:text-left space-y-6 flex flex-col items-center xl:items-start justify-center">
                        <h1 className="text-3xl xl:text-4xl font-extrabold tracking-tight text-slate-800 dark:text-white leading-tight fit-text">
                            ระบบแจ้งซ่อม<br />
                            <span className="text-indigo-700 dark:text-indigo-300">
                                IT Helpdesk
                            </span>
                        </h1>
                        <p className="text-base xl:text-lg text-slate-500 dark:text-slate-400 max-w-xl mx-auto xl:mx-0 leading-relaxed fit-text">
                            แจ้งปัญหาคอมพิวเตอร์และอุปกรณ์ IT ได้ง่าย ทีม IT พร้อมช่วยเหลือ ตรวจสอบ และอัปเดตสถานะงานให้ติดตามได้ในระบบเดียว
                        </p>
                        <div className="flex flex-col sm:flex-row flex-wrap justify-center xl:justify-start gap-3 pt-2 w-full sm:w-auto">
                            {visibleActions.map((action) => {
                                const Icon = action.icon;
                                const isAdminAction = action.id === 'admin';
                                return (
                                    <Button
                                        key={action.id}
                                        onClick={() => onNavigateTo(action.tab)}
                                        size="lg"
                                        variant={isAdminAction ? 'outline' : 'default'}
                                        className="rounded-2xl shadow-sm"
                                    >
                                        <Icon className="w-5 h-5" />
                                        {action.label}
                                    </Button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="xl:col-span-5 flex justify-center items-center">
                        <div className="relative w-full max-w-[280px] sm:max-w-[340px] xl:max-w-full">
                            <div className="relative z-10 rounded-3xl border border-slate-200 bg-slate-50 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/40 sm:p-4">
                                <img
                                    src="/it-helpdesk-hero.jpg"
                                    alt="VAVA PACK IT Helpdesk"
                                    className="w-full h-auto object-contain rounded-2xl max-h-[300px] sm:max-h-[350px] xl:max-h-[380px]"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
                <div className="mb-5">
                    <h2 className="text-2xl font-extrabold text-slate-800 dark:text-white mb-2">ติดตามสถานะงาน</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">เลือกประเภทงานที่ต้องการ เพื่อตรวจสอบสถานะและความคืบหน้าล่าสุด</p>
                </div>
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.15fr_0.95fr_0.95fr]">
                    <TrackingLink
                        icon={ClipboardList}
                        title="ติดตามสถานะแจ้งซ่อม"
                        desc="ติดตามความคืบหน้าการซ่อมและรับอัปเดตเมื่อสถานะเปลี่ยน"
                        tone="repair"
                        onClick={() => onNavigateTo('tracking')}
                    />
                    <TrackingLink
                        icon={Key}
                        title="ติดตามสถานะขอสิทธิ์"
                        desc="ตรวจสอบสถานะการร้องขอสิทธิ์ใช้งานระบบ"
                        tone="access"
                        onClick={() => onNavigateTo('request_tracking_access')}
                    />
                    <TrackingLink
                        icon={ClipboardPenLine}
                        title="ติดตามสถานะขอพัฒนา"
                        desc="ตรวจสอบสถานะคำร้องขอพัฒนาระบบและสื่อ"
                        tone="change"
                        onClick={() => onNavigateTo('request_tracking_change')}
                    />
                </div>
            </section>
        </div>
    );
};

export default HomePage;
