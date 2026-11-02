import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import StudentScheduling from './pages/public/StudentScheduling';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import ProtectedRoute from './components/ProtectedRoute';

const getRoleHomePath = (role) => {
  if (role === 'admin') return '/admin';
  if (role === 'supervisor') return '/supervisor';
  return '/staff';
};

function DashboardRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={getRoleHomePath(user.role)} replace />;
}

function RootRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  return <Navigate to={user ? getRoleHomePath(user.role) : '/login'} replace />;
}

function LoginRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (user) {
    return <Navigate to={getRoleHomePath(user.role)} replace />;
  }

  return <Login />;
}

function CatchAllRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  return <Navigate to={user ? getRoleHomePath(user.role) : '/login'} replace />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardRedirect />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/supervisor"
            element={
              <ProtectedRoute allowedRoles={['supervisor']}>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff"
            element={
              <ProtectedRoute allowedRoles={['staff']}>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          {/* Public scheduling route - no authentication required */}
          <Route path="/schedule/:configId" element={<StudentScheduling />} />
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<CatchAllRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;