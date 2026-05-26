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
  hashToken
} = require('../utils/jwt');
const notificationOrchestrator = require('./notificationOrchestrator');

class AuthService {
  async getActiveInviteByToken(inviteToken, transaction) {
    const tokenHash = hashToken(inviteToken);
    const invite = await models.RegistrationInvite.findOne({
      where: { tokenHash },
      transaction
    });

    if (!invite) {
      throw new ValidationError('Invalid invite token');
    }

    if (invite.revokedAt) {
      throw new ValidationError('This invite has been revoked');
    }

    if (invite.usedAt) {
      throw new ValidationError('This invite has already been used');
    }

    if (new Date(invite.expiresAt) <= new Date()) {
      throw new ValidationError('This invite has expired');
    }

    return invite;
  }

  async getRegistrationInviteDetails(inviteToken) {
    if (!inviteToken) {
      throw new ValidationError('Invite token is required');
    }

    const invite = await this.getActiveInviteByToken(inviteToken);

    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt
    };
  }

  /**
   * Register a new user
   */
  async register(userData) {
    const {
      firstName,
      lastName,
      email,
      password,
      inviteToken,
      phoneNumber,
      dateOfBirth,
      bio
    } = userData;

    if (!inviteToken) {
      throw new ValidationError('Invite token is required');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await sequelize.transaction(async (transaction) => {
      const invite = await this.getActiveInviteByToken(inviteToken, transaction);

      if (invite.email.toLowerCase() !== normalizedEmail) {
        throw new ValidationError('This invite is only valid for a specific email address');
      }

      const role = invite.role;

      // Check if email already exists
      const existingUser = await models.User.findOne({ where: { email: normalizedEmail }, transaction });
      if (existingUser) {
        throw new ConflictError(AUTH_MESSAGES.EMAIL_ALREADY_EXISTS);
      }

      const user = await models.User.create({
        firstName,
        lastName,
        email: normalizedEmail,
        passwordHash: hashedPassword,
        role,
        phoneNumber,
        dateOfBirth,
        // Email is already proven valid — invite was sent to this exact address
        emailVerified: true,
        emailVerifiedAt: new Date(),
        status: 'active'
      }, { transaction });

      if (role === 'mentor') {
        await models.MentorProfile.create({
          userId: user.id,
          bio: bio || null,
          specialization: [],
          yearsOfExperience: 0,
          maxMentees: 5
        }, { transaction });
      } else {
        await models.MenteeProfile.create({
          userId: user.id,
            interests: [],                 
  currentEducation: null,        
  currentOccupation: null,       
  priorExperience: null,         
  preferredLearningStyle: 'visual', 
          learningGoals: [],
          currentLevel: 1,
          totalPoints: 0
        }, { transaction });
      }

      await models.UserSettings.create({ userId: user.id }, { transaction });

      invite.usedAt = new Date();
      invite.usedBy = user.id;
      await invite.save({ transaction });

      return { user };
    });

    notificationOrchestrator.sendWelcomeEmail(result.user).catch((error) => {
      console.warn('welcome email failed:', error.message);
    });

    const userResponse = result.user.toJSON();
    delete userResponse.passwordHash;

    return { user: userResponse };
  }

  /**
   * Login user
   */
  async login(email, password) {
    const normalizedEmail = email.trim().toLowerCase();

    // Find user
    const user = await models.User.findOne({ 
      where: { email: normalizedEmail },
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

    if (!user.emailVerified) {
      throw new AuthenticationError(AUTH_MESSAGES.EMAIL_NOT_VERIFIED);
    }

    // Check if 2FA is enabled
    if (user.twoFactorEnabled) {
      // Generate temporary token for 2FA verification
      const temporaryToken = generateAccessToken({ 
        id: user.id, 
        email: user.email, 
        role: user.role,
        temp: true 
      }, '5m'); // 5 minute expiry for 2FA verification

      // Remove password from response
      const userResponse = user.toJSON();
      delete userResponse.passwordHash;

      return {
        requiresTwoFactor: true,
        temporaryToken,
        user: userResponse
      };
    }

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
        usedAt: null,
        expiresAt: { [Op.gt]: new Date() }
      }
    });

    if (!verificationToken) {
      throw new ValidationError(AUTH_MESSAGES.INVALID_TOKEN);
    }

    // Update user
    await models.User.update(
      { emailVerified: true, emailVerifiedAt: new Date() },
      { where: { id: verificationToken.userId } }
    );

    // Mark token as used
    verificationToken.usedAt = new Date();
    await verificationToken.save();

    return true;
  }

  async resendVerificationEmail(email) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await models.User.findOne({ where: { email: normalizedEmail } });

    if (!user) {
      // Prevent email enumeration.
      return true;
    }

    if (user.emailVerified) {
      return true;
    }

    const verificationToken = generateRandomToken();
    const hashedToken = hashToken(verificationToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await models.EmailVerificationToken.create({
      userId: user.id,
      token: hashedToken,
      expiresAt
    });

    notificationOrchestrator.sendEmailVerificationEmail(user, verificationToken).catch((error) => {
      console.warn('verification resend email failed:', error.message);
    });

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
        usedAt: null,
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
      { passwordHash: hashedPassword },
      { where: { id: resetToken.userId } }
    );

    // Mark token as used
    resetToken.usedAt = new Date();
    await resetToken.save();

    // Revoke all refresh tokens for this user
    await models.RefreshToken.update(
      { revokedAt: new Date() },
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
      attributes: { exclude: ['password', 'passwordHash'] },
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

  /**
   * Verify 2FA code during login
   */
  async verify2FADuringLogin(userId, code) {
    const securityService = require('./securityService');
    
    // Verify 2FA code (TOTP or backup code)
    const result = await securityService.verify2FAToken(userId, code);
    
    // Get user
    const user = await models.User.findByPk(userId, {
      include: [
        { model: models.MentorProfile, as: 'mentorProfile' },
        { model: models.MenteeProfile, as: 'menteeProfile' },
        { model: models.AdminProfile, as: 'adminProfile' }
      ]
    });

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    // Generate full tokens
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
      refreshToken,
      twoFactorType: result.type
    };
  }
}

module.exports = new AuthService();
