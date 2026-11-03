const express = require('express');
const router = express.Router();
const {
  getAllDailyReports,
  createDailyReport,
  verifyDailyReport
} = require('../controllers/dailyReportsController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/', getAllDailyReports);
router.post('/', createDailyReport);
router.put('/:id/verify', verifyDailyReport);

module.exports = router;