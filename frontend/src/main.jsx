import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css' // or whatever your main CSS file is called

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);