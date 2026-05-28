const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { validateBody, validateQuery } = require('../middlewares/validate');
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

// Create registration invite
router.post(
  '/invites',
  authenticate,
  authorize('admin'),
  validateBody(adminSchemas.createInvite),
  adminController.createRegistrationInvite
);

// Bulk create registration invites
router.post(
  '/invites/bulk',
  authenticate,
  authorize('admin'),
  validateBody(adminSchemas.bulkInvite),
  adminController.bulkRegistrationInvites
);

// List registration invites
router.get(
  '/invites',
  authenticate,
  authorize('admin'),
  validateQuery(adminSchemas.inviteListQuery),
  adminController.listRegistrationInvites
);

// Revoke registration invite
router.post(
  '/invites/:id/revoke',
  authenticate,
  authorize('admin'),
  adminController.revokeRegistrationInvite
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

// Delete a user (mentee or mentor)
router.delete(
  '/users/:id',
  authenticate,
  authorize('admin'),
  adminController.deleteUser
);

// Suspend a user
router.put(
  '/users/:id/suspend',
  authenticate,
  authorize('admin'),
  adminController.suspendUser
);

// Unsuspend a user
router.put(
  '/users/:id/unsuspend',
  authenticate,
  authorize('admin'),
  adminController.unsuspendUser
);

module.exports = router;
