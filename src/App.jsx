import { Suspense, lazy, useState, useEffect, useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { getAdminProfile, mysql, updateAdminProfile } from './mysqlClient';
import ThemePicker from './components/ThemePicker';
import { ChevronDown, LogIn, LogOut, Monitor, MoreHorizontal, PanelLeftClose, PanelLeftOpen, UserCog } from 'lucide-react';
import { ADMIN_SUB_TABS, MAIN_NAV_ITEMS, canSee, normalizeRole } from './config/navigation';
import { ACCESS_QUEUE_STATUS_BY_ROLE, APPROVAL_QUEUE_STATUS_BY_ROLE, CHANGE_QUEUE_STATUS_BY_ROLE, ROLE_LABELS, canApproveServerRoomEntry, canHandleChangeRequestCategory, countVisibleQueue } from './config/roles';
import Swal from 'sweetalert2';
import { notifyNewIssue, notifyStatusChange, notifyRepairUpdate } from './telegramNotify';
import { buildCloseIssueLink, showCloseIssueLinkDialog } from './utils/closeIssueLink';
import { toMysqlDateTime } from './utils/dateTime';
import { insertWithMonthlyDocumentNumber } from './utils/ticketNumber';
import { loadSignatureIntoCanvas } from './utils/signatureCanvas';
import { PASSWORD_POLICY_TEXT, getPasswordPolicyErrors } from '../shared/passwordPolicy';

const IssueForm = lazy(() => import('./components/IssueForm'));
const IssueTracking = lazy(() => import('./components/IssueTracking'));
const RequestTracking = lazy(() => import('./components/RequestTracking'));
const IssueDashboard = lazy(() => import('./components/IssueDashboard'));
const AdminLogin = lazy(() => import('./components/AdminLogin'));
const UserManagement = lazy(() => import('./components/UserManagement'));
const EmployeeManagement = lazy(() => import('./components/EmployeeManagement'));
const AIHelpdesk = lazy(() => import('./components/AIHelpdesk'));
const HomePage = lazy(() => import('./components/HomePage'));
const AssetInventory = lazy(() => import('./components/AssetInventory'));
const IssueStatistics = lazy(() => import('./components/IssueStatistics'));
const UserAccessRequestForm = lazy(() => import('./components/UserAccessRequestForm'));
const ControlledAreaEntryForm = lazy(() => import('./components/ControlledAreaEntryForm'));
const AdminAccessRequests = lazy(() => import('./components/AdminAccessRequests'));
const ManagerApproval = lazy(() => import('./components/ManagerApproval'));
const ITManagerApproval = lazy(() => import('./components/ITManagerApproval'));
const ChangeRequestForm = lazy(() => import('./components/ChangeRequestForm'));
const AdminChangeRequests = lazy(() => import('./components/AdminChangeRequests'));
const ApprovedDocuments = lazy(() => import('./components/ApprovedDocuments'));
const ServerRoomManagement = lazy(() => import('./components/ServerRoomManagement'));
const IssueCloseSignature = lazy(() => import('./components/IssueCloseSignature'));
const IssueWaitingPartsSignature = lazy(() => import('./components/IssueWaitingPartsSignature'));
const ChangeRequestAcceptance = lazy(() => import('./components/ChangeRequestAcceptance'));
const AccessRequestAcknowledgement = lazy(() => import('./components/AccessRequestAcknowledgement'));
const BorrowReturnSignature = lazy(() => import('./components/BorrowReturnSignature'));
const ChangeManagerApproval = lazy(() => import('./components/ChangeManagerApproval'));

const AUTO_CLOSE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
const SESSION_ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'pointerdown'];
const SESSION_REFRESH_THROTTLE_MS = 30 * 1000;

const ACTIVE_TAB_STORAGE_KEY = 'it-helpdesk-active-tab';
const ADMIN_SUB_TAB_STORAGE_KEY = 'it-helpdesk-admin-sub-tab';
const ADMIN_SUBMENU_STORAGE_KEY = 'it-helpdesk-admin-submenus-open';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'it-helpdesk-sidebar-collapsed';
const TRANSIENT_TABS = new Set(['manager_approval', 'change_manager_approval', 'it_manager_approval', 'issue_close', 'issue_waiting_parts', 'borrow_return', 'change_request_acceptance', 'access_request_acknowledgement']);
const AUTH_HIDDEN_MAIN_NAV_ITEMS = new Set(['user', 'access_request', 'change_request', 'controlled_area']);
const BOTTOM_NAV_VISIBLE_LIMIT = 4;
const TAB_PATHS = {
    home: '/',
    ai_helpdesk: '/ai-helpdesk',
    user: '/report-issue',
    tracking: '/track-repair',
    request_tracking: '/track',
    request_tracking_access: '/track/access',
    request_tracking_change: '/track/change',
    access_request: '/request-access',
    change_request: '/request-change',
    controlled_area: '/controlled-area',
    admin: '/admin',
    manager_approval: '/approve/access',
    change_manager_approval: '/approve/change',
    it_manager_approval: '/approve/access/it',
    issue_close: '/close-issue',
    issue_waiting_parts: '/waiting-parts-sign',
    borrow_return: '/return-borrow',
    change_request_acceptance: '/accept-change-request',
    access_request_acknowledgement: '/acknowledge-access-request',
};
const ADMIN_SUB_TAB_PATHS = {
    issues: 'issues',
    assets: 'assets',
    asset_pm: 'assets/pm',
    access_requests: 'access-requests',
    change_requests: 'change-requests',
    approved_documents: 'approved-documents',
    server_room: 'server-room',
    stats: 'statistics',
    employees: 'employees',
    users: 'users',
};
const WORKFLOW_QUERY_TABS = {
    approveRequest: 'manager_approval',
    approveChangeReq: 'change_manager_approval',
    itApproveRequest: 'it_manager_approval',
    closeIssue: 'issue_close',
    waitingPartsIssue: 'issue_waiting_parts',
    returnBorrowIssue: 'borrow_return',
    acceptChangeReq: 'change_request_acceptance',
    ackAccessReq: 'access_request_acknowledgement',
};
const collectQueueStatuses = (...queueMaps) => [
    ...new Set(queueMaps.flatMap((queueMap) => Object.values(queueMap).flat())),
];
const ACCESS_QUEUE_FETCH_STATUSES = collectQueueStatuses(ACCESS_QUEUE_STATUS_BY_ROLE, APPROVAL_QUEUE_STATUS_BY_ROLE);
const CHANGE_QUEUE_FETCH_STATUSES = collectQueueStatuses(CHANGE_QUEUE_STATUS_BY_ROLE, APPROVAL_QUEUE_STATUS_BY_ROLE);
const SERVER_ROOM_QUEUE_FETCH_STATUSES = ['Pending_Approval'];
const ISSUE_DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
const PageLoadingFallback = () => (
    <div className="glass-card rounded-3xl p-10 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
        กำลังโหลดหน้า...
    </div>
);

const normalizePathname = (pathname = '/') => {
    const normalized = `/${String(pathname).replace(/^\/+|\/+$/g, '')}`;
    return normalized === '/' ? '/' : normalized.toLowerCase();
};

const getWorkflowTab = (params) =>
    Object.entries(WORKFLOW_QUERY_TABS).find(([queryKey]) => params.has(queryKey))?.[1] || null;

const getRouteFromPathname = (pathname) => {
    const normalizedPathname = normalizePathname(pathname);
    const adminRoute = Object.entries(ADMIN_SUB_TAB_PATHS)
        .find(([, path]) => normalizedPathname === `/admin/${path}`);
    if (adminRoute) return { activeTab: 'admin', adminSubTab: adminRoute[0] };

    const activeTab = Object.entries(TAB_PATHS)
        .find(([, path]) => normalizedPathname === path)?.[0];
    return activeTab ? { activeTab } : null;
};

const getPathForTab = (activeTab, adminSubTab) => {
    if (activeTab === 'admin' && adminSubTab && ADMIN_SUB_TAB_PATHS[adminSubTab]) {
        return `/admin/${ADMIN_SUB_TAB_PATHS[adminSubTab]}`;
    }
    return TAB_PATHS[activeTab] || '/';
};

const updateBrowserPath = (path, { replace = false } = {}) => {
    if (normalizePathname(window.location.pathname) === normalizePathname(path) && !window.location.search) return;
    window.history[replace ? 'replaceState' : 'pushState']({}, document.title, path);
};

