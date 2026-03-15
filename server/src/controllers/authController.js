const authService = require('../services/authService');
const securityService = require('../services/securityService');
const { successResponse } = require('../utils/responses');
const { AUTH_MESSAGES } = require('../utils/responses/messages');
const { AuthenticationError } = require('../utils/errors/errorTypes');
const { catchAsync } = require('../middlewares/errorHandler');

class AuthController {
  /**
   * Register a new user
   * POST /api/auth/register
   */
  register = catchAsync(async (req, res) => {
    const result = await authService.register(req.body);

    res.status(201).json(
      successResponse(
        AUTH_MESSAGES.REGISTER_SUCCESS,
        {
          user: result.user,
          tokens: {
            accessToken: result.accessToken,
            refreshToken: result.refreshToken
          }
        },
        201
      )
    );
  });

  /**
   * Login user
   * POST /api/auth/login
   */
  login = catchAsync(async (req, res) => {
    const { email, password } = req.body;
    const result = await authService.login(email, password);

    // Check if 2FA is required
    if (result.requiresTwoFactor) {
      res.status(200).json(
        successResponse(
          AUTH_MESSAGES.LOGIN_SUCCESS,
          {
            requiresTwoFactor: true,
            temporaryToken: result.temporaryToken,
            user: result.user
          }
        )
      );
    } else {
      // Normal login flow
      res.status(200).json(
        successResponse(
          AUTH_MESSAGES.LOGIN_SUCCESS,
          {
            user: result.user,
            tokens: {
              accessToken: result.accessToken,
              refreshToken: result.refreshToken
            }
          }
        )
      );
    }
  });

  /**
   * Refresh access token
   * POST /api/auth/refresh
   */
  refreshToken = catchAsync(async (req, res) => {
    const { refreshToken } = req.body;
    const result = await authService.refreshAccessToken(refreshToken);

    res.status(200).json(
      successResponse(
        AUTH_MESSAGES.TOKEN_REFRESH_SUCCESS,
        {
          accessToken: result.accessToken
        }
      )
    );
  });

  /**
   * Logout user
   * POST /api/auth/logout
   */
  logout = catchAsync(async (req, res) => {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);

    res.status(200).json(
      successResponse(AUTH_MESSAGES.LOGOUT_SUCCESS)
    );
  });

  /**
   * Verify email
   * POST /api/auth/verify-email
   */
  verifyEmail = catchAsync(async (req, res) => {
    const { token } = req.body;
    await authService.verifyEmail(token);

    res.status(200).json(
      successResponse(AUTH_MESSAGES.EMAIL_VERIFIED)
    );
  });

  /**
   * Request password reset
   * POST /api/auth/forgot-password
   */
  forgotPassword = catchAsync(async (req, res) => {
    const { email } = req.body;
    await authService.forgotPassword(email);

    res.status(200).json(
      successResponse(AUTH_MESSAGES.PASSWORD_RESET_SENT)
    );
  });

  /**
   * Reset password
   * POST /api/auth/reset-password
   */
  resetPassword = catchAsync(async (req, res) => {
    const { token, password } = req.body;
    await authService.resetPassword(token, password);

    res.status(200).json(
      successResponse(AUTH_MESSAGES.PASSWORD_RESET_SUCCESS)
    );
  });

  /**
   * Change password (authenticated user)
   * POST /api/auth/change-password
   */
  changePassword = catchAsync(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user.id, currentPassword, newPassword);

    res.status(200).json(
      successResponse(AUTH_MESSAGES.PASSWORD_CHANGE_SUCCESS)
    );
  });

  /**
   * Get current user
   * GET /api/auth/me
   */
  getCurrentUser = catchAsync(async (req, res) => {
    const user = await authService.getCurrentUser(req.user.id);

    res.status(200).json(
      successResponse(
        'User retrieved successfully',
        { user }
      )
    );
  });

  /**
   * Get active sessions
   * GET /api/auth/sessions
   */
  getActiveSessions = catchAsync(async (req, res) => {
    const sessions = await securityService.getActiveSessions(req.user.id);

    res.status(200).json(
      successResponse('Active sessions retrieved successfully', sessions)
    );
  });

  /**
   * Revoke a session
   * DELETE /api/auth/sessions/:sessionId
   */
  revokeSession = catchAsync(async (req, res) => {
    const { sessionId } = req.params;
    await securityService.revokeSession(req.user.id, sessionId);

    res.status(200).json(
      successResponse('Session revoked successfully')
    );
  });

  /**
   * Revoke all other sessions
   * POST /api/auth/sessions/revoke-all-others
   */
  revokeAllOtherSessions = catchAsync(async (req, res) => {
    const sessionId = req.sessionId; // Extracted from token middleware
    await securityService.revokeAllOtherSessions(req.user.id, sessionId);

    res.status(200).json(
      successResponse('All other sessions revoked successfully')
    );
  });

  /**
   * Get audit logs
   * GET /api/auth/audit-logs
   */
  getAuditLogs = catchAsync(async (req, res) => {
    const { limit = 50, offset = 0 } = req.query;
    const result = await securityService.getAuditLogs(req.user.id, {
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.status(200).json(
      successResponse('Audit logs retrieved successfully', result)
    );
  });

  /**
   * Setup 2FA
   * POST /api/auth/2fa/setup
   */
  setup2FA = catchAsync(async (req, res) => {
    const result = await securityService.setup2FA(req.user.id);

    res.status(200).json(
      successResponse('2FA setup initiated. Scan the QR code or enter the secret key.', result)
    );
  });

  /**
   * Verify and enable 2FA
   * POST /api/auth/2fa/verify
   */
  verify2FA = catchAsync(async (req, res) => {
    const { token } = req.body;
    const result = await securityService.verify2FA(req.user.id, token);

    res.status(200).json(
      successResponse('2FA verified and enabled successfully', result)
    );
  });

  /**
   * Disable 2FA
   * POST /api/auth/2fa/disable
   */
  disable2FA = catchAsync(async (req, res) => {
    const result = await securityService.disable2FA(req.user.id);

    res.status(200).json(
      successResponse(result.message)
    );
  });

  /**
   * Get 2FA status
   * GET /api/auth/2fa/status
   */
  get2FAStatus = catchAsync(async (req, res) => {
    const result = await securityService.get2FAStatus(req.user.id);

    res.status(200).json(
      successResponse('2FA status retrieved successfully', result)
    );
  });

  /**
   * Verify 2FA code during login
   * POST /api/auth/verify-2fa-login
   */
  verify2FALogin = catchAsync(async (req, res) => {
    const code = req.body.code || req.body.token;
    
    // Extract user ID from temporary token (done by middleware)
    const userId = req.user?.id;
    if (!userId) {
      throw new AuthenticationError('Invalid temporary token');
    }

    const result = await authService.verify2FADuringLogin(userId, code);

    res.status(200).json(
      successResponse('2FA verified successfully', {
        user: result.user,
        tokens: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken
        }
      })
    );
  });

  /**
   * Regenerate backup codes
   * POST /api/auth/2fa/regenerate-backup-codes
   */
  regenerateBackupCodes = catchAsync(async (req, res) => {
    const result = await securityService.regenerateBackupCodes(req.user.id);

    res.status(200).json(
      successResponse('Backup codes regenerated successfully', result)
    );
  });
}

module.exports = new AuthController();
