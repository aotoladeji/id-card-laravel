import { useState, useEffect } from 'react';
import { showNotification } from '../../utils/errorHandler';
import { printReport, getDateRange } from '../../utils/printReport';

export default function InventoryManagement() {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState('monthly');

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      const response = await fetch('/api/inventory', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (response.ok) {
        setInventory(data.inventory);
      } else {
        showNotification(data.message || 'Failed to fetch inventory', 'error');
      }
    } catch (error) {
      showNotification('Unable to connect to server', 'error');
    } finally {
      setLoading(false);
    }
  };

  const approveItem = async (id) => {
    try {
      const response = await fetch(`/api/inventory/${id}/approve`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ status: 'approved' })
      });
      const data = await response.json();
      if (response.ok) {
        setInventory(inventory.map(item =>
          item.id === id ? { ...item, status: 'approved' } : item
        ));
        showNotification('Item approved successfully', 'success');
      } else {
        showNotification(data.message || 'Failed to approve', 'error');
      }
    } catch (error) {
      showNotification('Unable to connect to server', 'error');
    }
  };

  const handlePrint = () => {
    const { startDate, endDate, label } = getDateRange(reportType);

    const filtered = inventory.filter(item => {
      const d = new Date(item.created_at);
      return d >= startDate && d <= endDate;
    });

    const totalQty = filtered.reduce((sum, i) => sum + parseInt(i.quantity || 0), 0);

    printReport({
      title: 'Inventory Report',
      subtitle: label,
      reportType: reportType.charAt(0).toUpperCase() + reportType.slice(1),
      summary: [
        { label: 'Total Items', value: filtered.length },
        { label: 'Total Quantity', value: totalQty },
        { label: 'Approved', value: filtered.filter(i => i.status === 'approved').length },
        { label: 'Pending', value: filtered.filter(i => i.status === 'pending').length },
      ],
      columns: ['Item Name', 'Quantity', 'Unit', 'Added By', 'Date Added', 'Status'],
      rows: filtered.map(item => [
        item.item_name,
        item.quantity,
        item.unit,
        item.added_by_name || 'N/A',
        new Date(item.created_at).toLocaleDateString(),
        item.status
      ])
    });
  };

  const totalItems = inventory.reduce((sum, item) => sum + parseInt(item.quantity || 0), 0);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
      <div style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
        <div>Loading inventory...</div>
      </div>
    </div>
  );

  return (
    <>
      <div className="header">
        <h1>📦 Inventory Management</h1>
        <div className="btn-group">
          <select
            className="form-control"
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            style={{ width: 'auto', padding: '0.4rem 0.75rem' }}
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="annually">Annually</option>
          </select>
          <button className="btn btn-primary btn-sm" onClick={handlePrint}>
            🖨️ Print Report
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Items in Store</div>
          <div className="stat-value">{totalItems}</div>
          <div className="stat-change">{inventory.length} categories</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Approval</div>
          <div className="stat-value">{inventory.filter(i => i.status === 'pending').length}</div>
          <div className="stat-change">Awaiting review</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Approved Items</div>
          <div className="stat-value">{inventory.filter(i => i.status === 'approved').length}</div>
          <div className="stat-change positive">Ready to use</div>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Item Name</th>
              <th>Quantity</th>
              <th>Unit</th>
              <th>Added By</th>
              <th>Date Added</th>
              <th>Last Restocked</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {inventory.map(item => (
              <tr key={item.id}>
                <td>{item.item_name}</td>
                <td>{item.quantity}</td>
                <td>{item.unit}</td>
                <td>{item.added_by_name || 'N/A'}</td>
                <td>{new Date(item.created_at).toLocaleDateString()}</td>
                <td>{item.last_restocked ? new Date(item.last_restocked).toLocaleDateString() : 'Never'}</td>
                <td>
                  <span className={`badge badge-${item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'danger' : 'warning'}`}>
                    {item.status}
                  </span>
                </td>
                <td>
                  {item.status === 'pending' && (
                    <button className="btn btn-success btn-sm" onClick={() => approveItem(item.id)}>
                      ✓ Approve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}