import { useState } from 'react';
import '../styles/modal.css';
import { showNotification } from '../utils/errorHandler';

export default function ChangePasswordModal({ onSuccess, onClose }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (currentPassword === newPassword) {
      setError('New password must be different from current password');
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });

      const data = await response.json();

      if (response.ok) {
        showNotification('Password changed successfully! Please login again with your new password.', 'success');
        
        // Update user data to remove must_change_password flag
        const user = JSON.parse(localStorage.getItem('user'));
        user.must_change_password = false;
        localStorage.setItem('user', JSON.stringify(user));
        
        onSuccess();
      } else {
        setError(data.message || 'Failed to change password');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h2>🔒 Change Password</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-content">
          {error && (
            <div className="alert alert-danger">
              {error}
            </div>
          )}

          <div className="alert alert-info">
            <strong>ℹ️ Password Requirements:</strong>
            <ul style={{ marginTop: '0.5rem', marginLeft: '1.5rem' }}>
              <li>Minimum 6 characters</li>
              <li>Must be different from current password</li>
            </ul>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Current Password *</label>
              <input
                type="password"
                className="form-control"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                required
              />
            </div>

            <div className="form-group">
              <label>New Password *</label>
              <input
                type="password"
                className="form-control"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min. 6 characters)"
                required
              />
            </div>

            <div className="form-group">
              <label>Confirm New Password *</label>
              <input
                type="password"
                className="form-control"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
              />
            </div>

            <div className="btn-group" style={{ display: 'flex', gap: '1rem' }}>
              <button 
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={loading}
                style={{ flex: 1 }}
              >
                {loading ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}