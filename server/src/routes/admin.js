const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { validateBody } = require('../middlewares/validate');
const { adminSchemas } = require('../validations/adminValidation');
const { authenticate, authorize } = require('../middlewares/auth');

/**
 * All admin routes require authentication and admin role
 */

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

module.exports = router;
