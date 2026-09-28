import { useEffect, useRef, useState } from 'react';
import {
    Bell, ChevronDown, ChevronLeft, ChevronRight, LayoutGrid, LogIn, Menu,
    MonitorCog, Moon, Search, Sun, UserRound, X,
} from 'lucide-react';
import SystemPageBoundary from './SystemPageBoundary';
import './system-pages.css';

export default function SystemAppShell({
    brand = 'IT HELPDESK',
    brandCaption = 'VAVA PACK',
    brandIcon: BrandIcon = MonitorCog,
    navItems = [],
    activePage,
    onNavigate,
    onOpenCenter,
    onExit,
    onLogin,
    exitLabel = 'กลับหน้าระบบเดิม',
    userManagementPage = 'users',
    query,
    onQueryChange,
    searchPlaceholder = 'ค้นหา...',
    currentUser,
    notificationCount = 0,
    notificationItems = [],
    publicMode = false,
    showSearch = true,
    children,
}) {
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [popover, setPopover] = useState('');
    const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
    const searchRef = useRef(null);

    useEffect(() => {
        const shortcut = (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                searchRef.current?.focus();
            }
        };
        document.addEventListener('keydown', shortcut);
        return () => document.removeEventListener('keydown', shortcut);
    }, []);

    const navigate = (id) => {
        setMobileOpen(false);
        setPopover('');
        onNavigate?.(id);
    };
    const toggleTheme = () => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle('dark', next);
        localStorage.setItem('theme', next ? 'dark' : 'light');
    };

    return (
        <div className={`tailadmin-preview system-app-shell ${collapsed ? 'is-collapsed' : ''}`}>
            {mobileOpen && <button type="button" className="tap-backdrop" aria-label="ปิดเมนู" onClick={() => setMobileOpen(false)} />}
            <aside className={`tap-sidebar ${mobileOpen ? 'is-mobile-open' : ''}`}>
                <div className="tap-brand">
                    <div className="tap-brand-mark"><BrandIcon size={22} /></div>
                    <div className="tap-brand-copy"><strong>{brand}</strong><span>{brandCaption}</span></div>
                    <button type="button" className="tap-mobile-close" aria-label="ปิดเมนู" onClick={() => setMobileOpen(false)}><X size={20} /></button>
                </div>
                <nav className="tap-nav" aria-label={`เมนู ${brand}`}>
                    <p className="tap-nav-label">เมนู</p>
                    {navItems.map(({ id, label, icon: Icon, badge }) => (
                        <button key={id} type="button" className={`tap-nav-item ${id === activePage ? 'is-active' : ''}`} title={collapsed ? label : undefined} onClick={() => navigate(id)}>
                            <Icon size={20} strokeWidth={1.8} /><span>{label}</span>
                            {badge > 0 && <b>{badge > 99 ? '99+' : badge}</b>}
                        </button>
                    ))}
                    <p className="tap-nav-label tap-nav-label-secondary">ระบบ</p>
                    <button type="button" className="tap-nav-item" title={collapsed ? 'App Center' : undefined} onClick={onOpenCenter}>
                        <LayoutGrid size={20} /><span>App Center</span>
                    </button>
                </nav>
                <div className="tap-sidebar-footer">
                    <button type="button" className="tap-back-button" title={collapsed ? (publicMode ? 'เข้าสู่ระบบเจ้าหน้าที่' : exitLabel) : undefined} onClick={publicMode ? onLogin : onExit}>
                        {publicMode ? <LogIn size={19} /> : <ChevronLeft size={19} />}<span>{publicMode ? 'เข้าสู่ระบบเจ้าหน้าที่' : exitLabel}</span>
                    </button>
                </div>
            </aside>

            <div className="tap-workspace">
                <header className="tap-header">
                    <div className="tap-header-start">
                        <button type="button" className="tap-icon-button tap-menu-button" aria-label="เปิดหรือย่อเมนู" onClick={() => window.innerWidth < 1024 ? setMobileOpen(true) : setCollapsed((value) => !value)}>
                            {collapsed ? <ChevronRight size={20} /> : <Menu size={20} />}
                        </button>
                        {showSearch && <label className="tap-search">
                            <Search size={19} />
                            <input ref={searchRef} value={query} onChange={(event) => onQueryChange?.(event.target.value)} placeholder={searchPlaceholder} />
                            <kbd>Ctrl K</kbd>
                        </label>}
                    </div>
                    <div className="tap-header-actions">
                        <button type="button" className="tap-icon-button" aria-label="เปลี่ยนธีม" title="เปลี่ยนธีม" onClick={toggleTheme}>{dark ? <Sun size={19} /> : <Moon size={19} />}</button>
                        {!publicMode && <div className="tap-popover-anchor">
                            <button type="button" className="tap-icon-button" aria-label="การแจ้งเตือน" onClick={() => setPopover(popover === 'notice' ? '' : 'notice')}>
                                <Bell size={19} />{notificationCount > 0 && <span className="tap-dot" />}
                            </button>
                            {popover === 'notice' && <div className="tap-popover tap-notifications">
                                <div><strong>การแจ้งเตือน</strong><span>{notificationCount} รายการ</span></div>
                                {notificationItems.length
                                    ? notificationItems.map((item) => <p key={item.label}>{item.label} <b>{item.value}</b></p>)
                                    : <p>ไม่มีรายการใหม่</p>}
                            </div>}
                        </div>}
                        {publicMode ? <button type="button" onClick={onLogin} className="tap-primary-button"><LogIn size={17} />เข้าสู่ระบบเจ้าหน้าที่</button> : <div className="tap-popover-anchor">
                            <button type="button" className="tap-profile-button" onClick={() => setPopover(popover === 'profile' ? '' : 'profile')}>
                                <span className="tap-avatar">{(currentUser?.name || currentUser?.username || 'U').charAt(0).toUpperCase()}</span>
                                <span className="tap-profile-copy"><strong>{currentUser?.name || currentUser?.username || 'ผู้ใช้งาน'}</strong><small>{currentUser?.position || 'ผู้ดูแลระบบ'}</small></span>
                                <ChevronDown size={16} />
                            </button>
                            {popover === 'profile' && <div className="tap-popover tap-profile-menu">
                                {userManagementPage && <button type="button" onClick={() => navigate(userManagementPage)}><UserRound size={17} /> จัดการผู้ใช้งาน</button>}
                                <button type="button" onClick={onExit}><ChevronLeft size={17} /> {exitLabel}</button>
                            </div>}
                        </div>}
                    </div>
                </header>
                <main className="tap-main-content"><SystemPageBoundary pageKey={activePage}>{children}</SystemPageBoundary></main>
            </div>
        </div>
    );
}
