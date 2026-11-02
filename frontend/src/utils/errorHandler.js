export const handleApiError = (error) => {
  if (error.response) {
    // Server responded with error
    return error.response.data.message || 'An error occurred';
  } else if (error.request) {
    // Request made but no response
    return 'Unable to connect to server. Please check your connection.';
  } else {
    // Something else happened
    return error.message || 'An unexpected error occurred';
  }
};

export const showNotification = (message, type = 'info') => {
  // Simple notification - can be enhanced with a toast library
  const styles = {
    success: { background: '#10b981', color: 'white' },
    error: { background: '#ef4444', color: 'white' },
    warning: { background: '#f59e0b', color: 'white' },
    info: { background: '#3b82f6', color: 'white' }
  };

  const notification = document.createElement('div');
  notification.textContent = message;
  Object.assign(notification.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    padding: '1rem 1.5rem',
    borderRadius: '10px',
    zIndex: '9999',
    fontWeight: '500',
    boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
    animation: 'slideIn 0.3s ease-out',
    ...styles[type]
  });

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
};

// Add animations to document head
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(400px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(400px); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}