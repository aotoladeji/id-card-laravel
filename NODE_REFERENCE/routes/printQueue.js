const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
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
} = require('../controllers/printQueueController');

router.use(authenticateToken);

router.post('/sync', syncCards);
router.post('/', addCardToQueue);
router.get('/', getPrintQueue);
router.post('/:id/printed', markAsPrinted);
router.post('/:id/failed', markAsFailed);
router.post('/:id/retry', retryPrint);
router.post('/:id/generate-pdf', generatePDF);
router.post('/:id/print-direct', printDirect);
router.delete('/clear', clearQueue);
router.delete('/:id', deleteCard);

module.exports = router;