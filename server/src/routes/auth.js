const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateBody, validateParams } = require('../middlewares/validate');
const { authSchemas, paramSchemas } = require('../validations/authValidation');
const { authenticate } = require('../middlewares/auth');

/**
 * Public routes (no authentication required)
 */

// Register new user
router.post(
  '/register',
  validateBody(authSchemas.register),
  authController.register
);

// Validate invite token
router.get(
  '/invites/:token',
  validateParams(paramSchemas.tokenParam),
  authController.validateInvite
);

// Login
router.post(
  '/login',
  validateBody(authSchemas.login),
  authController.login
);

// Refresh access token
router.post(
  '/refresh',
  validateBody(authSchemas.refreshToken),
  authController.refreshToken
);

// Verify email
router.post(
  '/verify-email',
  validateBody(authSchemas.verifyEmail),
  authController.verifyEmail
);

// Request password reset
router.post(
  '/forgot-password',
  validateBody(authSchemas.forgotPassword),
  authController.forgotPassword
);

// Resend verification email
router.post(
  '/resend-verification',
  validateBody(authSchemas.resendVerification),
  authController.resendVerification
);

// Reset password
router.post(
  '/reset-password',
  validateBody(authSchemas.resetPassword),
  authController.resetPassword
);

/**
 * Protected routes (authentication required)
 */

// Get current user
router.get(
  '/me',
  authenticate,
  authController.getCurrentUser
);

// Change password
router.post(
  '/change-password',
  authenticate,
  validateBody(authSchemas.changePassword),
  authController.changePassword
);

// Logout
router.post(
  '/logout',
  authenticate,
  validateBody(authSchemas.refreshToken),
  authController.logout
);

/**
 * Security routes (authentication required)
 */

// Get active sessions
// router.get(
//   '/sessions',
//   authenticate,
//   authController.getActiveSessions
// );

// Revoke a specific session
// router.delete(
//   '/sessions/:sessionId',
//   authenticate,
//   authController.revokeSession
// );

// Revoke all other sessions
// router.post(
//   '/sessions/revoke-all-others',
//   authenticate,
//   authController.revokeAllOtherSessions
// );

// Get audit logs
router.get(
  '/audit-logs',
  authenticate,
  authController.getAuditLogs
);

// Setup 2FA
router.post(
  '/2fa/setup',
  authenticate,
  authController.setup2FA
);

// Verify and enable 2FA
router.post(
  '/2fa/verify',
  authenticate,
  validateBody(authSchemas.verify2FA),
  authController.verify2FA
);

// Disable 2FA
router.post(
  '/2fa/disable',
  authenticate,
  authController.disable2FA
);

// Get 2FA status
router.get(
  '/2fa/status',
  authenticate,
  authController.get2FAStatus
);

// Verify 2FA during login (uses temporary token from login response)
router.post(
  '/verify-2fa-login',
  authenticate,
  validateBody(authSchemas.verify2FALogin),
  authController.verify2FALogin
);

// Regenerate backup codes
router.post(
  '/2fa/regenerate-backup-codes',
  authenticate,
  authController.regenerateBackupCodes
);

module.exports = router;
