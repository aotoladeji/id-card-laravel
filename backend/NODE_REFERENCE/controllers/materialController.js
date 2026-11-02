const pool = require('../config/database');

// Get all material requests
const getAllMaterialRequests = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        m.*,
        u1.username as requested_by_username,
        u1.name as requested_by_name,
        u2.username as responded_by_username,
        u2.name as responded_by_name
      FROM material_requests m
      LEFT JOIN users u1 ON m.requested_by = u1.id
      LEFT JOIN users u2 ON m.responded_by = u2.id
      ORDER BY m.created_at DESC
    `);

    res.json({
      success: true,
      requests: result.rows
    });
  } catch (error) {
    console.error('Error fetching material requests:', error);
    res.status(500).json({ message: 'Error fetching material requests' });
  }
};

// Create material request
const createMaterialRequest = async (req, res) => {
  try {
    const { itemName, quantity, urgency } = req.body;

    console.log('Received material request data:', { itemName, quantity, urgency }); // Debug log

    // Validation
    if (!itemName || !quantity) {
      return res.status(400).json({ message: 'Item name and quantity are required' });
    }

    const result = await pool.query(
      `INSERT INTO material_requests 
       (item_name, quantity, urgency, requested_by) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [itemName, parseInt(quantity), urgency || 'normal', req.user.id]
    );

    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'MATERIAL_REQUEST_CREATED', `Requested ${quantity} ${itemName}`]
    );

    res.status(201).json({
      success: true,
      message: 'Material request created successfully',
      request: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating material request:', error);
    res.status(500).json({ 
      message: 'Error creating material request',
      error: error.message 
    });
  }
};

// Respond to material request
const respondToMaterialRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, responseMessage } = req.body;

    const result = await pool.query(
      `UPDATE material_requests 
       SET status = $1, response_message = $2, responded_by = $3, responded_at = CURRENT_TIMESTAMP 
       WHERE id = $4 
       RETURNING *`,
      [status, responseMessage, req.user.id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Request not found' });
    }

    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'MATERIAL_REQUEST_RESPONDED', `Responded to request ID: ${id} - ${status}`]
    );

    res.json({
      success: true,
      message: 'Response submitted successfully',
      request: result.rows[0]
    });
  } catch (error) {
    console.error('Error responding to material request:', error);
    res.status(500).json({ message: 'Error responding to material request' });
  }
};

// Forward material request to admin (Supervisor only)
const forwardMaterialRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { urgency, forwardNotes } = req.body;

    // Update urgency if provided
    const result = await pool.query(
      `UPDATE material_requests 
       SET urgency = $1, response_message = $2
       WHERE id = $3 
       RETURNING *`,
      [urgency, `Forwarded to admin: ${forwardNotes || 'Please review'}`, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Request not found' });
    }

    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'MATERIAL_REQUEST_FORWARDED', `Forwarded request ID: ${id} with urgency: ${urgency}`]
    );

    res.json({
      success: true,
      message: 'Request forwarded to admin successfully',
      request: result.rows[0]
    });
  } catch (error) {
    console.error('Error forwarding material request:', error);
    res.status(500).json({ message: 'Error forwarding material request' });
  }
};

// Address material request (Admin only)
const addressMaterialRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, responseMessage, actionTaken } = req.body;

    const result = await pool.query(
      `UPDATE material_requests 
       SET status = $1, response_message = $2, responded_by = $3, responded_at = CURRENT_TIMESTAMP 
       WHERE id = $4 
       RETURNING *`,
      [status, `${responseMessage}\n\nAction Taken: ${actionTaken || 'N/A'}`, req.user.id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Request not found' });
    }

    const matRequest = result.rows[0];

    // Deduct from inventory when approved or fulfilled
    if (status === 'approved' || status === 'fulfilled') {
      let remaining = matRequest.quantity;
      // Get matching approved inventory rows, newest first
      const invRows = await pool.query(
        `SELECT id, quantity FROM inventory
         WHERE LOWER(item_name) = LOWER($1) AND status = 'approved' AND quantity > 0
         ORDER BY last_restocked DESC NULLS LAST, created_at DESC`,
        [matRequest.item_name]
      );
      for (const row of invRows.rows) {
        if (remaining <= 0) break;
        const deduct = Math.min(remaining, row.quantity);
        await pool.query(
          `UPDATE inventory SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [deduct, row.id]
        );
        remaining -= deduct;
      }
    }

    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'MATERIAL_REQUEST_ADDRESSED', `Addressed request ID: ${id} - ${status}`]
    );

    res.json({
      success: true,
      message: 'Material request addressed successfully',
      request: matRequest
    });
  } catch (error) {
    console.error('Error addressing material request:', error);
    res.status(500).json({ message: 'Error addressing material request' });
  }
};

// Query a material request (admin/supervisor sends a question to the requester)
const queryMaterialRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { queryMessage } = req.body;

    if (!queryMessage || !queryMessage.trim()) {
      return res.status(400).json({ message: 'Query message is required' });
    }

    const result = await pool.query(
      `UPDATE material_requests
       SET status = 'queried', query_message = $1, queried_by = $2, queried_at = CURRENT_TIMESTAMP,
           query_reply = NULL, query_replied_at = NULL
       WHERE id = $3
       RETURNING *`,
      [queryMessage.trim(), req.user.id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Request not found' });
    }

    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'MATERIAL_REQUEST_QUERIED', `Queried request ID: ${id} — ${queryMessage.trim().substring(0, 80)}`]
    );

    res.json({ success: true, message: 'Query sent to staff member', request: result.rows[0] });
  } catch (error) {
    console.error('Error querying material request:', error);
    res.status(500).json({ message: 'Error sending query' });
  }
};

// Staff replies to a query
const replyToQuery = async (req, res) => {
  try {
    const { id } = req.params;
    const { queryReply } = req.body;

    if (!queryReply || !queryReply.trim()) {
      return res.status(400).json({ message: 'Reply is required' });
    }

    // Ensure this request belongs to the requester
    const check = await pool.query(
      `SELECT * FROM material_requests WHERE id = $1 AND requested_by = $2 AND status = 'queried'`,
      [id, req.user.id]
    );

    if (check.rows.length === 0) {
      return res.status(403).json({ message: 'Request not found or not in queried state' });
    }

    const result = await pool.query(
      `UPDATE material_requests
       SET query_reply = $1, query_replied_at = CURRENT_TIMESTAMP, status = 'pending'
       WHERE id = $2
       RETURNING *`,
      [queryReply.trim(), id]
    );

    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'MATERIAL_REQUEST_QUERY_REPLIED', `Replied to query on request ID: ${id}`]
    );

    res.json({ success: true, message: 'Reply submitted successfully', request: result.rows[0] });
  } catch (error) {
    console.error('Error replying to query:', error);
    res.status(500).json({ message: 'Error submitting reply' });
  }
};

module.exports = {
  getAllMaterialRequests,
  createMaterialRequest,
  respondToMaterialRequest,
  forwardMaterialRequest,
  addressMaterialRequest,
  queryMaterialRequest,
  replyToQuery
};
