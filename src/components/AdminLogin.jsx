import React, { useState } from 'react';
import { Lock, User } from 'lucide-react';
import { loginAdmin } from '../mysqlClient';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@/components/ui';

const AdminLogin = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        try {
            const { data, error: fetchError } = await loginAdmin(username, password);

            if (fetchError || !data) {
                setError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
                return;
            }

            if (data.id) {
                onLogin(data);
            } else {
                setError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
            }
        } catch (err) {
            console.error('Login error: ', err);
            setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
        }
    };

    return (
        <Card className="max-w-md mx-auto mt-16 rounded-3xl">
            <CardHeader className="text-center items-center pb-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-100/80 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 mb-4 shadow-inner border border-white/50 dark:border-indigo-800/50">
                    <Lock className="w-8 h-8" />
                </div>
                <CardTitle className="text-2xl sm:text-3xl text-indigo-950 dark:text-indigo-100">
                    เข้าสู่ระบบสำหรับเจ้าหน้าที่
                </CardTitle>
                <CardDescription className="font-medium">
                    กรุณาเข้าสู่ระบบเพื่อจัดการรายการแจ้งซ่อม
                </CardDescription>
            </CardHeader>

            <CardContent>
                {error && (
                    <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 rounded-xl text-sm text-center shadow-sm animate-fade-in">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="username" className="ml-1">ชื่อผู้ใช้ (Username)</Label>
                        <div className="relative">
                            <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500" />
                            <Input
                                type="text"
                                id="username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="!pl-11"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="password" className="ml-1">รหัสผ่าน (Password)</Label>
                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500" />
                            <Input
                                type="password"
                                id="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="!pl-11"
                                required
                            />
                        </div>
                    </div>

                    <Button type="submit" className="w-full mt-8">
                        เข้าสู่ระบบ
                    </Button>
                </form>

                <div className="mt-8 text-center text-xs text-slate-500 dark:text-slate-400 font-medium">
                    <p>
                        สำหรับสาธิต: ใช้ Username:{' '}
                        <span className="font-bold text-slate-700 dark:text-slate-300">admin1, admin2, หรือ admin3</span>
                        {' '} / Password:{' '}
                        <span className="font-bold text-slate-700 dark:text-slate-300">admin123</span>
                    </p>
                </div>
            </CardContent>
        </Card>
    );
};

export default AdminLogin;
