import { useState } from 'react';

export default function SubmitReprintForm({ onSubmit, onClose }) {
  const [formData, setFormData] = useState({
    matricNumber: '',
    studentName: '',
    reason: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/reprint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (response.ok) {
        onSubmit(data.request);
        onClose();
      } else {
        setError(data.message || 'Failed to submit reprint request');
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
        <label>Matric/Staff Number *</label>
        <input 
          type="text" 
          className="form-control" 
          value={formData.matricNumber}
          onChange={(e) => setFormData({...formData, matricNumber: e.target.value})}
          placeholder="e.g., STU001"
          required
        />
      </div>

      <div className="form-group">
        <label>Student/Staff Name *</label>
        <input 
          type="text" 
          className="form-control" 
          value={formData.studentName}
          onChange={(e) => setFormData({...formData, studentName: e.target.value})}
          placeholder="e.g., John Doe"
          required
        />
      </div>

      <div className="form-group">
        <label>Reason for Reprint *</label>
        <textarea 
          className="form-control" 
          rows="4"
          value={formData.reason}
          onChange={(e) => setFormData({...formData, reason: e.target.value})}
          placeholder="Describe why a reprint is needed..."
          required
        ></textarea>
      </div>

      <button 
        type="submit" 
        className="btn btn-primary" 
        disabled={loading}
        style={{ width: '100%' }}
      >
        {loading ? 'Submitting...' : 'Submit Reprint Request'}
      </button>
    </form>
  );
}