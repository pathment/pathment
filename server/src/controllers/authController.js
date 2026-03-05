const authService = require("../services/authService");
const { successResponse } = require("../utils/responses");
const { AUTH_MESSAGES } = require("../utils/responses/messages");
const { catchAsync } = require("../middlewares/errorHandler");

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
            refreshToken: result.refreshToken,
          },
        },
        201,
      ),
    );
  });

  /**
   * Login user
   * POST /api/auth/login
   */
  login = catchAsync(async (req, res) => {
    const { email, password } = req.body;
    const result = await authService.login(email, password);

    res.status(200).json(
      successResponse(AUTH_MESSAGES.LOGIN_SUCCESS, {
        user: result.user,
        tokens: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
      }),
    );
  });

  /**
   * Refresh access token
   * POST /api/auth/refresh
   */
  refreshToken = catchAsync(async (req, res) => {
    const { refreshToken } = req.body;
    const result = await authService.refreshAccessToken(refreshToken);

    res.status(200).json(
      successResponse(AUTH_MESSAGES.TOKEN_REFRESH_SUCCESS, {
        accessToken: result.accessToken,
      }),
    );
  });

  /**
   * Logout user
   * POST /api/auth/logout
   */
  logout = catchAsync(async (req, res) => {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);

    res.status(200).json(successResponse(AUTH_MESSAGES.LOGOUT_SUCCESS));
  });

  /**
   * Verify email
   * POST /api/auth/verify-email
   */
  verifyEmail = catchAsync(async (req, res) => {
    const { code } = req.body;
    await authService.verifyEmail(code);

    res.status(200).json(successResponse(AUTH_MESSAGES.EMAIL_VERIFIED));
  });

  /**
   * Request password reset
   * POST /api/auth/forgot-password
   */
  forgotPassword = catchAsync(async (req, res) => {
    const { email } = req.body;
    await authService.forgotPassword(email);

    res.status(200).json(successResponse(AUTH_MESSAGES.PASSWORD_RESET_SENT));
  });

  /**
   * Reset password
   * POST /api/auth/reset-password
   */
  resetPassword = catchAsync(async (req, res) => {
    const { code, password } = req.body;
    await authService.resetPassword(code, password);

    res.status(200).json(successResponse(AUTH_MESSAGES.PASSWORD_RESET_SUCCESS));
  });

  /**
   * Change password (authenticated user)
   * POST /api/auth/change-password
   */
  changePassword = catchAsync(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user.id, currentPassword, newPassword);

    res
      .status(200)
      .json(successResponse(AUTH_MESSAGES.PASSWORD_CHANGE_SUCCESS));
  });

  /**
   * Get current user
   * GET /api/auth/me
   */
  getCurrentUser = catchAsync(async (req, res) => {
    const user = await authService.getCurrentUser(req.user.id);

    res
      .status(200)
      .json(successResponse("User retrieved successfully", { user }));
  });
}

module.exports = new AuthController();
