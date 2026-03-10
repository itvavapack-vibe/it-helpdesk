import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import IssueForm from './components/IssueForm';
import IssueDashboard from './components/IssueDashboard';
import AdminLogin from './components/AdminLogin';
import UserManagement from './components/UserManagement';
import HomePage from './components/HomePage';
import AssetInventory from './components/AssetInventory';
import { Home, Settings, LogOut, Users, Ticket, ClipboardList, Monitor } from 'lucide-react';
import Swal from 'sweetalert2';
import { notifyNewIssue, notifyStatusChange, notifyRepairUpdate } from './telegramNotify';

function App() {
    const [activeTab, setActiveTab] = useState('home');
    const [adminSubTab, setAdminSubTab] = useState('issues'); // 'issues' or 'users'
    const [issues, setIssues] = useState([]);
    const [isIssuesLoading, setIsIssuesLoading] = useState(true);
    const [isAdminAuth, setIsAdminAuth] = useState(null);

    // Check auth state from localStorage initially
    useEffect(() => {
        const authStat = localStorage.getItem('it-helpdesk-admin-auth');
        if (authStat) {
            try {
                const parsedAuth = JSON.parse(authStat);
                // Handle legacy boolean auth
                if (parsedAuth === true) {
                    setIsAdminAuth({ id: 0, username: 'admin', name: 'System Admin' });
                } else {
                    setIsAdminAuth(parsedAuth); // Now expects object or null
                }
            } catch {
                setIsAdminAuth(null);
            }
        }
    }, []);

    // Fetch issues from Supabase
    useEffect(() => {
        fetchIssues();
    }, []);

    // Supabase Realtime: อัพเดตข้อมูลอัตโนมัติเมื่อมีการเปลี่ยนแปลง
    useEffect(() => {
        const channel = supabase
            .channel('issues-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'issues' }, () => {
                fetchIssues();
            })
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, []);

    // Time-based Dark Mode Logic (18:00 - 05:59 is Dark)
    useEffect(() => {
        const checkDarkMode = () => {
            const hour = new Date().getHours();
            const isDarkMode = hour >= 18 || hour < 6;

            if (isDarkMode) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        };

        checkDarkMode(); // Run immediately
        const intervalId = setInterval(checkDarkMode, 60 * 1000); // Check every minute

        return () => clearInterval(intervalId); // Cleanup on unmount
    }, []);

    const fetchIssues = async () => {
        setIsIssuesLoading(true);

        // Add a slight artificial delay (min 500ms) for better UX with the spinner
        const startTime = Date.now();

        const { data, error } = await supabase
            .from('issues')
            .select('*')
            .order('created_at', { ascending: false });

        const elapsedTime = Date.now() - startTime;
        if (elapsedTime < 500) {
            await new Promise(resolve => setTimeout(resolve, 500 - elapsedTime));
        }

        if (error) {
            console.error("Error fetching issues from Supabase:", error);
            Swal.fire('Error', 'ไม่สามารถโหลดข้อมูลแจ้งซ่อมได้', 'error');
        } else {
            // Map snake_case from DB to camelCase for frontend
            const formattedIssues = data.map(issue => ({
                id: issue.id,
                name: issue.name,
                department: issue.department,
                category: issue.category,
                severity: issue.severity,
                description: issue.description,
                status: issue.status,
                repairDetails: issue.repair_details,
                assignedAdmin: issue.assigned_admin || null,
                createdAt: issue.created_at
            }));
            setIssues(formattedIssues);
        }
        setIsIssuesLoading(false);
    };

    const generateDocId = () => {
        const today = new Date();
        const yy = today.getFullYear().toString().slice(-2);
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const datePrefix = `IT-${yy}${mm}${dd}-`;

        // Find issues from today to calculate sequence
        const todaysIssues = issues.filter(issue => issue.id && issue.id.startsWith(datePrefix));

        // Extract existing sequence numbers for today to find the max
        const sequences = todaysIssues.map(issue => {
            const parts = issue.id.split('-');
            return parts.length === 3 ? parseInt(parts[2], 10) : 0;
        });

        const maxSeq = sequences.length > 0 ? Math.max(...sequences) : 0;
        const nextSeq = maxSeq + 1;

        // Requested format: 3 digits e.g. 001
        const seqStr = String(nextSeq).padStart(3, '0');

        return `${datePrefix}${seqStr}`;
    };

    const addIssue = async (newIssue) => {
        const issueId = generateDocId();
        const issueWithId = {
            ...newIssue,
            id: issueId,
            repairDetails: '',
            assignedAdmin: null
        };

        // Insert into Supabase
        const { error } = await supabase
            .from('issues')
            .insert([
                {
                    id: issueId,
                    name: newIssue.name,
                    department: newIssue.department,
                    category: newIssue.category,
                    severity: newIssue.severity,
                    description: newIssue.description,
                    status: newIssue.status,
                    repair_details: '',
                    created_at: newIssue.createdAt
                }
            ]);

        if (error) {
            console.error("Error saving issue:", error);
            Swal.fire('Error', 'ไม่สามารถบันทึกข้อมูลแจ้งซ่อมได้', 'error');
            return;
        }

        // Update local state to reflect change immediately
        setIssues([issueWithId, ...issues]);

        // Send Telegram notification
        notifyNewIssue(issueWithId);
    };

    const updateIssueRepairDetails = async (id, details) => {
        const { error } = await supabase
            .from('issues')
            .update({ repair_details: details })
            .eq('id', id);

        if (error) {
            console.error("Error updating repair details:", error);
            Swal.fire('Error', 'ไม่สามารถอัปเดตรายละเอียดได้', 'error');
            return;
        }

        const updatedIssues = issues.map(issue =>
            issue.id === id ? { ...issue, repairDetails: details } : issue
        );
        setIssues(updatedIssues);

        // Send Telegram notification for repair update
        const updatedIssue = issues.find(i => i.id === id);
        if (updatedIssue && details) {
            notifyRepairUpdate(updatedIssue, details);
        }
    };

    const updateIssueStatus = async (id, newStatus, adminName = null) => {
        const updateData = { status: newStatus };
        if (adminName) {
            updateData.assigned_admin = adminName;
        }

        const { error } = await supabase
            .from('issues')
            .update(updateData)
            .eq('id', id);

        if (error) {
            console.error("Error updating status:", error);
            Swal.fire('Error', 'ไม่สามารถอัปเดตสถานะได้', 'error');
            return;
        }

        const updatedIssues = issues.map(issue => {
            if (issue.id === id) {
                return { ...issue, status: newStatus, ...(adminName && { assignedAdmin: adminName }) };
            }
            return issue;
        });
        setIssues(updatedIssues);

        // Send Telegram notification
        const updatedIssue = issues.find(i => i.id === id);
        if (updatedIssue) {
            notifyStatusChange(
                { ...updatedIssue, ...(adminName && { assignedAdmin: adminName }) },
                newStatus
            );
        }
    };

    const deleteIssue = async (id) => {
        const { error } = await supabase
            .from('issues')
            .delete()
            .eq('id', id);

        if (error) {
            console.error("Error deleting issue:", error);
            Swal.fire('Error', 'ไม่สามารถลบข้อมูลแจ้งซ่อมได้', 'error');
            return;
        }

        const updatedIssues = issues.filter(issue => issue.id !== id);
        setIssues(updatedIssues);
    };

    const handleAdminLogin = (adminData) => {
        setIsAdminAuth(adminData);
        localStorage.setItem('it-helpdesk-admin-auth', JSON.stringify(adminData));
        fetchIssues(); // Refresh data and show spinner on login
    };

    const handleAdminLogout = () => {
        setIsAdminAuth(null);
        localStorage.setItem('it-helpdesk-admin-auth', JSON.stringify(null));
        setActiveTab('admin');
    };

    const renderContent = () => {
        if (activeTab === 'home') {
            return <HomePage onNavigateTo={setActiveTab} />;
        }

        if (activeTab === 'assets') {
            return <AssetInventory />;
        }

        if (activeTab === 'user') {
            return <IssueForm addIssue={addIssue} issues={issues} isLoading={isIssuesLoading} />;
        }

        if (activeTab === 'admin') {
            if (isAdminAuth) {
                return (
                    <div className="space-y-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
                                    {isAdminAuth.name.charAt(0)}
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{isAdminAuth.name}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{isAdminAuth.role === 'superadmin' ? 'Super Admin' : 'ผู้ดูแลระบบ'}</p>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                                <div className="flex bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-xl w-full sm:w-auto overflow-hidden">
                                    <button
                                        onClick={() => { setAdminSubTab('issues'); fetchIssues(); }}
                                        className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${adminSubTab === 'issues' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                    >
                                        <Ticket className="w-4 h-4" /> แจ้งซ่อม
                                    </button>
                                    <button
                                        onClick={() => setAdminSubTab('users')}
                                        className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${adminSubTab === 'users' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                    >
                                        <Users className="w-4 h-4" /> ผู้ใช้งาน
                                    </button>
                                </div>
                                <button
                                    onClick={handleAdminLogout}
                                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-1.5 text-sm text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 rounded-xl transition font-medium border border-red-200 dark:border-red-800/50"
                                >
                                    <LogOut className="w-4 h-4" /> ออกจากระบบ
                                </button>
                            </div>
                        </div>

                        {adminSubTab === 'issues' ? (
                            <IssueDashboard
                                issues={issues}
                                currentAdmin={isAdminAuth}
                                updateIssueStatus={updateIssueStatus}
                                updateIssueRepairDetails={updateIssueRepairDetails}
                                deleteIssue={deleteIssue}
                                isLoading={isIssuesLoading}
                            />
                        ) : (
                            <UserManagement currentAdmin={isAdminAuth} />
                        )}
                    </div>
                );
            } else {
                return <AdminLogin onLogin={handleAdminLogin} />;
            }
        }
    };

    return (
        <div className="min-h-screen font-sans text-slate-800 dark:text-slate-200 flex flex-col relative w-full overflow-hidden">
            <header className="fixed w-full z-50 top-0 transition-all duration-300 glass-panel border-b border-white/40 dark:border-slate-700/50">
                <div className="container mx-auto px-4 md:px-8 py-3 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-600 dark:bg-indigo-500 text-white p-2 rounded-xl shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30">
                            <Settings className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-slate-800 dark:text-white leading-tight">IT Helpdesk</h1>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide">SUPPORT SYSTEM</p>
                        </div>
                    </div>

                    <nav className="flex bg-slate-100/80 dark:bg-slate-800/80 backdrop-blur-md p-1.5 rounded-2xl border border-white dark:border-slate-700 shadow-inner">
                        <button
                            onClick={() => setActiveTab('home')}
                            className={`px-4 py-2 rounded-xl transition-all duration-300 font-medium flex items-center gap-2 ${activeTab === 'home' ? 'bg-white dark:bg-indigo-600 text-indigo-700 dark:text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50'}`}
                        >
                            <Home className="w-4 h-4" /> หน้าแรก
                        </button>
                        <button
                            onClick={() => setActiveTab('user')}
                            className={`px-4 py-2 rounded-xl transition-all duration-300 font-medium flex items-center gap-2 ${activeTab === 'user' ? 'bg-white dark:bg-indigo-600 text-indigo-700 dark:text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50'}`}
                        >
                            <ClipboardList className="w-4 h-4" /> แจ้งซ่อม
                        </button>
                        <button
                            onClick={() => setActiveTab('assets')}
                            className={`px-4 py-2 rounded-xl transition-all duration-300 font-medium flex items-center gap-2 ${activeTab === 'assets' ? 'bg-white dark:bg-indigo-600 text-indigo-700 dark:text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50'}`}
                        >
                            <Monitor className="w-4 h-4" /> ทรัพย์สิน
                        </button>
                        <button
                            onClick={() => { setActiveTab('admin'); fetchIssues(); }}
                            className={`px-4 py-2 rounded-xl transition-all duration-300 font-medium flex items-center gap-2 ${activeTab === 'admin' ? 'bg-white dark:bg-indigo-600 text-indigo-700 dark:text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50'}`}
                        >
                            <Settings className="w-4 h-4" /> จัดการข้อมูล
                        </button>
                    </nav>
                </div>
            </header>

            <main className="flex-grow container mx-auto p-4 md:p-8 mt-24 relative z-10 w-full max-w-6xl">
                <div className="animate-fade-in">
                    {renderContent()}
                </div>
            </main>

            <footer className="py-6 mt-auto relative z-10">
                <div className="container mx-auto px-4 text-center text-slate-500/70 dark:text-slate-400/70 text-sm font-medium">
                    &copy; {new Date().getFullYear()} IT Helpdesk System. Built with React & Tailwind CSS.
                </div>
            </footer>
        </div>
    )
}

export default App
