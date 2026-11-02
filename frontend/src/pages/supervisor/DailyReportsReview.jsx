import { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import VerifyReportForm from '../../components/supervisor/VerifyReportForm';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { showNotification } from '../../utils/errorHandler';

export default function DailyReportsReview() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [filter, setFilter] = useState('all');
  const { dialogState, showDialog, closeDialog } = useConfirmDialog();

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const response = await fetch('/api/daily-reports', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setReports(data.reports);
      } else {
        showNotification(data.message || 'Failed to fetch reports', 'error');
      }
    } catch (error) {
      console.error('Error fetching daily reports:', error);
      showNotification('Unable to connect to server', 'error');
    } finally {
      setLoading(false);
    }
  };

  const verifyReport = (report) => {
    setSelectedReport(report);
    setModalOpen(true);
  };

  const handleVerifySubmit = (updatedReport) => {
    setReports(reports.map(rep => 
      rep.id === updatedReport.id ? updatedReport : rep
    ));
    showNotification('Report verified successfully', 'success');
  };

  const filteredReports = reports.filter(rep => {
    if (filter === 'all') return true;
    return rep.verification_status === filter;
  });

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
          <div>Loading reports...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="header">
        <h1>📊 Daily Reports Review</h1>
        <div className="btn-group">
          <button 
            className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button 
            className={`btn btn-sm ${filter === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('pending')}
          >
            Pending
          </button>
          <button 
            className={`btn btn-sm ${filter === 'verified' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('verified')}
          >
            Verified
          </button>
        </div>
      </div>

      <div className="card">
        {filteredReports.length === 0 ? (
          <div style={{ 
            padding: '3rem', 
            textAlign: 'center', 
            color: 'var(--text-dim)' 
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
            <p>No daily reports found</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Submitted By</th>
                <th>Cards Captured</th>
                <th>Cards Approved</th>
                <th>Cards Printed</th>
                <th>Cards Collected</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map(rep => (
                <tr key={rep.id}>
                  <td>{new Date(rep.report_date).toLocaleDateString()}</td>
                  <td>{rep.submitted_by_name}</td>
                  <td>{rep.cards_captured}</td>
                  <td>{rep.cards_approved}</td>
                  <td>{rep.cards_printed}</td>
                  <td>{rep.cards_collected}</td>
                  <td>
                    <span className={`badge badge-${
                      rep.verification_status === 'verified' ? 'success' : 
                      rep.verification_status === 'rejected' ? 'danger' : 
                      'warning'
                    }`}>
                      {rep.verification_status}
                    </span>
                  </td>
                  <td>
                    {rep.verification_status === 'pending' ? (
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => verifyReport(rep)}
                      >
                        ✓ Verify
                      </button>
                    ) : (
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          const info = `Status: ${rep.verification_status}\nVerified By: ${rep.verified_by_name || 'N/A'}\nVerified At: ${rep.verified_at ? new Date(rep.verified_at).toLocaleString() : 'N/A'}\nRemarks: ${rep.supervisor_remarks || 'None'}`;
                          showDialog({
                            type: 'alert',
                            title: 'Report Details',
                            message: info
                          });
                        }}
                      >
                        👁️ View
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Verify Daily Report"
        size="large"
      >
        {selectedReport && (
          <VerifyReportForm
            report={selectedReport}
            onSubmit={handleVerifySubmit}
            onClose={() => setModalOpen(false)}
          />
        )}
      </Modal>

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