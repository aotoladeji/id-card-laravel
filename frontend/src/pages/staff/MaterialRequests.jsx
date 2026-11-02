import { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import SubmitMaterialRequestForm from '../../components/staff/SubmitMaterialRequestForm';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { showNotification } from '../../utils/errorHandler';

export default function MaterialRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [replyModalOpen, setReplyModalOpen] = useState(false);
  const [replyingToRequest, setReplyingToRequest] = useState(null);
  const [replyText, setReplyText] = useState('');
  const { dialogState, showDialog, closeDialog } = useConfirmDialog();

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
        // Filter to show only current user's requests
        const userId = JSON.parse(localStorage.getItem('user')).id;
        const myRequests = data.requests.filter(r => r.requested_by === userId);
        setRequests(myRequests);
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

  const submitRequest = () => {
    setModalOpen(true);
  };

  const openReplyModal = (req) => {
    setReplyingToRequest(req);
    setReplyText('');
    setReplyModalOpen(true);
  };

  const submitQueryReply = async () => {
    if (!replyText.trim()) {
      showNotification('Please enter a reply', 'warning');
      return;
    }
    try {
      const response = await fetch(`/api/material/${replyingToRequest.id}/reply-query`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ queryReply: replyText.trim() })
      });
      const data = await response.json();
      if (response.ok) {
        setRequests(requests.map(r => r.id === replyingToRequest.id ? data.request : r));
        setReplyModalOpen(false);
        showNotification('Reply submitted. Your request is back under review.', 'success');
      } else {
        showNotification(data.message || 'Failed to submit reply', 'error');
      }
    } catch (error) {
      console.error('Error submitting reply:', error);
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
          <div>Loading requests...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="header">
        <h1>📦 Material Requisition</h1>
        <button className="btn btn-primary btn-sm" onClick={submitRequest}>
          ➕ Request Materials
        </button>
      </div>

      {/* Pending query alert banner */}
      {requests.some(r => r.status === 'queried' && !r.query_reply) && (
        <div style={{
          padding: '1rem 1.25rem',
          background: 'rgba(245, 158, 11, 0.15)',
          border: '1px solid rgba(245, 158, 11, 0.5)',
          borderRadius: '10px',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <span style={{ fontSize: '1.5rem' }}>⚠️</span>
          <div>
            <strong>You have unanswered queries.</strong>
            <span style={{ color: 'var(--text-dim)', marginLeft: '0.5rem' }}>
              A supervisor or admin has asked you to justify a material request. Scroll down and click "Reply to Query".
            </span>
          </div>
        </div>
      )}

      <div className="card">
        {requests.length === 0 ? (
          <div style={{ 
            padding: '3rem', 
            textAlign: 'center', 
            color: 'var(--text-dim)' 
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
            <p>No material requests yet. Submit your first request!</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Urgency</th>
                <th>Date</th>
                <th>Status</th>
                <th>Query / Response</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(req => (
                <tr key={req.id} style={
                  req.status === 'queried' && !req.query_reply
                    ? { background: 'rgba(245, 158, 11, 0.07)', outline: '1px solid rgba(245, 158, 11, 0.3)' }
                    : {}
                }>
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
                  <td>{new Date(req.created_at).toLocaleDateString()}</td>
                  <td>
                    <span className={`badge badge-${
                      req.status === 'approved' ? 'success' : 
                      req.status === 'rejected' ? 'danger' :
                      req.status === 'queried' ? 'warning' :
                      'warning'
                    }`}>
                      {req.status === 'queried' ? '⚠️ queried' : req.status}
                    </span>
                  </td>
                  <td>
                    {req.query_message ? (
                      <div>
                        <p style={{ fontSize: '0.8rem', color: '#f59e0b', marginBottom: '0.25rem' }}>
                          <strong>❓ Query:</strong> {req.query_message}
                        </p>
                        {req.query_reply && (
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                            <strong>Your reply:</strong> {req.query_reply}
                          </p>
                        )}
                      </div>
                    ) : req.response_message ? (
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => showDialog({
                          type: 'alert',
                          title: 'Supervisor Response',
                          message: req.response_message
                        })}
                      >
                        👁️ View Response
                      </button>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    {req.status === 'queried' && !req.query_reply && (
                      <button
                        className="btn btn-warning btn-sm"
                        onClick={() => openReplyModal(req)}
                      >
                        📝 Reply to Query
                      </button>
                    )}
                    {req.status === 'queried' && req.query_reply && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>✓ Reply sent</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        isOpen={replyModalOpen}
        onClose={() => setReplyModalOpen(false)}
        title="Reply to Query"
        size="medium"
      >
        {replyingToRequest && (
          <div>
            <div style={{
              padding: '1rem',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '10px',
              marginBottom: '1.5rem'
            }}>
              <p style={{ marginBottom: '0.25rem' }}><strong>❓ Query from supervisor/admin:</strong></p>
              <p style={{ fontStyle: 'italic' }}>{replyingToRequest.query_message}</p>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                Your Reply
              </label>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Explain your usage and justify this request..."
                rows={4}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={submitQueryReply}>
                📤 Submit Reply
              </button>
              <button className="btn btn-secondary" onClick={() => setReplyModalOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Submit Material Request"
        size="medium"
      >
        <SubmitMaterialRequestForm
          onSubmit={(newRequest) => {
            setRequests([newRequest, ...requests]);
            showNotification('Material request submitted successfully', 'success');
          }}
          onClose={() => setModalOpen(false)}
        />
      </Modal>

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