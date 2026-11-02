import { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import RespondForm from '../../components/supervisor/RespondForm';
import { showNotification } from '../../utils/errorHandler';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

export default function MaterialRequestsApproval() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const { dialogState, showDialog, closeDialog } = useConfirmDialog();
  const [viewResponseDialog, setViewResponseDialog] = useState({ isOpen: false, request: null });

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const response = await fetch('/api/material', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setRequests(data.requests);
      } else {
        showNotification(data.message || 'Failed to fetch requests', 'error');
      }
    } catch (error) {
      console.error('Error fetching material requests:', error);
      showNotification('Unable to connect to server', 'error');
    } finally {
      setLoading(false);
    }
  };

  const respondToRequest = (request) => {
    setSelectedRequest(request);
    setModalOpen(true);
  };

  const handleQueryRequest = async (req) => {
    const queryMessage = await showDialog({
      type: 'prompt',
      title: '🔍 Send Query to Staff',
      message: `Ask ${req.requested_by_username} to justify this request:`
    });
    if (!queryMessage) return;

    try {
      const response = await fetch(`/api/material/${req.id}/query`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ queryMessage })
      });
      const data = await response.json();
      if (response.ok) {
        setRequests(requests.map(r => r.id === req.id ? data.request : r));
        showNotification('Query sent to staff member', 'success');
      } else {
        showNotification(data.message || 'Failed to send query', 'error');
      }
    } catch (error) {
      console.error('Error sending query:', error);
      showNotification('Unable to connect to server', 'error');
    }
  };

  const forwardToAdmin = async (request) => {
    const inputs = await showDialog({
      title: 'Forward to Admin',
      message: 'Set urgency level and add forwarding notes:',
      type: 'multi-prompt',
      fields: [
        {
          name: 'urgency',
          label: 'Urgency Level',
          type: 'select',
          required: true,
          options: [
            { value: 'normal', label: 'Normal' },
            { value: 'high', label: 'High' },
            { value: 'urgent', label: 'Urgent' }
          ]
        },
        {
          name: 'notes',
          label: 'Forwarding Notes',
          type: 'textarea',
          placeholder: 'Add notes for admin...',
          rows: 3,
          required: false
        }
      ],
      confirmText: 'Forward',
      cancelText: 'Cancel'
    });
    
    if (!inputs) return;

    try {
      const response = await fetch(`/api/material/${request.id}/forward`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          urgency: inputs.urgency,
          forwardNotes: inputs.notes || 'Forwarded for admin review'
        })
      });

      const data = await response.json();

      if (response.ok) {
        setRequests(requests.map(req => 
          req.id === request.id ? data.request : req
        ));
        showNotification('Request forwarded to admin successfully', 'success');
      } else {
        showNotification(data.message || 'Failed to forward request', 'error');
      }
    } catch (error) {
      console.error('Error forwarding request:', error);
      showNotification('Unable to connect to server', 'error');
    }
  };

  const handleResponseSubmit = (updatedRequest) => {
    setRequests(requests.map(req => 
      req.id === updatedRequest.id ? updatedRequest : req
    ));
    showNotification('Response submitted successfully', 'success');
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
          <div>Loading requests...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="header">
        <h1>📦 Material Requests</h1>
      </div>

      <div className="card">
        {requests.length === 0 ? (
          <div style={{ 
            padding: '3rem', 
            textAlign: 'center', 
            color: 'var(--text-dim)' 
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
            <p>No material requests found</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Urgency</th>
                <th>Requested By</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(req => (
                <tr key={req.id}>
                  <td>{req.item_name}</td>
                  <td>{req.quantity}</td>
                  <td>
                    <span className={`badge badge-${
                      req.urgency === 'urgent' ? 'danger' : 
                      req.urgency === 'high' ? 'warning' : 
                      'info'
                    }`}>
                      {req.urgency}
                    </span>
                  </td>
                  <td>{req.requested_by_username}</td>
                  <td>{new Date(req.created_at).toLocaleDateString()}</td>
                  <td>
                    <span className={`badge badge-${
                      req.status === 'approved' ? 'success' : 
                      req.status === 'rejected' ? 'danger' : 
                      'warning'
                    }`}>
                      {req.status === 'queried' ? '🔍 queried' : req.status}
                    </span>
                  </td>
                  <td>
                    <div className="btn-group">
                      {req.status === 'pending' && (
                        <>
                          <button 
                            className="btn btn-secondary btn-sm"
                            onClick={() => respondToRequest(req)}
                          >
                            💬 Respond
                          </button>
                          <button 
                            className="btn btn-primary btn-sm"
                            onClick={() => forwardToAdmin(req)}
                          >
                            ➡️ Forward to Admin
                          </button>
                        </>
                      )}
                      {(req.status === 'pending' || req.status === 'queried') && (
                        <button 
                          className="btn btn-warning btn-sm"
                          onClick={() => handleQueryRequest(req)}
                        >
                          🔍 Query
                        </button>
                      )}
                      {req.status === 'queried' && req.query_reply && (
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => respondToRequest(req)}
                        >
                          💬 Respond
                        </button>
                      )}
                      {req.status !== 'pending' && req.status !== 'queried' && req.response_message && (
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => setViewResponseDialog({ isOpen: true, request: req })}
                        >
                          👁️ View Response
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

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Respond to Material Request"
        size="medium"
      >
        {selectedRequest && (
          <div>
            <div style={{ 
              padding: '1rem', 
              background: 'var(--bg)', 
              borderRadius: '10px', 
              marginBottom: '1.5rem' 
            }}>
              <p><strong>Item:</strong> {selectedRequest.item_name}</p>
              <p><strong>Quantity:</strong> {selectedRequest.quantity}</p>
              <p><strong>Urgency:</strong> {selectedRequest.urgency}</p>
              <p><strong>Requested By:</strong> {selectedRequest.requested_by_username}</p>
            </div>

            {selectedRequest.query_message && (
              <div style={{
                padding: '1rem',
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '10px',
                marginBottom: '1.5rem'
              }}>
                <p style={{ marginBottom: '0.5rem' }}>
                  <strong>🔍 Query sent:</strong>
                </p>
                <p style={{ fontStyle: 'italic', marginBottom: '1rem' }}>{selectedRequest.query_message}</p>
                {selectedRequest.query_reply ? (
                  <>
                    <p style={{ marginBottom: '0.25rem' }}><strong>💬 Staff reply:</strong></p>
                    <p style={{ color: 'var(--text)' }}>{selectedRequest.query_reply}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
                      Replied: {new Date(selectedRequest.query_replied_at).toLocaleString()}
                    </p>
                  </>
                ) : (
                  <p style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>⏳ Awaiting staff reply...</p>
                )}
              </div>
            )}

            <RespondForm
              requestId={selectedRequest.id}
              onSubmit={handleResponseSubmit}
              onClose={() => setModalOpen(false)}
            />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={dialogState.isOpen}
        onClose={closeDialog}
        onConfirm={dialogState.onConfirm}
        title={dialogState.title}
        message={dialogState.message}
        type={dialogState.type}
        confirmText={dialogState.confirmText}
        cancelText={dialogState.cancelText}
        placeholder={dialogState.placeholder}
        fields={dialogState.fields}
      />

      <ConfirmDialog
        isOpen={viewResponseDialog.isOpen}
        onClose={() => setViewResponseDialog({ isOpen: false, request: null })}
        onConfirm={() => setViewResponseDialog({ isOpen: false, request: null })}
        title="Response Details"
        message={viewResponseDialog.request ? `Response:\n\n${viewResponseDialog.request.response_message}\n\nResponded by: ${viewResponseDialog.request.responded_by_username || 'N/A'}\nDate: ${viewResponseDialog.request.responded_at ? new Date(viewResponseDialog.request.responded_at).toLocaleString() : 'N/A'}` : ''}
        type="alert"
        confirmText="Close"
      />
    </>
  );
}