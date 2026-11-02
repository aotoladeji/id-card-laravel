const pool = require('../config/database');

// Get all daily reports
const getAllDailyReports = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        d.*,
        u1.username as submitted_by_username,
        u1.name as submitted_by_name,
        u2.username as verified_by_username,
        u2.name as verified_by_name
      FROM daily_reports d
      LEFT JOIN users u1 ON d.submitted_by = u1.id
      LEFT JOIN users u2 ON d.verified_by = u2.id
      ORDER BY d.report_date DESC, d.created_at DESC
    `);

    res.json({
      success: true,
      reports: result.rows
    });
  } catch (error) {
    console.error('Error fetching daily reports:', error);
    res.status(500).json({ message: 'Error fetching daily reports' });
  }
};

// Create daily report
const createDailyReport = async (req, res) => {
  try {
    const {
      reportDate,
      cardsCaptured,
      cardsApproved,
      cardsPrinted,
      cardsCollected,
      issuesEncountered,
      inventoryUsed
    } = req.body;

    console.log('Received daily report data:', req.body); // Debug log

    // Validation
    if (!reportDate) {
      return res.status(400).json({ message: 'Report date is required' });
    }

    // Check if report already exists for this date and user
    const existing = await pool.query(
      'SELECT id FROM daily_reports WHERE report_date = $1 AND submitted_by = $2',
      [reportDate, req.user.id]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ 
        message: 'You have already submitted a report for this date' 
      });
    }

    const result = await pool.query(
      `INSERT INTO daily_reports 
       (report_date, cards_captured, cards_approved, cards_printed, cards_collected, 
        issues_encountered, inventory_used, submitted_by, verification_status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending') 
       RETURNING *`,
      [
        reportDate, 
        parseInt(cardsCaptured) || 0, 
        parseInt(cardsApproved) || 0, 
        parseInt(cardsPrinted) || 0, 
        parseInt(cardsCollected) || 0, 
        issuesEncountered || '', 
        inventoryUsed ? JSON.stringify(inventoryUsed) : '{}',
        req.user.id
      ]
    );

    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'DAILY_REPORT_SUBMITTED', `Report for ${reportDate}`]
    );

    res.status(201).json({
      success: true,
      message: 'Daily report submitted successfully',
      report: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating daily report:', error);
    res.status(500).json({ 
      message: 'Error creating daily report',
      error: error.message 
    });
  }
};

// Verify daily report
const verifyDailyReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { verificationStatus, supervisorRemarks } = req.body;

    const result = await pool.query(
      `UPDATE daily_reports 
       SET verification_status = $1, supervisor_remarks = $2, 
           verified_by = $3, verified_at = CURRENT_TIMESTAMP 
       WHERE id = $4 
       RETURNING *`,
      [verificationStatus, supervisorRemarks, req.user.id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Report not found' });
    }

    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'DAILY_REPORT_VERIFIED', `Report ID: ${id} - ${verificationStatus}`]
    );

    res.json({
      success: true,
      message: 'Report verified successfully',
      report: result.rows[0]
    });
  } catch (error) {
    console.error('Error verifying report:', error);
    res.status(500).json({ message: 'Error verifying report' });
  }
};

module.exports = {
  getAllDailyReports,
  createDailyReport,
  verifyDailyReport
};