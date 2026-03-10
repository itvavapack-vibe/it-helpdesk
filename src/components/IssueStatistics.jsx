import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { BarChart3, PieChart as PieChartIcon, TrendingUp, Users } from 'lucide-react';

const IssueStatistics = ({ issues = [] }) => {
    // 1. คำนวณข้อมูลสำหรับ Pie Chart (สัดส่วนสถานะ)
    const statusData = useMemo(() => {
        const counts = { 'Pending': 0, 'In Progress': 0, 'Resolved': 0 };
        issues.forEach(issue => {
            if (counts[issue.status] !== undefined) {
                counts[issue.status]++;
            }
        });
        return [
            { name: 'รอดำเนินการ', value: counts['Pending'], color: '#f59e0b' }, // Amber
            { name: 'กำลังแก้ไข', value: counts['In Progress'], color: '#6366f1' }, // Indigo
            { name: 'เสร็จสิ้น', value: counts['Resolved'], color: '#10b981' }, // Emerald
        ].filter(item => item.value > 0);
    }, [issues]);

    // 2. คำนวณข้อมูลสำหรับ Bar Chart (หมวดหมู่ปัญหา)
    const categoryData = useMemo(() => {
        const counts = {};
        issues.forEach(issue => {
            const cat = issue.category || 'อื่นๆ';
            counts[cat] = (counts[cat] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count); // เรียงจากมากไปน้อย
    }, [issues]);

    // 3. คำนวณข้อมูลสำหรับ Bar Chart (แผนกที่แจ้งซ่อม)
    const departmentData = useMemo(() => {
        const counts = {};
        issues.forEach(issue => {
            const dept = issue.department || 'ไม่ระบุแผนก';
            counts[dept] = (counts[dept] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5); // เอาแค่ Top 5
    }, [issues]);

    // Custom Tooltip สำหรับ Pie Chart
    const CustomTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white dark:bg-slate-800 p-3 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700">
                    <p className="font-medium text-slate-800 dark:text-slate-200">{payload[0].name}</p>
                    <p className="text-sm font-bold mt-1" style={{ color: payload[0].payload.color }}>
                        {payload[0].value} รายการ
                    </p>
                </div>
            );
        }
        return null;
    };

    if (issues.length === 0) {
        return (
            <div className="glass-card rounded-3xl p-12 text-center flex flex-col items-center justify-center">
                <BarChart3 className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-4" />
                <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300">ยังไม่มีข้อมูลสถิติ</h3>
                <p className="text-slate-500 dark:text-slate-500 mt-2">ต้องมีรายการแจ้งซ่อมอย่างน้อย 1 รายการเพื่อแสดงกราฟ</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="glass-card p-6 rounded-3xl flex items-center justify-between shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)]">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/40">
                        <TrendingUp className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-violet-700 dark:from-indigo-400 dark:to-violet-400">สถิติภาพรวมแจ้งซ่อม</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">แสดงสถิติและแนวโน้มการแจ้งปัญหาทั้งหมด</p>
                    </div>
                </div>
                <div className="text-right hidden sm:block">
                    <div className="text-3xl font-black text-slate-800 dark:text-white">{issues.length}</div>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-1">Total Issues</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Pie Chart: สถานะการทำงาน */}
                <div className="glass-card p-6 rounded-3xl shadow-sm">
                    <div className="flex items-center gap-2 mb-6">
                        <PieChartIcon className="w-5 h-5 text-indigo-500" />
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">สัดส่วนสถานะงาน</h3>
                    </div>
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={statusData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {statusData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <RechartsTooltip content={<CustomTooltip />} />
                                <Legend verticalAlign="bottom" height={36} iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 2. Bar Chart: หมวดหมู่ปัญหา */}
                <div className="glass-card p-6 rounded-3xl shadow-sm">
                    <div className="flex items-center gap-2 mb-6">
                        <BarChart3 className="w-5 h-5 text-violet-500" />
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">ปัญหาที่พบบ่อย (หมวดหมู่)</h3>
                    </div>
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={categoryData} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#64748b', fontSize: 12 }}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#64748b', fontSize: 12 }}
                                    allowDecimals={false}
                                />
                                <RechartsTooltip
                                    cursor={{ fill: '#f1f5f9', opacity: 0.4 }}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Bar dataKey="count" name="จำนวน (ครั้ง)" fill="#8b5cf6" radius={[6, 6, 0, 0]} maxBarSize={50}>
                                    {categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={index === 0 ? '#6366f1' : '#a78bfa'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 3. Bar Chart: แผนก (Full Width) */}
                <div className="glass-card p-6 rounded-3xl shadow-sm lg:col-span-2">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <Users className="w-5 h-5 text-emerald-500" />
                            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Top 5 แผนกที่แจ้งซ่อมบ่อยที่สุด</h3>
                        </div>
                    </div>
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={departmentData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" opacity={0.5} />
                                <XAxis
                                    type="number"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#64748b', fontSize: 12 }}
                                    allowDecimals={false}
                                />
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#475569', fontSize: 13, fontWeight: 500 }}
                                />
                                <RechartsTooltip
                                    cursor={{ fill: '#f1f5f9', opacity: 0.4 }}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Bar dataKey="count" name="จำนวน (ครั้ง)" fill="#10b981" radius={[0, 6, 6, 0]} barSize={32}>
                                    {departmentData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#6ee7b7'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default IssueStatistics;
