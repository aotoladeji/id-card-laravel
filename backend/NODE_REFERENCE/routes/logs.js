const express = require('express');
const router = express.Router();
const { getAllLogs } = require('../controllers/logsController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

router.get('/', authenticateToken, authorizeRole('admin', 'supervisor'), getAllLogs);

module.exports = router;