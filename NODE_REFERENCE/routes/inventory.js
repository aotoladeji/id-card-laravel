const express = require('express');
const router = express.Router();
const {
  getAllInventory,
  addInventoryItem,
  logFaultyDelivery,
  getFaultyDeliveries,
  attestFaultyDelivery,
  approveInventoryItem
} = require('../controllers/inventoryController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/', getAllInventory);
router.post('/', addInventoryItem);
router.post('/faulty', logFaultyDelivery);
router.get('/faulty', getFaultyDeliveries);
router.put('/faulty/:id/attest', attestFaultyDelivery);
router.put('/:id/approve', approveInventoryItem);

module.exports = router;