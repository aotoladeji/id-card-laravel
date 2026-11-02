import { useState, useEffect } from 'react';

export default function SupervisorOverview({ user, onNavigate }) {
  const [stats, setStats] = useState({
    pendingReprints: 0,
    pendingMaterials: 0,
    pendingReports: 0,
    totalStaff: 0
  });

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const [reprintsRes, materialsRes, reportsRes, usersRes] = await Promise.all([
        fetch('/api/reprint', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }),
        fetch('/api/material', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }),
        fetch('/api/daily-reports', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }),
        fetch('/api/users', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        })
      ]);

      const [reprints, materials, reports, users] = await Promise.all([
        reprintsRes.json(),
        materialsRes.json(),
        reportsRes.json(),
        usersRes.json()
      ]);

      setStats({
        pendingReprints: reprints.requests?.filter(r => r.status === 'pending').length || 0,
        pendingMaterials: materials.requests?.filter(m => m.status === 'pending').length || 0,
        pendingReports: reports.reports?.filter(r => r.verification_status === 'pending').length || 0,
        totalStaff: users.users?.filter(u => u.role === 'staff').length || 0
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    }
  };

  const quickActions = [
    {
      label: '➕ Create Staff Account',
      tab: 'staff',
      variant: 'btn-primary',
      badge: null
    },
    {
      label: '🔄 Review Reprint Requests',
      tab: 'reprint',
      variant: 'btn-secondary',
      badge: stats.pendingReprints
    },
    {
      label: '📦 Review Material Requests',
      tab: 'material',
      variant: 'btn-secondary',
      badge: stats.pendingMaterials
    },
    {
      label: '📊 Verify Daily Reports',
      tab: 'daily-reports',
      variant: 'btn-secondary',
      badge: stats.pendingReports
    },
    {
      label: '⚠️ Faulty Deliveries',
      tab: 'faulty-deliveries',
      variant: 'btn-secondary',
      badge: null
    },
    {
      label: '📦 View Inventory',
      tab: 'inventory-overview',
      variant: 'btn-secondary',
      badge: null
    },
    {
      label: '📈 Collection Stats',
      tab: 'collections',
      variant: 'btn-secondary',
      badge: null
    },
    {
      label: '👥 Manage Staff',
      tab: 'staff',
      variant: 'btn-secondary',
      badge: null
    }
  ];

  const responsibilities = [
    'Approve/Reject reprint requests',
    'Manage material requisitions',
    'Verify daily reports from staff',
    'Create and manage staff accounts & permissions',
    'Monitor card collection statistics',
    'Attest faulty delivery reports',
    'Forward material requests to admin',
    'View all inventory in store'
  ];

  return (
    <>
      <div className="header">
        <h1>Welcome back, {user?.name}! 👋</h1>
        <p style={{ color: 'var(--text-dim)', marginTop: '0.5rem' }}>
          Supervisor Dashboard — Manage your team and approvals
        </p>
      </div>

      {/* Stats - clicking navigates to the relevant tab */}
      <div className="stats-grid">
        <div
          className="stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigate('reprint')}
        >
          <div className="stat-label">⏳ Pending Reprints</div>
          <div className="stat-value">{stats.pendingReprints}</div>
          <div className="stat-change" style={{
            color: stats.pendingReprints > 0 ? 'var(--warning)' : 'var(--success)'
          }}>
            {stats.pendingReprints > 0 ? 'Needs attention' : 'All clear'}
          </div>
        </div>

        <div
          className="stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigate('material')}
        >
          <div className="stat-label">📦 Pending Materials</div>
          <div className="stat-value">{stats.pendingMaterials}</div>
          <div className="stat-change" style={{
            color: stats.pendingMaterials > 0 ? 'var(--warning)' : 'var(--success)'
          }}>
            {stats.pendingMaterials > 0 ? 'Needs attention' : 'All clear'}
          </div>
        </div>

        <div
          className="stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigate('daily-reports')}
        >
          <div className="stat-label">📊 Pending Reports</div>
          <div className="stat-value">{stats.pendingReports}</div>
          <div className="stat-change" style={{
            color: stats.pendingReports > 0 ? 'var(--warning)' : 'var(--success)'
          }}>
            {stats.pendingReports > 0 ? 'Needs verification' : 'All verified'}
          </div>
        </div>

        <div
          className="stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigate('staff')}
        >
          <div className="stat-label">👥 Total Staff</div>
          <div className="stat-value">{stats.totalStaff}</div>
          <div className="stat-change">Active accounts</div>
        </div>
      </div>

      <div className="grid-2">
        {/* Quick Actions */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Quick Actions</h3>
          </div>
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {quickActions.map((action, index) => (
              <button
                key={index}
                className={`btn ${action.variant}`}
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  textAlign: 'left'
                }}
                onClick={() => onNavigate(action.tab)}
              >
                <span>{action.label}</span>
                {action.badge > 0 && (
                  <span style={{
                    background: 'var(--danger)',
                    color: 'white',
                    borderRadius: '50%',
                    width: '22px',
                    height: '22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    flexShrink: 0
                  }}>
                    {action.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Responsibilities */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Supervisor Responsibilities</h3>
          </div>
          <div style={{ padding: '1rem' }}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: 'var(--text-dim)' }}>
              {responsibilities.map((item, index) => (
                <li
                  key={index}
                  style={{
                    padding: '0.6rem 0',
                    borderBottom: index < responsibilities.length - 1
                      ? '1px solid var(--border)'
                      : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <span style={{ color: 'var(--success)', fontWeight: '700', flexShrink: 0 }}>✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
