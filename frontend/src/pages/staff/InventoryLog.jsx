import { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import AddInventoryForm from '../../components/staff/AddInventoryForm';
import FaultyDeliveryForm from '../../components/staff/FaultyDeliveryForm';
import { showNotification } from '../../utils/errorHandler';

export default function InventoryLog() {
  const [inventory, setInventory] = useState([]);
  const [faultyDeliveries, setFaultyDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [faultyLoading, setFaultyLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFaultyModal, setShowFaultyModal] = useState(false);
  const [activeTab, setActiveTab] = useState('inventory');
  const [selectedFaulty, setSelectedFaulty] = useState(null);
  const [showFaultyDetail, setShowFaultyDetail] = useState(false);

  const user = JSON.parse(localStorage.getItem('user'));

  useEffect(() => {
    fetchInventory();
    fetchFaultyDeliveries();
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

  const fetchFaultyDeliveries = async () => {
    try {
      const response = await fetch('/api/inventory/faulty', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (response.ok) {
        // Only show this staff member's own reports
        const myReports = data.deliveries.filter(
          d => d.reported_by === user?.id
        );
        setFaultyDeliveries(myReports);
      } else {
        showNotification(data.message || 'Failed to fetch faulty deliveries', 'error');
      }
    } catch (error) {
      showNotification('Unable to connect to server', 'error');
    } finally {
      setFaultyLoading(false);
    }
  };

  const handleInventoryAdded = (newItem) => {
    setInventory(prev => [newItem, ...prev]);
    setShowAddModal(false);
    showNotification('Inventory item added successfully', 'success');
  };

  const handleFaultyLogged = (newReport) => {
    setFaultyDeliveries(prev => [newReport, ...prev]);
    setShowFaultyModal(false);
    showNotification('Faulty delivery logged successfully', 'success');
  };

  const viewFaultyDetail = (delivery) => {
    setSelectedFaulty(delivery);
    setShowFaultyDetail(true);
  };

  const getStatusBadge = (status) => {
    const map = {
      pending: 'warning',
      approved: 'success',
      rejected: 'danger',
      acknowledged: 'info',
      resolved: 'success'
    };
    return map[status] || 'warning';
  };

  // My own inventory submissions
  const myInventory = inventory.filter(i => i.added_by === user?.id);
  const KNOWN_CATEGORIES = ['ribbons', 'film', 'blank cards', 'filter', 'cleaner'];
  const othersInventory = myInventory.filter(i => !KNOWN_CATEGORIES.includes(i.item_name?.toLowerCase()));

  return (
    <>
      <div className="header">
        <h1>📦 Inventory & Deliveries</h1>
        <div className="btn-group">
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>
            ➕ Add Inventory
          </button>
          <button className="btn btn-warning btn-sm" onClick={() => setShowFaultyModal(true)}>
            ⚠️ Log Faulty Delivery
          </button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div style={{
        display: 'flex',
        gap: '0',
        marginBottom: '1.5rem',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        padding: '0.25rem',
        width: 'fit-content'
      }}>
        <button
          onClick={() => setActiveTab('inventory')}
          style={{
            padding: '0.5rem 1.5rem',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'inventory' ? '600' : '400',
            background: activeTab === 'inventory' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'inventory' ? 'white' : 'var(--text-dim)',
            transition: 'all 0.2s'
          }}
        >
          📦 My Inventory Logs ({myInventory.length})
        </button>
        <button
          onClick={() => setActiveTab('faulty')}
          style={{
            padding: '0.5rem 1.5rem',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'faulty' ? '600' : '400',
            background: activeTab === 'faulty' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'faulty' ? 'white' : 'var(--text-dim)',
            transition: 'all 0.2s',
            position: 'relative'
          }}
        >
          ⚠️ Faulty Delivery Reports ({faultyDeliveries.length})
          {faultyDeliveries.filter(d => d.status === 'pending').length > 0 && (
            <span style={{
              position: 'absolute',
              top: '-6px',
              right: '-6px',
              background: 'var(--danger)',
              color: 'white',
              borderRadius: '50%',
              width: '18px',
              height: '18px',
              fontSize: '0.7rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '700'
            }}>
              {faultyDeliveries.filter(d => d.status === 'pending').length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('others')}
          style={{
            padding: '0.5rem 1.5rem',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'others' ? '600' : '400',
            background: activeTab === 'others' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'others' ? 'white' : 'var(--text-dim)',
            transition: 'all 0.2s'
          }}
        >
          🔖 Others ({myInventory.filter(i => !KNOWN_CATEGORIES.includes(i.item_name?.toLowerCase())).length})
        </button>
      </div>

      {/* Inventory Tab */}
      {activeTab === 'inventory' && (
        <div className="card">
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
              Loading inventory...
            </div>
          ) : myInventory.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
              <p>You haven't logged any inventory yet.</p>
              <button
                className="btn btn-primary"
                style={{ marginTop: '1rem' }}
                onClick={() => setShowAddModal(true)}
              >
                ➕ Add Your First Item
              </button>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Quantity</th>
                  <th>Unit</th>
                  <th>Date Added</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {myInventory.map(item => (
                  <tr key={item.id}>
                    <td>{item.item_name}</td>
                    <td>{item.quantity}</td>
                    <td>{item.unit}</td>
                    <td>{new Date(item.created_at).toLocaleDateString()}</td>
                    <td>
                      <span className={`badge badge-${getStatusBadge(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Faulty Deliveries Tab */}
      {activeTab === 'faulty' && (
        <div className="card">
          {faultyLoading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
              Loading faulty deliveries...
            </div>
          ) : faultyDeliveries.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
              <p>No faulty delivery reports submitted yet.</p>
              <button
                className="btn btn-warning"
                style={{ marginTop: '1rem' }}
                onClick={() => setShowFaultyModal(true)}
              >
                ⚠️ Log a Faulty Delivery
              </button>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Quantity</th>
                  <th>Issue Description</th>
                  <th>Date Reported</th>
                  <th>Status</th>
                  <th>Attested On</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {faultyDeliveries.map(delivery => (
                  <tr key={delivery.id}>
                    <td>{delivery.item_name}</td>
                    <td>{delivery.quantity}</td>
                    <td style={{ maxWidth: '200px' }}>
                      <div style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }} title={delivery.issue_description}>
                        {delivery.issue_description}
                      </div>
                    </td>
                    <td>{new Date(delivery.created_at).toLocaleDateString()}</td>
                    <td>
                      <span className={`badge badge-${getStatusBadge(delivery.status)}`}>
                        {delivery.status === 'acknowledged' ? '✓ Acknowledged' :
                         delivery.status === 'resolved' ? '✓ Resolved' :
                         '⏳ Pending'}
                      </span>
                    </td>
                    <td>
                      {delivery.resolved_at
                        ? new Date(delivery.resolved_at).toLocaleDateString()
                        : <span style={{ color: 'var(--text-dim)' }}>—</span>
                      }
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => viewFaultyDetail(delivery)}
                      >
                        👁️ View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Others Inventory Tab */}
      {activeTab === 'others' && (
        <div className="card">
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
              Loading...
            </div>
          ) : othersInventory.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔖</div>
              <p>No "Others" inventory items logged yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Quantity</th>
                  <th>Unit</th>
                  <th>Date Added</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {othersInventory.map(item => (
                  <tr key={item.id}>
                    <td>{item.item_name}</td>
                    <td>{item.quantity}</td>
                    <td>{item.unit}</td>
                    <td>{new Date(item.created_at).toLocaleDateString()}</td>
                    <td>
                      <span className={`badge badge-${getStatusBadge(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Others Inventory Tab */}
      {activeTab === 'others' && (
        <div className="card">
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
              Loading...
            </div>
          ) : othersInventory.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔖</div>
              <p>No "Others" inventory items logged yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Quantity</th>
                  <th>Unit</th>
                  <th>Date Added</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {othersInventory.map(item => (
                  <tr key={item.id}>
                    <td>{item.item_name}</td>
                    <td>{item.quantity}</td>
                    <td>{item.unit}</td>
                    <td>{new Date(item.created_at).toLocaleDateString()}</td>
                    <td>
                      <span className={`badge badge-${getStatusBadge(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Add Inventory Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Inventory Item"
        size="medium"
      >
        <AddInventoryForm
          onAdd={handleInventoryAdded}
          onClose={() => setShowAddModal(false)}
        />
      </Modal>

      {/* Log Faulty Delivery Modal */}
      <Modal
        isOpen={showFaultyModal}
        onClose={() => setShowFaultyModal(false)}
        title="Log Faulty Delivery"
        size="medium"
      >
        <FaultyDeliveryForm
          onSubmit={handleFaultyLogged}
          onClose={() => setShowFaultyModal(false)}
        />
      </Modal>

      {/* Faulty Delivery Detail Modal */}
      <Modal
        isOpen={showFaultyDetail}
        onClose={() => setShowFaultyDetail(false)}
        title="Faulty Delivery Details"
        size="medium"
      >
        {selectedFaulty && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Status Banner */}
            <div style={{
              padding: '1rem',
              borderRadius: '10px',
              background: selectedFaulty.status === 'resolved' ? 'rgba(34,197,94,0.1)' :
                          selectedFaulty.status === 'acknowledged' ? 'rgba(59,130,246,0.1)' :
                          'rgba(245,158,11,0.1)',
              border: `1px solid ${
                selectedFaulty.status === 'resolved' ? 'var(--success)' :
                selectedFaulty.status === 'acknowledged' ? 'var(--secondary)' :
                'var(--warning)'
              }`,
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              <div style={{ fontSize: '1.75rem' }}>
                {selectedFaulty.status === 'resolved' ? '✅' :
                 selectedFaulty.status === 'acknowledged' ? '👁️' : '⏳'}
              </div>
              <div>
                <div style={{ fontWeight: '600', marginBottom: '0.2rem' }}>
                  {selectedFaulty.status === 'resolved' ? 'Issue Resolved' :
                   selectedFaulty.status === 'acknowledged' ? 'Acknowledged by Supervisor/Admin' :
                   'Awaiting Acknowledgment'}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                  {selectedFaulty.resolved_at
                    ? `Attested on ${new Date(selectedFaulty.resolved_at).toLocaleString()}`
                    : 'Your report is being reviewed'}
                </div>
              </div>
            </div>

            {/* Report Details */}
            <div style={{
              background: 'var(--bg)',
              borderRadius: '10px',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}>
              <h4 style={{ marginBottom: '0.25rem', color: 'var(--text-dim)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Report Details
              </h4>
              {[
                { label: 'Item Name', value: selectedFaulty.item_name },
                { label: 'Quantity Affected', value: selectedFaulty.quantity },
                { label: 'Date Reported', value: new Date(selectedFaulty.created_at).toLocaleString() },
              ].map(field => (
                <div key={field.label} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingBottom: '0.5rem',
                  borderBottom: '1px solid var(--border)'
                }}>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>{field.label}</span>
                  <span style={{ fontWeight: '500' }}>{field.value}</span>
                </div>
              ))}
              <div>
                <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                  Issue Description
                </div>
                <div style={{
                  padding: '0.75rem',
                  background: 'var(--bg-elevated)',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  lineHeight: '1.5'
                }}>
                  {selectedFaulty.issue_description}
                </div>
              </div>
            </div>

            {/* Resolution Notes - only if attested */}
            {selectedFaulty.resolution_notes && (
              <div style={{
                background: 'var(--bg)',
                borderRadius: '10px',
                padding: '1rem'
              }}>
                <h4 style={{
                  marginBottom: '0.75rem',
                  color: 'var(--text-dim)',
                  fontSize: '0.8rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em'
                }}>
                  Supervisor / Admin Notes
                </h4>
                <div style={{
                  padding: '0.75rem',
                  background: 'var(--bg-elevated)',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  lineHeight: '1.5',
                  borderLeft: '3px solid var(--secondary)'
                }}>
                  {selectedFaulty.resolution_notes}
                </div>
                {selectedFaulty.resolved_at && (
                  <div style={{
                    marginTop: '0.5rem',
                    fontSize: '0.8rem',
                    color: 'var(--text-dim)',
                    textAlign: 'right'
                  }}>
                    — {new Date(selectedFaulty.resolved_at).toLocaleString()}
                  </div>
                )}
              </div>
            )}

            <button
              className="btn btn-secondary"
              onClick={() => setShowFaultyDetail(false)}
            >
              Close
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}