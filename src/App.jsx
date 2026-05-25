import { useState, useEffect } from 'react';
import { mysql } from './mysqlClient';
import IssueForm from './components/IssueForm';
import IssueDashboard from './components/IssueDashboard';
import AdminLogin from './components/AdminLogin';
import UserManagement from './components/UserManagement';
import EmployeeManagement from './components/EmployeeManagement';
import HomePage from './components/HomePage';
import AssetInventory from './components/AssetInventory';
import IssueStatistics from './components/IssueStatistics';
import UserAccessRequestForm from './components/UserAccessRequestForm';
import AdminAccessRequests from './components/AdminAccessRequests';
import ManagerApproval from './components/ManagerApproval';
import ITManagerApproval from './components/ITManagerApproval';
import ChangeRequestForm from './components/ChangeRequestForm';
import AdminChangeRequests from './components/AdminChangeRequests';
import IssueCloseSignature from './components/IssueCloseSignature';
import { Settings, LogOut } from 'lucide-react';
import { ADMIN_SUB_TABS, MAIN_NAV_ITEMS, canSee, normalizeRole, NAV_ROLES } from './config/navigation';
import Swal from 'sweetalert2';
import { notifyNewIssue, notifyStatusChange, notifyRepairUpdate } from './telegramNotify';
import { buildCloseIssueLink, showCloseIssueLinkDialog } from './utils/closeIssueLink';

