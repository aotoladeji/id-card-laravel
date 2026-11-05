import { useState } from 'react';
import Modal from './Modal';
import { showNotification } from '../utils/errorHandler';

// Shown whenever an uploaded Excel file contains a matric number that either
// already exists in the schedule, or appears more than once in the file
// itself. Nothing with a colliding matric number is ever imported until
// staff explicitly picks what should happen to it here.
export default function DuplicateResolutionModal({ isOpen, onClose, duplicates, onResolve, submitting }) {
  const [choices, setChoices] = useState(() => buildDefaultChoices(duplicates));

  // Rebuild defaults whenever a new set of duplicates comes in (e.g. re-opening for a new upload).
  if (duplicates && duplicates.length && Object.keys(choices).length !== duplicates.length) {
    const fresh = buildDefaultChoices(duplicates);
    if (JSON.stringify(Object.keys(fresh)) !== JSON.stringify(Object.keys(choices))) {
      setChoices(fresh);
    }
  }

  function buildDefaultChoices(list) {
    const next = {};
    (list || []).forEach((dup) => {
      next[dup.matricNumber] = { action: 'skip', selectedOccurrenceIndex: 0 };
    });
    return next;
  }

  const setAction = (matricNumber, action) => {
    setChoices((prev) => ({ ...prev, [matricNumber]: { ...prev[matricNumber], action } }));
  };

  const setSelectedOccurrence = (matricNumber, index) => {
    setChoices((prev) => ({ ...prev, [matricNumber]: { ...prev[matricNumber], selectedOccurrenceIndex: index } }));
  };

  const handleSubmit = () => {
    const decisions = (duplicates || []).map((dup) => ({
      matricNumber: dup.matricNumber,
      existingStudentId: dup.existingStudentId,
      occurrences: dup.occurrences,
      action: choices[dup.matricNumber]?.action || 'skip',
      selectedOccurrenceIndex: choices[dup.matricNumber]?.selectedOccurrenceIndex || 0,
    }));

    onResolve(decisions);
  };

  const handleApplyToAll = (action) => {
    setChoices((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((matric) => {
        next[matric] = { ...next[matric], action };
      });
      return next;
    });
    showNotification(`Set "${actionLabel(action)}" for all duplicates`, 'info');
  };

  const actionLabel = (action) => {
    if (action === 'overwrite') return 'Overwrite';
    if (action === 'keep_both') return 'Allow duplicate (keep both)';
    return 'Skip (keep former data, discard new)';
  };

  if (!duplicates || duplicates.length === 0) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`⚠️ ${duplicates.length} Duplicate Matric Number(s) Found`} size="large">
      <div style={{ marginBottom: '1rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
        These matric numbers already exist in this schedule and/or appear more than once in the
        uploaded file. Nothing is stored until you decide what to do with each one below.
      </div>

      <div className="btn-group" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleApplyToAll('skip')}>
          Skip all
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleApplyToAll('overwrite')}>
          Overwrite all
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleApplyToAll('keep_both')}>
          Allow duplicate for all
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '55vh', overflowY: 'auto' }}>
        {duplicates.map((dup) => {
          const choice = choices[dup.matricNumber] || { action: 'skip', selectedOccurrenceIndex: 0 };
          const hasMultipleOccurrences = dup.occurrences.length > 1;

          return (
            <div
              key={dup.matricNumber}
              style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', background: 'var(--bg)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <strong>Matric Number: {dup.matricNumber}</strong>
                {hasMultipleOccurrences && (
                  <span className="badge badge-warning">Appears {dup.occurrences.length}× in file</span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: dup.existing ? '1fr 1fr' : '1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                {dup.existing && (
                  <div style={{ padding: '0.75rem', background: 'var(--card-bg, #fff)', borderRadius: '6px', fontSize: '0.85rem' }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                      Already stored{' '}
                      {dup.existing.hasScheduled && <span className="badge badge-success">Scheduled</span>}
                    </div>
                    <div>{dup.existing.fullName}</div>
                    <div style={{ color: 'var(--text-dim)' }}>{dup.existing.email || '—'}</div>
                    <div style={{ color: 'var(--text-dim)' }}>
                      {[dup.existing.faculty, dup.existing.department, dup.existing.level].filter(Boolean).join(' / ') || '—'}
                    </div>
                  </div>
                )}

                <div style={{ padding: '0.75rem', background: 'var(--card-bg, #fff)', borderRadius: '6px', fontSize: '0.85rem' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                    {hasMultipleOccurrences ? 'New in uploaded file' : 'New data'}
                  </div>
                  {dup.occurrences.map((occ, idx) => (
                    <label
                      key={idx}
                      style={{
                        display: hasMultipleOccurrences && choice.action !== 'keep_both' ? 'flex' : 'block',
                        alignItems: 'center',
                        gap: '0.4rem',
                        marginBottom: idx < dup.occurrences.length - 1 ? '0.5rem' : 0,
                        cursor: hasMultipleOccurrences && choice.action !== 'keep_both' ? 'pointer' : 'default',
                      }}
                    >
                      {hasMultipleOccurrences && choice.action !== 'keep_both' && (
                        <input
                          type="radio"
                          name={`occurrence-${dup.matricNumber}`}
                          checked={choice.selectedOccurrenceIndex === idx}
                          onChange={() => setSelectedOccurrence(dup.matricNumber, idx)}
                        />
                      )}
                      <span>
                        {occ.fullName}
                        <span style={{ color: 'var(--text-dim)' }}> — {occ.email || 'no email'}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.9rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name={`action-${dup.matricNumber}`}
                    checked={choice.action === 'skip'}
                    onChange={() => setAction(dup.matricNumber, 'skip')}
                  />
                  Skip (keep former data, discard new)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name={`action-${dup.matricNumber}`}
                    checked={choice.action === 'overwrite'}
                    onChange={() => setAction(dup.matricNumber, 'overwrite')}
                  />
                  {dup.existing ? 'Overwrite former data' : 'Keep only one copy'}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name={`action-${dup.matricNumber}`}
                    checked={choice.action === 'keep_both'}
                    onChange={() => setAction(dup.matricNumber, 'keep_both')}
                  />
                  Allow duplicate (keep both)
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <div className="btn-group" style={{ marginTop: '1.5rem' }}>
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Applying…' : 'Apply Decisions'}
        </button>
      </div>
    </Modal>
  );
}
