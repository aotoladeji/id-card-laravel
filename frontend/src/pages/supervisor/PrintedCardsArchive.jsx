import { useState, useEffect, useRef } from 'react';
import ConfirmDialog from '../../components/ConfirmDialog';
import { showNotification } from '../../utils/errorHandler';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const formatBytes = (bytes) => {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`;
};

const chunk = (list, size) => {
  const parts = [];
  for (let i = 0; i < list.length; i += size) parts.push(list.slice(i, i + size));
  return parts;
};

const EMPTY_FILTERS = { search: '', status: '', backup: '', startDate: '', endDate: '' };

export default function PrintedCardsArchive() {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
  const [selected, setSelected] = useState(() => new Set());
  const [includeImages, setIncludeImages] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [restoreReport, setRestoreReport] = useState(null);
  const fileInputRef = useRef(null);
  const { dialogState, showDialog, closeDialog } = useConfirmDialog();

  useEffect(() => {
    fetchCards();
  }, [pagination.page, filters]);

  useEffect(() => {
    fetchStats();
  }, []);

  const buildParams = (extra = {}) => {
    const params = new URLSearchParams();
    Object.entries({ ...filters, ...extra }).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) params.set(key, value);
    });
    return params;
  };

  const fetchCards = async () => {
    setLoading(true);
    try {
      const params = buildParams({ page: pagination.page, limit: pagination.limit });
      const response = await fetch(`/api/card-archive?${params}`, { headers: authHeaders() });
      const data = await response.json();
      if (response.ok) {
        setCards(data.cards);
        setPagination((prev) => ({ ...prev, ...data.pagination }));
      } else {
        showNotification(data.message || 'Could not load printed cards', 'error');
      }
    } catch (error) {
      showNotification('Error loading printed cards', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/card-archive/stats', { headers: authHeaders() });
      const data = await response.json();
      if (response.ok) setStats(data.stats);
    } catch (error) {
      console.error('Error loading archive stats:', error);
    }
  };

  const applyFilters = (e) => {
    e.preventDefault();
    setSelected(new Set());
    setPagination((prev) => ({ ...prev, page: 1 }));
    setFilters({ ...form });
  };

  const clearFilters = () => {
    setSelected(new Set());
    setForm(EMPTY_FILTERS);
    setPagination((prev) => ({ ...prev, page: 1 }));
    setFilters({ ...EMPTY_FILTERS });
  };

  // ---- selection ----
  const pageIds = cards.map((card) => Number(card.card_id));
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const selectAllMatching = async () => {
    try {
      const response = await fetch(`/api/card-archive/ids?${buildParams()}`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not select all cards');
      setSelected(new Set(data.ids));
      showNotification(`Selected ${data.ids.length} card(s)`, 'success');
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  // ---- backup download ----
  const saveBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  const handleDownload = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      showNotification('Select the cards you want to back up first', 'warning');
      return;
    }

    // Card images take time to draw, so use smaller ZIP files when they are included.
    const batches = chunk(ids, includeImages ? 25 : 100);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    let imageFailures = 0;
    let finished = 0;

    setBusy(true);
    try {
      for (let i = 0; i < batches.length; i++) {
        setProgress(`Preparing ZIP ${i + 1} of ${batches.length}... please keep this page open.`);

        const response = await fetch('/api/card-archive/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ cardIds: batches[i], includeCardImages: includeImages })
        });

        if (!response.ok) {
          let message = `Download failed (status ${response.status})`;
          try {
            const payload = await response.json();
            message = payload.message || message;
          } catch (e) {
            // keep default message
          }
          throw new Error(message);
        }

        imageFailures += Number(response.headers.get('X-Archive-Image-Failures') || 0);
        const blob = await response.blob();
        const part = String(i + 1).padStart(3, '0');
        saveBlob(blob, `printed-cards-backup-${stamp}-part${part}-of-${batches.length}.zip`);
        finished++;
      }

      let message = `Downloaded ${finished} ZIP file(s) for ${ids.length} card(s). Open one to check it before deleting anything.`;
      if (imageFailures > 0) {
        message += ` Warning: ${imageFailures} card image(s) could not be created (passport photos are still included).`;
      }
      showNotification(message, imageFailures > 0 ? 'warning' : 'success');
    } catch (error) {
      showNotification(
        `${error.message}${finished > 0 ? ` (${finished} ZIP file(s) were already downloaded.)` : ''}`,
        'error'
      );
    } finally {
      setProgress('');
      setBusy(false);
      fetchCards();
      fetchStats();
    }
  };

  // ---- delete ----
  const handleDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      showNotification('Select the cards you want to delete first', 'warning');
      return;
    }

    const answer = await showDialog({
      type: 'prompt',
      title: '🗑️ Delete from server',
      message:
        `You are about to permanently delete ${ids.length} selected card(s) and their passport photos from this server. ` +
        'Only cards that are COLLECTED and already BACKED UP will be deleted; all others are skipped safely. ' +
        'This cannot be undone. Type DELETE to continue.',
      placeholder: 'Type DELETE',
      confirmText: 'Delete permanently'
    });

    if (answer === false) return;
    if (String(answer).trim() !== 'DELETE') {
      showNotification('Nothing was deleted. You must type DELETE exactly.', 'warning');
      return;
    }

    setBusy(true);
    let deleted = 0;
    let freed = 0;
    const skippedTotals = {};

    try {
      const batches = chunk(ids, 200);
      for (let i = 0; i < batches.length; i++) {
        setProgress(`Deleting batch ${i + 1} of ${batches.length}...`);

        const response = await fetch('/api/card-archive/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ cardIds: batches[i] })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Delete failed');

        deleted += data.deleted || 0;
        freed += data.photoBytesFreed || 0;
        Object.entries(data.skipped || {}).forEach(([reason, count]) => {
          skippedTotals[reason] = (skippedTotals[reason] || 0) + count;
        });
      }

      const skippedText = Object.entries(skippedTotals)
        .map(([reason, count]) => `${count} ${reason}`)
        .join('; ');

      let message = deleted > 0
        ? `Deleted ${deleted} card(s), freeing about ${formatBytes(freed)} of photo data.`
        : 'Nothing was deleted.';
      if (skippedText) message += ` Skipped: ${skippedText}.`;

      showNotification(message, deleted > 0 ? 'success' : 'warning');
      setSelected(new Set());
    } catch (error) {
      showNotification(
        `${error.message}${deleted > 0 ? ` (${deleted} card(s) were already deleted.)` : ''}`,
        'error'
      );
    } finally {
      setProgress('');
      setBusy(false);
      fetchCards();
      fetchStats();
    }
  };

  // ---- restore (upload) ----
  const handleRestoreFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = ''; // lets the same file be chosen again later
    if (files.length === 0) return;

    const limit = stats?.upload_limit_bytes || 0;
    const totals = { restored: 0, skippedExisting: 0, skippedInvalid: 0, withoutPhoto: 0, sameMatricOnServer: 0 };
    const problems = [];
    let filesDone = 0;

    setBusy(true);
    setRestoreReport(null);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(`Restoring file ${i + 1} of ${files.length}: ${file.name}`);

        if (limit && file.size > limit) {
          problems.push(
            `${file.name}: skipped. It is ${formatBytes(file.size)} but the server accepts only ${formatBytes(limit)} per upload. ` +
            'Make backups without card images (much smaller), or ask your IT person to raise upload_max_filesize and post_max_size.'
          );
          continue;
        }

        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/card-archive/restore', {
          method: 'POST',
          headers: authHeaders(),
          body: formData
        });

        let data = null;
        try {
          data = await response.json();
        } catch (e) {
          // not JSON (for example a "413 too large" page from the web server)
        }

        if (!response.ok || !data) {
          const reason = data?.message || `upload failed (status ${response.status})`;
          problems.push(`${file.name}: ${reason}${response.status === 413 ? ' - the file is bigger than the server allows' : ''}`);
          continue;
        }

        Object.keys(totals).forEach((key) => {
          totals[key] += data[key] || 0;
        });
        (data.problems || []).forEach((problem) => problems.push(`${file.name}: ${problem}`));
        filesDone++;
      }

      setRestoreReport({ files: files.length, filesDone, totals, problems });
      showNotification(
        `Restored ${totals.restored} card(s) from ${filesDone} of ${files.length} file(s).`,
        totals.restored > 0 && problems.length === 0 ? 'success' : 'warning'
      );
    } catch (error) {
      showNotification(error.message || 'Restore failed', 'error');
    } finally {
      setProgress('');
      setBusy(false);
      fetchCards();
      fetchStats();
    }
  };

  const diskText = stats && stats.disk_free_bytes !== null
    ? `${formatBytes(stats.disk_free_bytes)} free of ${formatBytes(stats.disk_total_bytes)}`
    : '—';

  return (
    <>
      <div className="header">
        <h1>🗄️ Printed Cards Archive</h1>
      </div>

      <div className="alert alert-info" style={{ marginBottom: '1.5rem' }}>
        Back up old printed cards to your computer or drive, then delete them from the server to free space.
        Only cards that are <strong>collected</strong> and <strong>backed up</strong> can be deleted.
      </div>

      {stats && (
        <div className="stats-grid" style={{ marginBottom: '2rem' }}>
          <div className="stat-card">
            <div className="stat-label">Printed cards on server</div>
            <div className="stat-value">{stats.total_cards}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Already backed up</div>
            <div className="stat-value">{stats.backed_up}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Photos in database</div>
            <div className="stat-value">{formatBytes(stats.photo_bytes)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Saved card images</div>
            <div className="stat-value">{formatBytes(stats.cache_bytes)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Server disk (app drive)</div>
            <div className="stat-value" style={{ fontSize: '1.1rem' }}>{diskText}</div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ flex: '1 1 320px' }}>
            <strong>⬆️ Restore old cards</strong>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
              Need to reprint an old ID? Upload the backup ZIP that contains it. The card comes back to the server
              (cards already on the server are never overwritten) and can then be reprinted.
              {stats && stats.upload_limit_bytes > 0 && (
                <> Server upload limit: <strong>{formatBytes(stats.upload_limit_bytes)}</strong> per file.</>
              )}
            </div>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip"
              multiple
              style={{ display: 'none' }}
              onChange={handleRestoreFiles}
            />
            <button
              type="button"
              className="btn btn-success"
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              disabled={busy}
            >
              ⬆️ Restore from backup (ZIP)
            </button>
          </div>
        </div>

        {restoreReport && (
          <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-elevated)', borderRadius: '10px' }}>
            <strong>Restore result</strong>{' '}
            <span style={{ color: 'var(--text-dim)' }}>
              ({restoreReport.filesDone} of {restoreReport.files} file(s) processed)
            </span>
            <ul style={{ margin: '0.5rem 0 0 1.25rem' }}>
              <li>✅ Restored: <strong>{restoreReport.totals.restored}</strong></li>
              <li>⏭️ Already on the server (left unchanged): {restoreReport.totals.skippedExisting}</li>
              {restoreReport.totals.skippedInvalid > 0 && (
                <li>⚠️ Could not be restored: {restoreReport.totals.skippedInvalid}</li>
              )}
              {restoreReport.totals.withoutPhoto > 0 && (
                <li>⚠️ Restored without a photo: {restoreReport.totals.withoutPhoto}</li>
              )}
              {restoreReport.totals.sameMatricOnServer > 0 && (
                <li>ℹ️ {restoreReport.totals.sameMatricOnServer} restored card(s) share an ID number with another card already on the server</li>
              )}
            </ul>
            {restoreReport.problems.length > 0 && (
              <details style={{ marginTop: '0.75rem' }}>
                <summary style={{ cursor: 'pointer' }}>Show {restoreReport.problems.length} problem(s)</summary>
                <ul style={{ margin: '0.5rem 0 0 1.25rem', fontSize: '0.9rem' }}>
                  {restoreReport.problems.map((problem, i) => (
                    <li key={i}>{problem}</li>
                  ))}
                </ul>
              </details>
            )}
            {restoreReport.totals.restored > 0 && (
              <div style={{ marginTop: '0.75rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                To reprint a restored card: staff open <strong>Card Approval</strong>, find the student and click
                <strong> Request Reprint</strong>. A supervisor then approves it under <strong>Reprint Approvals</strong>.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <form onSubmit={applyFilters}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Search</label>
              <input
                type="text"
                className="form-control"
                placeholder="Name, ID, or card number..."
                value={form.search}
                onChange={(e) => setForm({ ...form, search: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Collection</label>
              <select
                className="form-control"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="">All</option>
                <option value="collected">Collected</option>
                <option value="awaiting_collection">Awaiting collection</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Backup</label>
              <select
                className="form-control"
                value={form.backup}
                onChange={(e) => setForm({ ...form, backup: e.target.value })}
              >
                <option value="">All</option>
                <option value="no">Not backed up</option>
                <option value="yes">Backed up</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Printed from</label>
              <input
                type="date"
                className="form-control"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Printed to</label>
              <input
                type="date"
                className="form-control"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
            <div className="btn-group" style={{ marginBottom: 0 }}>
              <button type="submit" className="btn btn-primary">🔍 Search</button>
              <button type="button" className="btn btn-secondary" onClick={clearFilters}>✕ Clear</button>
            </div>
          </div>
        </form>
      </div>

      <div className="card" style={{ padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <strong>{selected.size}</strong> card(s) selected
            <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginLeft: '0.75rem' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={selectAllMatching} disabled={busy || pagination.total === 0}>
                Select all {pagination.total} matching
              </button>{' '}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelected(new Set())} disabled={busy || selected.size === 0}>
                Clear selection
              </button>
            </span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={includeImages}
                onChange={(e) => setIncludeImages(e.target.checked)}
                disabled={busy}
              />
              Include finished card images (slower)
            </label>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleDownload}
              disabled={busy || selected.size === 0}
            >
              ⬇️ Download backup (ZIP)
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleDelete}
              disabled={busy || selected.size === 0}
            >
              🗑️ Delete from server
            </button>
          </div>
        </div>

        {progress && (
          <div style={{ marginTop: '1rem', color: 'var(--text-dim)' }}>⏳ {progress}</div>
        )}
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>Loading printed cards...</div>
        ) : cards.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>
            No printed cards found
          </div>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>
                    <input type="checkbox" checked={allOnPageSelected} onChange={togglePage} disabled={busy} />
                  </th>
                  <th>Name</th>
                  <th>ID Number</th>
                  <th>Card Number</th>
                  <th>Printed</th>
                  <th>Collection</th>
                  <th>Backup</th>
                  <th>Photo size</th>
                </tr>
              </thead>
              <tbody>
                {cards.map((card) => {
                  const id = Number(card.card_id);
                  return (
                    <tr key={id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(id)}
                          onChange={() => toggleOne(id)}
                          disabled={busy}
                        />
                      </td>
                      <td>
                        <strong>{card.surname}</strong> {card.other_names}
                      </td>
                      <td>{card.matric_no || card.staff_id || '—'}</td>
                      <td>{card.card_number || '—'}</td>
                      <td>{card.printed_at ? new Date(card.printed_at).toLocaleDateString() : '—'}</td>
                      <td>
                        <span className={`badge badge-${card.status === 'collected' ? 'success' : 'warning'}`}>
                          {card.status === 'collected' ? 'Collected' : 'Awaiting collection'}
                        </span>
                      </td>
                      <td>
                        {card.archive_downloaded_at ? (
                          <span className="badge badge-success" title={new Date(card.archive_downloaded_at).toLocaleString()}>
                            ✓ Backed up
                          </span>
                        ) : (
                          <span className="badge badge-info">Not backed up</span>
                        )}
                      </td>
                      <td>{formatBytes(Number(card.photo_bytes))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {pagination.pages > 1 && (
              <div
                style={{
                  padding: '1.5rem',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem'
                }}
              >
                <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                  Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                </div>
                <div className="btn-group">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                    disabled={pagination.page === 1 || busy}
                  >
                    ← Previous
                  </button>
                  <span style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center' }}>
                    Page {pagination.page} of {pagination.pages}
                  </span>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                    disabled={pagination.page === pagination.pages || busy}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

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
