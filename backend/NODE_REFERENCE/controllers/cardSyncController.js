const axios = require('axios');
const pool = require('../config/database');

const CAPTURE_APP_URL = process.env.CAPTURE_APP_URL || 'http://localhost:5001';

// Sync approved cards from capture app
const syncApprovedCards = async (req, res) => {
  try {
    console.log('Syncing approved cards from capture app...');
    
    // Fetch approved cards from capture app
    const response = await axios.get(`${CAPTURE_APP_URL}/api/printing/approved`, {
      timeout: 10000
    });

    if (!response.data || !response.data.success) {
      return res.status(500).json({ 
        message: 'Failed to fetch approved cards from capture app',
        synced: 0
      });
    }

    const approvedCards = response.data.cards || [];
    let synced = 0;

    for (const captureCard of approvedCards) {
      try {
        // Check if card already exists in this system
        const existing = await pool.query(
          'SELECT id FROM id_cards WHERE matric_number = $1 OR (matric_number IS NULL AND full_name = $2)',
          [captureCard.matric_no || captureCard.staff_id, captureCard.surname + ' ' + captureCard.other_names]
        );

        if (existing.rows.length > 0) {
          // Card already exists, skip
          continue;
        }

        // Insert the approved card into this system as pending approval
        await pool.query(`
          INSERT INTO id_cards 
          (matric_number, full_name, faculty, department, level, photo_url, signature_url, status, notes, captured_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9)
        `, [
          captureCard.matric_no || captureCard.staff_id,
          captureCard.surname + ' ' + captureCard.other_names,
          captureCard.faculty,
          captureCard.department,
          captureCard.level,
          captureCard.passport_photo ? 'capture_app_photo' : null,
          captureCard.signature ? 'capture_app_signature' : null,
          `Synced from capture app - Card ID: ${captureCard.id}`,
          req.user.id
        ]);

        synced++;
      } catch (err) {
        console.error(`Error syncing card ${captureCard.id}:`, err.message);
      }
    }

    // Log activity
    if (synced > 0) {
      await pool.query(
        'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
        [req.user.id, 'CARDS_SYNCED', `Synced ${synced} approved cards from capture app`]
      );
    }

    console.log(`Sync complete: ${synced} cards synced`);
    res.json({
      success: true,
      message: synced > 0 ? `Synced ${synced} card(s)` : 'No new cards to sync',
      synced,
      total: approvedCards.length
    });

  } catch (error) {
    console.error('Error syncing approved cards:', error.message);
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return res.status(503).json({ 
        message: 'Capture app is not available. Please ensure it is running on port 5001.',
        synced: 0
      });
    }
    
    res.status(500).json({ 
      message: 'Error syncing approved cards',
      error: error.message,
      synced: 0
    });
  }
};

module.exports = {
  syncApprovedCards
};
