import { useState } from 'react';

export default function DeleteConfirmForm({ user, onConfirm, onClose }) {
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') {
      setError('Please type DELETE to confirm');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        onConfirm();
        onClose();
      } else {
        setError(data.message || 'Failed to delete user');
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

      <div className="alert alert-danger">
        <strong>⚠️ Warning:</strong> This action cannot be undone!
      </div>

      <div className="delete-confirm">
        <p><strong>Account Details:</strong></p>
        <p>Name: {user.name}</p>
        <p>Staff ID: {user.staff_id || user.staffId}</p>
        <p>Username: {user.username}</p>
        <p>Role: {user.role}</p>
      </div>

      <div className="form-group" style={{marginTop: '1rem'}}>
        <label>Type <strong>DELETE</strong> to confirm</label>
        <input 
          type="text" 
          className="form-control" 
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Type DELETE"
        />
      </div>

      <div className="btn-group" style={{marginTop: '1rem'}}>
        <button 
          className="btn btn-danger" 
          onClick={handleDelete}
          disabled={confirmText !== 'DELETE' || loading}
          style={{flex: 1}}
        >
          {loading ? 'Deleting...' : 'Delete Account'}
        </button>
      </div>
    </div>
  );
}