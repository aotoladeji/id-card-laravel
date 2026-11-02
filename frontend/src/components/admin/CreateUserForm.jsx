import { useState } from 'react';

export default function CreateUserForm({ role, onSubmit, onClose }) {
  const [formData, setFormData] = useState({
    name: '',
    staffId: '',
    username: '',
    password: '',
    confirmPassword: ''
  });
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const availablePermissions = [
  { id: 'inventory', label: 'Inventory Management', description: 'Add and manage inventory items' },
  { id: 'reprint', label: 'Reprint Requests', description: 'Submit and manage reprint requests' },
  { id: 'material', label: 'Material Requests', description: 'Submit material requisition requests' }, // Add this
  { id: 'daily-report', label: 'Daily Reports', description: 'Submit daily activity reports' },
  { id: 'collection', label: 'Card Collection', description: 'Mark cards as collected' },
  { id: 'approval', label: 'Card Approval', description: 'Review and approve captured ID cards' },
  { id: 'printing', label: '🖨️ ID Card Printing', description: 'Access print queue and print ID cards' },
  { id: 'scheduling', label: '📅 Scheduling Management' }
];

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const togglePermission = (permId) => {
    if (permissions.includes(permId)) {
      setPermissions(permissions.filter(p => p !== permId));
    } else {
      setPermissions([...permissions, permId]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    setError('');
    setLoading(true);

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (role === 'staff' && permissions.length === 0) {
      setError('Please select at least one permission for staff member');
      return;
    }

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          name: formData.name,
          staffId: formData.staffId,
          username: formData.username,
          password: formData.password,
          role: role,
          permissions: role === 'staff' ? permissions : ['all']
        })
      });

      const data = await response.json();

      if (response.ok) {
        onSubmit(data.user);
        onClose();
      } else {
        setError(data.message || 'Failed to create user');
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
        <label>Full Name *</label>
        <input
          type="text"
          name="name"
          className="form-control"
          value={formData.name}
          onChange={handleChange}
          placeholder="e.g., John Doe"
          required
        />
      </div>

      <div className="form-group">
        <label>Staff ID *</label>
        <input
          type="text"
          name="staffId"
          className="form-control"
          value={formData.staffId}
          onChange={handleChange}
          placeholder="e.g., STF001"
          required
        />
      </div>

      <div className="form-group">
        <label>Username *</label>
        <input
          type="text"
          name="username"
          className="form-control"
          value={formData.username}
          onChange={handleChange}
          placeholder="e.g., johndoe"
          required
        />
      </div>

      <div className="form-group">
        <label>Password *</label>
        <input
          type="password"
          name="password"
          className="form-control"
          value={formData.password}
          onChange={handleChange}
          placeholder="Minimum 6 characters"
          required
        />
      </div>

      <div className="form-group">
        <label>Confirm Password *</label>
        <input
          type="password"
          name="confirmPassword"
          className="form-control"
          value={formData.confirmPassword}
          onChange={handleChange}
          placeholder="Re-enter password"
          required
        />
      </div>

      {role === 'staff' && (
        <div className="permission-section">
          <h4>Assign Permissions</h4>
          <div className="alert alert-info">
            Select the features this staff member can access
          </div>
          {availablePermissions.map(perm => (
            <div key={perm.id} className="permission-checkbox">
              <input 
                type="checkbox" 
                id={perm.id}
                checked={permissions.includes(perm.id)}
                onChange={() => togglePermission(perm.id)}
              />
              <label htmlFor={perm.id} style={{cursor: 'pointer', flex: 1}}>
                <strong>{perm.label}</strong>
                <div style={{fontSize: '0.85rem', color: 'var(--text-dim)'}}>
                  {perm.description}
                </div>
              </label>
            </div>
          ))}
        </div>
      )}
      
      <button type="submit" className="btn btn-primary" style={{width: '100%', marginTop: '1rem'}} disabled={loading}>
        {loading ? 'Creating...' : 'Create Account'}
      </button>
    </form>
  );
}