const normalizeIssueDuplicateValue = (value) =>
    String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

const buildIssueDuplicateKey = (issue) => [
    issue.name,
    issue.department,
    issue.category,
    issue.severity,
    issue.description,
    issue.assetId ?? issue.asset_id ?? '',
    issue.assetName ?? issue.asset_name ?? '',
].map(normalizeIssueDuplicateValue).join('|');

function App() {
    const [activeTab, setActiveTab] = useState(() => {
        // หากเปิดจาก QR Code (มี assetId) หรือลิงก์ขอสิทธิ์
        const params = new URLSearchParams(window.location.search);
        const workflowTab = getWorkflowTab(params);
        if (workflowTab) return workflowTab;
        if (params.has('assetId')) return 'user';
        const route = getRouteFromPathname(window.location.pathname);
        if (route) return route.activeTab;
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
    const [waitingPartsIssueId] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('waitingPartsIssue');
    });
    const [returnBorrowIssueId] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('returnBorrowIssue');
    });
    const [acceptChangeRequestId] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('acceptChangeReq');
    });
    const [ackAccessRequestId] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('ackAccessReq');
    });
    const [adminSubTab, setAdminSubTab] = useState(() =>
        getRouteFromPathname(window.location.pathname)?.adminSubTab ||
        localStorage.getItem(ADMIN_SUB_TAB_STORAGE_KEY) ||
        'issues'
    ); // 'issues' or 'users'
    const [issues, setIssues] = useState([]);
    const [isIssuesLoading, setIsIssuesLoading] = useState(true);
    const [isAdminAuth, setIsAdminAuth] = useState(null);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [isSidebarAccountOpen, setIsSidebarAccountOpen] = useState(false);
    const [isMainMoreOpen, setIsMainMoreOpen] = useState(false);
    const [isAdminMoreOpen, setIsAdminMoreOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true');
    const [openAdminSubmenus, setOpenAdminSubmenus] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem(ADMIN_SUBMENU_STORAGE_KEY) || '{"assets":true}');
        } catch {
            return { assets: true };
        }
    });
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [profileForm, setProfileForm] = useState({ username: '', name: '', position: '', signature: '', password: '' });
    const [approvalQueues, setApprovalQueues] = useState({ access: [], change: [], serverRoom: [] });
    const profileSignatureRef = useRef(null);
    const sessionRefreshRef = useRef({ inFlight: false, lastAt: 0 });
    const currentRole = normalizeRole(isAdminAuth);
    const adminNavItem = MAIN_NAV_ITEMS.find((item) => item.id === 'admin');
    const visibleMainNavItems = MAIN_NAV_ITEMS.filter((item) =>
        item.id !== 'admin' &&
        canSee(item.roles, currentRole) &&
        (!isAdminAuth || !AUTH_HIDDEN_MAIN_NAV_ITEMS.has(item.id))
    );
    const visibleAdminSubTabs = ADMIN_SUB_TABS.filter((item) => canSee(item.roles, currentRole));
    const visibleAdminRootTabs = visibleAdminSubTabs.filter((item) => !item.parentId);
    const adminSubTabsByParent = visibleAdminSubTabs.reduce((groups, item) => {
        if (!item.parentId) return groups;
        return {
            ...groups,
            [item.parentId]: [...(groups[item.parentId] || []), item],
        };
    }, {});
    const mainBottomItems = visibleMainNavItems.length > BOTTOM_NAV_VISIBLE_LIMIT
        ? visibleMainNavItems.slice(0, BOTTOM_NAV_VISIBLE_LIMIT)
        : visibleMainNavItems;
    const mainMoreItems = visibleMainNavItems.length > BOTTOM_NAV_VISIBLE_LIMIT
        ? visibleMainNavItems.slice(BOTTOM_NAV_VISIBLE_LIMIT)
        : [];
    const adminBottomItems = visibleAdminSubTabs.length > BOTTOM_NAV_VISIBLE_LIMIT
        ? visibleAdminSubTabs.slice(0, BOTTOM_NAV_VISIBLE_LIMIT)
        : visibleAdminSubTabs;
    const adminMoreItems = visibleAdminSubTabs.length > BOTTOM_NAV_VISIBLE_LIMIT
        ? visibleAdminSubTabs.slice(BOTTOM_NAV_VISIBLE_LIMIT)
        : [];
    const selectedAdminSubTab = visibleAdminSubTabs.some((item) => item.id === adminSubTab)
        ? adminSubTab
        : visibleAdminSubTabs[0]?.id;
    const isMainMoreSelected = mainMoreItems.some((item) => item.tab === activeTab);
    const isAdminMoreSelected = adminMoreItems.some((item) => item.id === selectedAdminSubTab);
    const isStandaloneSignaturePage = activeTab === 'issue_close' || activeTab === 'issue_waiting_parts' || activeTab === 'change_request_acceptance' || activeTab === 'access_request_acknowledgement';

    // QR parameters are consumed once. Workflow parameters stay in the URL so shared links survive refresh.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (window.location.search && !getWorkflowTab(params)) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, []);

    useEffect(() => {
        if (TRANSIENT_TABS.has(activeTab)) return;
        localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
        updateBrowserPath(getPathForTab(activeTab, activeTab === 'admin' ? adminSubTab : null), { replace: true });
    }, [activeTab, adminSubTab]);

    useEffect(() => {
        const handlePopState = () => {
            const params = new URLSearchParams(window.location.search);
            const workflowTab = getWorkflowTab(params);
            if (workflowTab) {
                setActiveTab(workflowTab);
                return;
            }

            const route = getRouteFromPathname(window.location.pathname);
            if (!route) {
                window.history.replaceState({}, document.title, '/');
                setActiveTab('home');
                return;
            }

            setActiveTab(route.activeTab);
            if (route.adminSubTab) setAdminSubTab(route.adminSubTab);
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    useEffect(() => {
        localStorage.setItem(ADMIN_SUB_TAB_STORAGE_KEY, adminSubTab);
    }, [adminSubTab]);

    useEffect(() => {
        localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isSidebarCollapsed));
    }, [isSidebarCollapsed]);

    useEffect(() => {
        localStorage.setItem(ADMIN_SUBMENU_STORAGE_KEY, JSON.stringify(openAdminSubmenus));
    }, [openAdminSubmenus]);

    useEffect(() => {
        if (!isAdminAuth || TRANSIENT_TABS.has(activeTab)) return;
        if (activeTab === 'tracking' || activeTab.startsWith('request_tracking')) return;
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
            setApprovalQueues({ access: [], change: [], serverRoom: [] });
            setIsProfileMenuOpen(false);
            setIsProfileModalOpen(false);
            setIsMainMoreOpen(false);
            setIsAdminMoreOpen(false);
            return;
        }

        const fetchApprovalQueues = async () => {
            const [accessResult, changeResult, serverRoomResult] = await Promise.all([
                mysql.from('access_requests').select('id, status').in('status', ACCESS_QUEUE_FETCH_STATUSES),
                mysql.from('change_requests').select('id, status, request_category').in('status', CHANGE_QUEUE_FETCH_STATUSES),
                mysql.from('controlled_area_logs').select('id, status').in('status', SERVER_ROOM_QUEUE_FETCH_STATUSES)
            ]);
            setApprovalQueues({
                access: accessResult.error ? [] : accessResult.data || [],
                change: changeResult.error ? [] : changeResult.data || [],
                serverRoom: serverRoomResult.error ? [] : serverRoomResult.data || []
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
                if (data.password_change_required) {
                    handleAdminLogout();
                    Swal.fire('ต้องเปลี่ยนรหัสผ่าน', 'กรุณาเข้าสู่ระบบอีกครั้งเพื่อตั้งรหัสผ่านใหม่', 'warning');
                    return;
                }
                handleCurrentAdminUpdated(data);
            }
        };

        refreshCurrentAdmin();
        return () => {
            cancelled = true;
        };
    }, [isAdminAuth?.id]);

    useEffect(() => {
        if (!isAdminAuth?.session_expires_at) return;

        const remainingTime = new Date(isAdminAuth.session_expires_at).getTime() - Date.now();
        const handleSessionTimeout = () => {
            handleAdminLogout();
            Swal.fire('หมดเวลาเข้าสู่ระบบ', 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง', 'warning');
        };

        if (remainingTime <= 0) {
            handleSessionTimeout();
            return;
        }

        const timeoutId = setTimeout(handleSessionTimeout, remainingTime);
        return () => clearTimeout(timeoutId);
    }, [isAdminAuth?.session_expires_at]);

    useEffect(() => {
        if (!isAdminAuth?.id || !isAdminAuth?.token) return;

        let cancelled = false;

        const extendLocalSession = () => {
            const sessionTimeoutMinutes = Number(isAdminAuth.session_timeout_minutes);
            if (!Number.isFinite(sessionTimeoutMinutes) || sessionTimeoutMinutes <= 0) return;

            const session_expires_at = new Date(Date.now() + sessionTimeoutMinutes * 60 * 1000).toISOString();
            setIsAdminAuth((previousAuth) => {
                if (!previousAuth) return previousAuth;
                const nextAuth = { ...previousAuth, session_expires_at };
                localStorage.setItem('it-helpdesk-admin-auth', JSON.stringify(nextAuth));
                return nextAuth;
            });
        };

        const refreshSession = async ({ force = false } = {}) => {
            const now = Date.now();
            const refreshState = sessionRefreshRef.current;
            extendLocalSession();
            if (refreshState.inFlight) return;
            if (!force && now - refreshState.lastAt < SESSION_REFRESH_THROTTLE_MS) return;

            refreshState.inFlight = true;
            refreshState.lastAt = now;

            const { data, error, status } = await getAdminProfile();
            refreshState.inFlight = false;
            if (cancelled) return;

            if (error) {
                if (status === 401) {
                    handleAdminLogout();
                    Swal.fire('หมดเวลาเข้าสู่ระบบ', 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง', 'warning');
                }
                return;
            }

            if (data?.password_change_required) {
                handleAdminLogout();
                Swal.fire('ต้องเปลี่ยนรหัสผ่าน', 'กรุณาเข้าสู่ระบบอีกครั้งเพื่อตั้งรหัสผ่านใหม่', 'warning');
                return;
            }

            if (data) handleCurrentAdminUpdated(data);
        };

        const handleActivity = () => {
            refreshSession();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                refreshSession({ force: true });
            }
        };

        SESSION_ACTIVITY_EVENTS.forEach((eventName) => {
            window.addEventListener(eventName, handleActivity, { passive: true });
        });
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            cancelled = true;
            SESSION_ACTIVITY_EVENTS.forEach((eventName) => {
                window.removeEventListener(eventName, handleActivity);
            });
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isAdminAuth?.id, isAdminAuth?.token, isAdminAuth?.session_timeout_minutes]);

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
            const now = new Date();
            const autoClosePayloads = data
                .filter(issue => {
                    if (issue.status !== 'Resolved' || issue.user_closed_at || issue.user_close_sign) return false;
                    const closeLinkCreatedAt = issue.inspector_signed_at;
                    const closeLinkDate = closeLinkCreatedAt ? new Date(closeLinkCreatedAt) : null;
                    return closeLinkDate && !Number.isNaN(closeLinkDate.getTime()) && now - closeLinkDate >= AUTO_CLOSE_AFTER_MS;
                })
                .map(issue => ({
                    id: issue.id,
                    name: issue.name,
                    closedAt: toMysqlDateTime(now)
                }));

            if (autoClosePayloads.length > 0) {
                await Promise.all(autoClosePayloads.map(({ id, name, closedAt }) =>
                    mysql
                        .from('issues')
                        .update({
                            status: 'Closed',
                            user_close_name: name,
                            user_close_note: 'Auto closed after requester did not sign within 3 days.',
                            user_closed_at: closedAt
                        })
                        .eq('id', id)
                ));
            }

            const autoClosedById = new Map(autoClosePayloads.map(item => [item.id, item]));

            // Map snake_case from DB to camelCase for frontend
            const formattedIssues = data.map(issue => {
                const autoClosed = autoClosedById.get(issue.id);
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
                status: autoClosed ? 'Closed' : issue.status,
                repairDetails: issue.repair_details,
                assignedAdmin: issue.assigned_admin || null,
                assetId: issue.asset_id || null,
                assetName: issue.asset_name || null,
                assetType: issue.asset_type || null,
                assetLocation: issue.asset_location || null,
                operationStartedAt: issue.operation_started_at || null,
                budget: issue.budget ?? null,
                attachments,
                userCloseName: autoClosed?.name || issue.user_close_name || null,
                userClosePosition: issue.user_close_position || null,
                userCloseNote: autoClosed ? 'Auto closed after requester did not sign within 3 days.' : issue.user_close_note || null,
                userCloseSign: issue.user_close_sign || null,
                userClosedAt: autoClosed?.closedAt || issue.user_closed_at || null,
                inspectorName: issue.inspector_name || null,
                inspectorPosition: issue.inspector_position || null,
                inspectorSign: issue.inspector_sign || null,
                inspectorSignedAt: issue.inspector_signed_at || null,
                waitingPartsUserName: issue.waiting_parts_user_name || null,
                waitingPartsUserPosition: issue.waiting_parts_user_position || null,
                waitingPartsUserSign: issue.waiting_parts_user_sign || null,
                waitingPartsSignedAt: issue.waiting_parts_signed_at || null,
                borrowReturnerName: issue.borrow_returner_name || null,
                borrowReturnerPosition: issue.borrow_returner_position || null,
                borrowReturnerSign: issue.borrow_returner_sign || null,
                borrowReturnedAt: issue.borrow_returned_at || null,
                borrowReceiverName: issue.borrow_receiver_name || null,
                borrowReceiverPosition: issue.borrow_receiver_position || null,
                borrowReceiverSign: issue.borrow_receiver_sign || null,
                borrowReceivedAt: issue.borrow_received_at || null,
                createdAt: issue.created_at
                });
            });
            setIssues(formattedIssues);
        }
        if (!silent) setIsIssuesLoading(false);
    };

    const addIssue = async (newIssue) => {
        const createdAt = new Date(newIssue.createdAt || Date.now());
        const duplicateWindowStart = new Date(createdAt.getTime() - ISSUE_DUPLICATE_WINDOW_MS);
        const duplicateKey = buildIssueDuplicateKey(newIssue);
        const { data: recentIssues, error: duplicateCheckError } = await mysql
            .from('issues')
            .select('id, name, department, category, severity, description, asset_id, asset_name, created_at')
            .gte('created_at', toMysqlDateTime(duplicateWindowStart))
            .lte('created_at', toMysqlDateTime(new Date(createdAt.getTime() + 5000)))
            .limit(50);

        if (duplicateCheckError) {
            console.warn('Duplicate issue check failed:', duplicateCheckError);
        } else {
            const duplicateIssue = (recentIssues || []).find((issue) => buildIssueDuplicateKey(issue) === duplicateKey);
            if (duplicateIssue) {
                setIssues((currentIssues) => {
                    if (currentIssues.some((issue) => issue.id === duplicateIssue.id)) return currentIssues;
                    return [{
                        ...newIssue,
                        id: duplicateIssue.id,
                        repairDetails: '',
                        assignedAdmin: null,
                        attachments: newIssue.attachments || [],
                        createdAt: duplicateIssue.created_at || newIssue.createdAt,
                    }, ...currentIssues];
                });
                return duplicateIssue.id;
            }
        }

        const { generatedTicket: issueId } = await insertWithMonthlyDocumentNumber({
            mysql,
            table: 'issues',
            prefix: 'IT-',
            numberColumn: 'id',
            buildRow: (documentNumber) => ({
                id: documentNumber,
                name: newIssue.name,
                department: newIssue.department,
                category: newIssue.category,
                severity: newIssue.severity,
                description: newIssue.description,
                status: newIssue.status,
                repair_details: '',
                asset_id: newIssue.assetId || null,
                asset_name: newIssue.assetName || null,
                asset_type: newIssue.assetType || null,
                asset_location: newIssue.assetLocation || null,
                attachments_json: JSON.stringify(newIssue.attachments || []),
                created_at: toMysqlDateTime(newIssue.createdAt)
            }),
        });
        const issueWithId = {
            ...newIssue,
            id: issueId,
            repairDetails: '',
            assignedAdmin: null,
            attachments: newIssue.attachments || []
        };

        // Update local state to reflect change immediately
        setIssues((currentIssues) => [issueWithId, ...currentIssues]);

        // Send Telegram notification
        notifyNewIssue(issueWithId);
        return issueId;
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

    const updateIssueFullDetails = async (id, updatedFields, options = {}) => {
        const dbFields = {};
        if (updatedFields.name !== undefined) dbFields.name = updatedFields.name;
        if (updatedFields.department !== undefined) dbFields.department = updatedFields.department;
        if (updatedFields.category !== undefined) dbFields.category = updatedFields.category;
        if (updatedFields.severity !== undefined) dbFields.severity = updatedFields.severity;
        if (updatedFields.description !== undefined) dbFields.description = updatedFields.description;
        if (updatedFields.repairDetails !== undefined) dbFields.repair_details = updatedFields.repairDetails;
        if (updatedFields.assignedAdmin !== undefined) dbFields.assigned_admin = updatedFields.assignedAdmin || null;
        if (updatedFields.assetId !== undefined) dbFields.asset_id = updatedFields.assetId || null;
        if (updatedFields.assetName !== undefined) dbFields.asset_name = updatedFields.assetName || null;
        if (updatedFields.assetType !== undefined) dbFields.asset_type = updatedFields.assetType || null;
        if (updatedFields.assetLocation !== undefined) dbFields.asset_location = updatedFields.assetLocation || null;
        if (updatedFields.operationStartedAt !== undefined) dbFields.operation_started_at = updatedFields.operationStartedAt ? toMysqlDateTime(updatedFields.operationStartedAt) : null;
        if (updatedFields.budget !== undefined) dbFields.budget = updatedFields.budget === '' ? null : updatedFields.budget;
        if (updatedFields.inspectorName !== undefined) dbFields.inspector_name = updatedFields.inspectorName || null;
        if (updatedFields.inspectorPosition !== undefined) dbFields.inspector_position = updatedFields.inspectorPosition || null;
        if (updatedFields.inspectorSign !== undefined) dbFields.inspector_sign = updatedFields.inspectorSign || null;
        if (updatedFields.inspectorSignedAt !== undefined) dbFields.inspector_signed_at = updatedFields.inspectorSignedAt ? toMysqlDateTime(updatedFields.inspectorSignedAt) : null;
        if (updatedFields.waitingPartsUserName !== undefined) dbFields.waiting_parts_user_name = updatedFields.waitingPartsUserName || null;
        if (updatedFields.waitingPartsUserPosition !== undefined) dbFields.waiting_parts_user_position = updatedFields.waitingPartsUserPosition || null;
        if (updatedFields.waitingPartsUserSign !== undefined) dbFields.waiting_parts_user_sign = updatedFields.waitingPartsUserSign || null;
        if (updatedFields.waitingPartsSignedAt !== undefined) dbFields.waiting_parts_signed_at = updatedFields.waitingPartsSignedAt ? toMysqlDateTime(updatedFields.waitingPartsSignedAt) : null;
        if (updatedFields.borrowReturnerName !== undefined) dbFields.borrow_returner_name = updatedFields.borrowReturnerName || null;
        if (updatedFields.borrowReturnerPosition !== undefined) dbFields.borrow_returner_position = updatedFields.borrowReturnerPosition || null;
        if (updatedFields.borrowReturnerSign !== undefined) dbFields.borrow_returner_sign = updatedFields.borrowReturnerSign || null;
        if (updatedFields.borrowReturnedAt !== undefined) dbFields.borrow_returned_at = updatedFields.borrowReturnedAt ? toMysqlDateTime(updatedFields.borrowReturnedAt) : null;
        if (updatedFields.borrowReceiverName !== undefined) dbFields.borrow_receiver_name = updatedFields.borrowReceiverName || null;
        if (updatedFields.borrowReceiverPosition !== undefined) dbFields.borrow_receiver_position = updatedFields.borrowReceiverPosition || null;
        if (updatedFields.borrowReceiverSign !== undefined) dbFields.borrow_receiver_sign = updatedFields.borrowReceiverSign || null;
        if (updatedFields.borrowReceivedAt !== undefined) dbFields.borrow_received_at = updatedFields.borrowReceivedAt ? toMysqlDateTime(updatedFields.borrowReceivedAt) : null;
        if (updatedFields.attachments !== undefined) dbFields.attachments_json = JSON.stringify(updatedFields.attachments || []);

        const { error } = await mysql
            .from('issues')
            .update(dbFields)
            .eq('id', id);

        if (error) {
            console.error("Error updating full issue details:", error);
            Swal.fire('Error', 'ไม่สามารถอัปเดตข้อมูลได้', 'error');
            return false;
        }

        setIssues(currentIssues => currentIssues.map(issue =>
            issue.id === id ? { ...issue, ...updatedFields } : issue
        ));
        if (!options.silent) {
            Swal.fire({
                title: 'บันทึกสำเร็จ!',
                text: 'แก้ไขข้อมูลการแจ้งซ่อมเรียบร้อยแล้ว',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            });
        }
        return true;
    };

    const updateIssueStatus = async (id, newStatus, adminName = null) => {
        if (newStatus === 'Closed') {
            Swal.fire('ไม่สามารถปิดจบจากหน้านี้ได้', 'สถานะปิดจบจะเปลี่ยนหลังจากผู้แจ้งเซ็นยืนยันเท่านั้น', 'warning');
            return false;
        }

        const updateData = { status: newStatus };
        const currentIssue = issues.find(issue => issue.id === id);
        const shouldSetOperationStartedAt =
            ['In Progress', 'External Repair', 'Waiting for Parts'].includes(newStatus) &&
            !currentIssue?.operationStartedAt;
        const operationStartedAt = shouldSetOperationStartedAt ? toMysqlDateTime() : null;
        if (adminName) {
            updateData.assigned_admin = adminName;
        }
        if (operationStartedAt) {
            updateData.operation_started_at = operationStartedAt;
        }
        const { error } = await mysql
            .from('issues')
            .update(updateData)
            .eq('id', id);

        if (error) {
            console.error("Error updating status:", error);
            Swal.fire('Error', 'ไม่สามารถอัปเดตสถานะได้', 'error');
            return false;
        }

        setIssues(currentIssues => currentIssues.map(issue => {
            if (issue.id === id) {
                return {
                    ...issue,
                    status: newStatus,
                    ...(adminName && { assignedAdmin: adminName }),
                    ...(operationStartedAt && { operationStartedAt }),
                    ...(updateData.user_close_name && { userCloseName: updateData.user_close_name }),
                    ...(updateData.user_close_note && { userCloseNote: updateData.user_close_note }),
                    ...(updateData.user_closed_at && { userClosedAt: updateData.user_closed_at })
                };
            }
            return issue;
        }));

        const updatedIssue = {
            ...issues.find(i => i.id === id),
            status: newStatus,
            ...(adminName && { assignedAdmin: adminName }),
            ...(operationStartedAt && { operationStartedAt }),
            ...(updateData.user_close_name && { userCloseName: updateData.user_close_name }),
            ...(updateData.user_close_note && { userCloseNote: updateData.user_close_note }),
            ...(updateData.user_closed_at && { userClosedAt: updateData.user_closed_at }),
        };

        if (updatedIssue?.id) {
            const closeLink =
                newStatus === 'Resolved' ? buildCloseIssueLink(id) : null;
            notifyStatusChange(updatedIssue, newStatus, closeLink);

            if (newStatus === 'Resolved' && !updatedIssue.userCloseSign) {
                await showCloseIssueLinkDialog(updatedIssue);
            }
        }
        return true;
    };

    const closeIssueByUser = async (id, closeData) => {
        const payload = {
            status: 'Closed',
            user_close_name: closeData.name,
            user_close_position: closeData.position,
            user_close_note: closeData.note || '',
            user_close_sign: closeData.signature,
            user_closed_at: toMysqlDateTime(),
            ...(closeData.attachments !== undefined ? { attachments_json: JSON.stringify(closeData.attachments || []) } : {})
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

        setIssues(currentIssues => currentIssues.map(issue => issue.id === id ? {
            ...issue,
            status: 'Closed',
            userCloseName: closeData.name,
            userClosePosition: closeData.position,
            userCloseNote: closeData.note || '',
            userCloseSign: closeData.signature,
            userClosedAt: payload.user_closed_at,
            ...(closeData.attachments !== undefined ? { attachments: closeData.attachments || [] } : {})
        } : issue));
        return true;
    };

    const signWaitingPartsIssueByUser = async (id, signData) => {
        const payload = {
            waiting_parts_user_name: signData.name,
            waiting_parts_user_position: signData.position,
            waiting_parts_user_sign: signData.signature,
            waiting_parts_signed_at: signData.signedAt || toMysqlDateTime(),
        };

        const { error } = await mysql
            .from('issues')
            .update(payload)
            .eq('id', id);

        if (error) {
            console.error("Error signing waiting parts issue:", error);
            Swal.fire('Error', 'ไม่สามารถบันทึกลายเซ็นรับทราบการเปิด PR ขอซื้ออะไหล่ได้', 'error');
            return false;
        }

        setIssues(currentIssues => currentIssues.map(issue => issue.id === id ? {
            ...issue,
            waitingPartsUserName: signData.name,
            waitingPartsUserPosition: signData.position,
            waitingPartsUserSign: signData.signature,
            waitingPartsSignedAt: payload.waiting_parts_signed_at,
        } : issue));
        return true;
    };

    const returnBorrowIssueByUser = async (id, returnData) => {
        const payload = {
            borrow_returner_name: returnData.name,
            borrow_returner_position: returnData.position,
            borrow_returner_sign: returnData.signature,
            borrow_returned_at: returnData.returnedAt || toMysqlDateTime(),
        };

        const { error } = await mysql
            .from('issues')
            .update(payload)
            .eq('id', id);

        if (error) {
            console.error('Error saving borrow return:', error);
            Swal.fire('Error', 'ไม่สามารถบันทึกข้อมูลส่งคืนได้', 'error');
            return false;
        }

        setIssues(currentIssues => currentIssues.map(issue => issue.id === id ? {
            ...issue,
            borrowReturnerName: returnData.name,
            borrowReturnerPosition: returnData.position,
            borrowReturnerSign: returnData.signature,
            borrowReturnedAt: payload.borrow_returned_at,
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
        setIsSidebarAccountOpen(false);
        setIsProfileModalOpen(false);
        localStorage.setItem('it-helpdesk-admin-auth', JSON.stringify(null));
        setActiveTab('admin');
    };

    const handleProfileSettings = () => {
        setIsProfileMenuOpen(false);
        setIsSidebarAccountOpen(false);
        setProfileForm({
            username: isAdminAuth?.username || '',
            name: isAdminAuth?.name || '',
            position: isAdminAuth?.position || '',
            signature: isAdminAuth?.signature || '',
            password: ''
        });
        setIsProfileModalOpen(true);
    };

    useEffect(() => {
        if (!isProfileModalOpen) return;
        loadSignatureIntoCanvas(profileSignatureRef, profileForm.signature);
    }, [isProfileModalOpen]);

    const handleProfileFormChange = (event) => {
        const { name, value } = event.target;
        setProfileForm((previous) => ({ ...previous, [name]: value }));
    };

    const handleProfileSubmit = async (event) => {
        event.preventDefault();

        if (!profileForm.username.trim() || !profileForm.name.trim() || !profileForm.position.trim()) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอกชื่อผู้ใช้ ชื่อที่แสดง และตำแหน่ง', 'warning');
            return;
        }
        const passwordErrors = profileForm.password ? getPasswordPolicyErrors(profileForm.password) : [];
        if (passwordErrors.length > 0) {
            Swal.fire('รหัสผ่านไม่ผ่านนโยบาย', `รหัสผ่านยังขาด: ${passwordErrors.join(', ')}`, 'warning');
            return;
        }

        setIsSavingProfile(true);
        const signature = profileSignatureRef.current && !profileSignatureRef.current.isEmpty()
            ? profileSignatureRef.current.getCanvas().toDataURL('image/png')
            : '';
        const { data, error, status } = await updateAdminProfile({
            username: profileForm.username,
            name: profileForm.name,
            position: profileForm.position,
            signature,
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

    const navigateToTab = (nextTab, { replace = false } = {}) => {
        updateBrowserPath(getPathForTab(nextTab, nextTab === 'admin' ? adminSubTab : null), { replace });
        setActiveTab(nextTab);
    };

    const renderContent = () => {
        if (activeTab === 'home') {
            return <HomePage onNavigateTo={navigateToTab} currentRole={currentRole} />;
        }

        if (activeTab === 'user') {
            return <IssueForm addIssue={addIssue} qrParams={qrParams} />;
        }

        if (activeTab === 'ai_helpdesk') {
            return <AIHelpdesk />;
        }

        if (activeTab === 'tracking') {
            return <IssueTracking issues={issues} isLoading={isIssuesLoading} />;
        }

        if (activeTab === 'request_tracking') {
            return <RequestTracking />;
        }

        if (activeTab === 'request_tracking_access') {
            return <RequestTracking initialType="access" />;
        }

        if (activeTab === 'request_tracking_change') {
            return <RequestTracking initialType="change" />;
        }

        if (activeTab === 'access_request') {
            return <UserAccessRequestForm />;
        }

        if (activeTab === 'change_request') {
            return <ChangeRequestForm />;
        }

        if (activeTab === 'controlled_area') {
            return <ControlledAreaEntryForm />;
        }

        if (activeTab === 'issue_close') {
            return <IssueCloseSignature issueId={closeIssueId} onCloseIssue={closeIssueByUser} />;
        }

        if (activeTab === 'issue_waiting_parts') {
            return <IssueWaitingPartsSignature issueId={waitingPartsIssueId} onSignWaitingPartsIssue={signWaitingPartsIssueByUser} />;
        }

        if (activeTab === 'borrow_return') {
            return <BorrowReturnSignature issueId={returnBorrowIssueId} onReturnBorrowIssue={returnBorrowIssueByUser} />;
        }

        if (activeTab === 'change_request_acceptance') {
            return <ChangeRequestAcceptance requestId={acceptChangeRequestId} />;
        }

        if (activeTab === 'access_request_acknowledgement') {
            return <AccessRequestAcknowledgement requestId={ackAccessRequestId} />;
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
                        <div className="hidden">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
                                    {isAdminAuth.name.charAt(0)}
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{isAdminAuth.name}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{ROLE_LABELS[currentRole] || ROLE_LABELS[isAdminAuth.role] || 'IT Support'}</p>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
                                <div className="flex flex-wrap bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-xl w-auto gap-1">
                                    {visibleAdminSubTabs.map((item) => {
                                        const Icon = item.icon;
                                        const pendingCount = getAdminNavPendingCount(item.id);
                                        return (
                                            <button
                                                key={item.id}
                                                onClick={() => {
                                                    if (item.id === 'issues') fetchIssues();
                                                    setAdminSubTab(item.id);
                                                }}
                                                className={`px-1 xl:px-4 py-2 xl:py-1.5 rounded-lg font-medium transition-all flex flex-col xl:flex-row items-center justify-center gap-1 xl:gap-1.5 ${selectedAdminSubTab === item.id ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-md xl:shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                            >
                                                <span className="relative">
                                                    <Icon className={`w-[18px] h-[18px] xl:w-4 xl:h-4 ${item.iconColor || ''}`} />
                                                    {pendingCount > 0 && (
                                                        <span className="absolute -right-2 -top-2 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center shadow">
                                                            {pendingCount > 99 ? '99+' : pendingCount}
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="text-[11px] xl:text-sm whitespace-nowrap">{item.label}</span>
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
                        ) : selectedAdminSubTab === 'asset_pm' ? (
                            <AssetInventory issues={issues} view="pm" />
                        ) : selectedAdminSubTab === 'access_requests' ? (
                            <AdminAccessRequests currentAdmin={isAdminAuth} />
                        ) : selectedAdminSubTab === 'change_requests' ? (
                            <AdminChangeRequests currentAdmin={isAdminAuth} />
                        ) : selectedAdminSubTab === 'approved_documents' ? (
                            <ApprovedDocuments currentAdmin={isAdminAuth} />
                        ) : selectedAdminSubTab === 'server_room' ? (
                            <ServerRoomManagement currentAdmin={isAdminAuth} />
                        ) : selectedAdminSubTab === 'stats' ? (
                            <IssueStatistics issues={issues} currentAdmin={isAdminAuth} />
                        ) : selectedAdminSubTab === 'employees' ? (
                            <EmployeeManagement currentAdmin={isAdminAuth} />
                        ) : selectedAdminSubTab === 'users' ? (
                            <UserManagement
                                currentAdmin={isAdminAuth}
                                onAuthExpired={handleAdminLogout}
                                onCurrentAdminUpdated={handleCurrentAdminUpdated}
                            />
                        ) : (
                            <EmployeeManagement currentAdmin={isAdminAuth} />
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
        navigateToTab(item.tab);
        setIsMainMoreOpen(false);
        setIsAdminMoreOpen(false);
    };

    const handleAdminBottomNavClick = (item) => {
        if (item.id === 'issues') fetchIssues();
        updateBrowserPath(getPathForTab('admin', item.id));
        setActiveTab('admin');
        setAdminSubTab(item.id);
        setIsAdminMoreOpen(false);
        setIsMainMoreOpen(false);
    };

    const getAdminNavPendingCount = (itemId) => {
        if (itemId === 'access_requests') {
            return countVisibleQueue(approvalQueues.access, currentRole, ACCESS_QUEUE_STATUS_BY_ROLE);
        }
        if (itemId === 'change_requests') {
            return countVisibleQueue(approvalQueues.change, currentRole, CHANGE_QUEUE_STATUS_BY_ROLE, canHandleChangeRequestCategory);
        }
        if (itemId === 'approved_documents') {
            const serverRoomApprovalCount = canApproveServerRoomEntry(currentRole)
                ? approvalQueues.serverRoom.filter((item) => item.status === 'Pending_Approval').length
                : 0;
            return countVisibleQueue(approvalQueues.access, currentRole, APPROVAL_QUEUE_STATUS_BY_ROLE)
                + countVisibleQueue(approvalQueues.change, currentRole, APPROVAL_QUEUE_STATUS_BY_ROLE, (_role, item) => item.status !== 'Pending_IT_Supervisor')
                + serverRoomApprovalCount;
        }
        if (itemId === 'server_room') {
            return 0;
        }
        return 0;
    };

    const handleAdminSidebarClick = (item) => {
        handleAdminBottomNavClick(item);
    };

    const toggleAdminSubmenu = (itemId) => {
        setOpenAdminSubmenus((current) => ({
            ...current,
            [itemId]: !current[itemId],
        }));
    };

    return (
        <div className="min-h-screen font-sans text-slate-800 dark:text-slate-200 flex flex-col relative w-full overflow-x-hidden">
            {!isStandaloneSignaturePage && <aside className={`hidden xl:flex fixed inset-y-0 left-0 z-[60] flex-col border-r border-slate-200/80 bg-white/95 py-5 shadow-xl shadow-slate-200/50 backdrop-blur-xl transition-[width,padding] duration-300 dark:border-slate-800 dark:bg-slate-950/95 dark:shadow-slate-950/40 ${isSidebarCollapsed ? 'w-20 px-2' : 'w-80 px-5'}`}>
                <div className={`flex items-center border-b border-slate-100 pb-5 dark:border-slate-800 ${isSidebarCollapsed ? 'justify-center' : 'gap-3 px-2'}`}>
                    <div className="bg-indigo-600 dark:bg-indigo-500 text-white p-2 rounded-xl shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30">
                        <Monitor className="w-6 h-6" />
                    </div>
                    <div className={`min-w-0 ${isSidebarCollapsed ? 'hidden' : ''}`}>
                        <h1 className="text-lg font-bold tracking-tight text-slate-800 dark:text-white leading-tight">IT HELPDESK</h1>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium tracking-wide">SUPPORT SYSTEM</p>
                    </div>
                </div>

                <div className={`flex-1 overflow-y-auto py-5 ${isSidebarCollapsed ? '' : 'pr-1'}`}>
                    <div className="space-y-1">
                        <p className={`px-3 pb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 ${isSidebarCollapsed ? 'hidden' : ''}`}>Main Menu</p>
                        {visibleMainNavItems.map((item) => {
                            const Icon = item.icon;
                            const isSelected = activeTab === item.tab;
                            const isPrimary = item.variant === 'primary';
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => handleNavClick(item)}
                                    className={`sidebar-nav-button ${isSelected ? 'is-active' : ''} w-full min-w-0 rounded-xl py-2.5 text-left transition-colors flex items-center ${isSidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3'} ${isSelected ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:bg-indigo-500 dark:shadow-indigo-950/40' : isPrimary ? 'text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/40' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'}`}
                                    title={isSidebarCollapsed ? item.label : undefined}
                                >
                                    <span className="sidebar-nav-icon" style={{ '--sidebar-icon-aura': item.iconAura || '99, 102, 241' }}>
                                        <Icon className={`h-5 w-5 shrink-0 ${item.iconColor || ''}`} strokeWidth={isSelected ? 2.5 : 2} />
                                    </span>
                                    <span className={`truncate text-sm font-semibold ${isSidebarCollapsed ? 'hidden' : ''}`}>{item.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    {isAdminAuth && visibleAdminSubTabs.length > 0 && (
                        <div className={`${isSidebarCollapsed ? 'mt-3 border-t border-slate-100 pt-3 dark:border-slate-800' : 'mt-6'} space-y-1`}>
                            <p className={`px-3 pb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 ${isSidebarCollapsed ? 'hidden' : ''}`}>Admin Menu</p>
                            {visibleAdminRootTabs.map((item) => {
                                const Icon = item.icon;
                                const childItems = adminSubTabsByParent[item.id] || [];
                                const hasChildren = childItems.length > 0;
                                const isGroupOpen = Boolean(openAdminSubmenus[item.id]);
                                const isChildSelected = childItems.some((child) => selectedAdminSubTab === child.id);
                                const pendingCount = getAdminNavPendingCount(item.id);
                                const isSelected = activeTab === 'admin' && selectedAdminSubTab === item.id;
                                const isGroupActive = isSelected || (activeTab === 'admin' && isChildSelected);
                                return (
                                    <div key={item.id} className="space-y-1">
                                        <div className={`flex min-w-0 items-center gap-1 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                                            <button
                                                type="button"
                                                onClick={() => handleAdminSidebarClick(item)}
                                                className={`sidebar-nav-button ${isGroupActive ? 'is-active' : ''} min-w-0 flex-1 rounded-xl py-2.5 text-left transition-colors flex items-center ${isSidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3'} ${isSelected ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:bg-indigo-500 dark:shadow-indigo-950/40' : isGroupActive ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-200' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'}`}
                                                title={isSidebarCollapsed ? item.label : undefined}
                                            >
                                                <span className="sidebar-nav-icon relative shrink-0" style={{ '--sidebar-icon-aura': item.iconAura || '99, 102, 241' }}>
                                                    <Icon className={`h-5 w-5 ${item.iconColor || ''}`} strokeWidth={isGroupActive ? 2.5 : 2} />
                                                    {pendingCount > 0 && (
                                                        <span className="absolute -right-2.5 -top-2.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center shadow">
                                                            {pendingCount > 99 ? '99+' : pendingCount}
                                                        </span>
                                                    )}
                                                </span>
                                                <span className={`truncate text-sm font-semibold ${isSidebarCollapsed ? 'hidden' : ''}`}>{item.label}</span>
                                            </button>
                                            {hasChildren && !isSidebarCollapsed && (
                                                <button
                                                    type="button"
                                                    onClick={() => toggleAdminSubmenu(item.id)}
                                                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-sky-600 dark:hover:bg-slate-900 dark:hover:text-sky-300 ${isGroupOpen ? 'text-sky-600 dark:text-sky-300' : ''}`}
                                                    aria-label={isGroupOpen ? `หุบเมนูย่อย ${item.label}` : `กางเมนูย่อย ${item.label}`}
                                                    aria-expanded={isGroupOpen}
                                                >
                                                    <ChevronDown className={`h-4 w-4 transition-transform ${isGroupOpen ? 'rotate-180' : ''}`} />
                                                </button>
                                            )}
                                        </div>

                                        {hasChildren && !isSidebarCollapsed && isGroupOpen && (
                                            <div className="ml-7 space-y-1 border-l border-slate-200 pl-3 dark:border-slate-800">
                                                {childItems.map((child) => {
                                                    const ChildIcon = child.icon;
                                                    const childPendingCount = getAdminNavPendingCount(child.id);
                                                    const isChildActive = activeTab === 'admin' && selectedAdminSubTab === child.id;
                                                    return (
                                                        <button
                                                            key={child.id}
                                                            type="button"
                                                            onClick={() => handleAdminSidebarClick(child)}
                                                            className={`sidebar-nav-button ${isChildActive ? 'is-active' : ''} flex w-full min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors ${isChildActive ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:bg-indigo-500 dark:shadow-indigo-950/40' : 'text-slate-500 hover:bg-sky-50 hover:text-sky-700 dark:text-slate-400 dark:hover:bg-sky-950/30 dark:hover:text-sky-200'}`}
                                                        >
                                                            <span className="sidebar-nav-icon relative shrink-0" style={{ '--sidebar-icon-aura': child.iconAura || '20, 184, 166' }}>
                                                                <ChildIcon className={`h-4 w-4 ${child.iconColor || ''}`} strokeWidth={isChildActive ? 2.5 : 2} />
                                                                {childPendingCount > 0 && (
                                                                    <span className="absolute -right-2.5 -top-2.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center shadow">
                                                                        {childPendingCount > 99 ? '99+' : childPendingCount}
                                                                    </span>
                                                                )}
                                                            </span>
                                                            <span className="truncate text-xs font-semibold">{child.label}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className={`mb-3 border-t border-slate-100 pt-3 dark:border-slate-800 ${isSidebarCollapsed ? '' : 'px-2'}`}>
                    <ThemePicker variant="sidebar" isCollapsed={isSidebarCollapsed} />
                </div>

                {isAdminAuth ? (
                    <div className={`border-t border-slate-100 pt-4 dark:border-slate-800 ${isSidebarCollapsed ? '' : 'px-2'}`}>
                        <button
                            type="button"
                            onClick={() => setIsSidebarAccountOpen((open) => !open)}
                            className={`flex w-full min-w-0 items-center rounded-xl bg-slate-50 py-3 text-left transition-colors hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 ${isSidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3'}`}
                            title={isSidebarCollapsed ? 'เมนูบัญชีผู้ใช้' : undefined}
                            aria-expanded={isSidebarAccountOpen}
                        >
                            <span className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-indigo-100 to-sky-100 dark:from-indigo-900/70 dark:to-sky-900/50 text-indigo-700 dark:text-indigo-200 flex items-center justify-center font-bold ring-1 ring-white/80 dark:ring-slate-700/70">
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
                            <div className={`min-w-0 ${isSidebarCollapsed ? 'hidden' : ''}`}>
                                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{isAdminAuth.name}</p>
                                <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{ROLE_LABELS[currentRole] || ROLE_LABELS[isAdminAuth.role] || 'IT Support'}</p>
                            </div>
                            <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform ${isSidebarCollapsed ? 'hidden' : ''} ${isSidebarAccountOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isSidebarAccountOpen && <div className="mt-2 space-y-1">
                            <button
                                type="button"
                                onClick={handleProfileSettings}
                                className={`flex w-full items-center rounded-xl py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-indigo-300 ${isSidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3'}`}
                                title={isSidebarCollapsed ? 'จัดการโปรไฟล์' : undefined}
                            >
                                <UserCog className="h-5 w-5 shrink-0" />
                                <span className={isSidebarCollapsed ? 'hidden' : ''}>จัดการโปรไฟล์</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleAdminLogout}
                                className={`flex w-full items-center rounded-xl py-2.5 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/30 ${isSidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3'}`}
                                title={isSidebarCollapsed ? 'ออกจากระบบ' : undefined}
                            >
                                <LogOut className="h-5 w-5 shrink-0" />
                                <span className={isSidebarCollapsed ? 'hidden' : ''}>ออกจากระบบ</span>
                            </button>
                        </div>}
                    </div>
                ) : (
                    <div className={`border-t border-slate-100 pt-4 dark:border-slate-800 ${isSidebarCollapsed ? '' : 'px-2'}`}>
                        <button
                            type="button"
                            onClick={() => handleNavClick(adminNavItem)}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-colors hover:bg-indigo-700 dark:bg-indigo-500 dark:shadow-indigo-950/40 dark:hover:bg-indigo-400"
                            title={isSidebarCollapsed ? 'เข้าสู่ระบบสำหรับแผนกไอที' : undefined}
                        >
                            <LogIn className="h-5 w-5" />
                            <span className={isSidebarCollapsed ? 'hidden' : ''}>เข้าสู่ระบบสำหรับแผนกไอที</span>
                        </button>
                    </div>
                )}
                <button
                    type="button"
                    onClick={() => {
                        setIsSidebarCollapsed((collapsed) => !collapsed);
                        setIsSidebarAccountOpen(false);
                    }}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-indigo-300"
                    title={isSidebarCollapsed ? 'ขยาย sidebar' : 'ย่อ sidebar'}
                    aria-label={isSidebarCollapsed ? 'ขยาย sidebar' : 'ย่อ sidebar'}
                >
                    {isSidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
                    <span className={isSidebarCollapsed ? 'hidden' : ''}>ย่อ sidebar</span>
                </button>
            </aside>}

            {!isStandaloneSignaturePage && <header className="fixed left-0 right-0 z-50 top-0 transition-all duration-300 glass-panel border-b border-white/40 dark:border-slate-700/50 xl:hidden">
                <div className="container mx-auto px-3 sm:px-4 xl:px-8 py-3 flex flex-row justify-between items-center gap-2 sm:gap-3 max-w-full 2xl:max-w-[1500px]">
                    <div className="flex min-w-0 items-center gap-2 sm:gap-3 xl:hidden">
                        <div className="shrink-0 bg-indigo-600 dark:bg-indigo-500 text-white p-1.5 min-[360px]:p-2 rounded-xl shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30">
                            <Monitor className="w-5 h-5 min-[360px]:w-6 min-[360px]:h-6" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="whitespace-nowrap text-base min-[360px]:text-xl font-bold tracking-tight text-slate-800 dark:text-white leading-tight">IT HELPDESK</h1>
                            <p className="whitespace-nowrap text-[10px] min-[360px]:text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide">SUPPORT SYSTEM</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <ThemePicker />
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
                                <span className="hidden xl:flex min-w-0 flex-col items-start">
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
                        <button
                            type="button"
                            onClick={() => handleNavClick(adminNavItem)}
                            className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-2.5 min-[360px]:px-3 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-colors hover:bg-indigo-700 dark:bg-indigo-500 dark:shadow-indigo-950/40 dark:hover:bg-indigo-400 xl:hidden [&_span]:hidden min-[360px]:[&_span]:inline"
                            aria-label="เข้าสู่ระบบ"
                        >
                            <LogIn className="h-4 w-4" />
                            <span>เข้าระบบ</span>
                        </button>
                        )}
                    </div>
                </div>
            </header>}

            <main className={`flex-grow relative w-full transition-[margin,width] duration-300 ${isStandaloneSignaturePage ? 'flex min-h-screen items-stretch justify-stretch p-0' : `mx-auto max-w-full px-3 py-4 sm:px-4 xl:p-8 mt-24 xl:mt-0 2xl:max-w-none mb-24 xl:mb-0 xl:mr-0 ${isSidebarCollapsed ? 'xl:ml-20 xl:w-[calc(100%-5rem)]' : 'xl:ml-80 xl:w-[calc(100%-20rem)]'}`}`}>
                <div className="animate-fade-in w-full">
                    <Suspense fallback={<PageLoadingFallback />}>
                        {renderContent()}
                    </Suspense>
                </div>
            </main>

            {isProfileModalOpen && (
                <div className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center overflow-y-auto p-3 sm:p-4 bg-slate-950/50 backdrop-blur-sm">
                    <div className="w-full max-w-md max-h-[calc(100dvh-1.5rem)] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-y-auto">
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
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">ตำแหน่ง</label>
                                <input
                                    type="text"
                                    name="position"
                                    value={profileForm.position}
                                    onChange={handleProfileFormChange}
                                    className="w-full input-modern"
                                    placeholder="ระบุตำแหน่ง"
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
                                <div className="flex items-center justify-between gap-3">
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">ลายเซ็นประจำโปรไฟล์</label>
                                    <button
                                        type="button"
                                        onClick={() => profileSignatureRef.current?.clear()}
                                        className="text-xs font-semibold text-rose-500 hover:text-rose-600"
                                    >
                                        ล้างลายเซ็น
                                    </button>
                                </div>
                                <div className="h-36 overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-950">
                                    <SignatureCanvas
                                        ref={profileSignatureRef}
                                        penColor="black"
                                        canvasProps={{ className: 'h-full w-full xl-signature', 'aria-label': 'ลายเซ็นประจำโปรไฟล์' }}
                                    />
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">ระบบจะดึงลายเซ็นนี้ไปเติมให้อัตโนมัติ และยังแก้ไขก่อนยืนยันงานได้</p>
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
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    ต้องมี {PASSWORD_POLICY_TEXT}
                                    {isAdminAuth?.password_never_expires ? ' บัญชี Administrator ไม่มีวันหมดอายุ' : ''}
                                </p>
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

            {!isStandaloneSignaturePage && <footer className={`py-6 mt-auto relative z-10 hidden xl:block transition-[margin] duration-300 ${isSidebarCollapsed ? 'xl:ml-20' : 'xl:ml-80'}`}>
                <div className="container mx-auto px-4 text-center text-slate-500/70 dark:text-slate-400/70 text-sm font-medium">
                    &copy; {new Date().getFullYear()} IT Helpdesk System. Built with React & Tailwind CSS.
                </div>
            </footer>}

            {/* Compact bottom navigation for mobile and tablet */}
            {!isStandaloneSignaturePage && !isAdminAuth && isMainMoreOpen && mainMoreItems.length > 0 && (
                <>
                    <button
                        type="button"
                        className="fixed inset-0 z-[54] bg-transparent xl:hidden"
                        onClick={() => setIsMainMoreOpen(false)}
                        aria-label="ปิดเมนูเพิ่มเติม"
                    />
                    <div className="fixed inset-x-3 bottom-20 z-[55] max-h-[60dvh] overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-2xl shadow-slate-300/50 backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95 dark:shadow-slate-950/50 xl:hidden">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {mainMoreItems.map((item) => {
                                const Icon = item.icon;
                                const isSelected = activeTab === item.tab;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => handleNavClick(item)}
                                        className={`flex min-w-0 items-center gap-2 rounded-xl px-3 py-3 text-left transition-colors ${isSelected ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:bg-indigo-500 dark:shadow-indigo-950/40' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                                    >
                                        <Icon className={`h-5 w-5 shrink-0 ${item.iconColor || ''}`} />
                                        <span className="truncate text-sm font-semibold">{item.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}

            {!isStandaloneSignaturePage && !isAdminAuth && <nav className="xl:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 pb-safe pt-2 px-2 pb-2">
                <div
                    className="grid items-center h-14 gap-1"
                    style={{ gridTemplateColumns: `repeat(${mainBottomItems.length + (mainMoreItems.length > 0 ? 1 : 0)}, minmax(0, 1fr))` }}
                >
                    {mainBottomItems.map((item) => {
                        const Icon = item.icon;
                        const isPrimary = item.variant === 'primary';
                        return (
                            <button
                                key={item.id}
                                onClick={() => handleNavClick(item)}
                                className={`min-w-0 w-full h-full rounded-xl flex flex-col items-center justify-center gap-1 px-1 transition-colors ${isPrimary ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:bg-indigo-500 dark:shadow-indigo-900/40' : `${activeTab === item.tab ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'}`}`}
                            >
                                <Icon className={`w-[clamp(18px,5vw,24px)] h-[clamp(18px,5vw,24px)] shrink-0 ${item.iconColor || ''}`} strokeWidth={activeTab === item.tab ? 2.5 : 2} />
                                <span className="max-w-full truncate text-[clamp(8px,2.6vw,10px)] font-semibold leading-none">{item.label}</span>
                            </button>
                        );
                    })}
                    {mainMoreItems.length > 0 && (
                        <button
                            type="button"
                            onClick={() => {
                                setIsMainMoreOpen((open) => !open);
                                setIsAdminMoreOpen(false);
                            }}
                            className={`min-w-0 w-full h-full rounded-xl flex flex-col items-center justify-center gap-1 px-1 transition-colors ${isMainMoreSelected || isMainMoreOpen ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:bg-indigo-500 dark:shadow-indigo-900/40' : 'text-slate-500 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'}`}
                            aria-expanded={isMainMoreOpen}
                        >
                            <MoreHorizontal className="w-[clamp(18px,5vw,24px)] h-[clamp(18px,5vw,24px)] shrink-0" />
                            <span className="max-w-full truncate text-[clamp(8px,2.6vw,10px)] font-semibold leading-none">เพิ่มเติม</span>
                        </button>
                    )}
                </div>
            </nav>}

            {!isStandaloneSignaturePage && isAdminAuth && visibleAdminSubTabs.length > 0 && (
                <>
                    {isAdminMoreOpen && adminMoreItems.length > 0 && (
                        <>
                            <button
                                type="button"
                                className="fixed inset-0 z-[54] bg-transparent xl:hidden"
                                onClick={() => setIsAdminMoreOpen(false)}
                                aria-label="ปิดเมนูเพิ่มเติม"
                            />
                            <div className="fixed inset-x-3 bottom-20 z-[55] max-h-[60dvh] overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-2xl shadow-slate-300/50 backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95 dark:shadow-slate-950/50 xl:hidden">
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                    {adminMoreItems.map((item) => {
                                        const Icon = item.icon;
                                        const pendingCount = getAdminNavPendingCount(item.id);
                                        const isSelected = selectedAdminSubTab === item.id;
                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => handleAdminBottomNavClick(item)}
                                                className={`flex min-w-0 items-center gap-2 rounded-xl px-3 py-3 text-left transition-colors ${isSelected ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:bg-indigo-500 dark:shadow-indigo-950/40' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                                            >
                                                <span className="relative shrink-0">
                                                    <Icon className={`h-5 w-5 ${item.iconColor || ''}`} />
                                                    {pendingCount > 0 && (
                                                        <span className="absolute -right-2.5 -top-2.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center shadow">
                                                            {pendingCount > 99 ? '99+' : pendingCount}
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="truncate text-sm font-semibold">{item.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}
                <nav className="xl:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 pt-2 px-2 pb-3">
                    <div
                        className="grid items-center gap-1"
                        style={{ gridTemplateColumns: `repeat(${adminBottomItems.length + (adminMoreItems.length > 0 ? 1 : 0)}, minmax(0, 1fr))` }}
                    >
                        {adminBottomItems.map((item) => {
                            const Icon = item.icon;
                            const pendingCount = getAdminNavPendingCount(item.id);
                            const isSelected = selectedAdminSubTab === item.id;

                            return (
                                <button
                                    key={item.id}
                                    onClick={() => handleAdminBottomNavClick(item)}
                                    className={`relative min-w-0 w-full h-14 rounded-2xl flex flex-col items-center justify-center gap-1 px-1 transition-colors ${isSelected ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:bg-indigo-500 dark:shadow-indigo-950/40' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                                >
                                    <span className="relative">
                                        <Icon className={`w-[clamp(16px,4.6vw,20px)] h-[clamp(16px,4.6vw,20px)] ${item.iconColor || ''}`} strokeWidth={isSelected ? 2.5 : 2} />
                                        {pendingCount > 0 && (
                                            <span className="absolute -right-2.5 -top-2.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center shadow">
                                                {pendingCount > 99 ? '99+' : pendingCount}
                                            </span>
                                        )}
                                    </span>
                                    <span className="max-w-full truncate text-[clamp(7px,2.25vw,10px)] font-semibold leading-none">{item.label}</span>
                                </button>
                            );
                        })}
                        {adminMoreItems.length > 0 && (
                            <button
                                type="button"
                                onClick={() => {
                                    setIsAdminMoreOpen((open) => !open);
                                    setIsMainMoreOpen(false);
                                }}
                                className={`relative min-w-0 w-full h-14 rounded-2xl flex flex-col items-center justify-center gap-1 px-1 transition-colors ${isAdminMoreSelected || isAdminMoreOpen ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:bg-indigo-500 dark:shadow-indigo-950/40' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                                aria-expanded={isAdminMoreOpen}
                            >
                                <MoreHorizontal className="w-[clamp(16px,4.6vw,20px)] h-[clamp(16px,4.6vw,20px)]" />
                                <span className="max-w-full truncate text-[clamp(7px,2.25vw,10px)] font-semibold leading-none">เพิ่มเติม</span>
                            </button>
                        )}
                    </div>
                </nav>
                </>
            )}
        </div>
    )
}

export default App
