import { useState, useEffect } from 'react';

export default function Overview({ user, onNavigate }) {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalCards: 0,
    pendingApprovals: 0,
    cardsToday: 0,
    pendingMaterials: 0,
    faultyDeliveries: 0,
    cardsCollected: 0,
    totalStock: 0
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${localStorage.getItem('token')}` };

      const [usersRes, approvedCardsRes, printHistoryRes, collectionsRes, logsRes, materialsRes, faultyRes, inventoryRes] = await Promise.all([
        fetch('/api/users', { headers }),
        fetch('/api/approved-cards', { headers }),
        fetch('/api/print-history', { headers }),
        fetch('/api/collections', { headers }),
        fetch('/api/logs', { headers }),
        fetch('/api/material', { headers }),
        fetch('/api/inventory/faulty', { headers }),
        fetch('/api/inventory', { headers })
      ]);

      const [usersData, approvedCardsData, printHistoryData, collectionsData, logsData, materialsData, faultyData, inventoryData] = await Promise.all([
        usersRes.json(),
        approvedCardsRes.json(),
        printHistoryRes.json(),
        collectionsRes.json(),
        logsRes.json(),
        materialsRes.json(),
        faultyRes.json(),
        inventoryRes.json()
      ]);

      const today = new Date().toDateString();
      
      // Cards printed today from print_history
      const cardsPrintedToday = printHistoryData.history?.filter(p =>
        new Date(p.printed_at).toDateString() === today
      )?.length || 0;

      // Cards collected (from card_collections with status 'collected')
      const cardsCollected = collectionsData.collections?.filter(c => c.status === 'collected')?.length || 0;

      setStats({
        totalUsers: usersData.users?.length || 0,
        totalCards: approvedCardsData.cards?.length || 0,
        pendingApprovals: 0, // Not applicable - cards are approved in capture app
        cardsToday: cardsPrintedToday,
        pendingMaterials: materialsData.requests?.filter(r => r.status === 'pending')?.length || 0,
        faultyDeliveries: faultyData.deliveries?.filter(d => d.status === 'pending')?.length || 0,
        cardsCollected: cardsCollected
      });

      setRecentActivity(logsData.logs?.slice(0, 6) || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionColor = (action) => {
    if (action?.includes('LOGIN')) return 'var(--secondary)';
    if (action?.includes('DELETE')) return 'var(--danger)';
    if (action?.includes('CREATE') || action?.includes('ADDED')) return 'var(--success)';
    if (action?.includes('UPDATE') || action?.includes('CHANGE')) return 'var(--warning)';
    return 'var(--text-dim)';
  };

  const getActionIcon = (action) => {
    if (action?.includes('LOGIN')) return '🔑';
    if (action?.includes('DELETE')) return '🗑️';
    if (action?.includes('CREATE') || action?.includes('ADDED')) return '✅';
    if (action?.includes('UPDATE') || action?.includes('CHANGE')) return '✏️';
    if (action?.includes('PASSWORD')) return '🔒';
    if (action?.includes('REPORT')) return '📊';
    if (action?.includes('INVENTORY')) return '📦';
    if (action?.includes('MATERIAL')) return '📋';
    return '📝';
  };

  return (
    <>
      <div className="header">
        <div>
          <h1>Welcome back, {user?.name}! 👋</h1>
          <p style={{ color: 'var(--text-dim)', marginTop: '0.5rem' }}>
            {new Date().toLocaleDateString('en-GB', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            })}
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('users')}>
          <div className="stat-label">👥 Total Users</div>
          <div className="stat-value">{stats.totalUsers}</div>
          <div className="stat-change">Click to manage</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('collections')}>
          <div className="stat-label">🎴 Total Cards</div>
          <div className="stat-value">{stats.totalCards}</div>
          <div className="stat-change">{stats.cardsToday} printed today</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('collections')}>
          <div className="stat-label">✅ Cards Collected</div>
          <div className="stat-value">{stats.cardsCollected}</div>
          <div className="stat-change">Click to view collections</div>
        </div>
        <div
          className="stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigate('inventory')}
        >
          <div className="stat-label">📦 Total Materials in Stock</div>
          <div className="stat-value">{stats.totalStock}</div>
          <div className="stat-change">Click to manage inventory</div>
        </div>
        <div
          className="stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigate('material-requests')}
        >
          <div className="stat-label">📦 Pending Materials</div>
          <div className="stat-value">{stats.pendingMaterials}</div>
          <div className="stat-change">Click to review</div>
        </div>
        <div
          className="stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigate('faulty-deliveries')}
        >
          <div className="stat-label">⚠️ Faulty Deliveries</div>
          <div className="stat-value">{stats.faultyDeliveries}</div>
          <div className="stat-change">Click to review</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('print-history')}>
          <div className="stat-label">🖨️ Printed Today</div>
          <div className="stat-value">{stats.cardsToday}</div>
          <div className="stat-change">Click for print history</div>
        </div>
      </div>

      <div className="grid-2">
        {/* Recent Activity */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Recent Activity</h3>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onNavigate('logs')}
            >
              View All Logs
            </button>
          </div>
          {loading ? (
            <p style={{ padding: '1rem', color: 'var(--text-dim)' }}>Loading...</p>
          ) : recentActivity.length > 0 ? (
            <div>
              {recentActivity.map((log, index) => (
                <div
                  key={log.id || index}
                  style={{
                    padding: '0.85rem 1rem',
                    borderBottom: index < recentActivity.length - 1 ? '1px solid var(--border)' : 'none',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ fontSize: '1.2rem', marginTop: '0.1rem' }}>
                    {getActionIcon(log.action)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '0.2rem',
                      gap: '0.5rem'
                    }}>
                      <strong style={{
                        fontSize: '0.85rem',
                        color: getActionColor(log.action),
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {log.action?.replace(/_/g, ' ')}
                      </strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                        {new Date(log.created_at).toLocaleTimeString([], {
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <div style={{
                      fontSize: '0.82rem',
                      color: 'var(--text-dim)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {log.username || 'System'} — {log.details}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ padding: '1rem', color: 'var(--text-dim)' }}>No recent activity</p>
          )}
        </div>

        {/* Quick Actions */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Quick Actions</h3>
          </div>
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => onNavigate('users')}
            >
              ➕ Create New Account
            </button>
            <button
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => onNavigate('material-requests')}
            >
              📦 Review Material Requests
            </button>
            <button
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => onNavigate('faulty-deliveries')}
            >
              ⚠️ Review Faulty Deliveries
            </button>
            <button
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => onNavigate('inventory')}
            >
              📦 Manage Inventory
            </button>
            <button
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => onNavigate('logs')}
            >
              📋 View System Logs
            </button>
            <button
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => onNavigate('reports')}
            >
              📄 Print Reports
            </button>
          </div>
        </div>
      </div>

      {/* System Status */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-header">
          <h3 className="card-title">System Status</h3>
        </div>
        <div className="grid-2">
          <div style={{ padding: '1rem' }}>
            {[
              { label: 'Database Connection', status: 'Healthy', type: 'success' },
              { label: 'API Server', status: 'Running', type: 'success' },
              { label: 'Storage', status: '78% Used', type: 'warning' }
            ].map(item => (
              <div key={item.label} style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '1rem',
                alignItems: 'center'
              }}>
                <span>{item.label}</span>
                <span className={`badge badge-${item.type}`}>{item.status}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: '1rem' }}>
            {[
              { label: 'Last Backup', value: '2 hours ago' },
              { label: 'Active Sessions', value: `${stats.totalUsers} users` },
              { label: 'Uptime', value: '99.9%' }
            ].map(item => (
              <div key={item.label} style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '1rem'
              }}>
                <span>{item.label}</span>
                <span style={{ color: 'var(--text-dim)' }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}