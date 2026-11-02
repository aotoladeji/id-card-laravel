import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import ChangePasswordModal from '../components/ChangePasswordModal';
import uiLogo from '../assets/ui-logo.png';
import '../styles/login.css';

const getRoleHomePath = (role) => {
  if (role === 'admin') return '/admin';
  if (role === 'supervisor') return '/supervisor';
  return '/staff';
};

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  
  const { login, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Don't render login form while auth state is being determined
  if (authLoading) {
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(username, password);

    if (result.success) {
      // Check if user must change password
      if (result.mustChangePassword) {
        setShowChangePassword(true);
      } else {
        navigate(getRoleHomePath(result.user?.role), { replace: true });
      }
    } else {
      setError(result.message);
    }

    setLoading(false);
  };

  const handlePasswordChanged = () => {
    setShowChangePassword(false);
    const savedUser = JSON.parse(localStorage.getItem('user') || '{}');
    navigate(getRoleHomePath(savedUser?.role), { replace: true });
  };

  return (
    <>
      <div className="login-container">
        <div className="login-box">
          {/* Updated Header with Full Branding */}
          <div className="login-header">
            <img 
              src={uiLogo}  // USE THE IMPORTED LOGO
              alt="University of Ibadan Logo" 
              style={{
                width: '120px',
                height: '120px',
                objectFit: 'contain',
                marginBottom: '0.5rem',
                filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))'
              }}
            />

            <p style={{ 
              color: 'var(--text-dim)',
              fontSize: '0.85rem',
              marginBottom: '0.15rem'
            }}>
              Management Information Systems Department
            </p>
            <p style={{ 
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
              marginTop: '0.15rem'
            }}>
              University of Ibadan
            </p>
          </div>

          {error && (
            <div className="alert alert-danger" style={{ marginTop: '1rem' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ marginTop: '1.5rem' }}>
            <div className="form-group">
              <label style={{ color: 'var(--text)', fontWeight: '500' }}>Username</label>
              <input
                type="text"
                className="form-control"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label style={{ color: 'var(--text)', fontWeight: '500' }}>Password</label>
              <input
                type="password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ 
                width: '100%',
                padding: '0.875rem',
                fontSize: '1rem',
                fontWeight: '600',
                marginTop: '0.5rem'
              }}
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In →'}
            </button>
          </form>

          {/* Footer */}
          <div style={{
            marginTop: '1.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border)',
            textAlign: 'center'
          }}>
            <p style={{ 
              fontSize: '0.75rem', 
              color: 'var(--text-muted)',
              margin: 0
            }}>
              🔒 Authorized Personnel Only
            </p>
            <p style={{ 
              fontSize: '0.7rem', 
              color: 'var(--text-muted)',
              marginTop: '0.25rem'
            }}>
              Contact IT support for login issues
            </p>
          </div>
        </div>
      </div>

      {showChangePassword && (
        <ChangePasswordModal 
          onSuccess={handlePasswordChanged}
          isFirstLogin={true}
        />
      )}
    </>
  );
}