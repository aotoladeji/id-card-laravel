import { useState, useEffect } from 'react';
import { printReport, getDateRange } from '../../utils/printReport';
import { showNotification } from '../../utils/errorHandler';

export default function AllReports() {
  const [reportType, setReportType] = useState('monthly');
  const [activeReport, setActiveReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const reportCategories = [
    { id: 'inventory', label: '📦 Inventory Report', icon: '📦' },
    { id: 'daily-activity', label: '📊 Daily Activity Report', icon: '📊' },
    { id: 'reprint', label: '🔄 Reprint Requests Report', icon: '🔄' },
    { id: 'collection', label: '🎴 Card Collection Report', icon: '🎴' },
    { id: 'material', label: '📋 Material Requests Report', icon: '📋' },
    { id: 'faulty', label: '⚠️ Faulty Delivery Report', icon: '⚠️' },
  ];

  const fetchAndPrint = async (reportId) => {
    setLoading(true);
    setActiveReport(reportId);

    const { startDate, endDate, label } = getDateRange(reportType);
    const token = localStorage.getItem('token');
    const headers = { 'Authorization': `Bearer ${token}` };

    try {
      let title, columns, rows, summary;

      if (reportId === 'inventory') {
        const res = await fetch('/api/inventory', { headers });
        const data = await res.json();
        const items = (data.inventory || []).filter(i => {
          const d = new Date(i.created_at);
          return d >= startDate && d <= endDate;
        });
        title = 'Inventory Report';
        summary = [
          { label: 'Total Items', value: items.length },
          { label: 'Total Qty', value: items.reduce((s, i) => s + parseInt(i.quantity || 0), 0) },
          { label: 'Approved', value: items.filter(i => i.status === 'approved').length },
          { label: 'Pending', value: items.filter(i => i.status === 'pending').length },
        ];
        columns = ['Item Name', 'Quantity', 'Unit', 'Added By', 'Date', 'Status'];
        rows = items.map(i => [i.item_name, i.quantity, i.unit, i.added_by_name || 'N/A', new Date(i.created_at).toLocaleDateString(), i.status]);

      } else if (reportId === 'daily-activity') {
        const res = await fetch('/api/daily-reports', { headers });
        const data = await res.json();
        const reports = (data.reports || []).filter(r => {
          const d = new Date(r.report_date);
          return d >= startDate && d <= endDate;
        });
        title = 'Daily Activity Report';
        const totalRibbons = reports.reduce((s, r) => s + parseInt((r.inventory_used || {}).ribbons || 0), 0);
        const totalFilm = reports.reduce((s, r) => s + parseInt((r.inventory_used || {}).film || 0), 0);
        const totalBlankCards = reports.reduce((s, r) => s + parseInt((r.inventory_used || {}).blankCards || 0), 0);
        const totalFilter = reports.reduce((s, r) => s + parseInt((r.inventory_used || {}).filter || 0), 0);
        const totalCleaner = reports.reduce((s, r) => s + parseInt((r.inventory_used || {}).cleaner || 0), 0);
        summary = [
          { label: 'Total Reports', value: reports.length },
          { label: 'Verified', value: reports.filter(r => r.verification_status === 'verified').length },
          { label: 'Pending', value: reports.filter(r => r.verification_status === 'pending').length },
          { label: 'Cards Captured', value: reports.reduce((s, r) => s + parseInt(r.cards_captured || 0), 0) },
          { label: 'Cards Printed', value: reports.reduce((s, r) => s + parseInt(r.cards_printed || 0), 0) },
          { label: 'Ribbons Used', value: totalRibbons },
          { label: 'Film Used', value: totalFilm },
          { label: 'Blank Cards Used', value: totalBlankCards },
          { label: 'Filter Used', value: totalFilter },
          { label: 'Cleaner Used', value: totalCleaner },
        ];
        columns = ['Date', 'Staff', 'Captured', 'Approved', 'Printed', 'Collected', 'Ribbons', 'Film', 'Blank Cards', 'Filter', 'Cleaner', 'Status'];
        rows = reports.map(r => {
          const inv = r.inventory_used || {};
          return [
            new Date(r.report_date).toLocaleDateString(),
            r.submitted_by_name || 'N/A',
            r.cards_captured,
            r.cards_approved,
            r.cards_printed,
            r.cards_collected,
            inv.ribbons || 0,
            inv.film || 0,
            inv.blankCards || 0,
            inv.filter || 0,
            inv.cleaner || 0,
            r.verification_status
          ];
        });

      } else if (reportId === 'reprint') {
        const res = await fetch('/api/reprint', { headers });
        const data = await res.json();
        const requests = (data.requests || []).filter(r => {
          const d = new Date(r.created_at);
          return d >= startDate && d <= endDate;
        });
        title = 'Reprint Requests Report';
        summary = [
          { label: 'Total Requests', value: requests.length },
          { label: 'Approved', value: requests.filter(r => r.status === 'approved').length },
          { label: 'Rejected', value: requests.filter(r => r.status === 'rejected').length },
          { label: 'Pending', value: requests.filter(r => r.status === 'pending').length },
        ];
        columns = ['Matric No.', 'Student Name', 'Reason', 'Requested By', 'Date', 'Status'];
        rows = requests.map(r => [
          r.matric_number,
          r.student_name,
          r.reason,
          r.requested_by_username || 'N/A',
          new Date(r.created_at).toLocaleDateString(),
          r.status
        ]);

      } else if (reportId === 'collection') {
        const res = await fetch('/api/collections', { headers });
        const data = await res.json();
        const cards = (data.collections || []).filter(c => {
          if (!c.collected_at) return false;
          const d = new Date(c.collected_at);
          return c.status === 'collected' && d >= startDate && d <= endDate;
        });
        title = 'Card Collection Report';
        summary = [
          { label: 'Total Collected', value: cards.length },
          { label: 'This Period', value: cards.length },
        ];
        columns = ['ID Number', 'Full Name', 'Faculty', 'Department', 'Collection Date', 'Collected By'];
        rows = cards.map(c => [
          c.matric_no || c.staff_id || 'N/A',
          `${c.surname} ${c.other_names}`,
          c.faculty,
          c.department,
          new Date(c.collected_at).toLocaleDateString(),
          c.collected_by_name || 'N/A'
        ]);

      } else if (reportId === 'material') {
        const res = await fetch('/api/material', { headers });
        const data = await res.json();
        const requests = (data.requests || []).filter(r => {
          const d = new Date(r.created_at);
          return d >= startDate && d <= endDate;
        });
        title = 'Material Requests Report';
        summary = [
          { label: 'Total Requests', value: requests.length },
          { label: 'Approved', value: requests.filter(r => r.status === 'approved').length },
          { label: 'Fulfilled', value: requests.filter(r => r.status === 'fulfilled').length },
          { label: 'Pending', value: requests.filter(r => r.status === 'pending').length },
        ];
        columns = ['Item', 'Quantity', 'Urgency', 'Requested By', 'Date', 'Status'];
        rows = requests.map(r => [
          r.item_name,
          r.quantity,
          r.urgency,
          r.requested_by_username || 'N/A',
          new Date(r.created_at).toLocaleDateString(),
          r.status
        ]);

      } else if (reportId === 'faulty') {
        const res = await fetch('/api/inventory/faulty', { headers });
        const data = await res.json();
        const deliveries = (data.deliveries || []).filter(d => {
          const date = new Date(d.created_at);
          return date >= startDate && date <= endDate;
        });
        title = 'Faulty Delivery Report';
        summary = [
          { label: 'Total Reports', value: deliveries.length },
          { label: 'Resolved', value: deliveries.filter(d => d.status === 'resolved').length },
          { label: 'Acknowledged', value: deliveries.filter(d => d.status === 'acknowledged').length },
          { label: 'Pending', value: deliveries.filter(d => d.status === 'pending').length },
        ];
        columns = ['Item', 'Quantity', 'Issue', 'Reported By', 'Date', 'Status'];
        rows = deliveries.map(d => [
          d.item_name,
          d.quantity,
          d.issue_description,
          d.reported_by_name || 'N/A',
          new Date(d.created_at).toLocaleDateString(),
          d.status
        ]);
      }

      printReport({
        title,
        subtitle: label,
        reportType: reportType.charAt(0).toUpperCase() + reportType.slice(1),
        summary,
        columns,
        rows
      });

    } catch (error) {
      console.error('Error generating report:', error);
      showNotification('Failed to generate report', 'error');
    } finally {
      setLoading(false);
      setActiveReport(null);
    }
  };

  return (
    <>
      <div className="header">
        <h1>📄 Reports</h1>
        <div className="btn-group" style={{ alignItems: 'center' }}>
          <label style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Period:</label>
          <select
            className="form-control"
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            style={{ width: 'auto', padding: '0.4rem 0.75rem' }}
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="annually">Annually</option>
          </select>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '1.5rem',
        marginTop: '1rem'
      }}>
        {reportCategories.map(cat => (
          <div key={cat.id} className="card" style={{ padding: '1.5rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>{cat.icon}</div>
            <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>{cat.label}</h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Generate a {reportType} report for this category
            </p>
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => fetchAndPrint(cat.id)}
              disabled={loading && activeReport === cat.id}
            >
              {loading && activeReport === cat.id ? '⏳ Generating...' : `🖨️ Print ${reportType} Report`}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}