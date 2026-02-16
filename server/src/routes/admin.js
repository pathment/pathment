const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { validateBody } = require('../middlewares/validate');
const { adminSchemas } = require('../validations/adminValidation');
const { authenticate, authorize } = require('../middlewares/auth');

/**
 * All admin routes require authentication and admin role
 */

// Get dashboard statistics
router.get(
  '/dashboard/stats',
  authenticate,
  authorize('admin'),
  adminController.getDashboardStats
);

// Create new admin (only admins with 'manage_users' or 'all' permissions)
router.post(
  '/create',
  authenticate,
  authorize('admin'),
  validateBody(adminSchemas.createAdmin),
  adminController.createAdmin
);

// Update admin permissions
router.put(
  '/:id/permissions',
  authenticate,
  authorize('admin'),
  validateBody(adminSchemas.updatePermissions),
  adminController.updatePermissions
);

// Recalculate mentor mentee counts (utility endpoint)
router.post(
  '/recalculate-mentor-counts',
  authenticate,
  authorize('admin'),
  adminController.recalculateMentorCounts
);

module.exports = router;
