import { useState, useEffect } from 'react';
import { showNotification } from '../../utils/errorHandler';

export default function PrintHistory() {
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState({
    startDate: '',
    endDate: ''
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    pages: 0
  });

  useEffect(() => {
    fetchHistory();
    fetchStats();
  }, [pagination.page, search, dateFilter]);

  const fetchHistory = async () => {
    try {
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        ...(search && { search }),
        ...(dateFilter.startDate && { startDate: dateFilter.startDate }),
        ...(dateFilter.endDate && { endDate: dateFilter.endDate })
      });

      const response = await fetch(`/api/print-history?${params}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      
      const data = await response.json();
      if (response.ok) {
        setHistory(data.history);
        setPagination(prev => ({ ...prev, ...data.pagination }));
      }
    } catch (error) {
      showNotification('Error fetching print history', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/print-history/stats', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (response.ok) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchHistory();
  };

  const clearFilters = () => {
    setSearch('');
    setDateFilter({ startDate: '', endDate: '' });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
        <div>Loading print history...</div>
      </div>
    );
  }

  return (
    <>
      <div className="header">
        <h1>📋 Print History</h1>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="stats-grid" style={{ marginBottom: '2rem' }}>
          <div className="stat-card">
            <div className="stat-label">Total Printed</div>
            <div className="stat-value">{stats.total_printed}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Printed Today</div>
            <div className="stat-value">{stats.printed_today}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">This Week</div>
            <div className="stat-value">{stats.printed_this_week}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">This Month</div>
            <div className="stat-value">{stats.printed_this_month}</div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <form onSubmit={handleSearch}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '1rem', alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Search</label>
              <input
                type="text"
                className="form-control"
                placeholder="Name, ID, or card number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Start Date</label>
              <input
                type="date"
                className="form-control"
                value={dateFilter.startDate}
                onChange={(e) => setDateFilter({ ...dateFilter, startDate: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>End Date</label>
              <input
                type="date"
                className="form-control"
                value={dateFilter.endDate}
                onChange={(e) => setDateFilter({ ...dateFilter, endDate: e.target.value })}
              />
            </div>
            <div className="btn-group" style={{ marginBottom: 0 }}>
              <button type="submit" className="btn btn-primary">
                🔍 Search
              </button>
              <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                ✕ Clear
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* History Table */}
      <div className="card">
        {history.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>
            No print history found
          </div>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>ID Number</th>
                  <th>Card Number</th>
                  <th>Printed Date</th>
                  <th>Printed By</th>
                  <th>Printer</th>
                  <th>Quality</th>
                </tr>
              </thead>
              <tbody>
                {history.map(record => (
                  <tr key={record.id}>
                    <td>
                      <strong>{record.surname}</strong> {record.other_names}
                    </td>
                    <td>{record.matric_no || record.staff_id || '—'}</td>
                    <td>{record.card_number || '—'}</td>
                    <td>
                      {new Date(record.printed_at).toLocaleDateString()} 
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginLeft: '0.5rem' }}>
                        {new Date(record.printed_at).toLocaleTimeString()}
                      </span>
                    </td>
                    <td>{record.printed_by_name || '—'}</td>
                    <td>{record.printer_name || '—'}</td>
                    <td>
                      <span className={`badge badge-${record.print_quality === 'high' ? 'success' : 'info'}`}>
                        {record.print_quality || 'standard'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div style={{ 
                padding: '1.5rem', 
                borderTop: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                  Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                </div>
                <div className="btn-group">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    disabled={pagination.page === 1}
                  >
                    ← Previous
                  </button>
                  <span style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center' }}>
                    Page {pagination.page} of {pagination.pages}
                  </span>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    disabled={pagination.page === pagination.pages}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}