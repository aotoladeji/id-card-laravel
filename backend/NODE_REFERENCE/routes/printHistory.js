const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getPrintHistory,
  getPrintStats
} = require('../controllers/printHistoryController');

router.use(authenticateToken);

router.get('/', getPrintHistory);
router.get('/stats', getPrintStats);

module.exports = router;