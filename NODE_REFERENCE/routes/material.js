const express = require('express');
const router = express.Router();
const {
  getAllMaterialRequests,
  createMaterialRequest,
  respondToMaterialRequest,
  forwardMaterialRequest,
  addressMaterialRequest,
  queryMaterialRequest,
  replyToQuery
} = require('../controllers/materialController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/', getAllMaterialRequests);
router.post('/', createMaterialRequest);
router.put('/:id/respond', respondToMaterialRequest);
router.put('/:id/forward', forwardMaterialRequest);
router.put('/:id/address', addressMaterialRequest);
router.put('/:id/query', queryMaterialRequest);
router.put('/:id/reply-query', replyToQuery);

module.exports = router;