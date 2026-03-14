const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const { sequelize, models } = require('../db');
const { 
  AuthenticationError, 
  ConflictError, 
  NotFoundError,
  ValidationError 
} = require('../utils/errors/errorTypes');
const { AUTH_MESSAGES } = require('../utils/responses/messages');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateRandomToken,
  generateVerificationCode,
  hashToken
} = require('../utils/jwt');
const notificationOrchestrator = require('./notificationOrchestrator');

class AuthService {
  /**
   * Register a new user
   */
  async register(userData) {
    const { firstName, lastName, email, password, role, phoneNumber, dateOfBirth, bio } = userData;

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
      status: 'active'
    });

    // Create role-specific profile
    if (role === 'mentor') {
      await models.MentorProfile.create({
        userId: user.id,
        bio: bio || null,
        specialization: [],
        yearsOfExperience: 0,
        maxMentees: 5
      });
    } else if (role === 'mentee') {
      await models.MenteeProfile.create({
        userId: user.id,
        bio: bio || null,
        learningGoals: [],
        currentLevel: 1,
        totalPoints: 0
      });
    }

    // Ensure settings exist for notification preference checks.
    await models.UserSettings.create({ userId: user.id });

    // Generate email verification token
    const verificationToken = generateRandomToken();
    const hashedToken = hashToken(verificationToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await models.EmailVerificationToken.create({
      userId: user.id,
      token: hashedToken,
      expiresAt
    });

    // Send welcome email (non-blocking).
    notificationOrchestrator.sendWelcomeEmail(user).catch((error) => {
      console.warn('welcome email failed:', error.message);
    });

    // Generate tokens
    const accessToken = generateAccessToken({ 
      id: user.id, 
      email: user.email, 
      role: user.role 
    });
    const refreshToken = generateRefreshToken({ id: user.id });

    // Store refresh token
    await models.RefreshToken.create({
      userId: user.id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });

    // Remove password from response
    const userResponse = user.toJSON();
    delete userResponse.passwordHash;

    return {
      user: userResponse,
      accessToken,
      refreshToken,
      verificationToken // Return for testing, remove in production
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
        { model: models.MentorProfile, as: 'mentorProfile' },
        { model: models.MenteeProfile, as: 'menteeProfile' },
        { model: models.AdminProfile, as: 'adminProfile' }
      ]
    });

    if (!user) {
      throw new AuthenticationError(AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    // Check if account is active
    if (user.status !== 'active') {
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
      role: user.role 
    });
    const refreshToken = generateRefreshToken({ id: user.id });

    // Store refresh token
    await models.RefreshToken.create({
      userId: user.id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    // Remove password from response
    const userResponse = user.toJSON();
    delete userResponse.passwordHash;

    return {
      user: userResponse,
      accessToken,
      refreshToken
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
        expiresAt: { [Op.gt]: new Date() }
      }
    });

    if (!storedToken) {
      throw new AuthenticationError(AUTH_MESSAGES.INVALID_TOKEN);
    }

    // Get user
    const user = await models.User.findByPk(decoded.id);
    if (!user || user.status !== 'active') {
      throw new AuthenticationError(AUTH_MESSAGES.USER_NOT_FOUND);
    }

    // Generate new access token
    const accessToken = generateAccessToken({ 
      id: user.id, 
      email: user.email, 
      role: user.role 
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
      { where: { token: refreshToken } }
    );

    return true;
  }

  /**
   * Verify email
   */
  async verifyEmail(token) {
    const hashedToken = hashToken(token);

    // Find token
    const verificationToken = await models.EmailVerificationToken.findOne({
      where: {
        token: hashedToken,
        isUsed: false,
        expiresAt: { [Op.gt]: new Date() }
      }
    });

    if (!verificationToken) {
      throw new ValidationError(AUTH_MESSAGES.INVALID_TOKEN);
    }

    // Update user
    await models.User.update(
      { isEmailVerified: true, emailVerifiedAt: new Date() },
      { where: { id: verificationToken.userId } }
    );

    // Mark token as used
    verificationToken.isUsed = true;
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

    // Generate reset token
    const resetToken = generateRandomToken();
    const hashedToken = hashToken(resetToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await models.PasswordResetToken.create({
      userId: user.id,
      token: hashedToken,
      expiresAt
    });

    // Send reset email (non-blocking).
    notificationOrchestrator.sendPasswordResetEmail(user, resetToken).catch((error) => {
      console.warn('password reset email failed:', error.message);
    });

    return { resetToken }; // Return for testing, remove in production
  }

  /**
   * Reset password
   */
  async resetPassword(token, newPassword) {
    const hashedToken = hashToken(token);

    // Find token
    const resetToken = await models.PasswordResetToken.findOne({
      where: {
        token: hashedToken,
        isUsed: false,
        expiresAt: { [Op.gt]: new Date() }
      }
    });

    if (!resetToken) {
      throw new ValidationError(AUTH_MESSAGES.INVALID_TOKEN);
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update user password
    await models.User.update(
      { password: hashedPassword },
      { where: { id: resetToken.userId } }
    );

    // Mark token as used
    resetToken.isUsed = true;
    await resetToken.save();

    // Revoke all refresh tokens for this user
    await models.RefreshToken.update(
      { isRevoked: true, revokedAt: new Date() },
      { where: { userId: resetToken.userId } }
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
    const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isPasswordValid) {
      throw new AuthenticationError('Current password is incorrect');
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
      { where: { userId: user.id } }
    );

    return true;
  }

  /**
   * Get current user
   */
  async getCurrentUser(userId) {
    const user = await models.User.findByPk(userId, {
      attributes: { exclude: ['password'] },
      include: [
        { model: models.MentorProfile, as: 'mentorProfile' },
        { model: models.MenteeProfile, as: 'menteeProfile' },
        { model: models.AdminProfile, as: 'adminProfile' }
      ]
    });

    if (!user) {
      throw new NotFoundError(AUTH_MESSAGES.USER_NOT_FOUND);
    }

    return user;
  }
}

module.exports = new AuthService();