function App() {
    const [activeTab, setActiveTab] = useState(() => {
        // หากเปิดจาก QR Code (มี assetId) หรือลิงก์ขอสิทธิ์
        const params = new URLSearchParams(window.location.search);
        if (params.has('approveRequest')) return 'manager_approval';
        if (params.has('itApproveRequest')) return 'it_manager_approval';
        if (params.has('closeIssue')) return 'issue_close';
        return params.has('assetId') ? 'user' : 'home';
    });
    // เก็บค่า QR params ไว้ก่อนที่จะถูกลบออกจาก URL
    const [qrParams] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        const assetId = params.get('assetId');
        const assetName = params.get('assetName');
        if (assetId && assetName) return { assetId, assetName };
        return null;
    });
    const [approveRequestId] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('approveRequest');
    });
    const [itApproveRequestId] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('itApproveRequest');
    });
    const [closeIssueId] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('closeIssue');
    });
    const [adminSubTab, setAdminSubTab] = useState('issues'); // 'issues' or 'users'
    const [issues, setIssues] = useState([]);
    const [isIssuesLoading, setIsIssuesLoading] = useState(true);
    const [isAdminAuth, setIsAdminAuth] = useState(null);
    const currentRole = normalizeRole(isAdminAuth);
    const visibleMainNavItems = MAIN_NAV_ITEMS.filter((item) => canSee(item.roles, currentRole));
    const visibleAdminSubTabs = ADMIN_SUB_TABS.filter((item) => canSee(item.roles, currentRole));

    // Clean up URL to avoid sticking on refresh
    useEffect(() => {
        if (window.location.search) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, []);

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

    // Fetch issues from mysql
    useEffect(() => {
        fetchIssues();
    }, []);

    // mysql Realtime: อัพเดตข้อมูลอัตโนมัติเมื่อมีการเปลี่ยนแปลง
    useEffect(() => {
        const channel = mysql
            .channel('issues-realtime')
            .on('mysql_changes', { event: '*', schema: 'public', table: 'issues' }, () => {
                fetchIssues();
            })
            .subscribe();

        return () => mysql.removeChannel(channel);
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

        const { data, error } = await mysql
            .from('issues')
            .select('*')
            .order('created_at', { ascending: false });

        const elapsedTime = Date.now() - startTime;
        if (elapsedTime < 500) {
            await new Promise(resolve => setTimeout(resolve, 500 - elapsedTime));
        }

        if (error) {
            console.error("Error fetching issues from mysql:", error);
            Swal.fire('Error', 'ไม่สามารถโหลดข้อมูลแจ้งซ่อมได้', 'error');
        } else {
            // Map snake_case from DB to camelCase for frontend
            const formattedIssues = data.map(issue => {
                let attachments = [];
                try {
                    attachments = issue.attachments_json ? JSON.parse(issue.attachments_json) : [];
                } catch {
                    attachments = [];
                }
                return ({
                id: issue.id,
                name: issue.name,
                department: issue.department,
                category: issue.category,
                severity: issue.severity,
                description: issue.description,
                status: issue.status,
                repairDetails: issue.repair_details,
                assignedAdmin: issue.assigned_admin || null,
                assetId: issue.asset_id || null,
                assetName: issue.asset_name || null,
                attachments,
                userCloseName: issue.user_close_name || null,
                userCloseNote: issue.user_close_note || null,
                userCloseSign: issue.user_close_sign || null,
                userClosedAt: issue.user_closed_at || null,
                createdAt: issue.created_at
                });
            });
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

    const toMysqlDateTime = (value = new Date()) => {
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        const pad = (num) => String(num).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };

    const addIssue = async (newIssue) => {
        const issueId = generateDocId();
        const issueWithId = {
            ...newIssue,
            id: issueId,
            repairDetails: '',
            assignedAdmin: null,
            attachments: newIssue.attachments || []
        };

        // Insert into mysql
        const { error } = await mysql
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
                    asset_id: newIssue.assetId || null,
                    asset_name: newIssue.assetName || null,
                    attachments_json: JSON.stringify(newIssue.attachments || []),
                    created_at: toMysqlDateTime(newIssue.createdAt)
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
        const { error } = await mysql
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

    const updateIssueFullDetails = async (id, updatedFields) => {
        const dbFields = {};
        if (updatedFields.name !== undefined) dbFields.name = updatedFields.name;
        if (updatedFields.department !== undefined) dbFields.department = updatedFields.department;
        if (updatedFields.category !== undefined) dbFields.category = updatedFields.category;
        if (updatedFields.severity !== undefined) dbFields.severity = updatedFields.severity;
        if (updatedFields.description !== undefined) dbFields.description = updatedFields.description;
        if (updatedFields.repairDetails !== undefined) dbFields.repair_details = updatedFields.repairDetails;
        if (updatedFields.attachments !== undefined) dbFields.attachments_json = JSON.stringify(updatedFields.attachments || []);

        const { error } = await mysql
            .from('issues')
            .update(dbFields)
            .eq('id', id);

        if (error) {
            console.error("Error updating full issue details:", error);
            Swal.fire('Error', 'ไม่สามารถอัปเดตข้อมูลได้', 'error');
            return;
        }

        const updatedIssues = issues.map(issue =>
            issue.id === id ? { ...issue, ...updatedFields } : issue
        );
        setIssues(updatedIssues);
        Swal.fire({
            title: 'บันทึกสำเร็จ!',
            text: 'แก้ไขข้อมูลการแจ้งซ่อมเรียบร้อยแล้ว',
            icon: 'success',
            timer: 1500,
            showConfirmButton: false
        });
    };

    const updateIssueStatus = async (id, newStatus, adminName = null) => {
        const updateData = { status: newStatus };
        if (adminName) {
            updateData.assigned_admin = adminName;
        }

        const { error } = await mysql
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

        const updatedIssue = {
            ...issues.find(i => i.id === id),
            status: newStatus,
            ...(adminName && { assignedAdmin: adminName }),
        };

        if (updatedIssue?.id) {
            const closeLink =
                newStatus === 'Resolved' ? buildCloseIssueLink(id) : null;
            notifyStatusChange(updatedIssue, newStatus, closeLink);

            if (newStatus === 'Resolved' && !updatedIssue.userCloseSign) {
                await showCloseIssueLinkDialog(updatedIssue);
            }
        }
    };

    const closeIssueByUser = async (id, closeData) => {
        const payload = {
            user_close_name: closeData.name,
            user_close_note: closeData.note || '',
            user_close_sign: closeData.signature,
            user_closed_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
        };

        const { error } = await mysql
            .from('issues')
            .update(payload)
            .eq('id', id);

        if (error) {
            console.error("Error closing issue by user:", error);
            Swal.fire('Error', 'ไม่สามารถบันทึกลายเซ็นปิดงานได้', 'error');
            return false;
        }

        setIssues(issues.map(issue => issue.id === id ? {
            ...issue,
            userCloseName: closeData.name,
            userCloseNote: closeData.note || '',
            userCloseSign: closeData.signature,
            userClosedAt: payload.user_closed_at
        } : issue));
        return true;
    };

    const deleteIssue = async (id) => {
        const { error } = await mysql
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
            return <HomePage onNavigateTo={setActiveTab} currentRole={currentRole} />;
        }

        if (activeTab === 'user') {
            return <IssueForm addIssue={addIssue} issues={issues} isLoading={isIssuesLoading} qrParams={qrParams} />;
        }

        if (activeTab === 'access_request') {
            return <UserAccessRequestForm />;
        }

        if (activeTab === 'change_request') {
            return <ChangeRequestForm />;
        }

        if (activeTab === 'issue_close') {
            return <IssueCloseSignature issueId={closeIssueId} onCloseIssue={closeIssueByUser} />;
        }

        if (activeTab === 'manager_approval') {
            return <ManagerApproval requestId={approveRequestId} />;
        }

        if (activeTab === 'it_manager_approval') {
            return <ITManagerApproval requestId={itApproveRequestId} />;
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
                                <div className="grid grid-cols-3 sm:flex flex-wrap bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-xl w-full sm:w-auto gap-1">
                                    {visibleAdminSubTabs.map((item) => {
                                        const Icon = item.icon;
                                        return (
                                            <button
                                                key={item.id}
                                                onClick={() => {
                                                    if (item.id === 'issues') fetchIssues();
                                                    setAdminSubTab(item.id);
                                                }}
                                                className={`px-1 sm:px-4 py-2 sm:py-1.5 rounded-lg font-medium transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 ${adminSubTab === item.id ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-md sm:shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                            >
                                                <Icon className="w-[18px] h-[18px] sm:w-4 sm:h-4" /> <span className="text-[11px] sm:text-sm whitespace-nowrap">{item.label}</span>
                                            </button>
                                        );
                                    })}
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
                                updateIssueFullDetails={updateIssueFullDetails}
                                deleteIssue={deleteIssue}
                                isLoading={isIssuesLoading}
                            />
                        ) : adminSubTab === 'assets' ? (
                            <AssetInventory issues={issues} />
                        ) : adminSubTab === 'access_requests' ? (
                            <AdminAccessRequests />
                        ) : adminSubTab === 'change_requests' ? (
                            <AdminChangeRequests />
                        ) : adminSubTab === 'stats' ? (
                            <IssueStatistics issues={issues} />
                        ) : adminSubTab === 'employees' ? (
                            <EmployeeManagement />
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

    const handleNavClick = (item) => {
        if (item.needsRefresh) fetchIssues();
        setActiveTab(item.tab);
    };

    return (
        <div className="min-h-screen font-sans text-slate-800 dark:text-slate-200 flex flex-col relative w-full overflow-hidden">
            <header className="fixed w-full z-50 top-0 transition-all duration-300 glass-panel border-b border-white/40 dark:border-slate-700/50">
                <div className="container mx-auto px-4 md:px-8 py-3 flex flex-col sm:flex-row justify-between items-center gap-4 max-w-[95%] 2xl:max-w-[1500px]">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-600 dark:bg-indigo-500 text-white p-2 rounded-xl shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30">
                            <Settings className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-slate-800 dark:text-white leading-tight">IT Helpdesk</h1>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide">SUPPORT SYSTEM</p>
                        </div>
                    </div>

                    <nav className="hidden sm:flex bg-slate-100/80 dark:bg-slate-800/80 backdrop-blur-md p-1.5 rounded-2xl border border-white dark:border-slate-700 shadow-inner">
                        {visibleMainNavItems.map((item) => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => handleNavClick(item)}
                                    className={`px-4 py-2 rounded-xl transition-all duration-300 font-medium flex items-center gap-2 ${activeTab === item.tab ? 'bg-white dark:bg-indigo-600 text-indigo-700 dark:text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50'}`}
                                >
                                    <Icon className="w-4 h-4" /> {item.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>
            </header>

            <main className="flex-grow container mx-auto p-4 md:p-8 mt-24 relative z-10 w-full max-w-[95%] 2xl:max-w-[1500px] mb-20 sm:mb-0">
                <div className="animate-fade-in">
                    {renderContent()}
                </div>
            </main>

            <footer className="py-6 mt-auto relative z-10 hidden sm:block">
                <div className="container mx-auto px-4 text-center text-slate-500/70 dark:text-slate-400/70 text-sm font-medium">
                    &copy; {new Date().getFullYear()} IT Helpdesk System. Built with React & Tailwind CSS.
                </div>
            </footer>

            {/* Mobile Bottom Navigation Bar limit sm:hidden */}
            <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 pb-safe pt-2 px-2 pb-2">
                <div className="flex justify-around items-center h-14">
                    {visibleMainNavItems.map((item) => {
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.id}
                                onClick={() => handleNavClick(item)}
                                className={`flex flex-col items-center justify-center w-16 h-full space-y-1 transition-colors ${activeTab === item.tab ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'}`}
                            >
                                <Icon className="w-6 h-6" strokeWidth={activeTab === item.tab ? 2.5 : 2} />
                                <span className="text-[10px] font-semibold">{item.label}</span>
                            </button>
                        );
                    })}
                </div>
            </nav>
        </div>
    )
}

export default App
