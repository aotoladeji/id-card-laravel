const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs').promises;
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { syncApprovedCards } = require('../controllers/cardSyncController');

const CAPTURE_APP_URL = process.env.CAPTURE_APP_URL || 'http://localhost:5001';

// Diagnostic endpoint to check capture app connection
router.get('/diagnostic', authenticateToken, async (req, res) => {
  try {
    const diagnostics = {
      captureAppUrl: CAPTURE_APP_URL,
      timestamp: new Date().toISOString(),
      tests: {}
    };

    // Test 1: Check if capture app is reachable
    try {
      const healthResponse = await axios.get(`${CAPTURE_APP_URL}/api/health`, {
        timeout: 3000
      });
      diagnostics.tests.captureAppReachable = {
        status: 'success',
        message: 'Capture app is reachable',
        data: healthResponse.data
      };
    } catch (error) {
      diagnostics.tests.captureAppReachable = {
        status: 'failed',
        message: error.code === 'ECONNREFUSED' 
          ? 'Capture app is not running or not accessible'
          : error.message
      };
    }

    // Test 2: Check if print queue endpoint works
    try {
      const approvedResponse = await axios.get(`${CAPTURE_APP_URL}/api/printing/queue`, {
        timeout: 5000
      });
      diagnostics.tests.approvedCardsEndpoint = {
        status: 'success',
        message: 'Print queue endpoint is working',
        cardCount: approvedResponse.data?.cards?.length || 0,
        sampleCardIds: approvedResponse.data?.cards?.slice(0, 3).map(c => c.id) || []
      };
    } catch (error) {
      diagnostics.tests.approvedCardsEndpoint = {
        status: 'failed',
        message: error.message
      };
    }

    // Test 3: Check if card SVG output endpoint works (test with first queue card)
    try {
      const approvedResponse = await axios.get(`${CAPTURE_APP_URL}/api/printing/queue`, {
        timeout: 5000
      });
      
      if (approvedResponse.data?.cards?.length > 0) {
        const testCardId = approvedResponse.data.cards[0].id;
        
        try {
          const imageResponse = await axios.get(`${CAPTURE_APP_URL}/api/printing/output-svg?cardId=${encodeURIComponent(testCardId)}`, {
            responseType: 'text',
            timeout: 5000
          });
          
          diagnostics.tests.cardImageEndpoint = {
            status: 'success',
            message: 'Card SVG output endpoint is working',
            testedCardId: testCardId,
            svgLength: String(imageResponse.data || '').length,
            endpoint: `/api/printing/output-svg?cardId=${testCardId}`
          };
        } catch (imgError) {
          diagnostics.tests.cardImageEndpoint = {
            status: 'failed',
            message: `Card SVG endpoint failed: ${imgError.message}`,
            testedCardId: testCardId,
            endpoint: `/api/printing/output-svg?cardId=${testCardId}`,
            suggestion: 'The card may not have a generated SVG output yet'
          };
        }
      } else {
        diagnostics.tests.cardImageEndpoint = {
          status: 'not_tested',
          message: 'No approved cards available to test image endpoint'
        };
      }
    } catch (error) {
      diagnostics.tests.cardImageEndpoint = {
        status: 'error',
        message: error.message
      };
    }

    // Test 4: Check output directory
    try {
      const outputDir = process.env.CAPTURE_APP_OUTPUT_DIR;
      diagnostics.tests.outputDirectory = {
        path: outputDir,
        status: 'checking'
      };

      if (outputDir) {
        try {
          await fs.access(outputDir);
          const files = await fs.readdir(outputDir);
          const pngFiles = files.filter(f => f.endsWith('.png'));
          
          diagnostics.tests.outputDirectory = {
            path: outputDir,
            status: 'success',
            message: 'Directory exists and is accessible',
            totalFiles: files.length,
            pngFiles: pngFiles.length,
            sampleFiles: pngFiles.slice(0, 5)
          };
        } catch (err) {
          diagnostics.tests.outputDirectory = {
            path: outputDir,
            status: 'failed',
            message: 'Directory does not exist or is not accessible',
            error: err.message
          };
        }
      } else {
        diagnostics.tests.outputDirectory = {
          status: 'not_configured',
          message: 'CAPTURE_APP_OUTPUT_DIR environment variable not set'
        };
      }
    } catch (error) {
      diagnostics.tests.outputDirectory = {
        status: 'error',
        message: error.message
      };
    }

    res.json({
      success: true,
      diagnostics
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error running diagnostics',
      error: error.message
    });
  }
});

// Sync approved cards from capture app
router.post('/sync-approved', authenticateToken, syncApprovedCards);

// Get list of ALL approved cards from capture app (for viewing history)
router.get('/approved-list', authenticateToken, async (req, res) => {
  try {
    console.log('Fetching approved cards list from capture app...');
    
    // Fetch approved cards from capture app
    const response = await axios.get(`${CAPTURE_APP_URL}/api/printing/approved`, {
      timeout: 10000
    });

    if (!response.data || !response.data.success) {
      return res.status(500).json({ 
        message: 'Failed to fetch approved cards from capture app',
        cards: []
      });
    }

    const approvedCards = response.data.cards || [];
    
    res.json({
      success: true,
      cards: approvedCards,
      total: approvedCards.length
    });

  } catch (error) {
    console.error('Error fetching approved cards list:', error.message);
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return res.status(503).json({ 
        message: 'Capture app is not available. Please ensure it is running on port 5001.',
        cards: []
      });
    }
    
    res.status(500).json({ 
      message: 'Error fetching approved cards list',
      error: error.message,
      cards: []
    });
  }
});

// Reprint: Send approved card back to print queue
router.post('/reprint', authenticateToken, async (req, res) => {
  try {
    const { cardId } = req.body;
    console.log(`[Reprint] Sending card ID ${cardId} to print queue...`);
    
    // Fetch card details from capture app
    const response = await axios.get(`${CAPTURE_APP_URL}/api/printing/approved`, {
      timeout: 10000
    });

    if (!response.data || !response.data.success) {
      return res.status(500).json({ 
        success: false,
        message: 'Failed to fetch card from capture app'
      });
    }

    const cards = response.data.cards || [];
    const card = cards.find(c => c.id == cardId);

    if (!card) {
      return res.status(404).json({
        success: false,
        message: 'Card not found in capture app'
      });
    }

    // Check if already in print queue
    const existing = await pool.query(
      'SELECT id FROM print_queue WHERE card_id = $1',
      [cardId]
    );

    if (existing.rows.length > 0) {
      return res.json({
        success: true,
        message: 'Card is already in print queue',
        alreadyExists: true
      });
    }

    // Add to print queue
    const passportBuffer = card.passport_photo ? Buffer.from(card.passport_photo, 'base64') : null;

    await pool.query(`
      INSERT INTO print_queue 
      (card_id, surname, other_names, matric_no, staff_id, faculty, department, 
       level, card_number, session, passport_photo, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'queued')
    `, [
      card.id,
      card.surname,
      card.other_names,
      card.matric_no,
      card.staff_id,
      card.faculty,
      card.department,
      card.level,
      card.card_number,
      card.session,
      passportBuffer
    ]);

    console.log(`[Reprint] Card added to print queue: ${card.surname} ${card.other_names}`);

    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'CARD_REPRINT_REQUESTED', `Sent ${card.surname} ${card.other_names} to print queue for reprinting`]
    );

    res.json({
      success: true,
      message: 'Card sent to print queue for reprinting'
    });

  } catch (error) {
    console.error('[Reprint] Error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error sending card for reprint',
      error: error.message
    });
  }
});

module.exports = router;
