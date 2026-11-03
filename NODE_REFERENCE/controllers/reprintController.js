const pool = require('../config/database');

// Get all reprint requests
const getAllReprintRequests = async (req, res) => {
  try {
    const { status } = req.query;

    let query = `
      SELECT 
        r.*,
        u1.username as requested_by_username,
        u2.username as resolved_by_username
      FROM reprint_requests r
      LEFT JOIN users u1 ON r.requested_by = u1.id
      LEFT JOIN users u2 ON r.resolved_by = u2.id
    `;

    const params = [];

    if (status) {
      query += ' WHERE r.status = $1';
      params.push(status);
    }

    query += ' ORDER BY r.created_at DESC';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      requests: result.rows
    });
  } catch (error) {
    console.error('Error fetching reprint requests:', error);
    res.status(500).json({ message: 'Error fetching reprint requests' });
  }
};

// Create new reprint request
const createReprintRequest = async (req, res) => {
  try {
    const { matricNumber, studentName, reason } = req.body;

    const result = await pool.query(
      `INSERT INTO reprint_requests 
       (matric_number, student_name, reason, requested_by, status) 
       VALUES ($1, $2, $3, $4, 'pending') 
       RETURNING *`,
      [matricNumber, studentName, reason, req.user.id]
    );

    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'REPRINT_REQUEST_CREATED', `Reprint request for ${matricNumber}`]
    );

    res.status(201).json({
      success: true,
      message: 'Reprint request created successfully',
      request: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating reprint request:', error);
    res.status(500).json({ message: 'Error creating reprint request' });
  }
};

// Approve/Reject reprint request
const updateReprintStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const result = await pool.query(
      `UPDATE reprint_requests 
       SET status = $1, notes = $2, resolved_by = $3, resolved_at = CURRENT_TIMESTAMP 
       WHERE id = $4 
       RETURNING *`,
      [status, notes, req.user.id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Request not found' });
    }

    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'REPRINT_REQUEST_' + status.toUpperCase(), `Request ID: ${id}`]
    );

    res.json({
      success: true,
      message: `Request ${status} successfully`,
      request: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating reprint request:', error);
    res.status(500).json({ message: 'Error updating reprint request' });
  }
};

module.exports = {
  getAllReprintRequests,
  createReprintRequest,
  updateReprintStatus
};