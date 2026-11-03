const express = require('express');
const router = express.Router();
const { login, register, changePassword } = require('../controllers/authController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// Public routes
router.post('/login', login);
router.get('/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// Protected routes
router.post('/change-password', authenticateToken, changePassword);
router.post('/register', authenticateToken, authorizeRole(['admin', 'supervisor']), register);


module.exports = router;