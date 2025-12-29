const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateBody } = require('../middlewares/validate');
const { authSchemas } = require('../validations/authValidation');
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

module.exports = router;
