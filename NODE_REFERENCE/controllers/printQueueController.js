const pool = require('../config/database');
const {
  syncApprovedCards,
  notifyCardPrinted,
  ensureQueueExclusionsTable,
  excludeCardFromQueue
} = require('../services/captureAppIntegration');

// Sync approved cards from capture app
const syncCards = async (req, res) => {
  try {
    const result = await syncApprovedCards();
    
    // Only log if cards were actually synced
    if ((result.addedToQueue || 0) > 0) {
      await pool.query(
        'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
        [req.user.id, 'CARDS_SYNCED', `Synced ${result.addedToQueue} new cards to print queue`]
      );
    }

    res.json({
      success: true,
      message: result.message || `Synced ${result.added} cards`,
      ...result
    });
  } catch (error) {
    console.error('Error syncing cards:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error syncing approved cards',
      error: error.message 
    });
  }
};

// Get print queue
const getPrintQueue = async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = `
      SELECT pq.*,
            COALESCE(NULLIF(pq.surname, ''), ac.surname) AS surname,
            COALESCE(NULLIF(pq.other_names, ''), ac.other_names) AS other_names,
            COALESCE(NULLIF(pq.matric_no, ''), ac.matric_no) AS matric_no,
            COALESCE(NULLIF(pq.staff_id, ''), ac.staff_id) AS staff_id,
            COALESCE(NULLIF(pq.faculty, ''), ac.faculty) AS faculty,
            COALESCE(NULLIF(pq.department, ''), ac.department) AS department,
            COALESCE(NULLIF(pq.level, ''), ac.level) AS level,
            COALESCE(NULLIF(pq.card_number, ''), ac.card_number) AS card_number,
            COALESCE(NULLIF(pq.session, ''), ac.session) AS session,
             u.name as printed_by_name
      FROM print_queue pq
      LEFT JOIN approved_cards ac ON ac.card_id = pq.card_id
      LEFT JOIN users u ON pq.printed_by = u.id
    `;

    const params = [];
    if (status) {
      query += ' WHERE pq.status = $1';
      params.push(status);
    } else {
      query += ' WHERE pq.status IN ($1, $2)';
      params.push('queued', 'printing');
    }

    query += ' ORDER BY pq.added_to_queue_at ASC';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      queue: result.rows
    });
  } catch (error) {
    console.error('Error fetching print queue:', error);
    res.status(500).json({ message: 'Error fetching print queue' });
  }
};

// Add a specific approved card to print queue (used for approved reprints)
const addCardToQueue = async (req, res) => {
  try {
    const { cardId } = req.body || {};

    if (!cardId) {
      return res.status(400).json({
        success: false,
        message: 'cardId is required'
      });
    }

    await ensureQueueExclusionsTable();

    let approvedCardResult = await pool.query(
      'SELECT * FROM approved_cards WHERE card_id = $1',
      [cardId]
    );

    // Backward-compatible fallback for callers that send approved_cards row id instead of card_id.
    if (approvedCardResult.rows.length === 0) {
      approvedCardResult = await pool.query(
        'SELECT * FROM approved_cards WHERE id = $1',
        [cardId]
      );
    }

    if (approvedCardResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Approved card not found'
      });
    }

    const approvedCard = approvedCardResult.rows[0];

    const existingQueueResult = await pool.query(
      'SELECT id, status FROM print_queue WHERE card_id = $1 LIMIT 1',
      [cardId]
    );

    if (existingQueueResult.rows.length > 0) {
      return res.json({
        success: true,
        message: 'Card is already in print queue',
        queueId: existingQueueResult.rows[0].id,
        alreadyQueued: true
      });
    }

    // Reprints are deliberate re-queues, so remove any prior exclusion first.
    await pool.query('DELETE FROM print_queue_exclusions WHERE card_id = $1', [cardId]);

    const passportBuffer = approvedCard.passport_photo
      ? Buffer.from(approvedCard.passport_photo)
      : null;

    const insertResult = await pool.query(
      `INSERT INTO print_queue
       (card_id, surname, other_names, matric_no, staff_id, faculty, department,
        level, card_number, session, passport_photo, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'queued')
       RETURNING id`,
      [
        approvedCard.card_id,
        approvedCard.surname,
        approvedCard.other_names,
        approvedCard.matric_no,
        approvedCard.staff_id,
        approvedCard.faculty,
        approvedCard.department,
        approvedCard.level,
        approvedCard.card_number,
        approvedCard.session,
        passportBuffer
      ]
    );

    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [
        req.user.id,
        'CARD_ADDED_TO_QUEUE',
        `Added approved reprint card ${approvedCard.card_id} (${approvedCard.surname} ${approvedCard.other_names}) to print queue`
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Card added to print queue',
      queueId: insertResult.rows[0].id
    });
  } catch (error) {
    console.error('Error adding card to print queue:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding card to print queue',
      error: error.message
    });
  }
};

