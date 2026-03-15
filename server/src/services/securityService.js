const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { models, Sequelize } = require('../db');
const { NotFoundError, ValidationError, UnauthorizedError } = require('../utils/errors/errorTypes');
const { Op } = Sequelize;

class SecurityService {
  /**
   * Get user's active sessions
   */
  async getActiveSessions(userId) {
    const sessions = await models.UserSession.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      attributes: [
        'id',
        'ipAddress',
        'deviceType',
        'userAgent',
        'createdAt',
        'lastActivityAt',
        'isActive'
      ]
    });

    return sessions;
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(userId, sessionId) {
    const session = await models.UserSession.findOne({
      where: { id: sessionId, userId }
    });

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    await session.destroy();
    return { success: true };
  }

  /**
   * Revoke all other sessions (keep current session active)
   */
  async revokeAllOtherSessions(userId, currentSessionId) {
    await models.UserSession.destroy({
      where: {
        userId,
        id: { [Op.ne]: currentSessionId }
      }
    });

    return { success: true };
  }

  /**
   * Get user's audit logs
   */
  async getAuditLogs(userId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const logs = await models.AuditLog.findAndCountAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      attributes: [
        'id',
        'action',
        'entityType',
        'entityId',
        'oldValues',
        'newValues',
        'ipAddress',
        'userAgent',
        'createdAt'
      ]
    });

    return {
      total: logs.count,
      logs: logs.rows
    };
  }

  /**
   * Initiate 2FA setup
   */
  async setup2FA(userId) {
    const user = await models.User.findByPk(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Generate secret for 2FA
    const secret = speakeasy.generateSecret({
      name: `Pathment (${user.email})`,
      issuer: 'Pathment',
      length: 32
    });

    // Generate QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);

    // Store temporary secret (not yet confirmed)
    const temporarySecret = crypto.randomBytes(32).toString('hex');

    // Reuse existing row (including soft-deleted) to avoid unique constraint on user_id.
    const existingTwoFactor = await models.TwoFactorAuth.findOne({
      where: { userId },
      paranoid: false
    });

    if (existingTwoFactor) {
      if (existingTwoFactor.deletedAt) {
        await existingTwoFactor.restore();
      }

      existingTwoFactor.secret = secret.base32;
      existingTwoFactor.qrCode = qrCode;
      existingTwoFactor.backupCodes = this.generateBackupCodes();
      existingTwoFactor.isVerified = false;
      existingTwoFactor.enabledAt = null;
      existingTwoFactor.temporarySecret = temporarySecret;
      await existingTwoFactor.save();
    } else {
      await models.TwoFactorAuth.create({
        userId,
        secret: secret.base32,
        qrCode,
        backupCodes: this.generateBackupCodes(),
        isVerified: false,
        temporarySecret // For verification purposes
      });
    }

    return {
      secret: secret.base32,
      qrCode,
      manualEntryKey: secret.base32
    };
  }

  /**
   * Verify and enable 2FA
   */
  async verify2FA(userId, token, backupCode = null) {
    const twoFactorAuth = await models.TwoFactorAuth.findOne({
      where: { userId, isVerified: false }
    });

    if (!twoFactorAuth) {
      throw new ValidationError('2FA setup not initiated. Please start setup first.');
    }

    // Verify the token
    const isValid = speakeasy.totp.verify({
      secret: twoFactorAuth.secret,
      encoding: 'base32',
      token,
      window: 2
    });

    if (!isValid) {
      throw new ValidationError('Invalid verification code. Please try again.');
    }

    // Mark as verified
    twoFactorAuth.isVerified = true;
    twoFactorAuth.enabledAt = new Date();
    await twoFactorAuth.save();

    // Update user's 2FA status
    await models.User.update(
      { twoFactorEnabled: true },
      { where: { id: userId } }
    );

    return {
      success: true,
      backupCodes: twoFactorAuth.backupCodes,
      message: 'Two-factor authentication enabled successfully'
    };
  }

  /**
   * Disable 2FA
   */
  async disable2FA(userId) {
    const twoFactorAuth = await models.TwoFactorAuth.findOne({
      where: { userId, isVerified: true }
    });

    if (!twoFactorAuth) {
      throw new NotFoundError('2FA is not enabled for this user');
    }

    // Do not soft-delete here because user_id is unique and would block future setup.
    twoFactorAuth.isVerified = false;
    twoFactorAuth.enabledAt = null;
    twoFactorAuth.temporarySecret = null;
    await twoFactorAuth.save();

    // Update user's 2FA status
    await models.User.update(
      { twoFactorEnabled: false },
      { where: { id: userId } }
    );

    return { success: true, message: '2FA disabled successfully' };
  }

  /**
   * Verify 2FA token during login
   */
  async verify2FAToken(userId, token) {
    const twoFactorAuth = await models.TwoFactorAuth.findOne({
      where: { userId, isVerified: true }
    });

    if (!twoFactorAuth) {
      throw new ValidationError('2FA not enabled for this user');
    }

    // Check if it's a backup code
    if (twoFactorAuth.backupCodes && twoFactorAuth.backupCodes.includes(token)) {
      // Remove used backup code
      twoFactorAuth.backupCodes = twoFactorAuth.backupCodes.filter(code => code !== token);
      await twoFactorAuth.save();
      return { success: true, type: 'backup_code' };
    }

    // Verify the TOTP token
    const isValid = speakeasy.totp.verify({
      secret: twoFactorAuth.secret,
      encoding: 'base32',
      token,
      window: 2
    });

    if (!isValid) {
      throw new UnauthorizedError('Invalid 2FA token');
    }

    return { success: true, type: 'totp' };
  }

  /**
   * Get 2FA status
   */
  async get2FAStatus(userId) {
    const user = await models.User.findByPk(userId, {
      attributes: ['id', 'twoFactorEnabled']
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const twoFactorAuth = await models.TwoFactorAuth.findOne({
      where: { userId, isVerified: true },
      attributes: ['enabledAt', 'backupCodes']
    });

    return {
      enabled: user.twoFactorEnabled,
      enabledAt: twoFactorAuth?.enabledAt || null,
      remainingBackupCodes: twoFactorAuth?.backupCodes?.length || 0
    };
  }

  /**
   * Generate backup codes for 2FA
   */
  generateBackupCodes(count = 10) {
    const codes = [];
    for (let i = 0; i < count; i++) {
      codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }
    return codes;
  }

  /**
   * Regenerate backup codes (when they run out)
   */
  async regenerateBackupCodes(userId) {
    const twoFactorAuth = await models.TwoFactorAuth.findOne({
      where: { userId, isVerified: true }
    });

    if (!twoFactorAuth) {
      throw new NotFoundError('2FA not enabled for this user');
    }

    // Generate new backup codes
    const newCodes = this.generateBackupCodes();
    twoFactorAuth.backupCodes = newCodes;
    await twoFactorAuth.save();

    return {
      success: true,
      backupCodes: newCodes,
      message: 'New backup codes generated successfully. Please save them in a safe place.'
    };
  }
}

module.exports = new SecurityService();
