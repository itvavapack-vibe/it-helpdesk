import { useState, useEffect } from 'react';
import { getAdminProfile, mysql, updateAdminProfile } from './mysqlClient';
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
import ApprovedDocuments from './components/ApprovedDocuments';
import IssueCloseSignature from './components/IssueCloseSignature';
import ChangeManagerApproval from './components/ChangeManagerApproval';
import { ChevronDown, LogOut, Settings, UserCog } from 'lucide-react';
import { ADMIN_SUB_TABS, MAIN_NAV_ITEMS, canSee, normalizeRole } from './config/navigation';
import { ACCESS_QUEUE_STATUS_BY_ROLE, CHANGE_QUEUE_STATUS_BY_ROLE, ROLE_LABELS, countVisibleQueue } from './config/roles';
import Swal from 'sweetalert2';
import { notifyNewIssue, notifyStatusChange, notifyRepairUpdate } from './telegramNotify';
import { buildCloseIssueLink, showCloseIssueLinkDialog } from './utils/closeIssueLink';
import { toMysqlDateTime } from './utils/dateTime';

const ACTIVE_TAB_STORAGE_KEY = 'it-helpdesk-active-tab';
const ADMIN_SUB_TAB_STORAGE_KEY = 'it-helpdesk-admin-sub-tab';
const TRANSIENT_TABS = new Set(['manager_approval', 'change_manager_approval', 'it_manager_approval', 'issue_close']);
function App() {
    const [activeTab, setActiveTab] = useState(() => {
        // หากเปิดจาก QR Code (มี assetId) หรือลิงก์ขอสิทธิ์
        const params = new URLSearchParams(window.location.search);
        if (params.has('approveRequest')) return 'manager_approval';
        if (params.has('approveChangeReq')) return 'change_manager_approval';
        if (params.has('itApproveRequest')) return 'it_manager_approval';
        if (params.has('closeIssue')) return 'issue_close';
        if (params.has('assetId')) return 'user';
        const savedTab = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
        if (savedTab && !TRANSIENT_TABS.has(savedTab)) return savedTab;
        return 'home';
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
    const [approveChangeRequestId] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('approveChangeReq');
    });
    const [itApproveRequestId] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('itApproveRequest');
    });
    const [closeIssueId] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('closeIssue');
    });
    const [adminSubTab, setAdminSubTab] = useState(() => localStorage.getItem(ADMIN_SUB_TAB_STORAGE_KEY) || 'issues'); // 'issues' or 'users'
    const [issues, setIssues] = useState([]);
    const [isIssuesLoading, setIsIssuesLoading] = useState(true);
    const [isAdminAuth, setIsAdminAuth] = useState(null);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [profileForm, setProfileForm] = useState({ username: '', name: '', password: '' });
    const [approvalQueues, setApprovalQueues] = useState({ access: [], change: [] });
    const currentRole = normalizeRole(isAdminAuth);
    const visibleMainNavItems = MAIN_NAV_ITEMS.filter((item) => canSee(item.roles, currentRole));
    const visibleAdminSubTabs = ADMIN_SUB_TABS.filter((item) => canSee(item.roles, currentRole));
    const selectedAdminSubTab = visibleAdminSubTabs.some((item) => item.id === adminSubTab)
        ? adminSubTab
        : visibleAdminSubTabs[0]?.id;

    // Clean up URL to avoid sticking on refresh
    useEffect(() => {
        if (window.location.search) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, []);

    useEffect(() => {
        if (TRANSIENT_TABS.has(activeTab)) return;
        localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
    }, [activeTab]);

    useEffect(() => {
        localStorage.setItem(ADMIN_SUB_TAB_STORAGE_KEY, adminSubTab);
    }, [adminSubTab]);

    useEffect(() => {
        if (!isAdminAuth || TRANSIENT_TABS.has(activeTab)) return;
        const canSeeActiveTab = visibleMainNavItems.some((item) => item.tab === activeTab);
        if (!canSeeActiveTab) setActiveTab('admin');
    }, [activeTab, isAdminAuth, visibleMainNavItems]);

    useEffect(() => {
        if (!visibleAdminSubTabs.length) return;
        const canSeeAdminSubTab = visibleAdminSubTabs.some((item) => item.id === adminSubTab);
        if (!canSeeAdminSubTab) setAdminSubTab(visibleAdminSubTabs[0].id);
    }, [adminSubTab, visibleAdminSubTabs]);

    useEffect(() => {
        if (!isAdminAuth) {
            setApprovalQueues({ access: [], change: [] });
            setIsProfileMenuOpen(false);
            setIsProfileModalOpen(false);
            return;
        }

        const fetchApprovalQueues = async () => {
            const [accessResult, changeResult] = await Promise.all([
                mysql.from('access_requests').select('id, status'),
                mysql.from('change_requests').select('id, status')
            ]);
            setApprovalQueues({
                access: accessResult.error ? [] : accessResult.data || [],
                change: changeResult.error ? [] : changeResult.data || []
            });
        };

        fetchApprovalQueues();
        const intervalId = setInterval(fetchApprovalQueues, 10000);
        window.addEventListener('approval-queues:refresh', fetchApprovalQueues);
        return () => {
            clearInterval(intervalId);
            window.removeEventListener('approval-queues:refresh', fetchApprovalQueues);
        };
    }, [isAdminAuth]);

    useEffect(() => {
        if (!isAdminAuth?.id) return;

        let cancelled = false;
        const refreshCurrentAdmin = async () => {
            const { data, error } = await getAdminProfile();
            if (!cancelled && !error && data) {
                handleCurrentAdminUpdated(data);
            }
        };

        refreshCurrentAdmin();
        return () => {
            cancelled = true;
        };
    }, [isAdminAuth?.id]);

    // Check auth state from localStorage initially
    useEffect(() => {
        const authStat = localStorage.getItem('it-helpdesk-admin-auth');
        if (authStat) {
            try {
                const parsedAuth = JSON.parse(authStat);
                // Handle legacy boolean auth
                if (parsedAuth === true) {
                    localStorage.setItem('it-helpdesk-admin-auth', JSON.stringify(null));
                    setIsAdminAuth(null);
                } else if (!parsedAuth?.token) {
                    localStorage.setItem('it-helpdesk-admin-auth', JSON.stringify(null));
                    setIsAdminAuth(null);
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

    // mysql Realtime: อัปเดตข้อมูลอัตโนมัติเมื่อมีการเปลี่ยนแปลง
    useEffect(() => {
        const channel = mysql
            .channel('issues-realtime')
            .on('mysql_changes', { event: '*', schema: 'public', table: 'issues' }, () => {
                fetchIssues();
            })
            .subscribe();

        return () => mysql.removeChannel(channel);
    }, []);

    useEffect(() => {
        const intervalId = setInterval(() => {
            if (document.visibilityState === 'visible') {
                fetchIssues({ silent: true });
            }
        }, 8000);

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                fetchIssues({ silent: true });
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
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

    const fetchIssues = async ({ silent = false } = {}) => {
        if (!silent) setIsIssuesLoading(true);

        // Add a slight artificial delay (min 500ms) for better UX with the spinner
        const startTime = Date.now();

        const { data, error } = await mysql
            .from('issues')
            .select('*')
            .order('created_at', { ascending: false });

        const elapsedTime = Date.now() - startTime;
        if (!silent && elapsedTime < 500) {
            await new Promise(resolve => setTimeout(resolve, 500 - elapsedTime));
        }

        if (error) {
            console.error("Error fetching issues from mysql:", error);
            if (silent) return;
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
        if (!silent) setIsIssuesLoading(false);
    };

    const generateDocId = () => {
        const today = new Date();
        const yy = today.getFullYear().toString().slice(-2);
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const datePrefix = `IT-${yy}${mm}-`;

        // Find issues from the current month to calculate sequence
        const monthlyIssues = issues.filter(issue => issue.id && issue.id.startsWith(datePrefix));

        // Extract existing sequence numbers for this month to find the max
        const sequences = monthlyIssues.map(issue => {
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
            user_closed_at: toMysqlDateTime()
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
        setIsProfileMenuOpen(false);
        setIsProfileModalOpen(false);
        localStorage.setItem('it-helpdesk-admin-auth', JSON.stringify(null));
        setActiveTab('admin');
    };

    const handleProfileSettings = () => {
        setIsProfileMenuOpen(false);
        setProfileForm({
            username: isAdminAuth?.username || '',
            name: isAdminAuth?.name || '',
            password: ''
        });
        setIsProfileModalOpen(true);
    };

    const handleProfileFormChange = (event) => {
        const { name, value } = event.target;
        setProfileForm((previous) => ({ ...previous, [name]: value }));
    };

    const handleProfileSubmit = async (event) => {
        event.preventDefault();

        if (!profileForm.username.trim() || !profileForm.name.trim()) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอกชื่อผู้ใช้และชื่อที่แสดง', 'warning');
            return;
        }

        setIsSavingProfile(true);
        const { data, error, status } = await updateAdminProfile({
            username: profileForm.username,
            name: profileForm.name,
            password: profileForm.password
        });
        setIsSavingProfile(false);

        if (error) {
            const message = status === 409 ? 'ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว' : 'ไม่สามารถบันทึกโปรไฟล์ได้';
            Swal.fire('Error', message, 'error');
            return;
        }

        handleCurrentAdminUpdated(data);
        setProfileForm((previous) => ({ ...previous, password: '' }));
        setIsProfileModalOpen(false);
        Swal.fire({
            icon: 'success',
            title: 'บันทึกโปรไฟล์แล้ว',
            showConfirmButton: false,
            timer: 1500
        });
    };

    const handleCurrentAdminUpdated = (updates) => {
        setIsAdminAuth((previousAuth) => {
            if (!previousAuth) return previousAuth;
            const nextAuth = { ...previousAuth, ...updates };
            localStorage.setItem('it-helpdesk-admin-auth', JSON.stringify(nextAuth));
            return nextAuth;
        });
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

        if (activeTab === 'change_manager_approval') {
            return <ChangeManagerApproval requestId={approveChangeRequestId} />;
        }

        if (activeTab === 'it_manager_approval') {
            return <ITManagerApproval requestId={itApproveRequestId} />;
        }

        if (activeTab === 'admin') {
            if (isAdminAuth) {
                return (
                    <div className="space-y-6">
                        <div className="hidden sm:flex sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
                                    {isAdminAuth.name.charAt(0)}
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{isAdminAuth.name}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{ROLE_LABELS[currentRole] || ROLE_LABELS[isAdminAuth.role] || 'IT Support'}</p>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                                <div className="flex flex-wrap bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-xl w-auto gap-1">
                                    {visibleAdminSubTabs.map((item) => {
                                        const Icon = item.icon;
                                        const pendingCount = item.id === 'access_requests'
                                            ? countVisibleQueue(approvalQueues.access, currentRole, ACCESS_QUEUE_STATUS_BY_ROLE)
                                            : item.id === 'change_requests'
                                                ? countVisibleQueue(approvalQueues.change, currentRole, CHANGE_QUEUE_STATUS_BY_ROLE)
                                                : 0;
                                        return (
                                            <button
                                                key={item.id}
                                                onClick={() => {
                                                    if (item.id === 'issues') fetchIssues();
                                                    setAdminSubTab(item.id);
                                                }}
                                                className={`px-1 sm:px-4 py-2 sm:py-1.5 rounded-lg font-medium transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 ${selectedAdminSubTab === item.id ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-md sm:shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                            >
                                                <span className="relative">
                                                    <Icon className="w-[18px] h-[18px] sm:w-4 sm:h-4" />
                                                    {pendingCount > 0 && (
                                                        <span className="absolute -right-2 -top-2 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center shadow">
                                                            {pendingCount > 99 ? '99+' : pendingCount}
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="text-[11px] sm:text-sm whitespace-nowrap">{item.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {selectedAdminSubTab === 'issues' ? (
                            <IssueDashboard
                                issues={issues}
                                currentAdmin={isAdminAuth}
                                updateIssueStatus={updateIssueStatus}
                                updateIssueRepairDetails={updateIssueRepairDetails}
                                updateIssueFullDetails={updateIssueFullDetails}
                                deleteIssue={deleteIssue}
                                isLoading={isIssuesLoading}
                            />
                        ) : selectedAdminSubTab === 'assets' ? (
                            <AssetInventory issues={issues} />
                        ) : selectedAdminSubTab === 'access_requests' ? (
                            <AdminAccessRequests currentAdmin={isAdminAuth} />
                        ) : selectedAdminSubTab === 'change_requests' ? (
                            <AdminChangeRequests currentAdmin={isAdminAuth} />
                        ) : selectedAdminSubTab === 'approved_documents' ? (
                            <ApprovedDocuments />
                        ) : selectedAdminSubTab === 'stats' ? (
                            <IssueStatistics issues={issues} />
                        ) : selectedAdminSubTab === 'employees' ? (
                            <EmployeeManagement />
                        ) : selectedAdminSubTab === 'users' ? (
                            <UserManagement
                                currentAdmin={isAdminAuth}
                                onAuthExpired={handleAdminLogout}
                                onCurrentAdminUpdated={handleCurrentAdminUpdated}
                            />
                        ) : (
                            <EmployeeManagement />
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
                <div className="container mx-auto px-4 md:px-8 py-3 flex flex-row justify-between items-center gap-3 max-w-[95%] 2xl:max-w-[1500px]">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-600 dark:bg-indigo-500 text-white p-2 rounded-xl shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30">
                            <Settings className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-slate-800 dark:text-white leading-tight">IT Helpdesk</h1>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide">SUPPORT SYSTEM</p>
                        </div>
                    </div>

                    {isAdminAuth ? (
                        <div className="relative">
                            <button
                                onClick={() => setIsProfileMenuOpen((open) => !open)}
                                className="group flex items-center gap-0 sm:gap-3 rounded-full sm:rounded-2xl bg-transparent p-1 sm:px-2 sm:py-1.5 hover:bg-white/55 dark:hover:bg-slate-800/55 transition-colors"
                                aria-haspopup="menu"
                                aria-expanded={isProfileMenuOpen}
                                title="เมนูโปรไฟล์"
                            >
                                <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden bg-gradient-to-br from-indigo-100 to-sky-100 dark:from-indigo-900/70 dark:to-sky-900/50 text-indigo-700 dark:text-indigo-200 flex items-center justify-center font-bold ring-1 ring-white/80 dark:ring-slate-700/70 group-hover:ring-indigo-200 dark:group-hover:ring-indigo-800 transition-shadow">
                                    {isAdminAuth.profile_image_url || isAdminAuth.avatar_url ? (
                                        <img
                                            src={isAdminAuth.profile_image_url || isAdminAuth.avatar_url}
                                            alt={isAdminAuth.name || 'Profile'}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        (isAdminAuth.name || isAdminAuth.username || 'U').charAt(0).toUpperCase()
                                    )}
                                </span>
                                <span className="hidden md:flex min-w-0 flex-col items-start">
                                    <span className="max-w-40 truncate text-sm font-semibold text-slate-800 dark:text-slate-100 leading-5">{isAdminAuth.name}</span>
                                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-4">{ROLE_LABELS[currentRole] || ROLE_LABELS[isAdminAuth.role] || 'IT Support'}</span>
                                </span>
                                <ChevronDown className={`hidden sm:block w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isProfileMenuOpen && (
                                <div className="absolute right-0 mt-3 w-[calc(100vw-2rem)] max-w-72 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl shadow-slate-200/70 dark:shadow-slate-950/50 overflow-hidden z-[60]">
                                    <div className="px-4 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 flex items-center gap-3">
                                        <span className="w-11 h-11 rounded-full overflow-hidden bg-gradient-to-br from-indigo-100 to-sky-100 dark:from-indigo-900/70 dark:to-sky-900/50 text-indigo-700 dark:text-indigo-200 flex items-center justify-center font-bold border border-white dark:border-slate-700">
                                            {isAdminAuth.profile_image_url || isAdminAuth.avatar_url ? (
                                                <img
                                                    src={isAdminAuth.profile_image_url || isAdminAuth.avatar_url}
                                                    alt={isAdminAuth.name || 'Profile'}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                (isAdminAuth.name || isAdminAuth.username || 'U').charAt(0).toUpperCase()
                                            )}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{isAdminAuth.name}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{isAdminAuth.username}</p>
                                            <p className="mt-1 inline-flex rounded-full bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-300">
                                                {ROLE_LABELS[currentRole] || ROLE_LABELS[isAdminAuth.role] || 'IT Support'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="p-1.5">
                                    <button
                                        onClick={handleProfileSettings}
                                        className="w-full px-3 py-2.5 rounded-xl text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
                                    >
                                        <UserCog className="w-4 h-4" /> ตั้งค่าโปรไฟล์
                                    </button>
                                    <button
                                        onClick={handleAdminLogout}
                                        className="w-full px-3 py-2.5 rounded-xl text-left text-sm font-medium text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2 transition-colors"
                                    >
                                        <LogOut className="w-4 h-4" /> ออกจากระบบ
                                    </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <nav className="hidden sm:flex bg-slate-100/80 dark:bg-slate-800/80 backdrop-blur-md p-1.5 rounded-2xl border border-white dark:border-slate-700 shadow-inner">
                            {visibleMainNavItems.map((item) => {
                                const Icon = item.icon;
                                const isPrimary = item.variant === 'primary';
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => handleNavClick(item)}
                                        className={`px-4 py-2 rounded-xl transition-all duration-300 font-medium flex items-center gap-2 ${isPrimary ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:shadow-indigo-900/40' : activeTab === item.tab ? 'bg-white dark:bg-indigo-600 text-indigo-700 dark:text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50'}`}
                                    >
                                        <Icon className="w-4 h-4" /> {item.label}
                                    </button>
                                );
                            })}
                        </nav>
                    )}
                </div>
            </header>

            <main className="flex-grow container mx-auto p-4 md:p-8 mt-24 relative z-10 w-full max-w-[95%] 2xl:max-w-[1500px] mb-24 sm:mb-0">
                <div className="animate-fade-in">
                    {renderContent()}
                </div>
            </main>

            {isProfileModalOpen && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
                        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">ตั้งค่าโปรไฟล์</h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400">แก้ไขข้อมูลบัญชีของคุณ</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsProfileModalOpen(false)}
                                className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800"
                                aria-label="ปิด"
                            >
                                ×
                            </button>
                        </div>

                        <form onSubmit={handleProfileSubmit} className="p-6 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-14 h-14 rounded-full overflow-hidden bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-200 flex items-center justify-center text-xl font-bold border border-indigo-200 dark:border-indigo-800">
                                    {isAdminAuth?.profile_image_url || isAdminAuth?.avatar_url ? (
                                        <img
                                            src={isAdminAuth.profile_image_url || isAdminAuth.avatar_url}
                                            alt={isAdminAuth.name || 'Profile'}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        (profileForm.name || profileForm.username || 'U').charAt(0).toUpperCase()
                                    )}
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{profileForm.name || '-'}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">รองรับรูปโปรไฟล์ในอนาคต</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">ชื่อผู้ใช้</label>
                                <input
                                    type="text"
                                    name="username"
                                    value={profileForm.username}
                                    onChange={handleProfileFormChange}
                                    className="w-full input-modern"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">ชื่อที่แสดง</label>
                                <input
                                    type="text"
                                    name="name"
                                    value={profileForm.name}
                                    onChange={handleProfileFormChange}
                                    className="w-full input-modern"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">สิทธิ์การใช้งาน</label>
                                <input
                                    type="text"
                                    value={ROLE_LABELS[currentRole] || ROLE_LABELS[isAdminAuth?.role] || 'IT Support'}
                                    className="w-full input-modern opacity-80 cursor-not-allowed"
                                    disabled
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">รหัสผ่านใหม่</label>
                                <input
                                    type="password"
                                    name="password"
                                    value={profileForm.password}
                                    onChange={handleProfileFormChange}
                                    className="w-full input-modern"
                                    placeholder="เว้นว่างไว้หากไม่ต้องการเปลี่ยน"
                                />
                            </div>

                            <div className="pt-4 flex gap-3 border-t border-slate-100 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setIsProfileModalOpen(false)}
                                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
                                    disabled={isSavingProfile}
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 disabled:opacity-60 disabled:cursor-not-allowed"
                                    disabled={isSavingProfile}
                                >
                                    {isSavingProfile ? 'กำลังบันทึก...' : 'บันทึก'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <footer className="py-6 mt-auto relative z-10 hidden sm:block">
                <div className="container mx-auto px-4 text-center text-slate-500/70 dark:text-slate-400/70 text-sm font-medium">
                    &copy; {new Date().getFullYear()} IT Helpdesk System. Built with React & Tailwind CSS.
                </div>
            </footer>

            {/* Mobile Bottom Navigation Bar limit sm:hidden */}
            {!isAdminAuth && <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 pb-safe pt-2 px-2 pb-2">
                <div className="flex justify-around items-center h-14">
                    {visibleMainNavItems.map((item) => {
                        const Icon = item.icon;
                        const isPrimary = item.variant === 'primary';
                        return (
                            <button
                                key={item.id}
                                onClick={() => handleNavClick(item)}
                                className={`flex flex-col items-center justify-center h-full space-y-1 transition-colors rounded-xl ${isPrimary ? 'w-20 bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:bg-indigo-500 dark:shadow-indigo-900/40' : `w-16 ${activeTab === item.tab ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'}`}`}
                            >
                                <Icon className="w-6 h-6" strokeWidth={activeTab === item.tab ? 2.5 : 2} />
                                <span className="text-[10px] font-semibold">{item.label}</span>
                            </button>
                        );
                    })}
                </div>
            </nav>}

            {isAdminAuth && visibleAdminSubTabs.length > 0 && (
                <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 pt-2 px-2 pb-3">
                    <div className="flex items-center gap-1 overflow-x-auto">
                        {visibleAdminSubTabs.map((item) => {
                            const Icon = item.icon;
                            const pendingCount = item.id === 'access_requests'
                                ? countVisibleQueue(approvalQueues.access, currentRole, ACCESS_QUEUE_STATUS_BY_ROLE)
                                : item.id === 'change_requests'
                                    ? countVisibleQueue(approvalQueues.change, currentRole, CHANGE_QUEUE_STATUS_BY_ROLE)
                                    : 0;
                            const isSelected = selectedAdminSubTab === item.id;

                            return (
                                <button
                                    key={item.id}
                                    onClick={() => {
                                        if (item.id === 'issues') fetchIssues();
                                        setAdminSubTab(item.id);
                                    }}
                                    className={`relative min-w-[74px] h-14 rounded-2xl flex flex-col items-center justify-center gap-1 transition-colors ${isSelected ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:bg-indigo-500 dark:shadow-indigo-950/40' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                                >
                                    <span className="relative">
                                        <Icon className="w-5 h-5" strokeWidth={isSelected ? 2.5 : 2} />
                                        {pendingCount > 0 && (
                                            <span className="absolute -right-2.5 -top-2.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center shadow">
                                                {pendingCount > 99 ? '99+' : pendingCount}
                                            </span>
                                        )}
                                    </span>
                                    <span className="max-w-[66px] truncate text-[10px] font-semibold leading-none">{item.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </nav>
            )}
        </div>
    )
}

export default App
