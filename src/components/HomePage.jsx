import React from 'react';
import { ClipboardList, ClipboardPenLine, Key } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { HOME_QUICK_ACTIONS, canSee } from '../config/navigation';

const FeatureCard = ({ icon: Icon, title, desc, color, onClick }) => (
    <button type="button" onClick={onClick} className="w-full text-left">
        <Card className="p-6 rounded-2xl flex flex-col gap-3 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-md ${color}`}>
                <Icon className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg">{title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</p>
        </Card>
    </button>
);

const HomePage = ({ onNavigateTo, currentRole = 'public' }) => {
    const visibleActions = HOME_QUICK_ACTIONS.filter(
        (item) => item.id === 'repair' && canSee(item.roles, currentRole)
    );

    const getButtonClassName = (id) => {
        if (id === 'admin') return 'rounded-2xl';

        const gradients = {
            repair: 'shadow-lg shadow-indigo-300/50 dark:shadow-indigo-900/50',
            access: 'from-sky-600 to-cyan-600 hover:from-sky-500 hover:to-cyan-500 shadow-lg shadow-sky-300/50 dark:shadow-sky-900/50',
            change: 'from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 shadow-lg shadow-emerald-300/50 dark:shadow-emerald-900/50',
        };

        return `rounded-2xl bg-gradient-to-r ${gradients[id] || gradients.repair}`;
    };

    return (
        <div className="space-y-12 animate-fade-in">
            <Card className="relative overflow-hidden rounded-3xl p-5 sm:p-8 xl:p-16">
                <div className="relative z-10 grid grid-cols-1 xl:grid-cols-12 gap-8 xl:gap-12 items-center">
                    <div className="xl:col-span-7 text-center xl:text-left space-y-6 flex flex-col items-center xl:items-start justify-center">
                        <h1 className="text-3xl xl:text-4xl font-extrabold tracking-tight text-slate-800 dark:text-white leading-tight fit-text">
                            ระบบแจ้งซ่อม<br />
                            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
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
                                        className={getButtonClassName(action.id)}
                                    >
                                        <Icon className="w-5 h-5" />
                                        {action.label}
                                    </Button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="xl:col-span-5 flex justify-center items-center">
                        <div className="relative group w-full max-w-[280px] sm:max-w-[340px] xl:max-w-full">
                            <div className="relative z-10 bg-white/40 dark:bg-slate-800/40 backdrop-blur-md p-3 sm:p-4 rounded-3xl border border-white/60 dark:border-slate-700/60 shadow-2xl transition-all duration-500 group-hover:shadow-indigo-500/10 dark:group-hover:shadow-indigo-500/5 group-hover:-translate-y-2 animate-float">
                                <img
                                    src="/it-helpdesk-hero.jpg"
                                    alt="VAVA PACK IT Helpdesk"
                                    className="w-full h-auto object-contain rounded-2xl max-h-[300px] sm:max-h-[350px] xl:max-h-[380px]"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </Card>

            <section>
                <div className="text-center mb-8">
                    <h2 className="text-2xl font-extrabold text-slate-800 dark:text-white mb-2">ติดตามสถานะงาน</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">เลือกประเภทงานที่ต้องการ เพื่อตรวจสอบสถานะและความคืบหน้าล่าสุด</p>
                </div>
                <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 md:grid-cols-3">
                    <FeatureCard
                        icon={ClipboardList}
                        title="ติดตามสถานะแจ้งซ่อม"
                        desc="ติดตามความคืบหน้าการซ่อมและรับอัปเดตเมื่อสถานะเปลี่ยน"
                        color="bg-gradient-to-br from-rose-500 to-pink-600"
                        onClick={() => onNavigateTo('tracking')}
                    />
                    <FeatureCard
                        icon={Key}
                        title="ติดตามสถานะขอสิทธิ์"
                        desc="ตรวจสอบสถานะการร้องขอสิทธิ์ใช้งานระบบ"
                        color="bg-gradient-to-br from-sky-500 to-cyan-600"
                        onClick={() => onNavigateTo('request_tracking_access')}
                    />
                    <FeatureCard
                        icon={ClipboardPenLine}
                        title="ติดตามสถานะขอพัฒนา"
                        desc="ตรวจสอบสถานะคำร้องขอพัฒนาระบบและสื่อ"
                        color="bg-gradient-to-br from-emerald-500 to-teal-600"
                        onClick={() => onNavigateTo('request_tracking_change')}
                    />
                </div>
            </section>
        </div>
    );
};

export default HomePage;
