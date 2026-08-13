const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateBody } = require('../middlewares/validate');
const { authSchemas } = require('../validations/authValidation');
const { authenticate, authenticateTemporary } = require('../middlewares/auth');
const {
  loginLimiter,
  passwordResetLimiter,
  registerLimiter,
  verifyEmailLimiter,
  resendVerificationLimiter,
  refreshTokenLimiter
} = require('../middlewares/rateLimiter');

/**
 * Public routes (no authentication required)
 */

// Register new user
router.post(
  '/register',
  registerLimiter,
  validateBody(authSchemas.register),
  authController.register
);

// Validate invite token
router.get(
  '/invites/:token',
  authController.validateInvite
);

// Login
router.post(
  '/login',
  loginLimiter,
  validateBody(authSchemas.login),
  authController.login
);

// Refresh access token
router.post(
  '/refresh',
  refreshTokenLimiter,
  validateBody(authSchemas.refreshToken),
  authController.refreshToken
);

// Verify email
router.post(
  '/verify-email',
  verifyEmailLimiter,
  validateBody(authSchemas.verifyEmail),
  authController.verifyEmail
);

// Request password reset
router.post(
  '/forgot-password',
  passwordResetLimiter,
  validateBody(authSchemas.forgotPassword),
  authController.forgotPassword
);

// Resend verification email
router.post(
  '/resend-verification',
  resendVerificationLimiter,
  validateBody(authSchemas.resendVerification),
  authController.resendVerification
);

// Reset password
router.post(
  '/reset-password',
  passwordResetLimiter,
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

// Logout.
// Deliberately NOT behind authenticate: people sign out after the app has been
// closed for a while, which is exactly when the 15-minute access token is dead.
// Requiring one meant the request 401'd and the refresh token was never revoked.
// Possession of the refresh token is itself the authorisation to revoke it.
router.post(
  '/logout',
  validateBody(authSchemas.refreshToken),
  authController.logout
);

// Sign out on every device. This one DOES need a live session — it acts on the
// whole account, not just the token in your hand.
router.post(
  '/logout-all',
  authenticate,
  authController.logoutAll
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

// Verify 2FA during login (uses the temporary token from the login response,
// which authenticateTemporary accepts and authenticate deliberately does not)
router.post(
  '/verify-2fa-login',
  loginLimiter,
  authenticateTemporary,
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
