import { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import CardReviewForm from '../../components/staff/CardReviewForm';
import { showNotification } from '../../utils/errorHandler';
import { useAuth } from '../../hooks/useAuth';

export default function CardApproval() {
  const { user } = useAuth();
  const isSupervisor = user?.role === 'supervisor';
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [pendingReprints, setPendingReprints] = useState(new Set());
  const [reprintDialogOpen, setReprintDialogOpen] = useState(false);
  const [cardToReprint, setCardToReprint] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  useEffect(() => {
    syncFromCaptureApp(true);
    fetchPendingReprints();
    // Auto-sync every 30 seconds
    const interval = setInterval(() => {
      console.log('[Auto-sync] Syncing approved cards from capture app...');
      syncFromCaptureApp(true); // silent sync
      fetchPendingReprints(); // Also refresh pending reprints
    }, 30000);

    console.log('[Card Approval] Auto-sync enabled (every 30 seconds)');
    return () => {
      clearInterval(interval);
      console.log('[Card Approval] Auto-sync disabled');
    };
  }, []);

  const fetchPendingReprints = async () => {
    try {
      const response = await fetch('/api/reprint?status=pending', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        // Create a Set of matric numbers that have pending reprint requests
        const pending = new Set(data.requests.map(r => r.matric_number));
        setPendingReprints(pending);
      }
    } catch (error) {
      console.error('Error fetching pending reprints:', error);
    }
  };

  const fetchCards = async () => {
    try {
      // Fetch ALL approved cards from LOCAL database (permanent history)
      const response = await fetch('/api/approved-cards', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setCards(data.cards || []);
        setLastSyncTime(new Date());
      } else {
        showNotification(data.message || 'Failed to fetch cards', 'error');
      }
    } catch (error) {
      console.error('Error fetching cards:', error);
      showNotification('Unable to connect to server', 'error');
    } finally {
      setLoading(false);
    }
  };

  const syncFromCaptureApp = async (silent = false) => {
    if (!silent) setSyncing(true);

    try {
      console.log(`[Sync] ${silent ? 'Auto-syncing' : 'Manual sync'} from capture app...`);

      await fetch('/api/print-queue/sync', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      // Refresh the locally stored approved-card history after backend sync
      await fetchCards();

      if (!silent) {
        showNotification('Synced with capture app', 'success');
      } else {
        console.log('[Auto-sync] Completed successfully');
      }
    } catch (error) {
      console.log(`[Sync] Failed: ${error.message}`);
      if (!silent) {
        showNotification('Sync failed - capture app may be offline', 'error');
      }
    } finally {
      if (!silent) setSyncing(false);
    }
  };

  const manualSync = () => {
    syncFromCaptureApp(false);
  };

  const viewCard = (card) => {
    setSelectedCard(card);
    setEditMode(false);
    setEditError('');
    setModalOpen(true);
  };

  const startEditCard = (card) => {
    if (!isSupervisor) return;
    setSelectedCard(card);
    setEditForm({
      surname: card.surname || '',
      otherNames: card.other_names || '',
      matricNo: card.matric_no || '',
      faculty: card.faculty || '',
      department: card.department || '',
      level: card.level || '',
      session: card.session || '',
      cardNumber: card.card_number || '',
      hall: card.hall || ''
    });
    setEditError('');
    setEditMode(true);
    setModalOpen(true);
  };

  const handleEditFieldChange = (field, value) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const cancelEdit = () => {
    if (selectedCard) {
      setEditMode(false);
      setEditError('');
    } else {
      setModalOpen(false);
    }
  };

  const saveCardEdit = async () => {
    if (!selectedCard || !editForm) return;

    if (!editForm.surname.trim() || !editForm.otherNames.trim()) {
      setEditError('Surname and other names cannot be empty');
      return;
    }

    setSaving(true);
    setEditError('');

    try {
        const response = await fetch(`/api/approved-cards/${selectedCard.card_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(editForm)
      });

      const data = await response.json();

      if (response.ok) {
        // Update the card in the local list and the currently selected card
        setCards(prev => prev.map(c => (c.card_id === data.card.card_id ? { ...c, ...data.card } : c)));
        setSelectedCard(prev => ({ ...prev, ...data.card }));
        setEditMode(false);
        showNotification('Card info updated successfully', 'success');
      } else {
        setEditError(data.message || 'Failed to update card');
      }
    } catch (error) {
      console.error('Error updating card:', error);
      setEditError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = (updatedCard) => {
    // Don't remove from list, just refresh
    fetchCards();
    showNotification('Card approved successfully', 'success');
  };

  const handleReject = (updatedCard) => {
    // Don't remove from list, just refresh
    fetchCards();
    showNotification('Card rejected - recapture required', 'warning');
  };

  const handleReprint = (card) => {
    setCardToReprint(card);
    setReprintDialogOpen(true);
  };

  const submitReprintRequest = async (reason) => {
    if (!cardToReprint) return;

    try {
      const response = await fetch('/api/reprint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          matricNumber: cardToReprint.matric_no || cardToReprint.staff_id,
          studentName: `${cardToReprint.surname} ${cardToReprint.other_names}`,
          reason: reason.trim()
        })
      });

      const data = await response.json();

      if (response.ok) {
        showNotification('Reprint request submitted for supervisor approval', 'success');
        fetchPendingReprints(); // Refresh pending reprints to disable button
      } else {
        showNotification(data.message || 'Failed to submit reprint request', 'error');
      }
    } catch (error) {
      console.error('Error submitting reprint request:', error);
      showNotification('Error submitting reprint request', 'error');
    }
  };

  // Filter cards based on search term
  const filteredCards = cards.filter(card =>
    card.matric_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    card.staff_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (card.surname + ' ' + card.other_names)?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    card.faculty?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    card.department?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '400px'
      }}>
        <div style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
          <div>Loading approved cards from capture app...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="header">
        <div>
          <h1>✓ Approved Cards History</h1>
          {lastSyncTime && (
            <div style={{
              fontSize: '0.85rem',
              color: 'var(--text-dim)',
              marginTop: '0.25rem'
            }}>
              Last synced from capture app: {lastSyncTime.toLocaleTimeString()} • Auto-sync every 30s
            </div>
          )}
        </div>
        <button
          className="btn btn-primary"
          onClick={manualSync}
          disabled={syncing}
        >
          {syncing ? '⏳ Syncing...' : '🔄 Sync from Capture App'}
        </button>
      </div>

      <div className="card">
        {/* Search Bar */}
        {cards.length > 0 && (
          <div style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid var(--border)'
          }}>
            <div style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1rem',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '10px'
            }}>
              <span style={{ fontSize: '1.25rem' }}>🔍</span>
              <input
                type="text"
                placeholder="Search by ID, name, faculty, or department..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '1rem',
                  color: 'var(--text)'
                }}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                    fontSize: '1.25rem'
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}

        {filteredCards.length === 0 ? (
          <div style={{
            padding: '3rem',
            textAlign: 'center',
            color: 'var(--text-dim)'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
              {searchTerm ? '🔍' : '✓'}
            </div>
            <p>
              {searchTerm
                ? 'No cards found matching your search'
                : 'No approved cards found in capture app'}
            </p>
            <button
              className="btn btn-secondary"
              onClick={manualSync}
              disabled={syncing}
              style={{ marginTop: '1rem' }}
            >
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        ) : (
          <>
            <div style={{
              padding: '1rem 1.5rem',
              background: 'var(--bg)',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                Showing {filteredCards.length} of {cards.length} approved cards
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>ID Number</th>
                  <th>Name</th>
                  <th>Faculty</th>
                  <th>Department</th>
                  <th>Level</th>
                  <th>Card Number</th>
                  <th>Approved Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredCards.map(card => (
                  <tr key={card.id}>
                    <td>{card.matric_no || card.staff_id}</td>
                    <td>{card.surname} {card.other_names}</td>
                    <td>{card.faculty}</td>
                    <td>{card.department}</td>
                    <td>{card.level || '—'}</td>
                    <td>{card.card_number || '—'}</td>
                    <td>{card.approved_at ? new Date(card.approved_at).toLocaleDateString() : '—'}</td>
                    <td>
                       <div
                        className="btn-group"
                        style={{
                          display: 'flex',
                          flexWrap: 'nowrap',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: '0.5rem',
                          marginTop: 0,
                          width: 'auto'
                        }}
                      >
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => viewCard(card)}
                        >
                          👁️ View
                        </button>
                                                {isSupervisor && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => startEditCard(card)}
                            title="Edit student/card info (e.g. department change)"
                          >
                            ✏️ Edit
                          </button>
                        )}
                        <button
                          className="btn btn-warning btn-sm"
                          onClick={() => handleReprint(card)}
                          disabled={pendingReprints.has(card.matric_no || card.staff_id)}
                          title={
                            pendingReprints.has(card.matric_no || card.staff_id)
                              ? "Pending reprint request exists"
                              : "Submit reprint request for supervisor approval"
                          }
                        >
                          {pendingReprints.has(card.matric_no || card.staff_id)
                            ? '⏳ Pending'
                            : '🔄 Request Reprint'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editMode ? 'Edit Card Info' : 'Card Details'}
        size="large"
      >
        {selectedCard && !editMode && (
          <div style={{ padding: '1rem' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
              marginBottom: '1.5rem'
            }}>
              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
                  Full Name
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: '600' }}>
                  {selectedCard.surname} {selectedCard.other_names}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
                  ID Number
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: '600' }}>
                  {selectedCard.matric_no || selectedCard.staff_id}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
                  Faculty
                </div>
                <div>{selectedCard.faculty}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
                  Department
                </div>
                <div>{selectedCard.department}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
                  Level
                </div>
                <div>{selectedCard.level || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
                  Card Number
                </div>
                <div>{selectedCard.card_number || '—'}</div>
              </div>
            </div>

            <div style={{
              padding: '1rem',
              background: 'var(--bg)',
              borderRadius: '8px',
              border: '1px solid var(--border)'
            }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>
                Status
              </div>
              <span className="badge badge-success">
                ✓ Approved in Capture App
              </span>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setModalOpen(false)}
              >
                Close
              </button>
                            {isSupervisor && (
                <button
                  className="btn btn-primary"
                  onClick={() => startEditCard(selectedCard)}
                >
                  ✏️ Edit Info
                </button>
              )}
            </div>
          </div>
        )}

        {selectedCard && editMode && editForm && (
          <div style={{ padding: '1rem' }}>
            <div className="alert alert-warning" style={{ marginBottom: '1.5rem' }}>
              <strong>ℹ️ Note:</strong> Use this if the student's department or any other detail
              on the card has changed (e.g. department transfer, name correction). This updates
              the stored card record used for future reprints.
            </div>

            {editError && (
              <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
                {editError}
              </div>
            )}

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
              marginBottom: '1.5rem'
            }}>
              <div className="form-group">
                <label>Surname</label>
                <input
                  type="text"
                  className="form-control"
                  value={editForm.surname}
                  onChange={(e) => handleEditFieldChange('surname', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Other Names</label>
                <input
                  type="text"
                  className="form-control"
                  value={editForm.otherNames}
                  onChange={(e) => handleEditFieldChange('otherNames', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Matric Number</label>
                <input
                  type="text"
                  className="form-control"
                  value={editForm.matricNo}
                  onChange={(e) => handleEditFieldChange('matricNo', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Faculty</label>
                <input
                  type="text"
                  className="form-control"
                  value={editForm.faculty}
                  onChange={(e) => handleEditFieldChange('faculty', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Department</label>
                <input
                  type="text"
                  className="form-control"
                  value={editForm.department}
                  onChange={(e) => handleEditFieldChange('department', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Level</label>
                <input
                  type="text"
                  className="form-control"
                  value={editForm.level}
                  onChange={(e) => handleEditFieldChange('level', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Session</label>
                <input
                  type="text"
                  className="form-control"
                  value={editForm.session}
                  onChange={(e) => handleEditFieldChange('session', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Card Number</label>
                <input
                  type="text"
                  className="form-control"
                  value={editForm.cardNumber}
                  onChange={(e) => handleEditFieldChange('cardNumber', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Hall</label>
                <input
                  type="text"
                  className="form-control"
                  value={editForm.hall}
                  onChange={(e) => handleEditFieldChange('hall', e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                className="btn btn-secondary"
                onClick={cancelEdit}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="btn btn-success"
                onClick={saveCardEdit}
                disabled={saving}
              >
                {saving ? 'Saving...' : '💾 Save Changes'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={reprintDialogOpen}
        onClose={() => {
          setReprintDialogOpen(false);
          setCardToReprint(null);
        }}
        onConfirm={submitReprintRequest}
        title="Request Reprint"
        message={cardToReprint ? `Request reprint for:\n${cardToReprint.surname} ${cardToReprint.other_names}\n${cardToReprint.matric_no || cardToReprint.staff_id}\n\nPlease enter reason for reprint:` : ''}
        type="prompt"
        placeholder="Enter reason for reprint..."
        confirmText="Submit Request"
        cancelText="Cancel"
      />
    </>
  );
}
