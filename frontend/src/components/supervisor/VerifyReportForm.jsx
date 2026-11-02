import { useState } from 'react';

export default function VerifyReportForm({ report, onSubmit, onClose }) {
  const [remarks, setRemarks] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('verified');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/daily-reports/${report.id}/verify`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          verificationStatus,
          supervisorRemarks: remarks
        })
      });

      const data = await response.json();

      if (response.ok) {
        onSubmit(data.report);
        onClose();
      } else {
        setError(data.message || 'Failed to verify report');
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

      <div style={{ 
        padding: '1rem', 
        background: 'var(--bg)', 
        borderRadius: '10px', 
        marginBottom: '1.5rem' 
      }}>
        <h4 style={{ marginBottom: '1rem' }}>Report Summary</h4>
        <div className="grid-2">
          <div>
            <p><strong>Date:</strong> {report.report_date}</p>
            <p><strong>Cards Captured:</strong> {report.cards_captured}</p>
            <p><strong>Cards Approved:</strong> {report.cards_approved}</p>
          </div>
          <div>
            <p><strong>Cards Printed:</strong> {report.cards_printed}</p>
            <p><strong>Cards Collected:</strong> {report.cards_collected}</p>
            <p><strong>Submitted By:</strong> {report.submitted_by_name}</p>
          </div>
        </div>
        {report.issues_encountered && (
          <div style={{ marginTop: '1rem' }}>
            <p><strong>Issues Encountered:</strong></p>
            <p style={{ color: 'var(--text-dim)' }}>{report.issues_encountered}</p>
          </div>
        )}
      </div>

      <div className="form-group">
        <label>Verification Status *</label>
        <select 
          className="form-control"
          value={verificationStatus}
          onChange={(e) => setVerificationStatus(e.target.value)}
          required
        >
          <option value="verified">Verify & Approve</option>
          <option value="rejected">Reject</option>
        </select>
      </div>

      <div className="form-group">
        <label>Remarks (Optional)</label>
        <textarea 
          className="form-control" 
          rows="4"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Add any remarks or comments..."
        ></textarea>
      </div>

      <button 
        type="submit" 
        className={`btn ${verificationStatus === 'verified' ? 'btn-success' : 'btn-danger'}`}
        disabled={loading}
        style={{ width: '100%' }}
      >
        {loading ? 'Submitting...' : `${verificationStatus === 'verified' ? '✓ Verify & Attest' : '✗ Reject Report'}`}
      </button>
    </form>
  );
}