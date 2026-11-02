import { useState } from 'react';

const ITEM_CATEGORIES = ['Ribbons', 'Film', 'Blank Cards', 'Filter', 'Cleaner', 'Others'];

export default function AddInventoryForm({ onAdd, onClose }) {
  const [formData, setFormData] = useState({
    itemCategory: '',
    customItemName: '',
    quantity: '',
    unit: 'units'
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
      const response = await fetch('/api/inventory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          itemName: getItemName(),
          quantity: parseInt(formData.quantity),
          unit: formData.unit
        })
      });

      const data = await response.json();

      if (response.ok) {
        onAdd(data.item);
        onClose();
      } else {
        setError(data.message || 'Failed to add inventory item');
      }
    } catch (err) {
      console.error('Add inventory error:', err);
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
          placeholder="e.g., 500"
          min="1"
          required
        />
      </div>

      <div className="form-group">
        <label>Unit *</label>
        <select 
          className="form-control"
          value={formData.unit}
          onChange={(e) => setFormData({...formData, unit: e.target.value})}
          required
        >
          <option value="units">Units</option>
          <option value="boxes">Boxes</option>
          <option value="packs">Packs</option>
          <option value="pieces">Pieces</option>
          <option value="reams">Reams</option>
          <option value="liters">Liters</option>
          <option value="kg">Kilograms</option>
        </select>
      </div>

      <button 
        type="submit" 
        className="btn btn-primary" 
        disabled={loading}
        style={{ width: '100%' }}
      >
        {loading ? 'Adding...' : 'Add Inventory Item'}
      </button>
    </form>
  );
}