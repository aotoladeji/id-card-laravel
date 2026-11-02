import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }

    // Verify token with server — if expired/invalid, clear and force re-login
    fetch('/api/auth/verify', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (res.ok) {
          const savedUser = localStorage.getItem('user');
          if (savedUser) setUser(JSON.parse(savedUser));
        } else {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      })
      .catch(() => {
        // Server unreachable on verify — keep existing session rather than
        // clearing it, which would cause the Login page to hard-remount.
        // Token will be rejected naturally on the next API call if truly invalid.
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (username, password) => {
    try {
      const response = await authAPI.login({ username, password });
      const { token, user: userData, mustChangePassword } = response.data;

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);

      return { 
        success: true, 
        mustChangePassword: mustChangePassword,
        user: userData
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed',
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};