// Mark card as printed (called after successful print)
const markAsPrinted = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { printerName, quality } = req.body;

    console.log(`[Mark as Printed] Starting for queue ID: ${id}`);

    await client.query('BEGIN');

    // Get card details
    const cardResult = await client.query(
      `SELECT pq.*,
              COALESCE(pq.faculty, ac.faculty) AS faculty,
              COALESCE(pq.department, ac.department) AS department,
              COALESCE(pq.level, ac.level) AS level,
              COALESCE(pq.card_number, ac.card_number) AS card_number,
              COALESCE(pq.session, ac.session) AS session
       FROM print_queue pq
       LEFT JOIN approved_cards ac ON ac.card_id = pq.card_id
       WHERE pq.id = $1`,
      [id]
    );

    if (cardResult.rows.length === 0) {
      await client.query('ROLLBACK');
      console.error(`[Mark as Printed] Card not found in queue: ${id}`);
      return res.status(404).json({ message: 'Card not found in queue' });
    }

    const card = cardResult.rows[0];
    console.log(`[Mark as Printed] Found card: ${card.surname} ${card.other_names} (card_id: ${card.card_id})`);

    await ensureQueueExclusionsTable();

    // Mark as printed in queue
    await client.query(
      `UPDATE print_queue 
       SET status = 'printed', printed_at = CURRENT_TIMESTAMP, printed_by = $1
       WHERE id = $2`,
      [req.user.id, id]
    );
    console.log(`[Mark as Printed] Updated print_queue status`);

    // Add to print history
    await client.query(`
      INSERT INTO print_history 
      (card_id, surname, other_names, matric_no, staff_id, card_number, 
       printed_at, printed_by, printer_name, print_quality)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7, $8, $9)
    `, [
      card.card_id,
      card.surname,
      card.other_names,
      card.matric_no,
      card.staff_id,
      card.card_number,
      req.user.id,
      printerName || 'Default Printer',
      quality || 'standard'
    ]);
    console.log(`[Mark as Printed] Added to print_history`);

    // Add to collection tracking
    await client.query(`
      INSERT INTO card_collections 
      (card_id, surname, other_names, matric_no, staff_id, faculty, department, 
       card_number, printed_at, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, 'awaiting_collection')
    `, [
      card.card_id,
      card.surname,
      card.other_names,
      card.matric_no,
      card.staff_id,
      card.faculty,
      card.department,
      card.card_number
    ]);
    console.log(`[Mark as Printed] Added to card_collections`);

    // Add exclusion so periodic sync will not re-queue this card.
    await excludeCardFromQueue(card.card_id, 'printed', req.user.id, client);
    console.log(`[Mark as Printed] Added queue exclusion for card_id ${card.card_id}`);

    // Delete from queue (card moves to history and collection)
    await client.query('DELETE FROM print_queue WHERE id = $1', [id]);
    console.log(`[Mark as Printed] Deleted from print_queue`);

    await client.query('COMMIT');
    console.log(`[Mark as Printed] Transaction committed successfully`);

    // Notify capture app (async, don't wait)
    notifyCardPrinted(card.card_id).catch(err => 
      console.error('Failed to notify capture app:', err)
    );

    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'CARD_PRINTED', `Printed card for ${card.surname} ${card.other_names}`]
    );

    res.json({
      success: true,
      message: 'Card marked as printed'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Mark as Printed] Error:', error);
    console.error('[Mark as Printed] Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      table: error.table,
      column: error.column
    });
    res.status(500).json({ 
      message: 'Error updating print status',
      error: error.message,
      detail: error.detail
    });
  } finally {
    client.release();
  }
};

// Mark card as failed
const markAsFailed = async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = req.body;

    await pool.query(
      `UPDATE print_queue 
       SET status = 'failed', print_attempts = print_attempts + 1, last_error = $1
       WHERE id = $2`,
      [error || 'Unknown error', id]
    );

    res.json({
      success: true,
      message: 'Card marked as failed'
    });
  } catch (error) {
    console.error('Error marking card as failed:', error);
    res.status(500).json({ message: 'Error updating print status' });
  }
};

