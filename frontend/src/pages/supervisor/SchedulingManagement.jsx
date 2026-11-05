import { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import DuplicateResolutionModal from '../../components/DuplicateResolutionModal';
import { showNotification } from '../../utils/errorHandler';
import { formatTime12Hour } from '../../utils/timeFormat';
import { useAuth } from '../../hooks/useAuth';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

export default function SchedulingManagement() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [configDetails, setConfigDetails] = useState(null);
  const [sendingEmails, setSendingEmails] = useState({});
  const [reopenConfig, setReopenConfig] = useState(null); // config being reopened
  const [showArchived, setShowArchived] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);
  // { configId, kind: 'upload' | 'reopen', duplicates, nonDuplicates, meta } while a duplicate decision is pending
  const [pendingDuplicates, setPendingDuplicates] = useState(null);
  const [resolvingDuplicates, setResolvingDuplicates] = useState(false);
  const { dialogState, showDialog, closeDialog } = useConfirmDialog();

  useEffect(() => {
    fetchConfigs();
  }, [showArchived]);

  const fetchConfigs = async () => {
    try {
      const response = await fetch(`/api/scheduling${showArchived ? '?archived=1' : ''}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (response.ok) {
        setConfigs(data.configs);
        setArchivedCount(data.archived_count ?? 0);
      }
    } catch (error) {
      showNotification('Error fetching scheduling configs', 'error');
    } finally {
      setLoading(false);
    }
  };

  const viewDetails = async (config) => {
    setSelectedConfig(config);
    try {
      const response = await fetch(`/api/scheduling/${config.id}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (response.ok) {
        setConfigDetails(data);
        setShowDetailsModal(true);
      }
    } catch (error) {
      showNotification('Error fetching details', 'error');
    }
  };

  const closeConfig = async (id) => {
    const confirmed = await showDialog({
      title: 'Close Scheduling',
      message: 'Close this scheduling? Students will no longer be able to book appointments.',
      type: 'confirm',
      confirmText: 'Close',
      cancelText: 'Cancel'
    });
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/scheduling/${id}/toggle`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ is_closed: true })
      });
      const data = await response.json();
      if (response.ok) {
        showNotification(data.message, 'success');
        fetchConfigs();
      }
    } catch {
      showNotification('Error closing scheduling', 'error');
    }
  };

  const sendEmails = async (id) => {
    // Disable the button immediately to prevent double-clicks
    setSendingEmails(prev => ({ ...prev, [id]: true }));

    const confirmed = await showDialog({
      title: 'Send Scheduling Emails',
      message: 'Send scheduling emails to all students? This may take a moment.',
      type: 'confirm',
      confirmText: 'Send Emails',
      cancelText: 'Cancel'
    });

    if (!confirmed) {
      setSendingEmails(prev => ({ ...prev, [id]: false }));
      return;
    }

    try {
      const response = await fetch(`/api/scheduling/${id}/send-emails`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (response.ok) {
        showNotification(data.message, data.failed > 0 ? 'warning' : 'success');
        fetchConfigs();
      } else {
        showNotification(data.message || 'Error sending emails', 'error');
      }
    } catch (error) {
      showNotification('Error sending emails — check your connection and try again.', 'error');
    } finally {
      setSendingEmails(prev => ({ ...prev, [id]: false }));
    }
  };

  const sendDelete = async (id, deleteData) => {
    try {
      const response = await fetch(`/api/scheduling/${id}${deleteData ? '?deleteData=1' : ''}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      const data = await response.json();

      if (response.ok) {
        showNotification(
          data.archived
            ? data.message
            : `Deleted: ${data.deleted.config} (${data.deleted.students} students, ${data.deleted.appointments} appointments)`,
          'success'
        );
        fetchConfigs();
      } else {
        showNotification(data.message, 'error');
      }
    } catch (error) {
      showNotification('Error deleting scheduling configuration', 'error');
    }
  };

  // Deleting the data is OPTIONAL: the supervisor must pick what happens to it.
  const deleteConfig = async (id, title) => {
    const answer = await showDialog({
      type: 'multi-prompt',
      title: 'Delete Scheduling',
      message: `What should happen to the data of "${title}" (students, appointments and time slots)?`,
      confirmText: 'Continue',
      cancelText: 'Cancel',
      fields: [
        {
          name: 'choice',
          label: 'Data',
          type: 'select',
          required: true,
          options: [
            { value: 'keep', label: 'Keep all data (archive the schedule) - recommended' },
            { value: 'delete', label: 'Delete everything permanently' }
          ]
        }
      ]
    });

    if (!answer || !answer.choice) return;

    if (answer.choice === 'delete') {
      const sure = await showDialog({
        title: 'Delete permanently?',
        message: `"${title}" and ALL its students, appointments and time slots will be permanently deleted.\n\nThis action CANNOT be undone!`,
        type: 'confirm',
        confirmText: 'Delete permanently',
        cancelText: 'Cancel'
      });
      if (!sure) return;
    }

    await sendDelete(id, answer.choice === 'delete');
  };

  // Permanently deleting an ARCHIVED schedule (this is the only way its data is erased).
  const deletePermanently = async (id, title) => {
    const sure = await showDialog({
      title: 'Delete archived schedule permanently?',
      message: `"${title}" and ALL its students, appointments and time slots will be permanently deleted.\n\nThis action CANNOT be undone!`,
      type: 'confirm',
      confirmText: 'Delete permanently',
      cancelText: 'Cancel'
    });
    if (!sure) return;
    await sendDelete(id, true);
  };

  const restoreConfig = async (id) => {
    try {
      const response = await fetch(`/api/scheduling/${id}/restore`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (response.ok) {
        showNotification(data.message, 'success');
        fetchConfigs();
      } else {
        showNotification(data.message || 'Could not restore the schedule', 'error');
      }
    } catch {
      showNotification('Error restoring the schedule', 'error');
    }
  };

  // Reopen a closed schedule with the SAME students and appointments (nothing is deleted).
  const reopenSameStudents = async (id) => {
    const confirmed = await showDialog({
      title: 'Reopen Scheduling',
      message: 'Reopen this schedule with its current students and appointments? Students will be able to book again.',
      type: 'confirm',
      confirmText: 'Reopen',
      cancelText: 'Cancel'
    });
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/scheduling/${id}/toggle`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ is_closed: false })
      });
      const data = await response.json();
      if (response.ok) {
        showNotification(data.message, 'success');
        fetchConfigs();
      } else {
        showNotification(data.message || 'Could not reopen the schedule', 'error');
      }
    } catch {
      showNotification('Error reopening the schedule', 'error');
    }
  };

  const handleResolveDuplicates = async (decisions) => {
    if (!pendingDuplicates) return;
    setResolvingDuplicates(true);
    try {
      const { configId, kind, nonDuplicates, meta } = pendingDuplicates;
      const endpoint = kind === 'reopen'
        ? `/api/scheduling/${configId}/reopen/resolve-duplicates`
        : `/api/scheduling/${configId}/resolve-duplicates`;
      const token = localStorage.getItem('token');

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          decisions,
          nonDuplicates,
          ...(kind === 'reopen' ? meta : {})
        })
      });
      const data = await response.json();
      if (response.ok) {
        showNotification(data.message || 'Duplicates resolved', 'success');
        setPendingDuplicates(null);
        fetchConfigs();
      } else {
        showNotification(data.message || 'Could not resolve duplicates', 'error');
      }
    } catch {
      showNotification('Error resolving duplicates', 'error');
    } finally {
      setResolvingDuplicates(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
        <div>Loading scheduling configurations...</div>
      </div>
    );
  }

  return (
    <>
      <div className="header">
        <h1>{showArchived ? '📁 Archived Schedules' : '📅 Scheduling Management'}</h1>
        <div className="btn-group">
          <button
            className="btn btn-secondary"
            onClick={() => { setLoading(true); setShowArchived(!showArchived); }}
          >
            {showArchived ? '← Back to active schedules' : `📁 Archived (${archivedCount})`}
          </button>
          {!showArchived && (
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
              ➕ Create New Schedule
            </button>
          )}
        </div>
      </div>

      {configs.length === 0 ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📅</div>
          <p style={{ color: 'var(--text-dim)', marginBottom: '1.5rem' }}>
            {showArchived ? 'No archived schedules' : 'No scheduling configurations yet'}
          </p>
          {!showArchived && (
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
              Create Your First Schedule
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {configs.map(config => (
            <div key={config.id} className="card">
              <div style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div>
                    <h3 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {config.title}
                      {config.archived_at ? (
                        <span className="badge badge-warning">Archived</span>
                      ) : config.is_closed ? (
                        <span className="badge badge-danger">Closed</span>
                      ) : (
                        <span className="badge badge-success">Open</span>
                      )}
                      <span className="badge badge-info">{config.type}</span>
                    </h3>
                    <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                      {config.description || 'No description'}
                    </p>
                  </div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '1rem',
                  padding: '1rem',
                  background: 'var(--bg)',
                  borderRadius: '8px',
                  marginBottom: '1rem'
                }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
                      Total Students
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>
                      {config.total_students || 0}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
                      Scheduled
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '600', color: 'var(--success)' }}>
                      {config.scheduled_count || 0}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
                      Slots/Period
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>
                      {config.slots_per_period}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
                      End Time
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>
                      {formatTime12Hour(config.daily_end_time || '14:00')}
                    </div>
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  gap: '0.5rem',
                  fontSize: '0.85rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{ padding: '0.5rem 0.75rem', background: 'var(--bg)', borderRadius: '6px' }}>
                    📅 Start: {new Date(config.start_date).toLocaleDateString()}
                  </div>
                  {config.end_date && (
                    <div style={{ padding: '0.5rem 0.75rem', background: 'var(--bg)', borderRadius: '6px' }}>
                      🏁 End: {new Date(config.end_date).toLocaleDateString()}
                    </div>
                  )}
                  {config.exclude_weekends && (
                    <div style={{ padding: '0.5rem 0.75rem', background: 'var(--bg)', borderRadius: '6px' }}>
                      🚫 No Weekends
                    </div>
                  )}
                </div>

                <div className="btn-group">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => viewDetails(config)}
                  >
                    👁️ View Details
                  </button>
                  {config.archived_at ? (
                    <>
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => restoreConfig(config.id)}
                      >
                        ♻️ Restore
                      </button>
                      {(user?.role === 'supervisor' || user?.role === 'admin') && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => deletePermanently(config.id, config.title)}
                        >
                          🗑️ Delete permanently
                        </button>
                      )}
                    </>
                  ) : (
                  <>
                  {config.is_closed ? (
                    <>
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => reopenSameStudents(config.id)}
                      >
                        ▶️ Reopen (same students)
                      </button>
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => setReopenConfig(config)}
                      >
                        🔓 Reopen (New Batch)
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-warning btn-sm"
                      onClick={() => closeConfig(config.id)}
                    >
                      🔒 Close
                    </button>
                  )}
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => sendEmails(config.id)}
                    disabled={config.total_students === 0 || sendingEmails[config.id]}
                    style={{ minWidth: '130px' }}
                  >
                    {sendingEmails[config.id] ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                        <span style={{
                          width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)',
                          borderTopColor: '#fff', borderRadius: '50%',
                          display: 'inline-block', animation: 'spin 0.7s linear infinite'
                        }} />
                        Sending...
                      </span>
                    ) : '📧 Send Emails'}
                  </button>
                  {/* Only show delete button for supervisor and admin */}
            {(user?.role === 'supervisor' || user?.role === 'admin') && (
                <button
                className="btn btn-danger btn-sm"
                onClick={() => deleteConfig(config.id, config.title)}
                >
                🗑️ Delete
                </button>
            )}
                  </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reopen Modal */}
      <Modal
        isOpen={!!reopenConfig}
        onClose={() => setReopenConfig(null)}
        title={`Reopen Schedule — ${reopenConfig?.title || ''}`}
        size="large"
      >
        {reopenConfig && (
          <ReopenScheduleForm
            config={reopenConfig}
            onSuccess={(imported) => {
              setReopenConfig(null);
              fetchConfigs();
              showNotification(`Schedule reopened with ${imported} students.`, 'success');
              // Offer to send emails right away
              sendEmails(reopenConfig.id);
            }}
            onDuplicates={(duplicates, nonDuplicates, meta) => {
              setPendingDuplicates({ configId: reopenConfig.id, kind: 'reopen', duplicates, nonDuplicates, meta });
              setReopenConfig(null);
            }}
            onCancel={() => setReopenConfig(null)}
          />
        )}
      </Modal>

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Scheduling Configuration"
        size="large"
      >
        <CreateSchedulingForm
          onSuccess={() => {
            setShowCreateModal(false);
            fetchConfigs();
          }}
          onDuplicates={(configId, duplicates, nonDuplicates) => {
            setShowCreateModal(false);
            fetchConfigs();
            setPendingDuplicates({ configId, kind: 'upload', duplicates, nonDuplicates, meta: {} });
          }}
        />
      </Modal>

      {/* Duplicate Matric Number Resolution Modal */}
      <DuplicateResolutionModal
        isOpen={!!pendingDuplicates}
        duplicates={pendingDuplicates?.duplicates}
        submitting={resolvingDuplicates}
        onClose={() => setPendingDuplicates(null)}
        onResolve={handleResolveDuplicates}
      />

      {/* Details Modal */}
      <Modal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        title="Scheduling Details"
        size="large"
      >
        {configDetails && <SchedulingDetails details={configDetails} user={user} onUpdate={() => viewDetails(selectedConfig)} />}
      </Modal>

      <ConfirmDialog
        isOpen={dialogState.isOpen}
        onClose={closeDialog}
        onConfirm={dialogState.onConfirm}
        title={dialogState.title}
        message={dialogState.message}
        type={dialogState.type}
        confirmText={dialogState.confirmText}
        cancelText={dialogState.cancelText}
        placeholder={dialogState.placeholder}
        fields={dialogState.fields}
      />
    </>
  );
}

function ReopenScheduleForm({ config, onSuccess, onDuplicates, onCancel }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const [oldData, setOldData] = useState('keep'); // what happens to the previous batch

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      showNotification('Please upload the new student list', 'error');
      return;
    }
    if (oldData === 'delete' && !window.confirm('Permanently delete the previous students, appointments and time slots? This cannot be undone.')) {
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('startDate', startDate);
      formData.append('endDate', endDate);
      formData.append('deleteOldData', oldData === 'delete' ? '1' : '0');
      formData.append('file', file);

      const response = await fetch(`/api/scheduling/${config.id}/reopen`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData
      });
      const data = await response.json();
      if (response.ok) {
        if (data.hasDuplicates) {
          onDuplicates(data.duplicates, data.nonDuplicates, data.meta);
        } else {
          onSuccess(data.imported);
        }
      } else {
        showNotification(data.message || 'Error reopening schedule', 'error');
      }
    } catch {
      showNotification('Error reopening schedule', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{
        padding: '0.75rem 1rem', background: 'rgba(245,158,11,0.1)',
        border: '1px solid var(--warning)', borderRadius: '8px', fontSize: '0.9rem'
      }}>
        ⚠️ Reopening starts this schedule fresh with the new student list. Choose what happens to the{' '}
        <strong>previous students, appointments and time slots</strong>:
        <label style={{ display: 'block', marginTop: '0.75rem', cursor: 'pointer' }}>
          <input
            type="radio"
            name="oldData"
            value="keep"
            checked={oldData === 'keep'}
            onChange={() => setOldData('keep')}
          />{' '}
          <strong>Keep them</strong> - saved in an archived copy (recommended)
        </label>
        <label style={{ display: 'block', marginTop: '0.5rem', cursor: 'pointer' }}>
          <input
            type="radio"
            name="oldData"
            value="delete"
            checked={oldData === 'delete'}
            onChange={() => setOldData('delete')}
          />{' '}
          <strong>Delete them permanently</strong>
        </label>
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label>New Start Date *</label>
          <input
            type="date"
            className="form-control"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>New End Date (Optional)</label>
          <input
            type="date"
            className="form-control"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <div className="form-group">
        <label>New Student List (Excel/CSV) *</label>
        <input
          type="file"
          className="form-control"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => setFile(e.target.files[0])}
          required
        />
        <small style={{ color: 'var(--text-dim)', marginTop: '0.5rem', display: 'block' }}>
          Required columns: <strong>full_name</strong>, <strong>email</strong>, <strong>matric_number</strong>
        </small>
      </div>

      <div className="btn-group">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </button>
        <button type="submit" className="btn btn-success" disabled={loading}>
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)',
                borderTopColor: '#fff', borderRadius: '50%',
                display: 'inline-block', animation: 'spin 0.7s linear infinite'
              }} />
              Reopening...
            </span>
          ) : '🔓 Reopen Schedule & Import Students'}
        </button>
      </div>
    </form>
  );
}

function CreateSchedulingForm({ onSuccess, onDuplicates }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'weekly',
    slotsPerPeriod: 50,
    startDate: '',
    endDate: '',
    dailyEndTime: '14:00',
    excludeWeekends: true,
    location: 'Mcarthur Building university of Ibadan',
    importantMessage: `Please arrive 10 minutes before your scheduled time
Bring a valid ID for verification
Dress appropriately for your ID photo`
  });
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Create config
      const response = await fetch('/api/scheduling', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message);
      }

      const configId = data.config.id;

      // Upload student list if provided
      if (file) {
        const formDataFile = new FormData();
        formDataFile.append('file', file);

        const uploadResponse = await fetch(`/api/scheduling/${data.config.id}/students`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
          body: formDataFile
        });

        const uploadData = await uploadResponse.json();

        if (uploadResponse.ok && uploadData.hasDuplicates) {
          // Config already exists; hand off to the duplicate-resolution flow
          // instead of importing anything further without a staff decision.
          onDuplicates(configId, uploadData.duplicates, uploadData.nonDuplicates);

          return;
        }

        if (uploadResponse.ok) {
          showNotification(
            `Scheduling created! ${uploadData.imported} student(s) imported successfully.`,
            'success'
          );
        } else {
          showNotification(
            `Scheduling created but upload failed: ${uploadData.message}`,
            'warning'
          );
        }
      } else {
        showNotification('Scheduling created successfully', 'success');
      }

      onSuccess(); // This will refresh the list
    } catch (error) {
      showNotification(error.message || 'Error creating scheduling', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="form-group">
        <label>Title *</label>
        <input
          type="text"
          className="form-control"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          required
        />
      </div>

      <div className="form-group">
        <label>Description</label>
        <textarea
          className="form-control"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows="3"
        />
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label>Scheduling Type *</label>
          <select
            className="form-control"
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        <div className="form-group">
          <label>Slots Per Period *</label>
          <input
            type="number"
            className="form-control"
            value={formData.slotsPerPeriod}
            onChange={(e) => setFormData({ ...formData, slotsPerPeriod: parseInt(e.target.value) })}
            min="1"
            required
          />
        </div>
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label>Start Date *</label>
          <input
            type="date"
            className="form-control"
            value={formData.startDate}
            onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
            required
          />
        </div>

        <div className="form-group">
          <label>End Date (Optional)</label>
          <input
            type="date"
            className="form-control"
            value={formData.endDate}
            onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
          />
        </div>
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label>Daily End Time *</label>
          <input
            type="time"
            className="form-control"
            value={formData.dailyEndTime}
            onChange={(e) => setFormData({ ...formData, dailyEndTime: e.target.value })}
            required
          />
        </div>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={formData.excludeWeekends}
              onChange={(e) => setFormData({ ...formData, excludeWeekends: e.target.checked })}
            />
            Exclude Weekends
          </label>
        </div>
      </div>

      <div className="form-group">
        <label>Appointment Location</label>
        <input
          type="text"
          className="form-control"
          value={formData.location}
          onChange={(e) => setFormData({ ...formData, location: e.target.value })}
          placeholder="e.g., ID Card Unit, MIS Department"
        />
        <small style={{ color: 'var(--text-dim)', marginTop: '0.5rem', display: 'block' }}>
          This will be shown to students on their confirmation page
        </small>
      </div>

      <div className="form-group">
        <label>Important Message (Instructions for Students)</label>
        <textarea
          className="form-control"
          value={formData.importantMessage}
          onChange={(e) => setFormData({ ...formData, importantMessage: e.target.value })}
          rows="5"
          placeholder="Enter important instructions (one per line)"
        />
        <small style={{ color: 'var(--text-dim)', marginTop: '0.5rem', display: 'block' }}>
          Each line will be shown as a separate bullet point
        </small>
      </div>

      <div className="form-group">
        <label>Upload Student List (Excel/CSV) *</label>
        <input
          type="file"
          className="form-control"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => setFile(e.target.files[0])}
          required
        />
        <small style={{ color: 'var(--text-dim)', marginTop: '0.5rem', display: 'block' }}>
          Required columns: <strong>full_name</strong>, <strong>email</strong>, <strong>matric_number</strong>
          <br />
          Optional: faculty, department, level, phone
        </small>
      </div>

      <div className="btn-group">
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Creating...' : '✓ Create Schedule & Import Students'}
        </button>
      </div>
    </form>
  );
}

function SchedulingDetails({ details, user, onUpdate }) {
  const [activeTab, setActiveTab] = useState('students');
  const [insertModal, setInsertModal] = useState(null); // slot object
  const [insertLoading, setInsertLoading] = useState(false);
  const [insertForm, setInsertForm] = useState({ fullName: '', email: '', studentId: '', useExisting: '' });

  const getSlotNumbers = (slot) => {
    const capacity = Number(slot?.capacity || 0);
    const booked = Number(slot?.booked || 0);
    const available = Math.max(capacity - booked, 0);
    return { capacity, booked, available };
  };

  const canInsert = user?.role === 'supervisor' || user?.role === 'admin' ||
    (user?.role === 'staff' && user?.permissions?.includes('scheduling'));

  const availableSlots = details.slots?.filter(s => getSlotNumbers(s).available > 0) || [];
  const totalAvailableSeats = (details.slots || []).reduce((sum, slot) => sum + getSlotNumbers(slot).available, 0);
  const unscheduledStudents = details.students?.filter(s => !s.has_scheduled) || [];

  const handleInsert = async (e) => {
    e.preventDefault();
    setInsertLoading(true);
    try {
      const payload = insertForm.useExisting
        ? { existingStudentId: insertForm.useExisting, slotId: insertModal.id, configId: details.config.id }
        : { fullName: insertForm.fullName, email: insertForm.email, matricNumber: insertForm.studentId, slotId: insertModal.id, configId: details.config.id };

      const response = await fetch(`/api/scheduling/${details.config.id}/manual-book`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (response.ok) {
        showNotification('Student inserted successfully', 'success');
        setInsertModal(null);
        setInsertForm({ fullName: '', email: '', studentId: '', useExisting: '' });
        if (onUpdate) onUpdate();
      } else {
        showNotification(data.message || 'Failed to insert student', 'error');
      }
    } catch (err) {
      showNotification('Network error', 'error');
    } finally {
      setInsertLoading(false);
    }
  };

  return (
    <div>
      <div style={{
        display: 'flex',
        gap: '0',
        marginBottom: '1.5rem',
        background: 'var(--bg)',
        borderRadius: '10px',
        padding: '0.25rem'
      }}>
        <button
          onClick={() => setActiveTab('students')}
          style={{
            padding: '0.5rem 1.5rem',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'students' ? '600' : '400',
            background: activeTab === 'students' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'students' ? 'white' : 'var(--text-dim)'
          }}
        >
          👥 Students ({details.students?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('slots')}
          style={{
            padding: '0.5rem 1.5rem',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'slots' ? '600' : '400',
            background: activeTab === 'slots' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'slots' ? 'white' : 'var(--text-dim)'
          }}
        >
          📅 Time Slots ({details.slots?.length || 0})
          {totalAvailableSeats > 0 && (
            <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', opacity: 0.9 }}>
              ({totalAvailableSeats} free)
            </span>
          )}
        </button>
      </div>

      {activeTab === 'students' && (
        <div style={{ maxHeight: '500px', overflow: 'auto' }}>
          {details.students?.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '2rem' }}>
              No students added yet
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Full Name</th>
                  <th>Matric Number</th>
                  <th>Email</th>
                  <th>Login Code</th>
                  <th>Scheduled</th>
                  <th>Appointment</th>
                </tr>
              </thead>
              <tbody>
                {details.students?.map(student => (
                  <tr key={student.id}>
                    <td>{student.full_name}</td>
                    <td>{student.matric_number || '—'}</td>
                    <td>{student.email}</td>
                    <td><code>{student.login_code}</code></td>
                    <td>
                      <span className={`badge badge-${student.has_scheduled ? 'success' : 'warning'}`}>
                        {student.has_scheduled ? '✓ Yes' : '⏳ Pending'}
                      </span>
                    </td>
                    <td>
                      {student.appointment_date ? (
                        <span style={{ fontSize: '0.85rem' }}>
                          {new Date(student.appointment_date).toLocaleDateString()} at {formatTime12Hour(student.appointment_time)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-dim)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'slots' && (
        <div style={{ maxHeight: '500px', overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Capacity</th>
                <th>Booked</th>
                <th>Available</th>
                <th>Status</th>
                {canInsert && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {details.slots?.map(slot => {
                const { capacity, booked, available } = getSlotNumbers(slot);
                const isFull = available <= 0;
                return (
                  <tr key={slot.id}>
                    <td>{new Date(slot.slot_date).toLocaleDateString()}</td>
                    <td>{formatTime12Hour(slot.slot_time)}</td>
                    <td>{capacity}</td>
                    <td>{booked}</td>
                    <td>{available}</td>
                    <td>
                      <span className={`badge badge-${isFull ? 'danger' : 'success'}`}>
                        {isFull ? 'Full' : 'Available'}
                      </span>
                    </td>
                    {canInsert && (
                      <td>
                        {!isFull ? (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => setInsertModal(slot)}
                          >
                            ➕ Insert Student
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Insert Student Modal */}
      {insertModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000
        }}>
          <div style={{
            background: 'var(--bg-elevated)', borderRadius: '16px', padding: '2rem',
            maxWidth: '480px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.4)'
          }}>
            <h3 style={{ marginBottom: '0.25rem' }}>Insert Student into Slot</h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              📅 {new Date(insertModal.slot_date).toLocaleDateString()} at {formatTime12Hour(insertModal.slot_time)}
            </p>
            <form onSubmit={handleInsert} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {unscheduledStudents.length > 0 && (
                <div className="form-group">
                  <label>Pick Existing Unscheduled Student</label>
                  <select
                    className="form-control"
                    value={insertForm.useExisting}
                    onChange={(e) => setInsertForm({ ...insertForm, useExisting: e.target.value })}
                  >
                    <option value="">— Add new student instead —</option>
                    {unscheduledStudents.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} ({s.matric_number || s.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {!insertForm.useExisting && (
                <>
                  <div className="form-group">
                    <label>Full Name *</label>
                    <input type="text" className="form-control"
                      value={insertForm.fullName}
                      onChange={(e) => setInsertForm({ ...insertForm, fullName: e.target.value })}
                      placeholder="e.g., John Doe"
                      required={!insertForm.useExisting}
                    />
                  </div>
                  <div className="form-group">
                    <label>Email *</label>
                    <input type="email" className="form-control"
                      value={insertForm.email}
                      onChange={(e) => setInsertForm({ ...insertForm, email: e.target.value })}
                      placeholder="student@example.com"
                      required={!insertForm.useExisting}
                    />
                  </div>
                  <div className="form-group">
                    <label>Matric Number</label>
                    <input type="text" className="form-control"
                      value={insertForm.studentId}
                      onChange={(e) => setInsertForm({ ...insertForm, studentId: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary"
                  onClick={() => { setInsertModal(null); setInsertForm({ fullName: '', email: '', studentId: '', useExisting: '' }); }}
                  disabled={insertLoading}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={insertLoading}>
                  {insertLoading ? '⏳ Inserting...' : '✓ Confirm Insert'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}