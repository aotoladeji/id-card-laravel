import { useState, useEffect } from 'react';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

export default function SystemLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const { dialogState, showDialog, closeDialog } = useConfirmDialog();

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const response = await fetch('/api/logs', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setLogs(data.logs || []);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
      // Use mock data for now
      setLogs([
        { id: 1, created_at: '2026-02-04 10:30:15', username: 'staff1', action: 'Added inventory item', details: 'Blank PVC Cards - 500 units' },
        { id: 2, created_at: '2026-02-04 09:15:22', username: 'supervisor', action: 'Approved reprint request', details: 'Card ID: STU001' },
        { id: 3, created_at: '2026-02-04 08:45:10', username: 'staff1', action: 'Submitted daily report', details: 'Date: 2026-02-03' }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const exportLogs = () => {
    showDialog({
      type: 'alert',
      title: 'Coming Soon',
      message: 'Export logs feature coming soon!'
    });
  };

  if (loading) {
    return <div style={{padding: '2rem'}}>Loading logs...</div>;
  }

  return (
    <>
      <div className="header">
        <h1>System Activity Logs</h1>
        <button className="btn btn-secondary btn-sm" onClick={exportLogs}>
          📄 Export Logs
        </button>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>User</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id}>
                <td>{log.created_at}</td>
                <td>{log.username || 'System'}</td>
                <td>{log.action}</td>
                <td>{log.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        isOpen={dialogState.isOpen}
        type={dialogState.type}
        title={dialogState.title}
        message={dialogState.message}
        onConfirm={dialogState.onConfirm}
        onClose={closeDialog}
      />
    </>
  );
}