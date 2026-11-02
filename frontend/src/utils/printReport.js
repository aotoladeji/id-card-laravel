// Shared print utility for all report types
export const printReport = ({ title, subtitle, columns, rows, reportType, summary }) => {
  const now = new Date();
  const currentDate = now.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const currentTime = now.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const summaryHTML = summary
    ? `
      <div class="summary-grid">
        ${summary.map(s => `
          <div class="summary-card">
            <div class="summary-label">${s.label}</div>
            <div class="summary-value">${s.value}</div>
          </div>
        `).join('')}
      </div>
    `
    : '';

  const tableHTML = rows.length > 0
    ? `
      <table>
        <thead>
          <tr>
            ${columns.map(col => `<th>${col}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, i) => `
            <tr class="${i % 2 === 0 ? 'even' : 'odd'}">
              ${row.map(cell => `<td>${cell ?? '-'}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    : '<p class="no-data">No records found for this period.</p>';

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title} - ${reportType}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500;600&family=Roboto+Mono:wght@400;500&display=swap');

          * { margin: 0; padding: 0; box-sizing: border-box; }

          body {
            font-family: 'EB Garamond', Georgia, serif;
            font-size: 13px;
            color: #1a1a1a;
            background: #fff;
            padding: 0;
          }

          /* Header */
          .report-header {
            background: #1a1a2e;
            color: white;
            padding: 2rem 2.5rem;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }

          .report-header-left h1 {
            font-size: 1.6rem;
            font-weight: 600;
            letter-spacing: 0.02em;
            margin-bottom: 0.3rem;
          }

          .report-header-left .subtitle {
            font-size: 0.95rem;
            opacity: 0.75;
            font-family: 'Roboto Mono', monospace;
          }

          .report-header-right {
            text-align: right;
            font-family: 'Roboto Mono', monospace;
            font-size: 0.8rem;
            opacity: 0.85;
            line-height: 1.8;
          }

          .report-badge {
            display: inline-block;
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.3);
            padding: 0.2rem 0.75rem;
            border-radius: 20px;
            font-size: 0.75rem;
            font-family: 'Roboto Mono', monospace;
            margin-top: 0.5rem;
            letter-spacing: 0.1em;
            text-transform: uppercase;
          }

          /* Body */
          .report-body {
            padding: 2rem 2.5rem;
          }

          /* Summary Cards */
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
          }

          .summary-card {
            border: 2px solid #1a1a2e;
            padding: 1rem;
            border-radius: 4px;
          }

          .summary-label {
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: #666;
            font-family: 'Roboto Mono', monospace;
            margin-bottom: 0.5rem;
          }

          .summary-value {
            font-size: 1.8rem;
            font-weight: 600;
            color: #1a1a2e;
          }

          /* Section title */
          .section-title {
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 0.15em;
            color: #666;
            font-family: 'Roboto Mono', monospace;
            border-bottom: 2px solid #1a1a2e;
            padding-bottom: 0.5rem;
            margin-bottom: 1rem;
          }

          /* Table */
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }

          th {
            background: #1a1a2e;
            color: white;
            padding: 0.6rem 0.8rem;
            text-align: left;
            font-family: 'Roboto Mono', monospace;
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            font-weight: 500;
          }

          td {
            padding: 0.6rem 0.8rem;
            border-bottom: 1px solid #e8e8e8;
            vertical-align: top;
          }

          tr.odd { background: #f8f8f8; }
          tr.even { background: #ffffff; }
          tr:last-child td { border-bottom: none; }

          .no-data {
            text-align: center;
            padding: 3rem;
            color: #888;
            font-style: italic;
          }

          /* Status badges */
          .badge {
            display: inline-block;
            padding: 0.15rem 0.5rem;
            border-radius: 3px;
            font-size: 0.7rem;
            font-family: 'Roboto Mono', monospace;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-weight: 500;
          }
          .badge-success { background: #d4edda; color: #155724; }
          .badge-warning { background: #fff3cd; color: #856404; }
          .badge-danger { background: #f8d7da; color: #721c24; }
          .badge-info { background: #d1ecf1; color: #0c5460; }

          /* Footer */
          .report-footer {
            margin-top: 3rem;
            padding-top: 1rem;
            border-top: 2px solid #1a1a2e;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.75rem;
            color: #888;
            font-family: 'Roboto Mono', monospace;
          }

          .signature-line {
            margin-top: 2.5rem;
            display: flex;
            gap: 4rem;
          }

          .signature-box {
            flex: 1;
          }

          .signature-box .line {
            border-bottom: 1px solid #333;
            margin-bottom: 0.4rem;
            height: 2rem;
          }

          .signature-box .label {
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: #666;
            font-family: 'Roboto Mono', monospace;
          }

          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            .report-header { background: #1a1a2e !important; }
            th { background: #1a1a2e !important; color: white !important; }
          }
        </style>
      </head>
      <body>
        <div class="report-header">
          <div class="report-header-left">
            <h1>${title}</h1>
            <div class="subtitle">MIS ID Card Management Unit</div>
            <div class="report-badge">${reportType} Report</div>
          </div>
          <div class="report-header-right">
            <div><strong>Date:</strong> ${currentDate}</div>
            <div><strong>Time:</strong> ${currentTime}</div>
            <div><strong>Period:</strong> ${subtitle}</div>
            <div><strong>Records:</strong> ${rows.length}</div>
          </div>
        </div>

        <div class="report-body">
          ${summary ? `
            <div class="section-title">Summary</div>
            ${summaryHTML}
          ` : ''}

          <div class="section-title">Records</div>
          ${tableHTML}

          <div class="signature-line">
            <div class="signature-box">
              <div class="line"></div>
              <div class="label">Prepared By</div>
            </div>
            <div class="signature-box">
              <div class="line"></div>
              <div class="label">Supervisor</div>
            </div>
            <div class="signature-box">
              <div class="line"></div>
              <div class="label">Admin / MIS Head</div>
            </div>
          </div>

          <div class="report-footer">
            <span>MIS ID Card Unit — Confidential</span>
            <span>Generated: ${currentDate} at ${currentTime}</span>
            <span>Page 1</span>
          </div>
        </div>

        <script>
          window.onload = () => {
            window.print();
            window.onafterprint = () => window.close();
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
};

// Helper to get date range based on report type
export const getDateRange = (reportType) => {
  const now = new Date();
  let startDate, endDate = new Date();

  if (reportType === 'weekly') {
    startDate = new Date(now);
    startDate.setDate(now.getDate() - 7);
  } else if (reportType === 'monthly') {
    startDate = new Date(now);
    startDate.setMonth(now.getMonth() - 1);
  } else if (reportType === 'annually') {
    startDate = new Date(now);
    startDate.setFullYear(now.getFullYear() - 1);
  } else {
    startDate = new Date(0); // all time
  }

  const formatDate = (d) => d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric'
  });

  return {
    startDate,
    endDate,
    label: `${formatDate(startDate)} — ${formatDate(endDate)}`
  };
};