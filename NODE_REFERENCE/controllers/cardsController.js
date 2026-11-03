const pool = require('../config/database');

// Get all cards
const getAllCards = async (req, res) => {
  try {
    const { status } = req.query;

    let query = `
      SELECT 
        c.*,
        u1.name as captured_by_name,
        u2.name as approved_by_name
      FROM id_cards c
      LEFT JOIN users u1 ON c.captured_by = u1.id
      LEFT JOIN users u2 ON c.approved_by = u2.id
    `;

    const params = [];

    if (status) {
      query += ' WHERE c.status = $1';
      params.push(status);
    }

    query += ' ORDER BY c.created_at DESC';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      cards: result.rows
    });
  } catch (error) {
    console.error('Error fetching cards:', error);
    res.status(500).json({ message: 'Error fetching cards' });
  }
};

// Create new card
const createCard = async (req, res) => {
  try {
    const { 
      matricNumber, 
      fullName, 
      faculty, 
      department, 
      level,
      photoUrl,
      signatureUrl
    } = req.body;

    const result = await pool.query(
      `INSERT INTO id_cards 
       (matric_number, full_name, faculty, department, level, photo_url, signature_url, captured_by, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending') 
       RETURNING *`,
      [matricNumber, fullName, faculty, department, level, photoUrl, signatureUrl, req.user.id]
    );

    res.status(201).json({
      success: true,
      message: 'ID card created successfully',
      card: result.rows[0]
    });
  } catch (error) {
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({ message: 'Matric number already exists' });
    }
    console.error('Error creating card:', error);
    res.status(500).json({ message: 'Error creating card' });
  }
};

// Update card status
const updateCardStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    let updateFields = 'status = $1, updated_at = CURRENT_TIMESTAMP';
    const params = [status, req.user.id, id];

    if (status === 'approved') {
      updateFields += ', approved_by = $2';
    } else if (status === 'printed') {
      updateFields += ', printed_by = $2';
    } else if (status === 'collected') {
      updateFields += ', collected_by = $2';
    }

    if (notes) {
      updateFields += ', notes = $' + (params.length + 1);
      params.push(notes);
    }

    const result = await pool.query(
      `UPDATE id_cards 
       SET ${updateFields}
       WHERE id = $3 
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Card not found' });
    }

    res.json({
      success: true,
      message: 'Card status updated successfully',
      card: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating card:', error);
    res.status(500).json({ message: 'Error updating card' });
  }
};

// Update card details (student info changed - e.g. department change, name correction)
const updateCardDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const editableFields = {
      matricNumber: 'matric_number',
      fullName: 'full_name',
      faculty: 'faculty',
      department: 'department',
      level: 'level'
    };

    const setClauses = [];
    const params = [];

    for (const [bodyKey, column] of Object.entries(editableFields)) {
      if (Object.prototype.hasOwnProperty.call(req.body, bodyKey)) {
        const value = req.body[bodyKey];
        if (!value || !String(value).trim()) {
          return res.status(400).json({ message: `${bodyKey} cannot be empty` });
        }
        params.push(String(value).trim());
        setClauses.push(`${column} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ message: 'No editable fields were provided' });
    }

    setClauses.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const result = await pool.query(
      `UPDATE id_cards
       SET ${setClauses.join(', ')}
       WHERE id = $${params.length}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Card not found' });
    }

    const card = result.rows[0];

    try {
      await pool.query(
        'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
        [req.user.id, 'CARD_DETAILS_UPDATED', `Updated details for ${card.full_name} (${card.matric_number})`]
      );
    } catch (logError) {
      console.warn('Non-fatal activity log error:', logError.message);
    }

    res.json({
      success: true,
      message: 'Card details updated successfully',
      card
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Matric number already exists' });
    }
    console.error('Error updating card details:', error);
    res.status(500).json({ message: 'Error updating card details' });
  }
};

// Delete card
const deleteCard = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM id_cards WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Card not found' });
    }

    res.json({
      success: true,
      message: 'Card deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting card:', error);
    res.status(500).json({ message: 'Error deleting card' });
  }
};

module.exports = {
  getAllCards,
  createCard,
  updateCardStatus,
  updateCardDetails,
  deleteCard
};