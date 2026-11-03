const express = require('express');
const router = express.Router();
const { ensureSchedulingSchema } = require('../services/schedulingSchema');
const {
  createSchedulingConfig,
  getAllConfigs,
  getConfigById,
  updateConfig,
  closeReopenConfig,
  reopenWithNewBatch,
  uploadStudentList,
  getScheduledStudents,
  getTimeSlots,
  sendSchedulingEmails,
  deleteConfig,
  manualBookStudent
} = require('../controllers/schedulingController');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

router.use(async (req, res, next) => {
  try {
    await ensureSchedulingSchema();
    next();
  } catch (error) {
    console.error('Error ensuring scheduling schema:', error);
    res.status(500).json({ message: 'Error initializing scheduling schema' });
  }
});

// Helper function to check if user can manage scheduling
const canManageScheduling = (req, res, next) => {
  const { role, permissions } = req.user;
  
  // Supervisors and admins have full access
  if (role === 'supervisor' || role === 'admin') {
    return next();
  }
  
  // Staff need 'scheduling' permission
  if (role === 'staff' && permissions && permissions.includes('scheduling')) {
    return next();
  }
  
  return res.status(403).json({ message: 'You do not have permission to manage scheduling' });
};

// Helper function to check if user can delete scheduling (only supervisor/admin)
const canDeleteScheduling = (req, res, next) => {
  const { role } = req.user;
  
  // Only supervisors and admins can delete
  if (role === 'supervisor' || role === 'admin') {
    return next();
  }
  
  return res.status(403).json({ message: 'Only supervisors and admins can delete scheduling configurations' });
};

// All routes require authentication
router.use(authenticateToken);

// Create new scheduling config
router.post('/', canManageScheduling, createSchedulingConfig);

// Get all scheduling configs
router.get('/', getAllConfigs);

// Get specific config with details
router.get('/:id', getConfigById);

// Update config
router.put('/:id', canManageScheduling, updateConfig);

// Close/reopen scheduling (simple toggle — only for closing)
router.put('/:id/toggle', canManageScheduling, closeReopenConfig);

// Reopen schedule with new batch of students and new dates
router.post('/:id/reopen', canManageScheduling, upload.single('file'), reopenWithNewBatch);

// Upload student list (Excel/CSV)
router.post('/:id/students', canManageScheduling, upload.single('file'), uploadStudentList);

// Get scheduled students for a config
router.get('/:id/students', getScheduledStudents);

// Get available time slots
router.get('/:id/slots', getTimeSlots);

// Send scheduling emails
router.post('/:id/send-emails', canManageScheduling, sendSchedulingEmails);

// Delete scheduling configuration - ONLY supervisor/admin
router.delete('/:id', canDeleteScheduling, deleteConfig);

// Manually insert a student into an available slot
router.post('/:id/manual-book', canManageScheduling, manualBookStudent);

module.exports = router;