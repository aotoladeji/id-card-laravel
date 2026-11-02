import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const getRoleHomePath = (role) => {
  if (role === 'admin') return '/admin';
  if (role === 'supervisor') return '/supervisor';
  return '/staff';
};

export default function ProtectedRoute({ children, allowedRoles = null }) {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{ fontSize: '3rem' }}>⏳</div>
        <div style={{ color: '#666' }}>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (Array.isArray(allowedRoles) && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: '#f8fafc',
        padding: '1.5rem'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '520px',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '1.5rem',
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)'
        }}>
          <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.2rem' }}>Access Denied</h2>
          <p style={{ marginTop: '0.75rem', color: '#475569', lineHeight: 1.5 }}>
            You are signed in as <strong>{String(user.role || '').toUpperCase()}</strong> and cannot access
            <strong> {location.pathname}</strong>.
          </p>
          <p style={{ marginTop: '0.5rem', color: '#64748b', fontSize: '0.95rem' }}>
            Your dashboard is available at <strong>{getRoleHomePath(user.role)}</strong>.
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => navigate(getRoleHomePath(user.role), { replace: true })}
              style={{
                border: 'none',
                borderRadius: '8px',
                padding: '0.65rem 0.9rem',
                background: '#2563eb',
                color: '#ffffff',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Open My Dashboard
            </button>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '0.65rem 0.9rem',
                background: '#ffffff',
                color: '#0f172a',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Sign In As Different Role
            </button>
          </div>
        </div>
      </div>
    );
  }

  return children;
}