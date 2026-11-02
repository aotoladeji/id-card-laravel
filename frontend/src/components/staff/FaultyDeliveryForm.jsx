import { useState } from 'react';

const ITEM_CATEGORIES = ['Ribbons', 'Film', 'Blank Cards', 'Filter', 'Cleaner', 'Others'];

export default function FaultyDeliveryForm({ onSubmit, onClose }) {
  const [formData, setFormData] = useState({
    itemCategory: '',
    customItemName: '',
    quantity: '',
    issueDescription: ''
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
      const response = await fetch('/api/inventory/faulty', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          itemName: getItemName(),
          quantity: parseInt(formData.quantity),
          issueDescription: formData.issueDescription
        })
      });

      const data = await response.json();

      if (response.ok) {
        onSubmit(data.report);
        onClose();
      } else {
        setError(data.message || 'Failed to log faulty delivery');
      }
    } catch (err) {
      console.error('Faulty delivery error:', err);
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

      <div className="alert alert-warning">
        <strong>⚠️ Important:</strong> Please provide detailed information about the faulty or damaged delivery.
      </div>

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
        <label>Quantity Affected *</label>
        <input 
          type="number" 
          className="form-control" 
          value={formData.quantity}
          onChange={(e) => setFormData({...formData, quantity: e.target.value})}
          placeholder="e.g., 50"
          min="1"
          required
        />
      </div>

      <div className="form-group">
        <label>Issue Description *</label>
        <textarea 
          className="form-control" 
          rows="5"
          value={formData.issueDescription}
          onChange={(e) => setFormData({...formData, issueDescription: e.target.value})}
          placeholder="Describe the damage or fault in detail..."
          required
        ></textarea>
      </div>

      <button 
        type="submit" 
        className="btn btn-danger" 
        disabled={loading}
        style={{ width: '100%' }}
      >
        {loading ? 'Logging...' : '⚠️ Log Faulty Delivery'}
      </button>
    </form>
  );
}