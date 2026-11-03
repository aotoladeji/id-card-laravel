const express = require('express');
const router = express.Router();
const {
  getAllUsers,
  getUserById,
  updateUserPermissions,
  deleteUser
} = require('../controllers/usersController');
const { authenticateToken } = require('../middleware/auth');

// Apply authentication to all routes
router.use(authenticateToken);

// All authenticated users can view users
router.get('/', getAllUsers);
router.get('/:id', getUserById);

// Update permissions - no additional middleware, controller handles authorization
router.put('/:id/permissions', updateUserPermissions);

// Delete user - no additional middleware, controller handles authorization
router.delete('/:id', deleteUser);

module.exports = router;