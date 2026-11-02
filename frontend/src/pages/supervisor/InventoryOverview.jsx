import { useState, useEffect } from 'react';
import { showNotification } from '../../utils/errorHandler';

export default function InventoryOverview() {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      const response = await fetch('/api/inventory', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setInventory(data.inventory);
      } else {
        showNotification(data.message || 'Failed to fetch inventory', 'error');
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
      showNotification('Unable to connect to server', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredInventory = inventory.filter(item => {
    if (filter === 'all') return true;
    return item.status === filter;
  });

  const totalItems = inventory.reduce((sum, item) => sum + parseInt(item.quantity), 0);

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
          <div>Loading inventory...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="header">
        <h1>📦 Inventory Overview</h1>
        <div className="btn-group">
          <button 
            className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button 
            className={`btn btn-sm ${filter === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('pending')}
          >
            Pending
          </button>
          <button 
            className={`btn btn-sm ${filter === 'approved' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('approved')}
          >
            Approved
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Items in Store</div>
          <div className="stat-value">{totalItems}</div>
          <div className="stat-change">Across {inventory.length} categories</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Approval</div>
          <div className="stat-value">
            {inventory.filter(i => i.status === 'pending').length}
          </div>
          <div className="stat-change">Awaiting review</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Approved Items</div>
          <div className="stat-value">
            {inventory.filter(i => i.status === 'approved').length}
          </div>
          <div className="stat-change positive">Ready to use</div>
        </div>
      </div>

      <div className="card">
        {filteredInventory.length === 0 ? (
          <div style={{ 
            padding: '3rem', 
            textAlign: 'center', 
            color: 'var(--text-dim)' 
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
            <p>No inventory items found</p>
          </div>
        ) : (
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
              </tr>
            </thead>
            <tbody>
              {filteredInventory.map(item => (
                <tr key={item.id}>
                  <td>{item.item_name}</td>
                  <td>{item.quantity}</td>
                  <td>{item.unit}</td>
                  <td>{item.added_by_name || 'N/A'}</td>
                  <td>{new Date(item.created_at).toLocaleDateString()}</td>
                  <td>
                    {item.last_restocked 
                      ? new Date(item.last_restocked).toLocaleDateString() 
                      : 'Never'}
                  </td>
                  <td>
                    <span className={`badge badge-${
                      item.status === 'approved' ? 'success' : 
                      item.status === 'rejected' ? 'danger' : 
                      'warning'
                    }`}>
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}