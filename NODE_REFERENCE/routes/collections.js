const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getCollections,
  markAsCollected,
  verifyAndCollect,
  getCollectionStats
} = require('../controllers/collectionsController');

router.use(authenticateToken);

router.get('/', getCollections);
router.post('/:id/collect', markAsCollected);
router.post('/:id/verify-fingerprint', verifyAndCollect);
router.get('/stats', getCollectionStats);

module.exports = router;