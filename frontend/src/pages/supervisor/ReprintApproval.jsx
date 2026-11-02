import { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import { showNotification } from '../../utils/errorHandler';

export default function ReprintApproval() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState(null);
  const [editingCard, setEditingCard] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const response = await fetch('/api/reprint', {
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
      console.error('Error fetching reprint requests:', error);
      showNotification('Unable to connect to server', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (id, approved) => {
    const status = approved ? 'approved' : 'rejected';
    const notes = approved ? 'Approved by supervisor' : 'Rejected by supervisor';

    try {
      const response = await fetch(`/api/reprint/${id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ status, notes })
      });

      const data = await response.json();

      if (response.ok) {
        setRequests(requests.map(req => 
          req.id === id ? data.request : req
        ));
        showNotification(`Request ${status} successfully`, 'success');
      } else {
        showNotification(data.message || 'Failed to update request', 'error');
      }
    } catch (error) {
      console.error('Error updating request:', error);
      showNotification('Unable to connect to server', 'error');
    }
  };

  const filteredRequests = requests.filter(req => {
    if (filter === 'all') return true;
    return req.status === filter;
  });

  // Looks up the approved card behind a reprint request so the supervisor can
  // correct it before it goes back into the print queue.
  const openEditForRequest = async (req) => {
    setEditingRequest(req);
    setEditError('');
    setEditLoading(true);
    setEditModalOpen(true);

    try {
      const response = await fetch('/api/approved-cards', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();

      if (!response.ok) {
        setEditError(data.message || 'Failed to fetch card details');
        return;
      }

      const card = data.cards.find(c =>
        c.matric_no === req.matric_number || c.staff_id === req.matric_number
      );

      if (!card) {
        setEditError('No approved card found for this matric/staff number');
        return;
      }

      setEditingCard(card);
      setEditForm({
        surname: card.surname || '',
        otherNames: card.other_names || '',
        matricNo: card.matric_no || '',
        hall: card.hall || '',
        faculty: card.faculty || '',
        department: card.department || '',
        level: card.level || '',
        session: card.session || '',
        cardNumber: card.card_number || ''
      });
    } catch (error) {
      console.error('Error fetching card for edit:', error);
      setEditError('Unable to connect to server');
    } finally {
      setEditLoading(false);
    }
  };

  const handleEditFieldChange = (field, value) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setEditingRequest(null);
    setEditingCard(null);
    setEditForm(null);
    setEditError('');
  };

  // Saves the edited card, then queues it for printing and marks the
  // reprint request completed — all in one supervisor action.
  const saveEditAndSendToQueue = async () => {
    if (!editingRequest || !editingCard || !editForm) return;

    if (!editForm.surname.trim() || !editForm.otherNames.trim()) {
      setEditError('Surname and other names cannot be empty');
      return;
    }

    setSaving(true);
    setEditError('');

    try {
      const updateResponse = await fetch(`/api/approved-cards/${editingCard.card_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(editForm)
      });
      const updateData = await updateResponse.json();

      if (!updateResponse.ok) {
        setEditError(updateData.message || 'Failed to update card');
        return;
      }

      const queueResponse = await fetch('/api/print-queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ cardId: editingCard.card_id })
      });
      const queueData = await queueResponse.json();

      if (!queueResponse.ok) {
        setEditError(queueData.message || 'Failed to add card to print queue');
        return;
      }

      const statusResponse = await fetch(`/api/reprint/${editingRequest.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ status: 'completed', notes: 'Edited and queued for printing by supervisor' })
      });
      const statusData = await statusResponse.json();

      if (statusResponse.ok) {
        setRequests(requests.map(req => (req.id === editingRequest.id ? statusData.request : req)));
      }

      showNotification('Card updated and sent to print queue', 'success');
      closeEditModal();
    } catch (error) {
      console.error('Error saving card edit / sending to queue:', error);
      setEditError('Network error. Please try again.');
    } finally {
      setSaving(false);
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
        <h1>🔄 Reprint Approvals</h1>
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
          <button 
            className={`btn btn-sm ${filter === 'rejected' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('rejected')}
          >
            Rejected
          </button>
        </div>
      </div>

      <div className="card">
        {filteredRequests.length === 0 ? (
          <div style={{ 
            padding: '3rem', 
            textAlign: 'center', 
            color: 'var(--text-dim)' 
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
            <p>No reprint requests found</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Matric Number</th>
                <th>Student Name</th>
                <th>Reason</th>
                <th>Requested By</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map(req => (
                <tr key={req.id}>
                  <td>{req.matric_number}</td>
                  <td>{req.student_name}</td>
                  <td style={{ maxWidth: '250px' }}>
                    <div style={{ 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      whiteSpace: 'nowrap' 
                    }}>
                      {req.reason}
                    </div>
                  </td>
                  <td>{req.requested_by_username}</td>
                  <td>{new Date(req.created_at).toLocaleDateString()}</td>
                  <td>
                    <span className={`badge badge-${
                      req.status === 'approved' ? 'success' : 
                      req.status === 'rejected' ? 'danger' : 
                      'warning'
                    }`}>
                      {req.status}
                    </span>
                  </td>
                  <td>
                    {req.status === 'pending' && (
                      <div className="btn-group">
                        <button 
                          className="btn btn-success btn-sm"
                          onClick={() => handleApproval(req.id, true)}
                        >
                          ✓ Approve
                        </button>
                        <button 
                          className="btn btn-danger btn-sm"
                          onClick={() => handleApproval(req.id, false)}
                        >
                          ✗ Reject
                        </button>
                      </div>
                    )}
                    {req.status === 'approved' && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => openEditForRequest(req)}
                        title="Correct card details, then send straight to print queue"
                      >
                        ✏️ Edit & Send to Queue
                      </button>
                    )}
                    {req.status === 'completed' && (
                      <span style={{ color: 'var(--success)', fontSize: '0.9rem' }}>
                        ✓ Queued for printing
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        isOpen={editModalOpen}
        onClose={closeEditModal}
        title="Edit Card & Send to Print Queue"
        size="large"
      >
        <div style={{ padding: '1rem' }}>
          {editLoading && (
            <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '2rem' }}>
              Loading card details...
            </div>
          )}

          {!editLoading && editError && !editForm && (
            <div className="alert alert-danger">{editError}</div>
          )}

          {!editLoading && editForm && (
            <>
              <div className="alert alert-warning" style={{ marginBottom: '1.5rem' }}>
                <strong>ℹ️ Note:</strong> Correct any details below, then send straight to the
                print queue. This updates the stored card record and marks the reprint request
                as completed.
              </div>

              {editError && (
                <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
                  {editError}
                </div>
              )}

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1rem',
                marginBottom: '1.5rem'
              }}>
                <div className="form-group">
                  <label>Surname</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.surname}
                    onChange={(e) => handleEditFieldChange('surname', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Other Names</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.otherNames}
                    onChange={(e) => handleEditFieldChange('otherNames', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Matric Number</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.matricNo}
                    onChange={(e) => handleEditFieldChange('matricNo', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Hall</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.hall}
                    onChange={(e) => handleEditFieldChange('hall', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Faculty</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.faculty}
                    onChange={(e) => handleEditFieldChange('faculty', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Department</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.department}
                    onChange={(e) => handleEditFieldChange('department', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Level</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.level}
                    onChange={(e) => handleEditFieldChange('level', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Session</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.session}
                    onChange={(e) => handleEditFieldChange('session', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Card Number</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.cardNumber}
                    onChange={(e) => handleEditFieldChange('cardNumber', e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  className="btn btn-secondary"
                  onClick={closeEditModal}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-success"
                  onClick={saveEditAndSendToQueue}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : '💾 Save & Send to Print Queue'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}