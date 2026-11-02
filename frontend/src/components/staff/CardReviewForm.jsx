import { useState } from 'react';

export default function CardReviewForm({ card, onApprove, onReject, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAction = async (approved) => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/cards/${card.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          status: approved ? 'approved' : 'rejected',
          notes: approved 
            ? 'Approved by staff - sent to supervisor' 
            : 'Rejected - recapture required'
        })
      });

      const data = await response.json();

      if (response.ok) {
        if (approved) {
          onApprove(data.card);
        } else {
          onReject(data.card);
        }
        onClose();
      } else {
        setError(data.message || 'Failed to update card');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {error && (
        <div className="alert alert-danger">
          {error}
        </div>
      )}

      <div style={{
        padding: '2rem',
        background: 'var(--bg)',
        borderRadius: '10px',
        marginBottom: '1.5rem',
        border: '2px solid var(--border)'
      }}>
        <h3 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          ID CARD PREVIEW
        </h3>
        
        <div className="grid-2" style={{ gap: '2rem' }}>
          <div>
            <div style={{ 
              fontSize: '5rem', 
              textAlign: 'center', 
              marginBottom: '1rem',
              background: 'var(--bg-elevated)',
              padding: '2rem',
              borderRadius: '10px'
            }}>
              {card.photo_url ? '📸' : '👤'}
            </div>
          </div>
          
          <div>
            <div style={{ marginBottom: '1rem' }}>
              <strong>Name:</strong>
              <div style={{ fontSize: '1.1rem', marginTop: '0.25rem' }}>
                {card.full_name}
              </div>
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <strong>Matric/Staff No.:</strong>
              <div style={{ fontSize: '1.1rem', marginTop: '0.25rem' }}>
                {card.matric_number}
              </div>
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <strong>Faculty:</strong>
              <div style={{ fontSize: '1.1rem', marginTop: '0.25rem' }}>
                {card.faculty}
              </div>
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <strong>Department:</strong>
              <div style={{ fontSize: '1.1rem', marginTop: '0.25rem' }}>
                {card.department}
              </div>
            </div>
            
            <div>
              <strong>Level:</strong>
              <div style={{ fontSize: '1.1rem', marginTop: '0.25rem' }}>
                {card.level}
              </div>
            </div>
          </div>
        </div>

        <div style={{ 
          marginTop: '1.5rem', 
          padding: '1rem', 
          background: 'var(--bg-elevated)', 
          borderRadius: '8px',
          display: 'flex',
          gap: '2rem'
        }}>
          <div>
            <strong>Photo:</strong> {card.photo_url ? '✓ Captured' : '✗ Missing'}
          </div>
          <div>
            <strong>Signature:</strong> {card.signature_url ? '✓ Captured' : '✗ Missing'}
          </div>
        </div>
      </div>

      <div className="alert alert-warning">
        <strong>⚠️ Important:</strong> Please review the captured information carefully before approval.
      </div>

      <div className="btn-group">
        <button 
          className="btn btn-danger" 
          onClick={() => handleAction(false)}
          disabled={loading}
          style={{ flex: 1 }}
        >
          {loading ? 'Processing...' : '✗ Reject & Request Recapture'}
        </button>
        <button 
          className="btn btn-success" 
          onClick={() => handleAction(true)}
          disabled={loading}
          style={{ flex: 1 }}
        >
          {loading ? 'Processing...' : '✓ Approve & Send to Supervisor'}
        </button>
      </div>
    </div>
  );
}