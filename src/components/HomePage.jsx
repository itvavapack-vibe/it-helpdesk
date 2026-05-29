import React from 'react';
import {
    MonitorCheck,
    Wifi,
    HardDrive,
    LayoutDashboard,
    ClipboardList,
    ShieldCheck,
    ArrowRight,
} from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import { HOME_QUICK_ACTIONS, canSee } from '../config/navigation';

const FeatureCard = ({ icon: Icon, title, desc, color }) => (
    <Card className="p-6 rounded-2xl flex flex-col gap-3 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-default">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-md ${color}`}>
            <Icon className="w-6 h-6 text-white" />
        </div>
        <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg">{title}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</p>
    </Card>
);

const StepCard = ({ num, title, desc }) => (
    <div className="flex items-start gap-4">
        <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-extrabold text-base shadow-lg shadow-indigo-200 dark:shadow-indigo-900/40">
            {num}
        </div>
        <div className="pt-1">
            <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-1">{title}</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</p>
        </div>
    </div>
);

const HomePage = ({ onNavigateTo, currentRole = 'public' }) => {
    const visibleActions = HOME_QUICK_ACTIONS.filter(
        (item) => item.id === 'repair' && canSee(item.roles, currentRole)
    );

    const getButtonClassName = (id) => {
        if (id === 'admin') return 'rounded-2xl';

        const gradients = {
            repair: 'from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-lg shadow-indigo-300/50 dark:shadow-indigo-900/50',
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
                        <Badge variant="secondary" className="rounded-full px-4 py-1.5">IT Helpdesk</Badge>
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
                    <h2 className="text-2xl font-extrabold text-slate-800 dark:text-white mb-2">บริการของเรา</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">ครอบคลุมปัญหา IT ที่พบได้ในการทำงานประจำวัน</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                    <FeatureCard
                        icon={MonitorCheck}
                        title="ซ่อมคอมพิวเตอร์"
                        desc="แก้ไขปัญหา Hardware และ Software สำหรับพีซีและแล็ปท็อป"
                        color="bg-gradient-to-br from-indigo-500 to-indigo-600"
                    />
                    <FeatureCard
                        icon={Wifi}
                        title="ปัญหาเครือข่าย"
                        desc="แก้ไขปัญหาเน็ตเวิร์ก อินเทอร์เน็ต VPN และ Wi-Fi ภายในอาคาร"
                        color="bg-gradient-to-br from-sky-500 to-cyan-600"
                    />
                    <FeatureCard
                        icon={HardDrive}
                        title="อุปกรณ์ต่อพ่วง"
                        desc="ดูแลปริ้นเตอร์ สแกนเนอร์ กล้อง และอุปกรณ์สำนักงานที่เกี่ยวข้อง"
                        color="bg-gradient-to-br from-violet-500 to-purple-600"
                    />
                    <FeatureCard
                        icon={ShieldCheck}
                        title="ความปลอดภัย"
                        desc="ช่วยตรวจสอบไวรัส มัลแวร์ และตั้งค่าความปลอดภัยของข้อมูล"
                        color="bg-gradient-to-br from-emerald-500 to-teal-600"
                    />
                    <FeatureCard
                        icon={LayoutDashboard}
                        title="ซอฟต์แวร์และระบบ"
                        desc="ติดตั้ง อัปเดต และแก้ไขปัญหาโปรแกรมหรือระบบปฏิบัติการ"
                        color="bg-gradient-to-br from-amber-500 to-orange-600"
                    />
                    <FeatureCard
                        icon={ClipboardList}
                        title="ติดตามสถานะ"
                        desc="ติดตามความคืบหน้าการซ่อมและรับอัปเดตเมื่อสถานะเปลี่ยน"
                        color="bg-gradient-to-br from-rose-500 to-pink-600"
                    />
                </div>
            </section>

            <Card className="rounded-3xl p-8">
                <div className="text-center mb-8">
                    <h2 className="text-2xl font-extrabold text-slate-800 dark:text-white mb-2">วิธีแจ้งซ่อม</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">ทำงานง่าย ๆ เพียง 3 ขั้นตอน</p>
                </div>
                <div className="max-w-lg mx-auto space-y-8">
                    <StepCard
                        num="1"
                        title="กรอกฟอร์มแจ้งปัญหา"
                        desc="ระบุชื่อ แผนก หมวดหมู่ปัญหา และรายละเอียดอาการที่พบ"
                    />
                    <div className="w-px h-6 bg-gradient-to-b from-indigo-300 to-violet-300 ml-4.5 dark:from-indigo-700 dark:to-violet-700" />
                    <StepCard
                        num="2"
                        title="รอทีม IT รับงาน"
                        desc="ระบบจะส่งงานให้ทีม IT Support ตรวจสอบและรับงานซ่อมของคุณ"
                    />
                    <div className="w-px h-6 bg-gradient-to-b from-violet-300 to-emerald-300 ml-4.5 dark:from-violet-700 dark:to-emerald-700" />
                    <StepCard
                        num="3"
                        title="ติดตามและรับการแก้ไข"
                        desc="ทีม IT จะดำเนินการแก้ไข พร้อมอัปเดตสถานะจนงานเสร็จสิ้น"
                    />
                </div>
                <div className="text-center mt-10">
                    <Button
                        onClick={() => onNavigateTo('user')}
                        size="lg"
                        className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-lg shadow-indigo-200/60 dark:shadow-indigo-900/50"
                    >
                        <ClipboardList className="w-5 h-5" />
                        เริ่มต้นแจ้งซ่อมเลย
                        <ArrowRight className="w-4 h-4" />
                    </Button>
                </div>
            </Card>
        </div>
    );
};

export default HomePage;