// Retry failed card
const retryPrint = async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(
      `UPDATE print_queue 
       SET status = 'queued', last_error = NULL
       WHERE id = $1`,
      [id]
    );

    res.json({
      success: true,
      message: 'Card queued for retry'
    });
  } catch (error) {
    console.error('Error retrying print:', error);
    res.status(500).json({ message: 'Error retrying print' });
  }
};

// Generate PDF for card
const generatePDF = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM print_queue WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Card not found' });
    }

    const card = result.rows[0];

    // For now, return a simple response
    // In production, you'd use a library like PDFKit or Puppeteer
    res.json({
      success: true,
      message: 'PDF generation not yet implemented. Use browser print for now.',
      card: {
        name: `${card.surname} ${card.other_names}`,
        id: card.matric_no || card.staff_id
      }
    });

    // TODO: Implement actual PDF generation
    // const PDFDocument = require('pdfkit');
    // const doc = new PDFDocument({ size: [243, 153] }); // ID card size in points
    // ... generate PDF content
    // res.setHeader('Content-Type', 'application/pdf');
    // doc.pipe(res);
    // doc.end();

  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ message: 'Error generating PDF' });
  }
};

// Send to direct printer
const printDirect = async (req, res) => {
  try {
    const { id } = req.params;
    const { printerName } = req.body;

    const result = await pool.query(
      'SELECT * FROM print_queue WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Card not found' });
    }

    // For now, return a simple response
    // In production, you'd use a library like node-printer or electron-printer
    res.json({
      success: true,
      message: 'Direct printing not yet implemented. Use browser print for now.',
      printerName: printerName || 'Default'
    });

    // TODO: Implement actual direct printing
    // const printer = require('printer');
    // printer.printDirect({
    //   data: generateCardData(card),
    //   printer: printerName,
    //   type: 'RAW',
    //   success: () => { ... },
    //   error: () => { ... }
    // });

  } catch (error) {
    console.error('Error printing directly:', error);
    res.status(500).json({ message: 'Error sending to printer' });
  }
};

// Clear entire print queue
const clearQueue = async (req, res) => {
  try {
    console.log('[Clear Queue] Clearing all cards from print queue...');
    await ensureQueueExclusionsTable();
    
    // Get count before clearing
    const countResult = await pool.query('SELECT COUNT(*) FROM print_queue');
    const count = parseInt(countResult.rows[0].count);
    
    // Persist exclusions so sync won't immediately repopulate removed cards.
    await pool.query(
      `INSERT INTO print_queue_exclusions (card_id, reason, created_by)
       SELECT card_id, 'removed', $1
       FROM print_queue
       ON CONFLICT (card_id)
       DO UPDATE SET reason = EXCLUDED.reason, created_by = EXCLUDED.created_by, created_at = CURRENT_TIMESTAMP`,
      [req.user.id]
    );

    // Clear the queue
    await pool.query('DELETE FROM print_queue');
    
    console.log(`[Clear Queue] Cleared ${count} cards from queue`);
    
    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'QUEUE_CLEARED', `Cleared ${count} cards from print queue`]
    );

    res.json({
      success: true,
      message: `Cleared ${count} card(s) from print queue`,
      count
    });
  } catch (error) {
    console.error('[Clear Queue] Error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error clearing print queue',
      error: error.message 
    });
  }
};

// Delete single card from queue
const deleteCard = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[Delete Card] Removing card ID ${id} from print queue...`);
    await ensureQueueExclusionsTable();
    
    // Get card details before deleting
    const cardResult = await pool.query(
      'SELECT * FROM print_queue WHERE id = $1',
      [id]
    );

    if (cardResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Card not found in queue' 
      });
    }

    const card = cardResult.rows[0];

    // Add exclusion so sync won't immediately add this card back.
    await excludeCardFromQueue(card.card_id, 'removed', req.user.id);
    
    // Delete the card
    await pool.query('DELETE FROM print_queue WHERE id = $1', [id]);
    
    console.log(`[Delete Card] Removed: ${card.surname} ${card.other_names}`);
    
    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'CARD_DELETED_FROM_QUEUE', `Deleted ${card.surname} ${card.other_names} from print queue`]
    );

    res.json({
      success: true,
      message: 'Card removed from queue'
    });
  } catch (error) {
    console.error('[Delete Card] Error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error deleting card',
      error: error.message 
    });
  }
};

module.exports = {
  syncCards,
  addCardToQueue,
  getPrintQueue,
  markAsPrinted,
  markAsFailed,
  retryPrint,
  generatePDF,
  printDirect,
  clearQueue,
  deleteCard
};