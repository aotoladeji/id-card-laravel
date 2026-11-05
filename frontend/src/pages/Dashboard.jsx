import { useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import '../styles/dashboard.css';
import ChangePasswordModal from '../components/ChangePasswordModal';
import UserProfile from './UserProfile';
import SchedulingManagement from './supervisor/SchedulingManagement';
import PrintedCardsArchive from './supervisor/PrintedCardsArchive';
import itmsLogo from '../assets/itms_logo.png';





// Admin imports
import Overview from './admin/Overview';
import UserManagement from './admin/UserManagement';
import SystemLogs from './admin/SystemLogs';
import Analytics from './admin/Analytics';
import AllReports from './admin/AllReports';
import InventoryManagement from './admin/InventoryManagement';
import FaultyDeliveryManagement from './admin/FaultyDeliveryManagement';
import MaterialRequestManagement from './admin/MaterialRequestManagement';
import PrintHistory from './admin/PrintHistory';


// Supervisor imports
import SupervisorOverview from './supervisor/SupervisorOverview';
import ReprintApproval from './supervisor/ReprintApproval';
import MaterialRequestsApproval from './supervisor/MaterialRequestsApproval';
import DailyReportsReview from './supervisor/DailyReportsReview';
import StaffManagement from './supervisor/StaffManagement';
import FaultyDeliveryReview from './supervisor/FaultyDeliveryReview';
import InventoryOverview from './supervisor/InventoryOverview';

// Staff imports
import StaffOverview from './staff/StaffOverview';
import InventoryLog from './staff/InventoryLog';
import ReprintRequests from './staff/ReprintRequests';
import MaterialRequests from './staff/MaterialRequests';
import DailyReportSubmission from './staff/DailyReportSubmission';
import CardApproval from './staff/CardApproval';
import PrintQueue from './staff/PrintQueue';
import Collections from './staff/Collections';



export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showChangePassword, setShowChangePassword] = useState(false);
  // Sidebar is the default layout; only an explicit, previously-saved choice
  // of the top navbar should opt a user out of it.
  const [sidebarMode, setSidebarMode] = useState(
    () => localStorage.getItem('navMode') !== 'navbar'
  );

  const toggleNavMode = () => {
    setSidebarMode(prev => {
      const next = !prev;
      localStorage.setItem('navMode', next ? 'sidebar' : 'navbar');
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handlePasswordChanged = () => {
    setShowChangePassword(false);
    // Optionally, you can logout and require re-login
    logout();
    navigate('/login');
  };

  const tabs = useMemo(() => {
    if (user?.role === 'admin') {
      return [
        { id: 'overview', label: '🏠 Overview' },
        { id: 'users', label: '👥 User Management' },
        { id: 'inventory', label: '📦 Inventory' },
        { id: 'faulty-deliveries', label: '⚠️ Faulty Deliveries' },
        { id: 'material-requests', label: '📦 Material Requests' },
        { id: 'print-history', label: '📋 Print History' },
        { id: 'collections', label: '🎴 Collections' },
        // { id: 'logs', label: '📋 System Logs' },
        { id: 'analytics', label: '📊 Analytics' },
        { id: 'reports', label: '📄 Reports' },
        { id: 'profile', label: '👤 Profile' }
      ];
    }

    if (user?.role === 'supervisor') {
      return [
        { id: 'overview', label: '🏠 Overview' },
        { id: 'inventory-overview', label: '📦 Inventory' },
        { id: 'faulty-deliveries', label: '⚠️ Faulty Deliveries' },
        { id: 'material', label: '📦 Material Requests' },
        { id: 'scheduling', label: '📅 Scheduling' },
        { id: 'reprint', label: '🔄 Reprint Approvals' },
        { id: 'collections', label: '📈 Collections' },
        { id: 'print-history', label: '📋 Print History' },
        { id: 'card-archive', label: '🗄️ Printed Cards Archive' },
        { id: 'staff', label: '👥 Staff Management' },
        { id: 'daily-reports', label: '📊 Daily Reports' },
        { id: 'profile', label: '👤 Profile' }
      ];
    }

    const permissions = user?.permissions || [];
    const staffTabs = [{ id: 'overview', label: '🏠 Dashboard' }];
    if (permissions.includes('inventory')) staffTabs.push({ id: 'inventory', label: '📦 Inventory' });
    if (permissions.includes('material')) staffTabs.push({ id: 'material', label: '📦 Material Requests' });
    if (permissions.includes('daily-report')) staffTabs.push({ id: 'daily-report', label: '📊 Daily Reports' });
    if (permissions.includes('collection')) staffTabs.push({ id: 'collection', label: '🎴 Collection' });
    if (permissions.includes('approval')) staffTabs.push({ id: 'approval', label: '✓ Card Approval' });
    if (permissions.includes('printing')) staffTabs.push({ id: 'print-queue', label: '🖨️ Print Queue' });
    if (permissions.includes('reprint')) staffTabs.push({ id: 'reprint', label: '🔄 Reprint Requests' });
    if (permissions.includes('scheduling')) staffTabs.push({ id: 'scheduling', label: '📅 Scheduling' });
    staffTabs.push({ id: 'profile', label: '👤 Profile' });
    return staffTabs;
  }, [user]);

  const defaultTab = tabs[0]?.id || 'overview';
  const urlTab = searchParams.get('tab');
  const activeTab = tabs.some((tab) => tab.id === urlTab) ? urlTab : defaultTab;

  const handleTabChange = (nextTabId) => {
    if (!tabs.some((tab) => tab.id === nextTabId)) return;

    const nextParams = new URLSearchParams(searchParams);
    if (nextTabId === defaultTab) {
      nextParams.delete('tab');
    } else {
      nextParams.set('tab', nextTabId);
    }

    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  };

// Update renderContent - profile check at the TOP before role checks
const renderContent = () => {
  // Profile available to ALL users
  if (activeTab === 'profile') return <UserProfile />;
  if (activeTab === 'scheduling') return <SchedulingManagement />;
  if (activeTab === 'print-queue') return <PrintQueue />;       
  if (activeTab === 'print-history') return <PrintHistory />; 

  // Admin tabs
  if (user?.role === 'admin') {
    switch (activeTab) {
      case 'overview': return <Overview user={user} onNavigate={handleTabChange} />;
      case 'users': return <UserManagement />;
      case 'inventory': return <InventoryManagement />;
      case 'faulty-deliveries': return <FaultyDeliveryManagement />;
      case 'material-requests': return <MaterialRequestManagement />;
      case 'collections': return <Collections />;
      case 'logs': return <SystemLogs />;
      case 'analytics': return <Analytics />;
      case 'reports': return <AllReports />;
      default: return <Overview user={user} onNavigate={handleTabChange} />;
    }
  }

  // Supervisor tabs
  if (user?.role === 'supervisor') {
    switch (activeTab) {
      case 'overview': return <SupervisorOverview user={user} onNavigate={handleTabChange} />;
      case 'inventory-overview': return <InventoryOverview />;
      case 'faulty-deliveries': return <FaultyDeliveryReview />;
      case 'reprint': return <ReprintApproval />;
      case 'material': return <MaterialRequestsApproval />;
      case 'daily-reports': return <DailyReportsReview />;
      case 'staff': return <StaffManagement />;
      case 'collections': return <Collections />;
      case 'print-history': return <PrintHistory />;
      case 'card-archive': return <PrintedCardsArchive />;
      default: return <SupervisorOverview user={user} onNavigate={handleTabChange} />;
    }
  }

  // Staff tabs
  switch (activeTab) {
    case 'overview': return <StaffOverview user={user} />;
    case 'inventory': return <InventoryLog />;
    case 'reprint': return <ReprintRequests />;
    case 'material': return <MaterialRequests />;
    case 'daily-report': return <DailyReportSubmission />;
    case 'collection': return <Collections />;
    case 'approval': return <CardApproval />;
    case 'print-queue': return <PrintQueue />;
    default: return <StaffOverview user={user} />;
  }
};
  const routeContext = useMemo(() => {
    if (location.pathname.startsWith('/admin')) {
      return { label: 'Admin Workspace', path: '/admin' };
    }
    if (location.pathname.startsWith('/supervisor')) {
      return { label: 'Supervisor Workspace', path: '/supervisor' };
    }
    if (location.pathname.startsWith('/staff')) {
      return { label: 'Staff Workspace', path: '/staff' };
    }
    return { label: 'Dashboard', path: location.pathname || '/' };
  }, [location.pathname]);

  return (
    <div className={`dashboard-container${sidebarMode ? ' sidebar-mode' : ''}`}>
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-branding">
          {sidebarMode && (
            <button
              className="btn btn-secondary btn-sm sidebar-collapse-btn"
              onClick={toggleNavMode}
              title="Switch to top navbar"
            >
              ☰
            </button>
          )}
          <img src={itmsLogo} alt="IT@MS University of Ibadan Logo" className="header-logo" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h1 style={{ margin: 0 }}>MIS ID Card System</h1>
            <span
              style={{
                color: 'var(--text-dim)',
                fontSize: '0.8rem',
                fontWeight: 600,
                letterSpacing: '0.02em'
              }}
            >
              {routeContext.label} ({routeContext.path})
            </span>
          </div>
        </div>
       
        <div className="user-info">
          <span style={{ color: 'var(--text-dim)' }}>
            {user?.name}
          </span>
          <span className={`badge badge-${
            user?.role === 'admin' ? 'danger' : 
            user?.role === 'supervisor' ? 'warning' : 
            'info'
          }`}>
            {user?.role?.toUpperCase()}
          </span>
          {!sidebarMode && (
            <button
              onClick={toggleNavMode}
              className="btn btn-secondary btn-sm"
              title="Switch to sidebar navigation"
            >
              ☰ Sidebar
            </button>
          )}
          <button 
            onClick={() => setShowChangePassword(true)} 
            className="btn btn-secondary btn-sm"
          >
            🔒 Change Password
          </button>
          <button onClick={handleLogout} className="btn btn-secondary btn-sm">
            🚪 Logout
          </button>
        </div>
      </header>

      {sidebarMode ? (
        <div className="dashboard-body">
          {/* Sidebar */}
          <aside className="dashboard-sidebar">
            <nav className="sidebar-nav">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`sidebar-tab ${activeTab === tab.id ? 'active' : ''}`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </aside>
          {/* Content */}
          <main className="dashboard-content">
            {renderContent()}
          </main>
        </div>
      ) : (
        <>
          {/* Top Navigation */}
          <nav className="dashboard-nav">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          {/* Content */}
          <main className="dashboard-content">
            {renderContent()}
          </main>
        </>
      )}

      {/* Change Password Modal */}
      {showChangePassword && (
        <ChangePasswordModal 
          onSuccess={handlePasswordChanged}
          onClose={() => setShowChangePassword(false)}
        />
      )}
    </div>
  );
}