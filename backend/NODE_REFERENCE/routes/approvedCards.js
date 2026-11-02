const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getApprovedCards,
  getApprovedCardById,
  getApprovedCardsStats,
  updateApprovedCard
} = require('../controllers/approvedCardsController');

router.use(authenticateToken);

router.get('/', getApprovedCards);
router.get('/stats', getApprovedCardsStats);
router.get('/:id', getApprovedCardById);
router.put('/:id', updateApprovedCard);

module.exports = router;
