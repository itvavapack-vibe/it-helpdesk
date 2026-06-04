import React, { useState } from 'react';
import { Lock, User } from 'lucide-react';
import { changeExpiredAdminPassword, loginAdmin } from '../mysqlClient';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@/components/ui';
import { PASSWORD_POLICY_TEXT, getPasswordPolicyErrors } from '../../shared/passwordPolicy';

const AdminLogin = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [changeToken, setChangeToken] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        try {
            setIsSubmitting(true);
            const { data, error: fetchError, code, changeToken: nextChangeToken, attemptsRemaining } = await loginAdmin(username, password);

            if (fetchError || !data) {
                if (code === 'PASSWORD_CHANGE_REQUIRED' && nextChangeToken) {
                    setChangeToken(nextChangeToken);
                    setError('ต้องตั้งรหัสผ่านใหม่ก่อนเข้าสู่ระบบ');
                    return;
                }
                if (code === 'ACCOUNT_LOCKED') {
                    setError('บัญชีถูกล็อก กรุณาติดต่อ Administrator เพื่อปลดล็อก');
                    return;
                }
                setError(attemptsRemaining != null
                    ? `ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง เหลือโอกาสอีก ${attemptsRemaining} ครั้ง`
                    : 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
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
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePasswordChange = async (event) => {
        event.preventDefault();
        setError('');

        const policyErrors = getPasswordPolicyErrors(newPassword);
        if (policyErrors.length > 0) {
            setError(`รหัสผ่านยังขาด: ${policyErrors.join(', ')}`);
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('ยืนยันรหัสผ่านใหม่ไม่ตรงกัน');
            return;
        }

        setIsSubmitting(true);
        const { data, error: changeError, code } = await changeExpiredAdminPassword(changeToken, newPassword);
        setIsSubmitting(false);

        if (changeError || !data) {
            if (code === 'INVALID_CHANGE_TOKEN') {
                setChangeToken('');
                setNewPassword('');
                setConfirmPassword('');
                setError('หมดเวลาตั้งรหัสผ่าน กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
                return;
            }
            setError('ไม่สามารถเปลี่ยนรหัสผ่านได้');
            return;
        }

        onLogin(data);
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
                    {changeToken ? 'ตั้งรหัสผ่านใหม่เพื่อเข้าสู่ระบบ' : 'กรุณาเข้าสู่ระบบเพื่อจัดการรายการแจ้งซ่อม'}
                </CardDescription>
            </CardHeader>

            <CardContent>
                {error && (
                    <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 rounded-xl text-sm text-center shadow-sm animate-fade-in">
                        {error}
                    </div>
                )}

                {!changeToken ? <form onSubmit={handleSubmit} className="space-y-6">
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

                    <Button type="submit" className="w-full mt-8" disabled={isSubmitting}>
                        {isSubmitting ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
                    </Button>
                </form> : <form onSubmit={handlePasswordChange} className="space-y-5">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-300">
                        รหัสผ่านต้องมี {PASSWORD_POLICY_TEXT}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="new-password" className="ml-1">รหัสผ่านใหม่</Label>
                        <Input
                            type="password"
                            id="new-password"
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirm-password" className="ml-1">ยืนยันรหัสผ่านใหม่</Label>
                        <Input
                            type="password"
                            id="confirm-password"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            required
                        />
                    </div>
                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                        {isSubmitting ? 'กำลังบันทึก...' : 'ตั้งรหัสผ่านใหม่และเข้าสู่ระบบ'}
                    </Button>
                    <button
                        type="button"
                        onClick={() => {
                            setChangeToken('');
                            setNewPassword('');
                            setConfirmPassword('');
                            setPassword('');
                            setError('');
                        }}
                        className="w-full text-sm font-semibold text-slate-500 hover:text-indigo-600"
                    >
                        กลับไปหน้าเข้าสู่ระบบ
                    </button>
                </form>}
            </CardContent>
        </Card>
    );
};

export default AdminLogin;
