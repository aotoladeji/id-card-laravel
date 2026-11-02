import { useState, useEffect } from 'react';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { showNotification } from '../../utils/errorHandler';

export default function FaultyDeliveryManagement() {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const { dialogState, showDialog, closeDialog } = useConfirmDialog();

  useEffect(() => {
    fetchDeliveries();
  }, []);

  const fetchDeliveries = async () => {
    try {
      const response = await fetch('/api/inventory/faulty', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setDeliveries(data.deliveries);
      } else {
        showNotification(data.message || 'Failed to fetch deliveries', 'error');
      }
    } catch (error) {
      console.error('Error fetching faulty deliveries:', error);
      showNotification('Unable to connect to server', 'error');
    } finally {
      setLoading(false);
    }
  };

  const attestDelivery = async (id, resolveStatus) => {
    const notes = await showDialog({
      type: 'prompt',
      title: `${resolveStatus === 'resolved' ? 'Resolution' : 'Acknowledgment'} Notes`,
      message: `Enter ${resolveStatus === 'resolved' ? 'resolution' : 'acknowledgment'} notes:`
    });
    
    if (!notes) {
      showNotification('Notes are required', 'warning');
      return;
    }

    try {
      const response = await fetch(`/api/inventory/faulty/${id}/attest`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          status: resolveStatus,
          resolutionNotes: notes
        })
      });

      const data = await response.json();

      if (response.ok) {
        setDeliveries(deliveries.map(d => 
          d.id === id ? data.delivery : d
        ));
        showNotification(`Faulty delivery ${resolveStatus} successfully`, 'success');
      } else {
        showNotification(data.message || 'Failed to attest delivery', 'error');
      }
    } catch (error) {
      console.error('Error attesting delivery:', error);
      showNotification('Unable to connect to server', 'error');
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
          <div>Loading faulty deliveries...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="header">
        <h1>⚠️ Faulty Delivery Management</h1>
      </div>

      <div className="card">
        {deliveries.length === 0 ? (
          <div style={{ 
            padding: '3rem', 
            textAlign: 'center', 
            color: 'var(--text-dim)' 
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
            <p>No faulty delivery reports</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Issue Description</th>
                <th>Reported By</th>
                <th>Date Reported</th>
                <th>Status</th>
                <th>Resolution Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map(delivery => (
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
                  <td>{delivery.reported_by_name}</td>
                  <td>{new Date(delivery.created_at).toLocaleDateString()}</td>
                  <td>
                    <span className={`badge badge-${
                      delivery.status === 'resolved' ? 'success' : 
                      delivery.status === 'acknowledged' ? 'warning' : 
                      'danger'
                    }`}>
                      {delivery.status}
                    </span>
                  </td>
                  <td>
                    {delivery.resolved_at 
                      ? new Date(delivery.resolved_at).toLocaleDateString() 
                      : '-'}
                  </td>
                  <td>
                    <div className="btn-group">
                      {delivery.status === 'pending' && (
                        <button 
                          className="btn btn-warning btn-sm"
                          onClick={() => attestDelivery(delivery.id, 'acknowledged')}
                        >
                          ✓ Acknowledge
                        </button>
                      )}
                      {(delivery.status === 'pending' || delivery.status === 'acknowledged') && (
                        <button 
                          className="btn btn-success btn-sm"
                          onClick={() => attestDelivery(delivery.id, 'resolved')}
                        >
                          ✓ Resolve
                        </button>
                      )}
                      {delivery.resolution_notes && (
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => showDialog({
                            type: 'alert',
                            title: 'Resolution Notes',
                            message: `${delivery.resolution_notes}\n\nResolved: ${delivery.resolved_at ? new Date(delivery.resolved_at).toLocaleString() : 'N/A'}`
                          })}
                        >
                          👁️ View Notes
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        isOpen={dialogState.isOpen}
        type={dialogState.type}
        title={dialogState.title}
        message={dialogState.message}
        onConfirm={dialogState.onConfirm}
        onClose={closeDialog}
      />
    </>
  );
}