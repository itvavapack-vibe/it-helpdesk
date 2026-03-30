import React from 'react';
import {
    MonitorCheck,
    Wifi,
    HardDrive,
    LayoutDashboard,
    ClipboardList,
    ShieldCheck,
    ArrowRight,
    Clock,
    Zap,
    HeadphonesIcon,
    Code
} from 'lucide-react';

const FeatureCard = ({ icon: Icon, title, desc, color }) => (
    <div className="glass-card p-6 rounded-2xl flex flex-col gap-3 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-default group">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-md ${color}`}>
            <Icon className="w-6 h-6 text-white" />
        </div>
        <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg">{title}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</p>
    </div>
);

const StatBadge = ({ icon: Icon, value, label, color }) => (
    <div className="flex items-center gap-3 glass-card px-5 py-4 rounded-2xl">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
            <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
            <p className="text-xl font-extrabold text-slate-800 dark:text-white">{value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        </div>
    </div>
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

const HomePage = ({ onNavigateTo }) => {
    return (
        <div className="space-y-12 animate-fade-in">

            {/* Hero Section */}
            <section className="relative text-center py-12 px-4 overflow-hidden rounded-3xl glass-card">
                {/* Decorative blobs */}
                <div className="absolute -top-10 -left-10 w-64 h-64 bg-indigo-400/20 dark:bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-10 -right-10 w-64 h-64 bg-violet-400/20 dark:bg-violet-600/20 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10">
                    <span className="inline-block px-4 py-1.5 mb-5 text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/50 rounded-full border border-indigo-200 dark:border-indigo-800">
                        IT Support System
                    </span>
                    <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-800 dark:text-white mb-5 leading-tight">
                        ระบบแจ้งซ่อม<br />
                        <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                            IT Helpdesk
                        </span>
                    </h1>
                    <p className="text-lg text-slate-500 dark:text-slate-400 max-w-xl mx-auto mb-8 leading-relaxed">
                        แจ้งปัญหาคอมพิวเตอร์และอุปกรณ์ IT ของคุณได้อย่างง่ายดาย ทีมงานของเราพร้อมช่วยเหลือคุณทุกวัน
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center gap-3">
                        <button
                            onClick={() => onNavigateTo('user')}
                            className="flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold rounded-2xl shadow-lg shadow-indigo-300/50 dark:shadow-indigo-900/50 transform hover:-translate-y-0.5 transition-all duration-200"
                        >
                            <ClipboardList className="w-5 h-5" />
                            แจ้งซ่อมเดี๋ยวนี้
                        </button>
                        <button
                            onClick={() => onNavigateTo('change_request')}
                            className="flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold rounded-2xl shadow-lg shadow-emerald-300/50 dark:shadow-emerald-900/50 transform hover:-translate-y-0.5 transition-all duration-200"
                        >
                            <Code className="w-5 h-5" />
                            ใบขอพัฒนาโปรแกรม
                        </button>
                        <button
                            onClick={() => onNavigateTo('admin')}
                            className="flex items-center justify-center gap-2 px-6 py-3.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold rounded-2xl shadow-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transform hover:-translate-y-0.5 transition-all duration-200"
                        >
                            <LayoutDashboard className="w-5 h-5 text-indigo-500" />
                            Admin
                        </button>
                    </div>
                </div>
            </section>

            {/* Features */}
            <section>
                <div className="text-center mb-8">
                    <h2 className="text-2xl font-extrabold text-slate-800 dark:text-white mb-2">บริการของเรา</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">ครอบคลุมทุกปัญหา IT ที่คุณพบเจอ</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    <FeatureCard
                        icon={MonitorCheck}
                        title="ซ่อมคอมพิวเตอร์"
                        desc="แก้ไขปัญหา Hardware และ Software พีซีและแล็ปท็อปทุกยี่ห้อ"
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
                        desc="ปริ้นเตอร์ สแกนเนอร์ กล้อง และอุปกรณ์สำนักงานทุกชนิด"
                        color="bg-gradient-to-br from-violet-500 to-purple-600"
                    />
                    <FeatureCard
                        icon={ShieldCheck}
                        title="ความปลอดภัย"
                        desc="ป้องกันไวรัส มัลแวร์ และตั้งค่าความปลอดภัยของข้อมูลองค์กร"
                        color="bg-gradient-to-br from-emerald-500 to-teal-600"
                    />
                    <FeatureCard
                        icon={LayoutDashboard}
                        title="ซอฟต์แวร์ & ระบบ"
                        desc="ติดตั้ง อัปเดต และแก้ไขปัญหาโปรแกรมและระบบปฏิบัติการ"
                        color="bg-gradient-to-br from-amber-500 to-orange-600"
                    />
                    <FeatureCard
                        icon={ClipboardList}
                        title="ติดตามสถานะ"
                        desc="ตรวจสอบความคืบหน้าการซ่อม พร้อมรับการอัปเดตแบบ Real-time"
                        color="bg-gradient-to-br from-rose-500 to-pink-600"
                    />
                </div>
            </section>

            {/* How it works */}
            <section className="glass-card rounded-3xl p-8">
                <div className="text-center mb-8">
                    <h2 className="text-2xl font-extrabold text-slate-800 dark:text-white mb-2">วิธีแจ้งซ่อม</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">ง่ายๆ แค่ 3 ขั้นตอน</p>
                </div>
                <div className="max-w-lg mx-auto space-y-8">
                    <StepCard
                        num="1"
                        title="กรอกฟอร์มแจ้งปัญหา"
                        desc="ระบุชื่อ แผนก หมวดหมู่ปัญหา และอธิบายอาการที่พบโดยละเอียด"
                    />
                    <div className="w-px h-6 bg-gradient-to-b from-indigo-300 to-violet-300 ml-4.5 dark:from-indigo-700 dark:to-violet-700" />
                    <StepCard
                        num="2"
                        title="รอทีม IT รับงาน"
                        desc="ระบบจะแจ้งไปยังทีม IT Support เพื่อตรวจสอบและรับงานซ่อมของคุณ"
                    />
                    <div className="w-px h-6 bg-gradient-to-b from-violet-300 to-emerald-300 ml-4.5 dark:from-violet-700 dark:to-emerald-700" />
                    <StepCard
                        num="3"
                        title="ติดตามและรับการแก้ไข"
                        desc="ทีม IT จะดำเนินการแก้ไขพร้อมอัปเดตสถานะ และออกรายงานเมื่อเสร็จสิ้น"
                    />
                </div>
                <div className="text-center mt-10">
                    <button
                        onClick={() => onNavigateTo('user')}
                        className="inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200/60 dark:shadow-indigo-900/50 transform hover:-translate-y-0.5 transition-all"
                    >
                        <ClipboardList className="w-5 h-5" />
                        เริ่มต้นแจ้งซ่อมเลย
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </section>

        </div>
    );
};

export default HomePage;
