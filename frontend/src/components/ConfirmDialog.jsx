import { useState } from 'react';
import '../styles/modal.css';

export default function ConfirmDialog({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'confirm', // 'confirm', 'prompt', 'alert', 'multi-prompt'
  placeholder = '',
  fields = [] // For multi-prompt: [{ name: 'field1', label: 'Label', placeholder: '', type: 'text' }]
}) {
  const [inputValue, setInputValue] = useState('');
  const [multiInputs, setMultiInputs] = useState({});

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (type === 'prompt') {
      onConfirm(inputValue);
      setInputValue('');
    } else if (type === 'multi-prompt') {
      onConfirm(multiInputs);
      setMultiInputs({});
    } else {
      onConfirm(true);
    }
  };

  const handleCancel = () => {
    setInputValue('');
    setMultiInputs({});
    onClose();
  };

  const handleMultiInputChange = (fieldName, value) => {
    setMultiInputs(prev => ({ ...prev, [fieldName]: value }));
  };

  const isMultiPromptValid = () => {
    if (type !== 'multi-prompt') return true;
    return fields.every(field => 
      !field.required || (multiInputs[field.name] && multiInputs[field.name].trim())
    );
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={handleCancel}>
            ✕
          </button>
        </div>

        <div className="modal-content">
          <p style={{ 
            whiteSpace: 'pre-line', 
            marginBottom: (type === 'prompt' || type === 'multi-prompt') ? '1rem' : '1.5rem',
            color: 'var(--text)'
          }}>
            {message}
          </p>

          {type === 'prompt' && (
            <div className="form-group">
              <textarea
                className="form-control"
                rows="4"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={placeholder}
                autoFocus
              />
            </div>
          )}

          {type === 'multi-prompt' && fields.map((field, index) => (
            <div key={field.name} className="form-group">
              <label>{field.label} {field.required && '*'}</label>
              {field.type === 'textarea' ? (
                <textarea
                  className="form-control"
                  rows={field.rows || 3}
                  value={multiInputs[field.name] || ''}
                  onChange={(e) => handleMultiInputChange(field.name, e.target.value)}
                  placeholder={field.placeholder}
                  autoFocus={index === 0}
                />
              ) : field.type === 'select' ? (
                <select
                  className="form-control"
                  value={multiInputs[field.name] || ''}
                  onChange={(e) => handleMultiInputChange(field.name, e.target.value)}
                  autoFocus={index === 0}
                >
                  <option value="">Select...</option>
                  {field.options?.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type || 'text'}
                  className="form-control"
                  value={multiInputs[field.name] || ''}
                  onChange={(e) => handleMultiInputChange(field.name, e.target.value)}
                  placeholder={field.placeholder}
                  autoFocus={index === 0}
                />
              )}
            </div>
          ))}

          <div className="btn-group" style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            {type !== 'alert' && (
              <button 
                type="button"
                className="btn btn-secondary"
                onClick={handleCancel}
                style={{ flex: 1 }}
              >
                {cancelText}
              </button>
            )}
            <button 
              type="button"
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={
                (type === 'prompt' && !inputValue.trim()) ||
                (type === 'multi-prompt' && !isMultiPromptValid())
              }
              style={{ flex: 1 }}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
