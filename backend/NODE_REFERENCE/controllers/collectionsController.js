const pool = require('../config/database');
const { notifyCardCollected, verifyFingerprint } = require('../services/captureAppIntegration');

// Get collection list
const getCollections = async (req, res) => {
  try {
    const { status, search } = req.query;
    
    let query = `
      SELECT cc.*,
            COALESCE(NULLIF(cc.surname, ''), ac.surname) AS surname,
            COALESCE(NULLIF(cc.other_names, ''), ac.other_names) AS other_names,
            COALESCE(NULLIF(cc.matric_no, ''), ac.matric_no) AS matric_no,
            COALESCE(NULLIF(cc.staff_id, ''), ac.staff_id) AS staff_id,
            COALESCE(NULLIF(cc.faculty, ''), ac.faculty) AS faculty,
            COALESCE(NULLIF(cc.department, ''), ac.department) AS department,
            COALESCE(NULLIF(cc.card_number, ''), ac.card_number) AS card_number,
        ac.level,
        ac.session,
            u.name as collected_by_name,
            u.name as printed_by_name
      FROM card_collections cc
      LEFT JOIN approved_cards ac ON ac.card_id = cc.card_id
          LEFT JOIN users u ON cc.collected_by = u.id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      query += ` AND cc.status = $${paramCount}`;
      params.push(status);
    }

    if (search) {
      paramCount++;
      const placeholder = '$' + paramCount;
      query += ` AND (
        cc.surname ILIKE ${placeholder} OR 
        cc.other_names ILIKE ${placeholder} OR 
        cc.matric_no ILIKE ${placeholder} OR 
        cc.card_number ILIKE ${placeholder}
      )`;
      params.push(`%${search}%`);
    }

    query += ' ORDER BY cc.printed_at DESC';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      collections: result.rows
    });
  } catch (error) {
    console.error('Error fetching collections:', error);
    res.status(500).json({ message: 'Error fetching collection list' });
  }
};

// Mark card as collected
const markAsCollected = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const result = await pool.query(
      `UPDATE card_collections 
       SET status = 'collected', 
           collected_at = CURRENT_TIMESTAMP, 
           collected_by = $1,
           notes = $2
       WHERE id = $3
       RETURNING card_id, surname, other_names`,
      [req.user.id, notes, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Collection record not found' });
    }

    const card = result.rows[0];

    // Notify capture app (async)
    notifyCardCollected(card.card_id).catch(err => 
      console.error('Failed to notify capture app:', err)
    );

    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'CARD_COLLECTED', `Card collected: ${card.surname} ${card.other_names}`]
    );

    res.json({
      success: true,
      message: 'Card marked as collected'
    });
  } catch (error) {
    console.error('Error marking card as collected:', error);
    res.status(500).json({ message: 'Error updating collection status' });
  }
};

// Verify fingerprint and mark as collected
const verifyAndCollect = async (req, res) => {
  try {
    const { id } = req.params;

    // Get collection record to find the card_id
    const collectionResult = await pool.query(
            `SELECT cc.*,
              COALESCE(NULLIF(cc.faculty, ''), ac.faculty) AS faculty,
              COALESCE(NULLIF(cc.department, ''), ac.department) AS department,
              COALESCE(NULLIF(cc.card_number, ''), ac.card_number) AS card_number,
              ac.level,
              ac.session
             FROM card_collections cc
             LEFT JOIN approved_cards ac ON ac.card_id = cc.card_id
             WHERE cc.id = $1`,
      [id]
    );

    if (collectionResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Collection record not found' 
      });
    }

    const collection = collectionResult.rows[0];

    if (collection.status === 'collected') {
      return res.status(400).json({ 
        success: false,
        message: 'Card has already been collected' 
      });
    }

    // Verify against capture app (which reads from shared database)
    const body = req.body || {};
    const { scannedFingerprint, scannedFingerprintImage, scanPayload } = body;

    if (!scannedFingerprint || typeof scannedFingerprint !== 'string') {
      return res.status(400).json({
        success: false,
        verified: false,
        message: 'No fingerprint scan payload was provided. Please scan and try again.'
      });
    }

    const verification = await verifyFingerprint(
      collection.card_id,
      scannedFingerprint,
      scanPayload,
      {
        identityCandidates: [
          collection.card_number,
          collection.matric_no,
          collection.staff_id
        ],
        scannedFingerprintImage
      }
    );

    // Handle connectivity/config issues
    if (verification.configIssue || verification.connectionError || verification.timeoutError) {
      return res.status(503).json({
        success: false,
        verified: false,
        message: verification.message,
        diagnostic: verification.diagnostic || verification.appError || null
      });
    }

    // Handle fingerprint mismatch
    if (!verification.matched) {
      console.warn(`[Collection] Fingerprint mismatch for card ${collection.card_id}`);
      return res.json({
        success: false,
        verified: false,
        message: verification.message || 'Fingerprint did not match. Please try again.'
      });
    }

    // Fingerprint matched — mark as collected
    const studentName = verification.studentName ||
      `${collection.surname} ${collection.other_names}`;

    const result = await pool.query(
      `UPDATE card_collections 
       SET status = 'collected', 
           collected_at = CURRENT_TIMESTAMP, 
           collected_by = $1,
           notes = $2
       WHERE id = $3
       RETURNING card_id, surname, other_names`,
      [req.user.id, `Verified by fingerprint — Collected by: ${studentName}`, id]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({
        success: false,
        verified: false,
        message: 'Collection record changed during verification. Please refresh and try again.'
      });
    }

    const card = result.rows[0];

    // Notify capture app (async)
    notifyCardCollected(card.card_id).catch(err =>
      console.error('Failed to notify capture app:', err)
    );

    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'CARD_COLLECTED_FINGERPRINT', `Fingerprint verified: ${card.surname} ${card.other_names}`]
    );

    res.json({
      success: true,
      verified: true,
      message: `Fingerprint verified! Card collected by ${studentName}.`,
      collectedBy: studentName
    });
  } catch (error) {
    console.error('Error in fingerprint collection:', error);
    res.status(500).json({
      success: false,
      verified: false,
      message: 'Error verifying fingerprint',
      diagnostic: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get collection statistics
const getCollectionStats = async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_printed,
        COUNT(*) FILTER (WHERE status = 'collected') as total_collected,
        COUNT(*) FILTER (WHERE status = 'awaiting_collection') as awaiting_collection,
        COUNT(*) FILTER (WHERE status = 'collected' AND DATE(collected_at) = CURRENT_DATE) as collected_today
      FROM card_collections
    `);

    res.json({
      success: true,
      stats: stats.rows[0]
    });
  } catch (error) {
    console.error('Error fetching collection stats:', error);
    res.status(500).json({ message: 'Error fetching statistics' });
  }
};

module.exports = {
  getCollections,
  markAsCollected,
  verifyAndCollect,
  getCollectionStats
};
