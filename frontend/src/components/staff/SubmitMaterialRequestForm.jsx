import { useState } from 'react';

const ITEM_CATEGORIES = ['Ribbons', 'Film', 'Blank Cards', 'Filter', 'Cleaner', 'Others'];

export default function SubmitMaterialRequestForm({ onSubmit, onClose }) {
  const [formData, setFormData] = useState({
    itemCategory: '',
    customItemName: '',
    quantity: '',
    urgency: 'normal'
  });

  const getItemName = () =>
    formData.itemCategory === 'Others' ? formData.customItemName.trim() : formData.itemCategory;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/material', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          itemName: getItemName(),
          quantity: parseInt(formData.quantity),
          urgency: formData.urgency
        })
      });

      const data = await response.json();

      if (response.ok) {
        onSubmit(data.request);
        onClose();
      } else {
        setError(data.message || 'Failed to submit material request');
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
        <label>Item Category *</label>
        <select
          className="form-control"
          value={formData.itemCategory}
          onChange={(e) => setFormData({ ...formData, itemCategory: e.target.value, customItemName: '' })}
          required
        >
          <option value="">-- Select item --</option>
          {ITEM_CATEGORIES.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {formData.itemCategory === 'Others' && (
        <div className="form-group">
          <label>Specify Item Name *</label>
          <input
            type="text"
            className="form-control"
            value={formData.customItemName}
            onChange={(e) => setFormData({ ...formData, customItemName: e.target.value })}
            placeholder="Enter item name"
            required
          />
        </div>
      )}

      <div className="form-group">
        <label>Quantity *</label>
        <input 
          type="number" 
          className="form-control" 
          value={formData.quantity}
          onChange={(e) => setFormData({...formData, quantity: e.target.value})}
          placeholder="e.g., 100"
          min="1"
          required
        />
      </div>

      <div className="form-group">
        <label>Urgency Level *</label>
        <select 
          className="form-control"
          value={formData.urgency}
          onChange={(e) => setFormData({...formData, urgency: e.target.value})}
          required
        >
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>

      <div className="alert alert-info">
        <strong>ℹ️ Note:</strong> Your request will be reviewed by your supervisor.
      </div>

      <button 
        type="submit" 
        className="btn btn-primary" 
        disabled={loading}
        style={{ width: '100%' }}
      >
        {loading ? 'Submitting...' : 'Submit Material Request'}
      </button>
    </form>
  );
}