const express = require('express');
const router = express.Router();
const {
  getAllReprintRequests,
  createReprintRequest,
  updateReprintStatus
} = require('../controllers/reprintController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/', getAllReprintRequests);
router.post('/', createReprintRequest);
router.put('/:id/status', updateReprintStatus);

module.exports = router;