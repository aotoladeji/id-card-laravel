const express = require('express');
const axios = require('axios');
const router = express.Router();

const CAPTURE_APP_URL = process.env.CAPTURE_APP_URL || 'http://localhost:5001';

/**
 * GET /api/diagnostic/capture-app-status
 * Check if capture app is reachable and configured correctly
 */
router.get('/capture-app-status', async (req, res) => {
  try {
    console.log('[Diagnostic] Checking capture app at:', CAPTURE_APP_URL);

    // Check environment configuration
    const config = {
      CAPTURE_APP_URL: CAPTURE_APP_URL,
      isProduction: !CAPTURE_APP_URL.includes('localhost'),
      VERIFY_API_KEY: process.env.VERIFY_API_KEY ? 'set' : 'not set',
      environment: process.env.NODE_ENV || 'development'
    };

    // Try to reach the capture app
    try {
      const response = await axios.get(`${CAPTURE_APP_URL}/api/health`, {
        timeout: 5000
      });
      return res.json({
        success: true,
        status: 'operational',
        capture_app: config,
        captureAppResponse: {
          statusCode: response.status,
          data: response.data
        }
      });
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({
          success: false,
          status: 'unreachable',
          message: `Cannot connect to capture app at ${CAPTURE_APP_URL}. Connection refused.`,
          capture_app: config,
          error: {
            code: 'ECONNREFUSED',
            hint: 'Check if capture app is running and CAPTURE_APP_URL is correct'
          }
        });
      }

      if (error.code === 'ENOTFOUND') {
        return res.status(503).json({
          success: false,
          status: 'unreachable',
          message: `Cannot resolve hostname for capture app at ${CAPTURE_APP_URL}`,
          capture_app: config,
          error: {
            code: 'ENOTFOUND',
            hint: 'Check CAPTURE_APP_URL is a valid hostname or IP address'
          }
        });
      }

      if (error.code === 'ETIMEDOUT') {
        return res.status(503).json({
          success: false,
          status: 'timeout',
          message: `Capture app at ${CAPTURE_APP_URL} is not responding (timeout)`,
          capture_app: config,
          error: {
            code: 'ETIMEDOUT',
            hint: 'Capture app may be slow or network latency is high'
          }
        });
      }

      throw error;
    }
  } catch (error) {
    console.error('[Diagnostic] Error checking capture app:', error.message);
    res.status(500).json({
      success: false,
      status: 'error',
      message: 'Diagnostic check failed',
      error: error.message
    });
  }
});

/**
 * GET /api/diagnostic/config
 * Show current environment configuration (for authorized users)
 */
router.get('/config', async (req, res) => {
  try {
    const config = {
      NODE_ENV: process.env.NODE_ENV || 'development',
      CAPTURE_APP_URL: process.env.CAPTURE_APP_URL || 'not set (using default http://localhost:5001)',
      VERIFY_API_KEY: process.env.VERIFY_API_KEY ? '[SET]' : '[NOT SET]',
      DATABASE_URL: process.env.DATABASE_URL ? '[SET]' : '[NOT SET]',
      JWT_SECRET: process.env.JWT_SECRET ? '[SET]' : '[NOT SET]'
    };

    res.json({
      success: true,
      config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error reading config',
      error: error.message
    });
  }
});

module.exports = router;
