import { useState } from 'react';

export default function RespondForm({ requestId, onSubmit, onClose }) {
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState('approved');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/material/${requestId}/respond`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          status,
          responseMessage: response
        })
      });

      const data = await res.json();

      if (res.ok) {
        onSubmit(data.request);
        onClose();
      } else {
        setError(data.message || 'Failed to submit response');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="alert alert-danger">
          {error}
        </div>
      )}

      <div className="form-group">
        <label>Decision *</label>
        <select 
          className="form-control"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          required
        >
          <option value="approved">Approve</option>
          <option value="rejected">Reject</option>
        </select>
      </div>

      <div className="form-group">
        <label>Response Message *</label>
        <textarea 
          className="form-control" 
          rows="4"
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="Enter your response..."
          required
        ></textarea>
      </div>

      <div className="btn-group">
        <button 
          type="submit" 
          className={`btn ${status === 'approved' ? 'btn-success' : 'btn-danger'}`}
          disabled={loading}
          style={{ flex: 1 }}
        >
          {loading ? 'Submitting...' : `${status === 'approved' ? '✓ Approve' : '✗ Reject'}`}
        </button>
      </div>
    </form>
  );
}