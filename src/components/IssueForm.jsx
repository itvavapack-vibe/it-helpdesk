import React, { useState } from 'react';
import { CheckCircle, Clock, Edit, CheckCircle2 } from 'lucide-react';
import Swal from 'sweetalert2';

const STATUS_ORDER = ['Pending', 'In Progress', 'Resolved'];

const getStatusBadge = (status) => {
    switch (status) {
        case 'Pending':
            return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200"><Clock className="w-3 h-3" /> รอดำเนินการ</span>;
        case 'In Progress':
            return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200"><Edit className="w-3 h-3" /> กำลังแก้ไข</span>;
        case 'Resolved':
            return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-3 h-3" /> เสร็จสิ้น</span>;
        default:
            return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">{status}</span>;
    }
};

const IssueForm = ({ addIssue, issues = [], isLoading = false }) => {
    const [formData, setFormData] = useState({
        name: '',
        department: '',
        category: 'Hardware',
        description: '',
        severity: 'Normal',
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.name || !formData.department || !formData.description) {
            Swal.fire({
                title: 'ข้อมูลไม่ครบถ้วน',
                text: 'กรุณากรอกข้อมูลที่มีเครื่องหมาย * ให้ครบถ้วน',
                icon: 'warning',
                confirmButtonColor: '#4f46e5',
            });
            return;
        }

        Swal.fire({
            title: 'ยืนยันการส่งข้อมูล?',
            text: "ตรวจสอบข้อมูลการแจ้งซ่อมของคุณให้ถูกต้องก่อนกดยืนยัน",
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#4f46e5',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'ยืนยันการส่ง',
            cancelButtonText: 'ยกเลิก',
            reverseButtons: true
        }).then((result) => {
            if (result.isConfirmed) {
                const newIssue = {
                    ...formData,
                    id: Date.now().toString(),
                    status: 'Pending',
                    createdAt: new Date().toISOString(),
                };

                addIssue(newIssue);
                setFormData({
                    name: '',
                    department: '',
                    category: 'Hardware',
                    description: '',
                    severity: 'Normal',
                });

                Swal.fire({
                    title: 'ส่งข้อมูลสำเร็จ!',
                    text: 'ได้รับข้อมูลแจ้งซ่อมของคุณเรียบร้อยแล้ว',
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false
                });
            }
        });
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    return (
        <div className="space-y-8">
            {/* Issue Report Form */}
            <div className="max-w-2xl mx-auto glass-card p-8 sm:p-10 rounded-3xl relative">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-indigo-950 dark:text-indigo-100 tracking-tight text-center">แจ้งปัญหาการใช้งาน<br /><span className="text-lg font-medium text-slate-500 dark:text-slate-400 mt-1 block">Report Support Issue</span></h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label htmlFor="name" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 ml-1">ชื่อ-นามสกุล <span className="text-rose-500 dark:text-rose-400">*</span></label>
                            <input
                                type="text"
                                id="name"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                className="w-full input-modern"
                                placeholder="นาย สมชาย ใจดี"
                            />
                        </div>
                        <div className="space-y-1">
                            <label htmlFor="department" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 ml-1">แผนก <span className="text-rose-500 dark:text-rose-400">*</span></label>
                            <input
                                type="text"
                                id="department"
                                name="department"
                                value={formData.department}
                                onChange={handleChange}
                                className="w-full input-modern"
                                placeholder="การตลาด"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1">
                            <label htmlFor="category" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 ml-1">หมวดหมู่ปัญหา</label>
                            <select
                                id="category"
                                name="category"
                                value={formData.category}
                                onChange={handleChange}
                                className="w-full input-modern cursor-pointer appearance-none"
                                style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: `right 0.5rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.5em 1.5em`, paddingRight: `2.5rem` }}
                            >
                                <option value="Hardware">ฮาร์ดแวร์ (Hardware)</option>
                                <option value="Software">ซอฟต์แวร์ (Software)</option>
                                <option value="Network">เครือข่าย (Network)</option>
                                <option value="Other">อื่นๆ (Other)</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label htmlFor="severity" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 ml-1">ระดับความรุนแรง</label>
                            <select
                                id="severity"
                                name="severity"
                                value={formData.severity}
                                onChange={handleChange}
                                className="w-full input-modern cursor-pointer appearance-none"
                                style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: `right 0.5rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.5em 1.5em`, paddingRight: `2.5rem` }}
                            >
                                <option value="Normal">ปกติ (Normal)</option>
                                <option value="Urgent">ด่วน (Urgent)</option>
                                <option value="Most Urgent">ด่วนที่สุด (Most Urgent)</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label htmlFor="description" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 ml-1">รายละเอียดปัญหา <span className="text-rose-500 dark:text-rose-400">*</span></label>
                        <textarea
                            id="description"
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            rows="4"
                            className="w-full input-modern resize-y"
                            placeholder="อธิบายปัญหาที่พบอย่างละเอียด..."
                        ></textarea>
                    </div>

                    <div className="pt-6 flex justify-center">
                        <button
                            type="submit"
                            className="w-full sm:w-auto bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold py-3 px-8 rounded-xl shadow-lg shadow-indigo-200/50 dark:shadow-indigo-900/30 transform hover:-translate-y-0.5 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 flex items-center justify-center gap-2"
                        >
                            <CheckCircle className="w-5 h-5" /> ส่งข้อมูลแจ้งซ่อม
                        </button>
                    </div>
                </form>
            </div>

            {/* Recent Issues List */}
            <div className="max-w-4xl mx-auto">
                <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-indigo-500" />
                    รายการแจ้งซ่อมล่าสุด
                </h3>

                {isLoading ? (
                    <div className="glass-card rounded-2xl p-10 flex justify-center items-center">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                            <p className="text-sm text-slate-500 dark:text-slate-400 animate-pulse">กำลังโหลดข้อมูล...</p>
                        </div>
                    </div>
                ) : issues.length === 0 ? (
                    <div className="glass-card rounded-2xl p-10 text-center text-slate-400 dark:text-slate-500">
                        ยังไม่มีรายการแจ้งซ่อม
                    </div>
                ) : (
                    <div className="space-y-3">
                        {issues.slice(0, 10).map((issue) => (
                            <div key={issue.id} className="glass-card rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 hover:shadow-lg transition-shadow">
                                {/* Left: ID + Date */}
                                <div className="shrink-0">
                                    <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/40 px-2.5 py-1 rounded-lg border border-indigo-100 dark:border-indigo-800 inline-block">
                                        {issue.id}
                                    </div>
                                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{formatDate(issue.createdAt)}</div>
                                </div>

                                {/* Middle: Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{issue.description}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        {issue.name} · {issue.department} · {issue.category}
                                    </p>
                                    {issue.assignedAdmin && (
                                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-semibold">
                                            👤 ผู้รับงาน: {issue.assignedAdmin}
                                        </p>
                                    )}
                                </div>

                                {/* Right: Status */}
                                <div className="shrink-0">
                                    {getStatusBadge(issue.status)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default IssueForm;
