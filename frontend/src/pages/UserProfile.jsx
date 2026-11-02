import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import Modal from '../components/Modal';
import ChangePasswordModal from '../components/ChangePasswordModal';

export default function UserProfile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showChangePassword, setShowChangePassword] = useState(false);

  const handlePasswordChanged = () => {
    setShowChangePassword(false);
    logout();
    navigate('/login');
  };

  return (
    <>
      <div className="header">
        <h1>👤 My Profile</h1>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Account Information</h3>
          </div>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {[
              { label: 'Full Name', value: user?.name },
              { label: 'Staff ID', value: user?.staff_id },
              { label: 'Username', value: user?.username },
              { label: 'Account Created', value: user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A' },
            ].map(field => (
              <div key={field.label}>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.85rem', 
                  color: 'var(--text-dim)', 
                  marginBottom: '0.4rem',
                  fontWeight: '500'
                }}>
                  {field.label}
                </label>
                <div style={{ 
                  padding: '0.75rem 1rem', 
                  background: 'var(--bg)', 
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  fontSize: '0.95rem'
                }}>
                  {field.value || 'N/A'}
                </div>
              </div>
            ))}

            <div>
              <label style={{ 
                display: 'block', 
                fontSize: '0.85rem', 
                color: 'var(--text-dim)', 
                marginBottom: '0.4rem',
                fontWeight: '500'
              }}>
                Role
              </label>
              <div>
                <span className={`badge badge-${
                  user?.role === 'admin' ? 'danger' : 
                  user?.role === 'supervisor' ? 'warning' : 
                  'info'
                }`} style={{ fontSize: '0.85rem', padding: '0.3rem 0.8rem' }}>
                  {user?.role?.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Security Settings - ALL users */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Security Settings</h3>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <div style={{ 
                padding: '1.5rem', 
                background: 'var(--bg)', 
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem'
              }}>
                <div style={{ fontSize: '2.5rem' }}>🔒</div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ marginBottom: '0.3rem' }}>Password</h4>
                  <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                    Keep your account secure with a strong password
                  </p>
                </div>
                <button 
                  className="btn btn-primary"
                  onClick={() => setShowChangePassword(true)}
                >
                  Change Password
                </button>
              </div>
            </div>
          </div>

          {/* Permissions - visible to all but relevant for staff */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">My Permissions</h3>
            </div>
            <div style={{ padding: '1.5rem' }}>
              {user?.role === 'admin' || user?.role === 'supervisor' ? (
                <div style={{ 
                  padding: '1rem', 
                  background: 'var(--bg)', 
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                    {user?.role === 'admin' ? '👑' : '⭐'}
                  </div>
                  <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                    {user?.role === 'admin' 
                      ? 'Full system access — all permissions granted'
                      : 'Supervisor access — all staff permissions plus management'}
                  </p>
                </div>
              ) : (
                <>
                  <p style={{ 
                    color: 'var(--text-dim)', 
                    fontSize: '0.85rem', 
                    marginBottom: '1rem' 
                  }}>
                    You have {user?.permissions?.length || 0} active permissions
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {user?.permissions?.length > 0 ? (
                      user.permissions.map((perm, index) => (
                        <span key={index} className="badge badge-info" style={{ padding: '0.3rem 0.8rem' }}>
                          {perm}
                        </span>
                      ))
                    ) : (
                      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                        No permissions assigned. Contact your supervisor.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {showChangePassword && (
        <ChangePasswordModal 
          onSuccess={handlePasswordChanged}
          onClose={() => setShowChangePassword(false)}
        />
      )}
    </>
  );
}