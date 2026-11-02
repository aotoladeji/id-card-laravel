import { useState } from 'react';

export default function SubmitDailyReportForm({ onSubmit, onClose }) {
  const [formData, setFormData] = useState({
    reportDate: new Date().toISOString().split('T')[0],
    cardsCaptured: '',
    cardsApproved: '',
    cardsPrinted: '',
    cardsCollected: '',
    issuesEncountered: '',
    inventoryUsed: {
      ribbons: '',
      film: '',
      blankCards: '',
      filter: '',
      cleaner: ''
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/daily-reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          reportDate: formData.reportDate,
          cardsCaptured: parseInt(formData.cardsCaptured),
          cardsApproved: parseInt(formData.cardsApproved),
          cardsPrinted: parseInt(formData.cardsPrinted),
          cardsCollected: parseInt(formData.cardsCollected),
          issuesEncountered: formData.issuesEncountered,
          inventoryUsed: {
            ribbons: parseInt(formData.inventoryUsed.ribbons) || 0,
            film: parseInt(formData.inventoryUsed.film) || 0,
            blankCards: parseInt(formData.inventoryUsed.blankCards) || 0,
            filter: parseInt(formData.inventoryUsed.filter) || 0,
            cleaner: parseInt(formData.inventoryUsed.cleaner) || 0
          }
        })
      });

      const data = await response.json();

      if (response.ok) {
        onSubmit(data.report);
        onClose();
      } else {
        setError(data.message || 'Failed to submit daily report');
      }
    } catch (err) {
      console.error('Daily report error:', err);
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

      <div className="alert alert-info">
        <strong>ℹ️ Daily Report:</strong> Submit your daily activity summary for supervisor review.
      </div>

      <div className="form-group">
        <label>Report Date *</label>
        <input 
          type="date" 
          className="form-control" 
          value={formData.reportDate}
          onChange={(e) => setFormData({...formData, reportDate: e.target.value})}
          max={new Date().toISOString().split('T')[0]}
          required
        />
      </div>

      <div className="grid-2" style={{ gap: '1rem' }}>
        <div className="form-group">
          <label>Cards Captured *</label>
          <input 
            type="number" 
            className="form-control" 
            value={formData.cardsCaptured}
            onChange={(e) => setFormData({...formData, cardsCaptured: e.target.value})}
            placeholder="0"
            min="0"
            required
          />
        </div>

        <div className="form-group">
          <label>Cards Approved *</label>
          <input 
            type="number" 
            className="form-control" 
            value={formData.cardsApproved}
            onChange={(e) => setFormData({...formData, cardsApproved: e.target.value})}
            placeholder="0"
            min="0"
            required
          />
        </div>

        <div className="form-group">
          <label>Cards Printed *</label>
          <input 
            type="number" 
            className="form-control" 
            value={formData.cardsPrinted}
            onChange={(e) => setFormData({...formData, cardsPrinted: e.target.value})}
            placeholder="0"
            min="0"
            required
          />
        </div>

        <div className="form-group">
          <label>Cards Collected *</label>
          <input 
            type="number" 
            className="form-control" 
            value={formData.cardsCollected}
            onChange={(e) => setFormData({...formData, cardsCollected: e.target.value})}
            placeholder="0"
            min="0"
            required
          />
        </div>
      </div>

      <div className="form-group">
        <label>Issues/Challenges Encountered</label>
        <textarea 
          className="form-control" 
          rows="4"
          value={formData.issuesEncountered}
          onChange={(e) => setFormData({...formData, issuesEncountered: e.target.value})}
          placeholder="Describe any challenges or issues..."
        ></textarea>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem' }}>
          🎞️ Consumables Used (enter 0 if none)
        </label>
        <div className="grid-2" style={{ gap: '1rem' }}>
          {[
            { key: 'ribbons', label: 'Ribbons' },
            { key: 'film', label: 'Film' },
            { key: 'blankCards', label: 'Blank Cards' },
            { key: 'filter', label: 'Filter' },
            { key: 'cleaner', label: 'Cleaner' }
          ].map(({ key, label }) => (
            <div className="form-group" key={key}>
              <label>{label}</label>
              <input
                type="number"
                className="form-control"
                value={formData.inventoryUsed[key]}
                onChange={(e) => setFormData({
                  ...formData,
                  inventoryUsed: { ...formData.inventoryUsed, [key]: e.target.value }
                })}
                placeholder="0"
                min="0"
              />
            </div>
          ))}
        </div>
      </div>

      <button 
        type="submit" 
        className="btn btn-primary" 
        disabled={loading}
        style={{ width: '100%' }}
      >
        {loading ? 'Submitting...' : 'Submit Report'}
      </button>
    </form>
  );
}