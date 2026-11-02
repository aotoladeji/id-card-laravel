import { useState } from 'react';

// Makes sure permissions is always a real list, even if the server sends text
const normalizePermissions = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

export default function EditPermissionsForm({ staff, onSave, onClose }) {
  const [permissions, setPermissions] = useState(() => normalizePermissions(staff.permissions));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const availablePermissions = [
    { id: 'inventory', label: 'Inventory Management', description: 'Add and manage inventory items' },
    { id: 'reprint', label: 'Reprint Requests', description: 'Submit and manage reprint requests' },
    { id: 'material', label: 'Material Requests', description: 'Submit material requisition requests' },
    { id: 'daily-report', label: 'Daily Reports', description: 'Submit daily activity reports' },
    { id: 'collection', label: 'Card Collection', description: 'Mark cards as collected' },
    { id: 'approval', label: 'Card Approval', description: 'Review and approve captured ID cards' },
    { id: 'printing', label: '🖨️ ID Card Printing', description: 'Access print queue and print ID cards' }
  ];

  const togglePermission = (permId) => {
    setPermissions(prev =>
      prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]
    );
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/users/${staff.id}/permissions`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ permissions })
      });

      const data = await response.json();

      if (response.ok) {
        onSave(permissions);
        onClose();
      } else {
        setError(data.message || 'Failed to update permissions');
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

      <div className="alert alert-warning">
        Configure which features this staff member can access
      </div>

      <div className="permission-section">
        <h4>Available Permissions</h4>
        {availablePermissions.map(perm => (
          <div key={perm.id} className="permission-checkbox">
            <input
              type="checkbox"
              id={`edit-${perm.id}`}
              checked={permissions.includes(perm.id)}
              onChange={() => togglePermission(perm.id)}
            />
            <label htmlFor={`edit-${perm.id}`} style={{ cursor: 'pointer', flex: 1 }}>
              <strong>{perm.label}</strong>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                {perm.description}
              </div>
            </label>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-elevated)', borderRadius: '10px' }}>
        <strong>Selected: {permissions.length} permissions</strong>
      </div>

      <button
        className="btn btn-primary"
        style={{ marginTop: '1rem', width: '100%' }}
        onClick={handleSave}
        disabled={loading}
      >
        {loading ? 'Saving...' : 'Save Permissions'}
      </button>
    </div>
  );
}