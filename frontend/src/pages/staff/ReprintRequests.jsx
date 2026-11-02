import { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import SubmitReprintForm from '../../components/staff/SubmitReprintForm';
import { showNotification } from '../../utils/errorHandler';

export default function ReprintRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [requestToPrint, setRequestToPrint] = useState(null);

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
        // Filter to show only current user's requests
        const userId = JSON.parse(localStorage.getItem('user')).id;
        const myRequests = data.requests.filter(r => r.requested_by === userId);
        setRequests(myRequests);
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

  const handlePrintApproved = (request) => {
    setRequestToPrint(request);
    setConfirmDialogOpen(true);
  };

  const confirmPrintApproved = async () => {
    if (!requestToPrint) return;

    try {
      // Find the card in approved_cards by matric number
      const cardsResponse = await fetch('/api/approved-cards', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const cardsData = await cardsResponse.json();
      
      if (!cardsResponse.ok) {
        showNotification('Failed to fetch card details', 'error');
        return;
      }

      const card = cardsData.cards.find(c => 
        c.matric_no === requestToPrint.matric_number || c.staff_id === requestToPrint.matric_number
      );

      if (!card) {
        showNotification('Card not found in approved cards', 'error');
        return;
      }

      // Add to print queue
      const response = await fetch('/api/print-queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ cardId: card.card_id || card.id })
      });

      const data = await response.json();

      if (response.ok) {
        showNotification('Card added to Print Queue successfully', 'success');
        
        // Update request status to 'completed'
        await fetch(`/api/reprint/${requestToPrint.id}/status`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ 
            status: 'completed', 
            notes: 'Added to print queue' 
          })
        });
        
        fetchRequests(); // Refresh the list
      } else {
        showNotification(data.message || 'Failed to add to print queue', 'error');
      }
    } catch (error) {
      console.error('Error adding to print queue:', error);
      showNotification('Error adding to print queue', 'error');
    }
  };

  const submitRequest = () => {
    setModalOpen(true);
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
        <h1>🔄 Reprint Requests</h1>
        <button className="btn btn-primary btn-sm" onClick={submitRequest}>
          ➕ Submit Reprint Request
        </button>
      </div>

      <div className="card">
        {requests.length === 0 ? (
          <div style={{ 
            padding: '3rem', 
            textAlign: 'center', 
            color: 'var(--text-dim)' 
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔄</div>
            <p>No reprint requests yet. Submit your first request!</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Matric Number</th>
                <th>Student Name</th>
                <th>Reason</th>
                <th>Date</th>
                <th>Status</th>
                <th>Notes</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(req => (
                <tr key={req.id}>
                  <td>{req.matric_number}</td>
                  <td>{req.student_name}</td>
                  <td style={{ maxWidth: '200px' }}>
                    <div style={{ 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      whiteSpace: 'nowrap' 
                    }}>
                      {req.reason}
                    </div>
                  </td>
                  <td>{new Date(req.created_at).toLocaleDateString()}</td>
                  <td>
                    <span className={`badge badge-${
                      req.status === 'approved' ? 'success' : 
                      req.status === 'rejected' ? 'danger' :
                      req.status === 'completed' ? 'info' :
                      'warning'
                    }`}>
                      {req.status}
                    </span>
                  </td>
                  <td>{req.notes || '-'}</td>
                  <td>
                    {req.status === 'approved' && (
                      <button 
                        className="btn btn-primary btn-sm"
                        onClick={() => handlePrintApproved(req)}
                      >
                        🖨️ Add to Print Queue
                      </button>
                    )}
                    {req.status === 'completed' && (
                      <span style={{ color: 'var(--success)', fontSize: '0.9rem' }}>
                        ✓ Printed
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
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Submit Reprint Request"
        size="medium"
      >
        <SubmitReprintForm
          onSubmit={(newRequest) => {
            setRequests([newRequest, ...requests]);
            showNotification('Reprint request submitted successfully', 'success');
          }}
          onClose={() => setModalOpen(false)}
        />
      </Modal>

      <ConfirmDialog
        isOpen={confirmDialogOpen}
        onClose={() => {
          setConfirmDialogOpen(false);
          setRequestToPrint(null);
        }}
        onConfirm={confirmPrintApproved}
        title="Add to Print Queue"
        message={requestToPrint ? `Add this approved reprint to Print Queue?\n\n${requestToPrint.student_name}\n${requestToPrint.matric_number}` : ''}
        type="confirm"
        confirmText="Add to Queue"
        cancelText="Cancel"
      />
    </>
  );
}