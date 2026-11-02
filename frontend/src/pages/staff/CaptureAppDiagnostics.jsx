import { useState } from 'react';
import { showNotification } from '../../utils/errorHandler';

export default function CaptureAppDiagnostics() {
  const [diagnostics, setDiagnostics] = useState(null);
  const [loading, setLoading] = useState(false);

  const runDiagnostics = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/card-preview/diagnostic', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setDiagnostics(data.diagnostics);
        showNotification('Diagnostics completed', 'success');
      } else {
        showNotification(data.message || 'Failed to run diagnostics', 'error');
      }
    } catch (error) {
      console.error('Error running diagnostics:', error);
      showNotification('Unable to connect to server', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success': return '✅';
      case 'failed': return '❌';
      case 'not_configured': return '⚠️';
      case 'checking': return '⏳';
      default: return '❓';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'success': return 'var(--success)';
      case 'failed': return 'var(--danger)';
      case 'not_configured': return 'var(--warning)';
      default: return 'var(--text-dim)';
    }
  };

  return (
    <>
      <div className="header">
        <h1>🔧 Capture App Diagnostics</h1>
        <button 
          className="btn btn-primary" 
          onClick={runDiagnostics}
          disabled={loading}
        >
          {loading ? '⏳ Running...' : '🔍 Run Diagnostics'}
        </button>
      </div>

      <div className="card">
        <div style={{ padding: '2rem' }}>
          {!diagnostics ? (
            <div style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔧</div>
              <p>Click "Run Diagnostics" to check the capture app connection and configuration.</p>
            </div>
          ) : (
            <>
              <div style={{ 
                marginBottom: '2rem',
                padding: '1rem',
                background: 'var(--bg)',
                borderRadius: '8px',
                border: '1px solid var(--border)'
              }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>
                  Capture App URL
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: '600', fontFamily: 'monospace' }}>
                  {diagnostics.captureAppUrl}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
                  Tested at: {new Date(diagnostics.timestamp).toLocaleString()}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Test 1: Capture App Reachable */}
                {diagnostics.tests.captureAppReachable && (
                  <div style={{ 
                    padding: '1.5rem',
                    border: '2px solid var(--border)',
                    borderRadius: '10px',
                    borderColor: getStatusColor(diagnostics.tests.captureAppReachable.status)
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                      <span style={{ fontSize: '1.5rem' }}>
                        {getStatusIcon(diagnostics.tests.captureAppReachable.status)}
                      </span>
                      <div>
                        <div style={{ fontSize: '1.1rem', fontWeight: '600' }}>
                          Capture App Connection
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                          {diagnostics.tests.captureAppReachable.message}
                        </div>
                      </div>
                    </div>
                    {diagnostics.tests.captureAppReachable.data && (
                      <pre style={{ 
                        background: 'var(--bg)',
                        padding: '0.75rem',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        overflow: 'auto'
                      }}>
                        {JSON.stringify(diagnostics.tests.captureAppReachable.data, null, 2)}
                      </pre>
                    )}
                  </div>
                )}

                {/* Test 2: Approved Cards Endpoint */}
                {diagnostics.tests.approvedCardsEndpoint && (
                  <div style={{ 
                    padding: '1.5rem',
                    border: '2px solid var(--border)',
                    borderRadius: '10px',
                    borderColor: getStatusColor(diagnostics.tests.approvedCardsEndpoint.status)
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                      <span style={{ fontSize: '1.5rem' }}>
                        {getStatusIcon(diagnostics.tests.approvedCardsEndpoint.status)}
                      </span>
                      <div>
                        <div style={{ fontSize: '1.1rem', fontWeight: '600' }}>
                          Approved Cards API
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                          {diagnostics.tests.approvedCardsEndpoint.message}
                        </div>
                      </div>
                    </div>
                    {diagnostics.tests.approvedCardsEndpoint.cardCount !== undefined && (
                      <div style={{ 
                        background: 'var(--bg)',
                        padding: '0.75rem',
                        borderRadius: '6px'
                      }}>
                        <div><strong>Cards found:</strong> {diagnostics.tests.approvedCardsEndpoint.cardCount}</div>
                        {diagnostics.tests.approvedCardsEndpoint.sampleCardIds && diagnostics.tests.approvedCardsEndpoint.sampleCardIds.length > 0 && (
                          <div style={{ marginTop: '0.5rem' }}>
                            <strong>Sample card IDs:</strong> {diagnostics.tests.approvedCardsEndpoint.sampleCardIds.join(', ')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Test 3: Card Image Endpoint */}
                {diagnostics.tests.cardImageEndpoint && (
                  <div style={{ 
                    padding: '1.5rem',
                    border: '2px solid var(--border)',
                    borderRadius: '10px',
                    borderColor: getStatusColor(diagnostics.tests.cardImageEndpoint.status)
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                      <span style={{ fontSize: '1.5rem' }}>
                        {getStatusIcon(diagnostics.tests.cardImageEndpoint.status)}
                      </span>
                      <div>
                        <div style={{ fontSize: '1.1rem', fontWeight: '600' }}>
                          Card Image Endpoint (PNG)
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                          {diagnostics.tests.cardImageEndpoint.message}
                        </div>
                      </div>
                    </div>
                    {diagnostics.tests.cardImageEndpoint.testedCardId && (
                      <div style={{ 
                        background: 'var(--bg)',
                        padding: '0.75rem',
                        borderRadius: '6px'
                      }}>
                        <div><strong>Tested Card ID:</strong> {diagnostics.tests.cardImageEndpoint.testedCardId}</div>
                        {diagnostics.tests.cardImageEndpoint.endpoint && (
                          <div style={{ marginTop: '0.5rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                            <strong>Endpoint:</strong> {diagnostics.tests.cardImageEndpoint.endpoint}
                          </div>
                        )}
                        {diagnostics.tests.cardImageEndpoint.imageSize && (
                          <div style={{ marginTop: '0.5rem' }}>
                            <strong>Image Size:</strong> {(diagnostics.tests.cardImageEndpoint.imageSize / 1024).toFixed(2)} KB
                          </div>
                        )}
                        {diagnostics.tests.cardImageEndpoint.suggestion && (
                          <div style={{ 
                            marginTop: '0.5rem',
                            padding: '0.5rem',
                            background: 'var(--warning-bg)',
                            color: 'var(--warning)',
                            borderRadius: '4px',
                            fontSize: '0.85rem'
                          }}>
                            💡 {diagnostics.tests.cardImageEndpoint.suggestion}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Test 4: Output Directory */}
                {diagnostics.tests.outputDirectory && (
                  <div style={{ 
                    padding: '1.5rem',
                    border: '2px solid var(--border)',
                    borderRadius: '10px',
                    borderColor: getStatusColor(diagnostics.tests.outputDirectory.status)
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                      <span style={{ fontSize: '1.5rem' }}>
                        {getStatusIcon(diagnostics.tests.outputDirectory.status)}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: '600' }}>
                          Output Directory
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                          {diagnostics.tests.outputDirectory.message}
                        </div>
                      </div>
                    </div>
                    {diagnostics.tests.outputDirectory.path && (
                      <div style={{ 
                        background: 'var(--bg)',
                        padding: '0.75rem',
                        borderRadius: '6px',
                        marginBottom: '0.75rem',
                        fontFamily: 'monospace',
                        fontSize: '0.85rem',
                        wordBreak: 'break-all'
                      }}>
                        {diagnostics.tests.outputDirectory.path}
                      </div>
                    )}
                    {diagnostics.tests.outputDirectory.totalFiles !== undefined && (
                      <div style={{ 
                        background: 'var(--bg)',
                        padding: '0.75rem',
                        borderRadius: '6px'
                      }}>
                        <div><strong>Total files:</strong> {diagnostics.tests.outputDirectory.totalFiles}</div>
                        <div><strong>PNG files:</strong> {diagnostics.tests.outputDirectory.pngFiles}</div>
                        {diagnostics.tests.outputDirectory.sampleFiles && diagnostics.tests.outputDirectory.sampleFiles.length > 0 && (
                          <div style={{ marginTop: '0.5rem' }}>
                            <strong>Sample files:</strong>
                            <ul style={{ margin: '0.5rem 0 0 1.5rem', fontSize: '0.85rem' }}>
                              {diagnostics.tests.outputDirectory.sampleFiles.map((file, idx) => (
                                <li key={idx} style={{ fontFamily: 'monospace' }}>{file}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                    {diagnostics.tests.outputDirectory.error && (
                      <div style={{ 
                        background: 'var(--danger-bg)',
                        color: 'var(--danger)',
                        padding: '0.75rem',
                        borderRadius: '6px',
                        fontSize: '0.85rem'
                      }}>
                        <strong>Error:</strong> {diagnostics.tests.outputDirectory.error}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ 
                marginTop: '2rem',
                padding: '1rem',
                background: 'var(--info-bg)',
                borderRadius: '8px',
                border: '1px solid var(--info)'
              }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--text)' }}>
                  <strong>💡 Troubleshooting Tips:</strong>
                  <ul style={{ margin: '0.5rem 0 0 1.5rem' }}>
                    <li>If capture app is not reachable, ensure it's running on port 5001</li>
                    <li>If output directory doesn't exist, check the capture app configuration</li>
                    <li>If no PNG files found, the capture app may not be generating card images</li>
                    <li>Check the CAPTURE_APP_INTEGRATION_GUIDE.md file for detailed instructions</li>
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
