const bcrypt = require("bcrypt");
const { Op } = require("sequelize");
const { sequelize, models } = require("../db");
const emailService = require("./emailService");
const {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} = require("../utils/errors/errorTypes");
const { AUTH_MESSAGES } = require("../utils/responses/messages");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateRandomToken,
  generateVerificationCode,
  hashToken,
} = require("../utils/jwt");

class AuthService {
  /**
   * Register a new user
   */
  async register(userData) {
    const {
      firstName,
      lastName,
      email,
      password,
      role,
      phoneNumber,
      dateOfBirth,
      bio,
    } = userData;

    // Check if email already exists
    const existingUser = await models.User.findOne({ where: { email } });
    if (existingUser) {
      throw new ConflictError(AUTH_MESSAGES.EMAIL_ALREADY_EXISTS);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await models.User.create({
      firstName,
      lastName,
      email,
      passwordHash: hashedPassword,
      role,
      phoneNumber,
      dateOfBirth,
      emailVerified: false,
      status: "active",
    });

    // Create role-specific profile
    if (role === "mentor") {
      await models.MentorProfile.create({
        userId: user.id,
        bio: bio || null,
        specialization: [],
        yearsOfExperience: 0,
        maxMentees: 5,
      });
    } else if (role === "mentee") {
      await models.MenteeProfile.create({
        userId: user.id,
        bio: bio || null,
        learningGoals: [],
        currentLevel: 1,
        totalPoints: 0,
      });
    }

    // Generate 6-digit verification code
    const verificationCode = Math.floor(
      100000 + Math.random() * 900000,
    ).toString();
    const hashedCode = hashToken(verificationCode);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await models.EmailVerificationToken.create({
      userId: user.id,
      token: hashedCode,
      expiresAt,
    });

    // Send verification email (non-blocking)
    try {
      await emailService.sendVerificationEmail(user.email, verificationCode);
    } catch (emailError) {
      console.error("Failed to send verification email:", emailError);
      // Don't fail the registration if email sending fails
    }

    // Generate tokens
    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = generateRefreshToken({ id: user.id });

    // Store refresh token
    await models.RefreshToken.create({
      userId: user.id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    // Remove password from response
    const userResponse = user.toJSON();
    delete userResponse.passwordHash;

    return {
      user: userResponse,
      accessToken,
      refreshToken,
      message:
        "Account created! Please check your email for the verification code.",
    };
  }

  /**
   * Login user
   */
  async login(email, password) {
    // Find user
    const user = await models.User.findOne({
      where: { email },
      include: [
        { model: models.MentorProfile, as: "mentorProfile" },
        { model: models.MenteeProfile, as: "menteeProfile" },
        { model: models.AdminProfile, as: "adminProfile" },
      ],
    });

    if (!user) {
      throw new AuthenticationError(AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    // Check if account is active
    if (user.status !== "active") {
      throw new AuthenticationError(AUTH_MESSAGES.ACCOUNT_DISABLED);
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AuthenticationError(AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    // Check email verification (optional enforcement)
    // if (!user.isEmailVerified) {
    //   throw new AuthenticationError(AUTH_MESSAGES.EMAIL_NOT_VERIFIED);
    // }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    // Generate tokens
    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = generateRefreshToken({ id: user.id });

    // Store refresh token
    await models.RefreshToken.create({
      userId: user.id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    // Remove password from response
    const userResponse = user.toJSON();
    delete userResponse.passwordHash;

    return {
      user: userResponse,
      accessToken,
      refreshToken,
    };
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken) {
    // Verify token
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (error) {
      throw new AuthenticationError(AUTH_MESSAGES.INVALID_TOKEN);
    }

    // Check if refresh token exists and is not revoked
    const storedToken = await models.RefreshToken.findOne({
      where: {
        token: refreshToken,
        userId: decoded.id,
        revokedAt: null,
        expiresAt: { [Op.gt]: new Date() },
      },
    });

    if (!storedToken) {
      throw new AuthenticationError(AUTH_MESSAGES.INVALID_TOKEN);
    }

    // Get user
    const user = await models.User.findByPk(decoded.id);
    if (!user || user.status !== "active") {
      throw new AuthenticationError(AUTH_MESSAGES.USER_NOT_FOUND);
    }

    // Generate new access token
    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return { accessToken };
  }

  /**
   * Logout user
   */
  async logout(refreshToken) {
    // Revoke refresh token
    await models.RefreshToken.update(
      { revokedAt: new Date() },
      { where: { token: refreshToken } },
    );

    return true;
  }

  /**
   * Verify email with 6-digit code
   */
  async verifyEmail(code) {
    // Clean and normalize the code (remove whitespace, convert to string)
    const cleanCode = String(code).trim().replace(/\s+/g, "");

    if (!cleanCode || cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      throw new ValidationError("Invalid verification code format");
    }

    const hashedCode = hashToken(cleanCode);

    // Find the verification token by hashed code
    const verificationToken = await models.EmailVerificationToken.findOne({
      where: {
        token: hashedCode,
        usedAt: null,
        expiresAt: { [Op.gt]: new Date() },
      },
    });

    if (!verificationToken) {
      throw new ValidationError(AUTH_MESSAGES.INVALID_TOKEN);
    }

    // Update user
    await models.User.update(
      { isEmailVerified: true, emailVerifiedAt: new Date() },
      { where: { id: verificationToken.userId } },
    );

    // Mark token as used
    verificationToken.usedAt = new Date();
    await verificationToken.save();

    return true;
  }

  /**
   * Request password reset
   */
  async forgotPassword(email) {
    const user = await models.User.findOne({ where: { email } });

    if (!user) {
      // Don't reveal if email exists
      return true;
    }

    // Generate 6-digit reset code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedToken = hashToken(resetCode);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await models.PasswordResetToken.create({
      userId: user.id,
      token: hashedToken,
      expiresAt,
    });

    // Send password reset email (non-blocking)
    try {
      await emailService.sendPasswordResetEmail(user.email, resetCode);
    } catch (emailError) {
      console.error("Failed to send password reset email:", emailError);
      // Don't fail the request if email sending fails
    }

    return true;
  }

  /**
   * Reset password with 6-digit code
   */
  async resetPassword(code, newPassword) {
    // Clean and normalize the code (remove whitespace, convert to string)
    const cleanCode = String(code).trim().replace(/\s+/g, "");

    if (!cleanCode || cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      throw new ValidationError("Invalid reset code format");
    }

    const hashedCode = hashToken(cleanCode);

    // Find the reset token by hashed code
    const resetToken = await models.PasswordResetToken.findOne({
      where: {
        token: hashedCode,
        usedAt: null,
        expiresAt: { [Op.gt]: new Date() },
      },
    });

    if (!resetToken) {
      throw new ValidationError(AUTH_MESSAGES.INVALID_TOKEN);
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update user password
    await models.User.update(
      { passwordHash: hashedPassword },
      { where: { id: resetToken.userId } },
    );

    // Mark token as used
    resetToken.usedAt = new Date();
    await resetToken.save();

    // Revoke all refresh tokens for this user
    await models.RefreshToken.update(
      { revokedAt: new Date() },
      { where: { userId: resetToken.userId } },
    );

    return true;
  }

  /**
   * Change password (when user is logged in)
   */
  async changePassword(userId, currentPassword, newPassword) {
    const user = await models.User.findByPk(userId);

    if (!user) {
      throw new NotFoundError(AUTH_MESSAGES.USER_NOT_FOUND);
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new AuthenticationError("Current password is incorrect");
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    user.passwordHash = hashedPassword;
    await user.save();

    // Revoke all refresh tokens except current session (optional)
    // For simplicity, we revoke all
    await models.RefreshToken.update(
      { isRevoked: true, revokedAt: new Date() },
      { where: { userId: user.id } },
    );

    return true;
  }

  /**
   * Get current user
   */
  async getCurrentUser(userId) {
    const user = await models.User.findByPk(userId, {
      attributes: { exclude: ["password"] },
      include: [
        { model: models.MentorProfile, as: "mentorProfile" },
        { model: models.MenteeProfile, as: "menteeProfile" },
        { model: models.AdminProfile, as: "adminProfile" },
      ],
    });

    if (!user) {
      throw new NotFoundError(AUTH_MESSAGES.USER_NOT_FOUND);
    }

    return user;
  }
}

module.exports = new AuthService();
