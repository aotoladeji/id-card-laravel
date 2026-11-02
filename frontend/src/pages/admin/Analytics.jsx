import { useState, useEffect } from 'react';
import { showNotification } from '../../utils/errorHandler';

export default function Analytics() {
  const [analytics, setAnalytics] = useState({
    totalCards: 0,
    totalPrinted: 0,
    totalCollected: 0,
    collectionRate: 0,
    printedToday: 0,
    printedThisWeek: 0,
    printedThisMonth: 0,
    failedPrints: 0,
    pendingCollection: 0,
    avgPrintsPerDay: 0,
    topFaculties: [],
    printTrends: [],
    recentPrints: []
  });
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('month'); // 'week', 'month', 'all'
  const [developerPassword, setDeveloperPassword] = useState('');
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange]);

  const fetchAnalytics = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${localStorage.getItem('token')}` };

      const [approvedCardsRes, printHistoryRes, collectionsRes, printQueueRes] = await Promise.all([
        fetch('/api/approved-cards', { headers }),
        fetch('/api/print-history', { headers }),
        fetch('/api/collections', { headers }),
        fetch('/api/print-queue', { headers })
      ]);

      const [approvedCards, printHistory, collections, printQueue] = await Promise.all([
        approvedCardsRes.json(),
        printHistoryRes.json(),
        collectionsRes.json(),
        printQueueRes.json()
      ]);

      const cards = approvedCards.cards || [];
      const prints = printHistory.history || [];
      const collectionsList = collections.collections || [];
      const queue = printQueue.queue || [];

      // Date calculations
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Basic stats
      const totalCards = cards.length;
      const totalPrinted = prints.length;
      const totalCollected = collectionsList.filter(c => c.status === 'collected').length;
      const collectionRate = totalPrinted > 0 ? Math.round((totalCollected / totalPrinted) * 100) : 0;

      // Time-based stats
      const printedToday = prints.filter(p => 
        new Date(p.printed_at) >= today
      ).length;

      const printedThisWeek = prints.filter(p => 
        new Date(p.printed_at) >= weekAgo
      ).length;

      const printedThisMonth = prints.filter(p => 
        new Date(p.printed_at) >= monthAgo
      ).length;

      // Failed prints
      const failedPrints = queue.filter(q => q.status === 'failed').length;

      // Pending collection
      const pendingCollection = collectionsList.filter(c => c.status === 'awaiting_collection').length;

      // Average prints per day (last 30 days)
      const avgPrintsPerDay = printedThisMonth > 0 ? (printedThisMonth / 30).toFixed(1) : 0;

      // Top faculties by print count
      const facultyCount = {};
      prints.forEach(p => {
        if (p.faculty) {
          facultyCount[p.faculty] = (facultyCount[p.faculty] || 0) + 1;
        }
      });
      const topFaculties = Object.entries(facultyCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([faculty, count]) => ({ faculty, count }));

      // Print trends (last 7 days)
      const printTrends = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = date.toDateString();
        const count = prints.filter(p => 
          new Date(p.printed_at).toDateString() === dateStr
        ).length;
        printTrends.push({
          date: date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
          count
        });
      }

      // Recent prints (last 10)
      const recentPrints = prints
        .sort((a, b) => new Date(b.printed_at) - new Date(a.printed_at))
        .slice(0, 10);

      setAnalytics({
        totalCards,
        totalPrinted,
        totalCollected,
        collectionRate,
        printedToday,
        printedThisWeek,
        printedThisMonth,
        failedPrints,
        pendingCollection,
        avgPrintsPerDay,
        topFaculties,
        printTrends,
        recentPrints
      });

    } catch (error) {
      console.error('Error fetching analytics:', error);
      showNotification('Error loading analytics', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeveloperReset = async () => {
    if (!developerPassword) {
      showNotification('Enter the developer password first', 'warning');
      return;
    }

    if (resetConfirmation !== 'RESET ACTIVITY DATA') {
      showNotification('Type RESET ACTIVITY DATA to confirm', 'warning');
      return;
    }

    setResetting(true);
    try {
      const response = await fetch('/api/admin/developer-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          password: developerPassword,
          confirmation: resetConfirmation
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to reset operational data');
      }

      showNotification(data.message || 'Operational data reset completed', 'success');
      setDeveloperPassword('');
      setResetConfirmation('');
      await fetchAnalytics();
    } catch (error) {
      console.error('Developer reset failed:', error);
      showNotification(error.message || 'Developer reset failed', 'error');
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '400px' 
      }}>
        <div style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
          <div>Loading analytics...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="header">
        <h1>📊 Analytics Dashboard</h1>
        <div className="btn-group">
          <button 
            className={`btn btn-sm ${dateRange === 'week' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setDateRange('week')}
          >
            This Week
          </button>
          <button 
            className={`btn btn-sm ${dateRange === 'month' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setDateRange('month')}
          >
            This Month
          </button>
          <button 
            className={`btn btn-sm ${dateRange === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setDateRange('all')}
          >
            All Time
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">🎴 Total Cards Approved</div>
          <div className="stat-value">{analytics.totalCards}</div>
          <div className="stat-change">From capture app</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">🖨️ Total Printed</div>
          <div className="stat-value">{analytics.totalPrinted}</div>
          <div className="stat-change">{analytics.printedToday} today</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">✅ Total Collected</div>
          <div className="stat-value">{analytics.totalCollected}</div>
          <div className="stat-change positive">{analytics.collectionRate}% collection rate</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">⏳ Pending Collection</div>
          <div className="stat-value">{analytics.pendingCollection}</div>
          <div className="stat-change">Awaiting pickup</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">📅 Avg. Prints/Day</div>
          <div className="stat-value">{analytics.avgPrintsPerDay}</div>
          <div className="stat-change">Last 30 days</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">❌ Failed Prints</div>
          <div className="stat-value">{analytics.failedPrints}</div>
          <div className="stat-change">In queue</div>
        </div>
      </div>

      <div className="grid-2">
        {/* Print Trends */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">📈 Print Trends (Last 7 Days)</h3>
          </div>
          <div style={{ padding: '1.5rem' }}>
            {analytics.printTrends.map((trend, index) => (
              <div key={index} style={{ marginBottom: '1rem' }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  marginBottom: '0.25rem',
                  fontSize: '0.9rem'
                }}>
                  <span>{trend.date}</span>
                  <span style={{ fontWeight: '600' }}>{trend.count} cards</span>
                </div>
                <div style={{ 
                  background: 'var(--bg)', 
                  borderRadius: '4px', 
                  height: '8px',
                  overflow: 'hidden'
                }}>
                  <div style={{ 
                    background: 'var(--secondary)', 
                    height: '100%',
                    width: `${Math.min((trend.count / Math.max(...analytics.printTrends.map(t => t.count))) * 100, 100)}%`,
                    transition: 'width 0.3s'
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Faculties */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">🏛️ Top Faculties by Print Volume</h3>
          </div>
          {analytics.topFaculties.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Faculty</th>
                  <th>Cards Printed</th>
                  <th>Percentage</th>
                </tr>
              </thead>
              <tbody>
                {analytics.topFaculties.map((item, index) => (
                  <tr key={index}>
                    <td>{item.faculty}</td>
                    <td>{item.count}</td>
                    <td>
                      <span className="badge badge-info">
                        {Math.round((item.count / analytics.totalPrinted) * 100)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>
              No data available
            </div>
          )}
        </div>
      </div>

      {/* Time Period Stats */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">📅 Time Period Statistics</h3>
        </div>
        <div className="grid-2">
          <div style={{ padding: '1.5rem' }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>
                Today
              </div>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--secondary)' }}>
                {analytics.printedToday}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                cards printed
              </div>
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>
                This Week
              </div>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--secondary)' }}>
                {analytics.printedThisWeek}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                cards printed
              </div>
            </div>
          </div>
          <div style={{ padding: '1.5rem' }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>
                This Month
              </div>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--secondary)' }}>
                {analytics.printedThisMonth}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                cards printed
              </div>
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>
                Collection Rate
              </div>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--success)' }}>
                {analytics.collectionRate}%
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                {analytics.totalCollected} of {analytics.totalPrinted} collected
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Prints */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">🕒 Recent Prints</h3>
        </div>
        {analytics.recentPrints.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>ID Number</th>
                <th>Faculty</th>
                <th>Printed At</th>
                <th>Printed By</th>
              </tr>
            </thead>
            <tbody>
              {analytics.recentPrints.map((print, index) => (
                <tr key={index}>
                  <td>{print.surname} {print.other_names}</td>
                  <td>{print.matric_no || print.staff_id}</td>
                  <td>{print.faculty}</td>
                  <td>{new Date(print.printed_at).toLocaleString()}</td>
                  <td>Staff</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>
            No prints yet
          </div>
        )}
      </div>

      <div className="card" style={{ border: '1px solid #c94b4b', marginTop: '2rem' }}>
        <div className="card-header">
          <h3 className="card-title">🔐 Developer Reset Key</h3>
        </div>
        <div style={{ padding: '1.5rem' }}>
          <p style={{ marginBottom: '0.75rem', color: 'var(--text-dim)' }}>
            Clears operational activity data only. User accounts, inventory setup, and scheduling configuration survive.
          </p>
          <p style={{ marginBottom: '1rem', color: '#c94b4b', fontWeight: '600' }}>
            This wipes captured and approved card activity, print queue and history, collections, requests, reports, logs, and scheduling activity records.
          </p>
          <div style={{ display: 'grid', gap: '0.75rem', maxWidth: '480px' }}>
            <input
              type="password"
              className="form-control"
              placeholder="Developer password"
              value={developerPassword}
              onChange={(e) => setDeveloperPassword(e.target.value)}
            />
            <input
              type="text"
              className="form-control"
              placeholder="Type RESET ACTIVITY DATA"
              value={resetConfirmation}
              onChange={(e) => setResetConfirmation(e.target.value)}
            />
            <button
              className="btn btn-danger"
              onClick={handleDeveloperReset}
              disabled={resetting}
              style={{ justifySelf: 'start' }}
            >
              {resetting ? '⏳ Resetting...' : 'Reset Operational Data'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}