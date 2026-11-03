const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../../middleware/auth');
const { resetOperationalData } = require('../../controllers/developerResetController');

router.use(authenticateToken);
router.use(authorizeRole(['admin']));

router.post('/', resetOperationalData);

module.exports = router;