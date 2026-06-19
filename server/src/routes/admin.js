const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const promotionController = require('../controllers/promotionController');
const cohortReviewAdminController = require('../controllers/cohortReviewAdminController');
const { validateBody, validateQuery } = require('../middlewares/validate');
const { adminSchemas } = require('../validations/adminValidation');
const { authenticate, authorize } = require('../middlewares/auth');
const { requirePermission, requirePermissionMinScope } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');

/**
 * All admin routes require authentication and admin role
 */

// Get dashboard statistics
router.get(
  '/dashboard/stats',
  authenticate,
  requirePermissionMinScope(PERMISSIONS.ANALYTICS_VIEW),
  adminController.getDashboardStats
);

// Create new admin (only admins with 'manage_users' or 'all' permissions)
router.post(
  '/create',
  authenticate,
  requirePermission(PERMISSIONS.USER_MANAGE),
  validateBody(adminSchemas.createAdmin),
  adminController.createAdmin
);

// Create registration invite (invite.create - super_admin, intake_manager, program_admin)
router.post(
  '/invites',
  authenticate,
  requirePermissionMinScope(PERMISSIONS.INVITE_CREATE),
  validateBody(adminSchemas.createInvite),
  adminController.createRegistrationInvite
);

// Bulk create registration invites
router.post(
  '/invites/bulk',
  authenticate,
  requirePermissionMinScope(PERMISSIONS.INVITE_CREATE),
  validateBody(adminSchemas.bulkInvite),
  adminController.bulkRegistrationInvites
);

// List registration invites
router.get(
  '/invites',
  authenticate,
  requirePermissionMinScope(PERMISSIONS.INVITE_CREATE),
  validateQuery(adminSchemas.inviteListQuery),
  adminController.listRegistrationInvites
);

// Revoke registration invite
router.post(
  '/invites/:id/revoke',
  authenticate,
  requirePermissionMinScope(PERMISSIONS.INVITE_CREATE),
  adminController.revokeRegistrationInvite
);

// Update admin permissions
router.put(
  '/:id/permissions',
  authenticate,
  requirePermission(PERMISSIONS.ACCESS_MANAGE),
  validateBody(adminSchemas.updatePermissions),
  adminController.updatePermissions
);

// Recalculate mentor mentee counts (utility endpoint)
router.post(
  '/recalculate-mentor-counts',
  authenticate,
  requirePermission(PERMISSIONS.SYSTEM_SETTINGS),
  adminController.recalculateMentorCounts
);

// Delete a user (mentee or mentor)
router.delete(
  '/users/:id',
  authenticate,
  requirePermission(PERMISSIONS.USER_MANAGE),
  adminController.deleteUser
);

// Edit a user (name / email / base role) — admin user management.
router.patch(
  '/users/:id',
  authenticate,
  requirePermission(PERMISSIONS.USER_MANAGE),
  adminController.updateUser
);

// Set a user's password directly (admin support action).
router.post(
  '/users/:id/password',
  authenticate,
  requirePermission(PERMISSIONS.USER_MANAGE),
  adminController.setUserPassword
);

// Send a user a password-reset link.
router.post(
  '/users/:id/send-reset',
  authenticate,
  requirePermission(PERMISSIONS.USER_MANAGE),
  adminController.sendUserPasswordReset
);

// Disable / reset a user's 2FA (locked-out support).
router.post(
  '/users/:id/disable-2fa',
  authenticate,
  requirePermission(PERMISSIONS.USER_MANAGE),
  adminController.disableUserTwoFactor
);

// Suspend a user
router.put(
  '/users/:id/suspend',
  authenticate,
  requirePermission(PERMISSIONS.USER_MANAGE),
  adminController.suspendUser
);

// Unsuspend a user
router.put(
  '/users/:id/unsuspend',
  authenticate,
  requirePermission(PERMISSIONS.USER_MANAGE),
  adminController.unsuspendUser
);

// Update a user's platform capabilities (multi-role views)
router.patch(
  '/users/:id/capabilities',
  authenticate,
  requirePermission(PERMISSIONS.USER_MANAGE),
  adminController.updateUserCapabilities
);

// ── Co-mentor promotions (admin review of mentor nominations) ────────────────
// The mentor nominates / marks "awaiting admin" on /mentor/promotions; the admin
// reviews, promotes, or declines here. Gated by user.manage.
router.get(
  '/promotions',
  authenticate,
  requirePermission(PERMISSIONS.USER_MANAGE),
  promotionController.list
);
router.patch(
  '/promotions/:id',
  authenticate,
  requirePermission(PERMISSIONS.USER_MANAGE),
  promotionController.advance
);
router.post(
  '/promotions/:id/promote',
  authenticate,
  requirePermission(PERMISSIONS.USER_MANAGE),
  promotionController.promote
);
router.post(
  '/promotions/:id/decline',
  authenticate,
  requirePermission(PERMISSIONS.USER_MANAGE),
  promotionController.decline
);

// Org system settings (cohort review deletion lock, etc.)
router.get(
  '/system-settings',
  authenticate,
  requirePermission(PERMISSIONS.SYSTEM_SETTINGS),
  cohortReviewAdminController.getSystemSettings
);
router.put(
  '/system-settings',
  authenticate,
  requirePermission(PERMISSIONS.SYSTEM_SETTINGS),
  cohortReviewAdminController.updateSystemSettings
);

// Cohort review edit access while deletion lock is on
router.get(
  '/cohort-review/edit-requests',
  authenticate,
  requirePermission(PERMISSIONS.SYSTEM_SETTINGS),
  cohortReviewAdminController.listEditRequests
);
router.post(
  '/cohort-review/edit-requests/:id/resolve',
  authenticate,
  requirePermission(PERMISSIONS.SYSTEM_SETTINGS),
  cohortReviewAdminController.resolveEditRequest
);
router.get(
  '/cohort-review/clan-grants',
  authenticate,
  requirePermission(PERMISSIONS.SYSTEM_SETTINGS),
  cohortReviewAdminController.listClanGrants
);
router.post(
  '/cohort-review/clan-grants',
  authenticate,
  requirePermission(PERMISSIONS.SYSTEM_SETTINGS),
  cohortReviewAdminController.createClanGrant
);

module.exports = router;
