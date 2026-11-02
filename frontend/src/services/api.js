import axios from 'axios';

const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').trim();
const API_BASE_URL = rawApiBaseUrl.endsWith('/')
  ? rawApiBaseUrl.slice(0, -1)
  : rawApiBaseUrl;

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  // Minimum 5 minutes so slow backend/capture-app requests aren't aborted early.
  timeout: 300000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
};

// Users API
export const usersAPI = {
  getAll: () => api.get('/users'),
  getById: (id) => api.get(`/users/${id}`),
  updatePermissions: (id, permissions) => 
    api.put(`/users/${id}/permissions`, { permissions }),
  delete: (id) => api.delete(`/users/${id}`),
};

// Cards API
export const cardsAPI = {
  getAll: (status) => api.get('/cards', { params: { status } }),
  create: (cardData) => api.post('/cards', cardData),
  updateStatus: (id, status, notes) => 
    api.put(`/cards/${id}/status`, { status, notes }),
  delete: (id) => api.delete(`/cards/${id}`),
};

export default api;