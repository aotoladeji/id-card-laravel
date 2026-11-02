import { useState, useEffect } from 'react';
import { showNotification } from '../../utils/errorHandler';

export default function Collections() {
  const [collections, setCollections] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('awaiting_collection');
  const [search, setSearch] = useState('');
  const [fingerprintModal, setFingerprintModal] = useState(null); // { id, name }
  const [scanState, setScanState] = useState('idle'); // idle | scanning | scanned | verifying
  const [scannedImage, setScannedImage] = useState(null);
  const [scanPayload, setScanPayload] = useState(null);
  const [scannedTemplate, setScannedTemplate] = useState(null);
  const [lastScanSignature, setLastScanSignature] = useState(null);

  const pickScannerTemplate = (payload) => {
    if (!payload || typeof payload !== 'object') return null;

    // Prefer explicit template-like fields if present.
    const priorityKeys = [
      'fingerprintData',
      'fingerprintTemplate',
      'template',
      'Template',
      'ISOFMR',
      'isoTemplate',
      'AnsiTemplate',
      'WSQ',
      'Base64Template'
    ];

    for (const key of priorityKeys) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim().length > 20) {
        return value.trim();
      }
    }

    // Fallback: detect likely template fields by key name.
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value !== 'string' || value.trim().length <= 20) continue;
      const k = key.toLowerCase();
      if (
        k.includes('template') ||
        k.includes('finger') ||
        k.includes('iso') ||
        k.includes('wsq') ||
        k.includes('minutiae')
      ) {
        return value.trim();
      }
    }

    return null;
  };

  useEffect(() => {
    fetchCollections();
    fetchStats();
  }, [filter]);

  const fetchCollections = async () => {
    try {
      const params = new URLSearchParams({
        ...(filter && { status: filter }),
        ...(search && { search })
      });

      const response = await fetch(`/api/collections?${params}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      
      const data = await response.json();
      console.log('[Collections] API Response:', { status: response.status, ok: response.ok, data });
      
      if (response.ok) {
        console.log('[Collections] Setting collections:', data.collections?.length, 'cards');
        setCollections(data.collections || []);
      } else {
        console.error('[Collections] API Error:', data);
        showNotification(data.message || 'Error fetching collections', 'error');
      }
    } catch (error) {
      console.error('[Collections] Fetch error:', error);
      showNotification('Error fetching collections', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/collections/stats', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (response.ok) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const markAsCollected = (id, name) => {
    setFingerprintModal({ id, name });
    setScanState('idle');
    setScannedImage(null);
    // Auto-start scanner immediately when user clicks "Verify Fingerprint".
    setTimeout(() => {
      handleScan();
    }, 50);
  };

  const closeFingerprintModal = () => {
    setFingerprintModal(null);
    setScanState('idle');
    setScannedImage(null);
    setScanPayload(null);
    setScannedTemplate(null);
  };

  // Step 1 — trigger the Windows fingerprint scanner service
  const handleScan = async () => {
    setScanState('scanning');
    try {
      // The Windows service expects a base64-encoded JSON payload
      const payload = btoa(JSON.stringify({ action: '14' }));
      const response = await fetch('http://localhost:28815/', {
        method: 'POST',
        body: payload
      });
      const data = await response.json();

      if (data.result === '02') {
        showNotification('Please reinsert the fingerprint device and try again.', 'error');
        setScanState('idle');
        return;
      }
      if (!data || (typeof data !== 'object')) {
        showNotification('Scanner returned an invalid response. Please try again.', 'error');
        setScanState('idle');
        return;
      }

      // Keep full scanner payload so backend can use any template fields available.
      setScanPayload(data);
      const templateValue = pickScannerTemplate(data);
      setScannedTemplate(templateValue);

      if (!data.FigPicBase64) {
        showNotification('No fingerprint captured. Please try again.', 'error');
        setScanState('idle');
        return;
      }
      setScannedImage(data.FigPicBase64);
      const signature = String(data.FigPicBase64).slice(0, 64);
      if (lastScanSignature && lastScanSignature === signature) {
        showNotification('Scanner returned the same fingerprint image as previous scan. Please reposition finger and rescan.', 'warning');
      }
      setLastScanSignature(signature);
      setScanState('scanned');
    } catch {
      showNotification('Could not reach fingerprint scanner service. Ensure the device driver is running.', 'error');
      setScanState('idle');
    }
  };

  // Step 2 — send scanned fingerprint to backend for comparison
  const handleFingerprintVerify = async () => {
    const { id } = fingerprintModal;
    setScanState('verifying');
    try {
      const response = await fetch(`/api/collections/${id}/verify-fingerprint`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          scannedFingerprint: scannedTemplate || scannedImage,
          scannedFingerprintImage: scannedImage,
          scanPayload
        })
      });
      const data = await response.json();
      if (response.ok && data.verified) {
        showNotification(data.message, 'success');
        closeFingerprintModal();
        fetchCollections();
        fetchStats();
      } else {
        showNotification(data.message || 'Fingerprint did not match', 'error');
        setScanState('scanned'); // allow rescan / retry
      }
    } catch {
      showNotification('Error verifying fingerprint', 'error');
      setScanState('scanned');
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchCollections();
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
        <div>Loading collections...</div>
      </div>
    );
  }

  return (
    <>
      <div className="header">
        <h1>🎴 Card Collections</h1>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="stats-grid" style={{ marginBottom: '2rem' }}>
          <div className="stat-card">
            <div className="stat-label">Total Printed</div>
            <div className="stat-value">{stats.total_printed}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Collected</div>
            <div className="stat-value" style={{ color: 'var(--success)' }}>
              {stats.total_collected}
            </div>
            <div className="stat-change">
              {((stats.total_collected / stats.total_printed) * 100).toFixed(1)}% collection rate
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Awaiting Collection</div>
            <div className="stat-value" style={{ color: 'var(--warning)' }}>
              {stats.awaiting_collection}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Collected Today</div>
            <div className="stat-value">{stats.collected_today}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'end' }}>
          <div style={{ flex: 1 }}>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Search by name, ID, or card number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn btn-primary">
                🔍 Search
              </button>
            </form>
          </div>
          <div className="btn-group">
            <button
              className={`btn btn-sm ${filter === 'awaiting_collection' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter('awaiting_collection')}
            >
              Awaiting ({stats?.awaiting_collection || 0})
            </button>
            <button
              className={`btn btn-sm ${filter === 'collected' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter('collected')}
            >
              Collected ({stats?.total_collected || 0})
            </button>
            <button
              className={`btn btn-sm ${filter === '' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter('')}
            >
              All
            </button>
          </div>
        </div>
      </div>

      {/* Collections Table */}
      <div className="card">
        {collections.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
            No {filter === 'awaiting_collection' ? 'pending' : filter === 'collected' ? 'collected' : ''} cards found
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>ID Number</th>
                <th>Card Number</th>
                <th>Faculty/Department</th>
                <th>Printed Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {collections.map(card => (
                <tr key={card.id}>
                  <td>
                    <strong>{card.surname}</strong> {card.other_names}
                  </td>
                  <td>{card.matric_no || card.staff_id || '—'}</td>
                  <td>{card.card_number || card.cardNumber || '—'}</td>
                  <td>
                    <div>{card.department}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                      {card.faculty}
                    </div>
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>
                    {new Date(card.printed_at).toLocaleDateString()}
                  </td>
                  <td>
                    {card.status === 'awaiting_collection' ? (
                      <span className="badge badge-warning">Awaiting Collection</span>
                    ) : (
                      <span className="badge badge-success">
                        Collected
                        {card.collected_at && (
                          <span style={{ display: 'block', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                            {new Date(card.collected_at).toLocaleDateString()}
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td>
                    {card.status === 'awaiting_collection' ? (
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => markAsCollected(card.id, `${card.surname} ${card.other_names}`)}
                      >
                        👆 Verify Fingerprint
                      </button>
                    ) : (
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                        Collected by: {card.collected_by_name || '—'}
                        {card.notes && (
                          <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                            Note: {card.notes}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Fingerprint Verification Modal */}
      {fingerprintModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: 'var(--bg-elevated)', borderRadius: '16px', padding: '2rem',
            maxWidth: '420px', width: '90%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.4)'
          }}>
            <h3 style={{ marginBottom: '0.5rem' }}>Fingerprint Verification</h3>
            <p style={{ color: 'var(--text-dim)', marginBottom: '1rem', fontSize: '0.9rem' }}>
              Card owner: <strong>{fingerprintModal.name}</strong>
            </p>

            {/* Step 1 — idle: prompt to scan */}
            {scanState === 'idle' && (
              <>
                <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>👆</div>
                <p style={{ color: 'var(--text-dim)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                  Scanner starts automatically. Ask the card owner to place their finger on the scanner now.
                </p>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button className="btn btn-secondary" onClick={closeFingerprintModal}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleScan}>👆 Scan Fingerprint</button>
                </div>
              </>
            )}

            {/* Step 2 — scanning: waiting for device */}
            {scanState === 'scanning' && (
              <>
                <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>⏳</div>
                <p style={{ color: 'var(--text-dim)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                  Waiting for fingerprint... ask the card owner to place their finger on the scanner now.
                </p>
                <button className="btn btn-secondary" onClick={closeFingerprintModal}>Cancel</button>
              </>
            )}

            {/* Step 3 — scanned: show preview and verify */}
            {(scanState === 'scanned') && (
              <>
                <p style={{ color: 'var(--success)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                  ✅ Fingerprint captured
                </p>
                <img
                  src={`data:image/jpg;base64,${scannedImage}`}
                  alt="Scanned fingerprint"
                  style={{ height: '120px', border: '2px solid var(--border)', borderRadius: '8px', marginBottom: '1.25rem' }}
                />
                <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                  Scanner response received. Proceed to verify.
                </div>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button className="btn btn-secondary" onClick={closeFingerprintModal}>Cancel</button>
                  <button className="btn btn-secondary" onClick={handleScan}>🔄 Rescan</button>
                  <button className="btn btn-primary" onClick={handleFingerprintVerify}>✅ Verify</button>
                </div>
              </>
            )}

            {/* Step 4 — verifying: backend comparison */}
            {scanState === 'verifying' && (
              <>
                <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🔍</div>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Comparing fingerprint...</p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}