const pool = require('../config/database');

// Get all inventory items
const getAllInventory = async (req, res) => {
  try {
    console.log('Fetching inventory...'); // Debug log
    
    const result = await pool.query(`
      SELECT 
        i.*,
        u.username as added_by_username,
        u.name as added_by_name
      FROM inventory i
      LEFT JOIN users u ON i.added_by = u.id
      ORDER BY i.created_at DESC
    `);

    console.log(`Found ${result.rows.length} inventory items`); // Debug log

    res.json({
      success: true,
      inventory: result.rows
    });
  } catch (error) {
    console.error('Error fetching inventory:', error.message);
    res.status(500).json({ 
      message: 'Error fetching inventory',
      error: error.message 
    });
  }
};

// Add inventory item
const addInventoryItem = async (req, res) => {
  try {
    const { itemName, quantity, unit } = req.body;

    console.log('Adding inventory:', { itemName, quantity, unit }); // Debug log

    // Validation
    if (!itemName || !quantity) {
      return res.status(400).json({ message: 'Item name and quantity are required' });
    }

    const result = await pool.query(
      `INSERT INTO inventory 
       (item_name, quantity, unit, added_by, status, last_restocked) 
       VALUES ($1, $2, $3, $4, 'pending', CURRENT_TIMESTAMP) 
       RETURNING *`,
      [itemName, parseInt(quantity), unit || 'units', req.user.id]
    );

    console.log('Inventory added:', result.rows[0]); // Debug log

    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'INVENTORY_ADDED', `Added ${quantity} ${itemName}`]
    );

    res.status(201).json({
      success: true,
      message: 'Inventory item added successfully',
      item: result.rows[0]
    });
  } catch (error) {
    console.error('Error adding inventory:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      message: 'Error adding inventory item',
      error: error.message 
    });
  }
};

// Log faulty delivery
const logFaultyDelivery = async (req, res) => {
  try {
    const { itemName, quantity, issueDescription } = req.body;

    console.log('Logging faulty delivery:', { itemName, quantity, issueDescription }); // Debug log

    // Validation
    if (!itemName || !quantity || !issueDescription) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const result = await pool.query(
      `INSERT INTO faulty_deliveries 
       (item_name, quantity, issue_description, reported_by, status) 
       VALUES ($1, $2, $3, $4, 'pending') 
       RETURNING *`,
      [itemName, parseInt(quantity), issueDescription, req.user.id]
    );

    console.log('Faulty delivery logged:', result.rows[0]); // Debug log

    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'FAULTY_DELIVERY_REPORTED', `Reported faulty ${itemName}`]
    );

    res.status(201).json({
      success: true,
      message: 'Faulty delivery logged successfully',
      report: result.rows[0]
    });
  } catch (error) {
    console.error('Error logging faulty delivery:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      message: 'Error logging faulty delivery',
      error: error.message 
    });
  }
};

// Get faulty deliveries
const getFaultyDeliveries = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        f.*,
        u.username as reported_by_username,
        u.name as reported_by_name
      FROM faulty_deliveries f
      LEFT JOIN users u ON f.reported_by = u.id
      ORDER BY f.created_at DESC
    `);

    res.json({
      success: true,
      deliveries: result.rows
    });
  } catch (error) {
    console.error('Error fetching faulty deliveries:', error.message);
    res.status(500).json({ 
      message: 'Error fetching faulty deliveries',
      error: error.message 
    });
  }
};


// Attest faulty delivery (Supervisor/Admin)
const attestFaultyDelivery = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolutionNotes } = req.body;

    console.log('Attesting faulty delivery:', { id, status, resolutionNotes });

    const result = await pool.query(
      `UPDATE faulty_deliveries 
       SET status = $1, resolution_notes = $2, resolved_at = CURRENT_TIMESTAMP 
       WHERE id = $3 
       RETURNING *`,
      [status, resolutionNotes, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Faulty delivery not found' });
    }

    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'FAULTY_DELIVERY_ATTESTED', `Attested faulty delivery ID: ${id} - ${status}`]
    );

    res.json({
      success: true,
      message: 'Faulty delivery attested successfully',
      delivery: result.rows[0]
    });
  } catch (error) {
    console.error('Error attesting faulty delivery:', error.message);
    res.status(500).json({ 
      message: 'Error attesting faulty delivery',
      error: error.message 
    });
  }
};

// Approve inventory item
const approveInventoryItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const result = await pool.query(
      `UPDATE inventory 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'INVENTORY_APPROVED', `Approved inventory item ID: ${id}`]
    );

    res.json({
      success: true,
      message: 'Inventory item approved successfully',
      item: result.rows[0]
    });
  } catch (error) {
    console.error('Error approving inventory:', error.message);
    res.status(500).json({ 
      message: 'Error approving inventory item',
      error: error.message 
    });
  }
};

// Update module.exports
module.exports = {
  getAllInventory,
  addInventoryItem,
  logFaultyDelivery,
  getFaultyDeliveries,
  attestFaultyDelivery,
  approveInventoryItem  // Add this
};
