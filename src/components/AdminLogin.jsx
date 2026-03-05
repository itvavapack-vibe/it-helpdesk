import React, { useState } from 'react';
import { Lock, User } from 'lucide-react';
import { supabase } from '../supabaseClient';

const AdminLogin = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        try {
            const { data, error: fetchError } = await supabase
                .from('admins')
                .select('*')
                .eq('username', username)
                .single();

            if (fetchError || !data) {
                setError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
                return;
            }

            // In a real app we would use hashed passwords, for now direct comparison
            if (data.password === password) {
                // Remove password from object before saving to state/localStorage
                const { password: _, ...adminData } = data;
                onLogin(adminData);
            } else {
                setError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
            }
        } catch (err) {
            console.error("Login error: ", err);
            setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
        }
    };

    return (
        <div className="max-w-md mx-auto mt-16 glass-card p-8 sm:p-10 rounded-3xl relative">
            <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-100/80 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 mb-6 shadow-inner border border-white/50 dark:border-indigo-800/50">
                    <Lock className="w-8 h-8" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-indigo-950 dark:text-indigo-100 tracking-tight">เข้าสู่ระบบสำหรับเจ้าหน้าที่</h2>
                <p className="text-slate-500 dark:text-slate-400 mt-3 text-sm font-medium">กรุณาเข้าสู่ระบบเพื่อจัดการรายการแจ้งซ่อม</p>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 rounded-xl text-sm text-center shadow-sm animate-fade-in">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                    <label htmlFor="username" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">ชื่อผู้ใช้ (Username)</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <User className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                        </div>
                        <input
                            type="text"
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="!pl-11 w-full input-modern"
                            placeholder="admin"
                            required
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label htmlFor="password" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">รหัสผ่าน (Password)</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Lock className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                        </div>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="!pl-11 w-full input-modern"
                            placeholder="••••••••"
                            required
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold py-3 rounded-xl shadow-lg shadow-indigo-200/50 dark:shadow-indigo-900/40 transform hover:-translate-y-0.5 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 mt-8"
                >
                    เข้าสู่ระบบ
                </button>
            </form>

            <div className="mt-8 text-center text-xs text-slate-500 dark:text-slate-400 font-medium">
                <p>สำหรับสาธิต: ใช้ Username: <span className="font-bold text-slate-700 dark:text-slate-300">admin1, admin2, หรือ admin3</span> / Password: <span className="font-bold text-slate-700 dark:text-slate-300">admin123</span></p>
            </div>
        </div>
    );
};

export default AdminLogin;
