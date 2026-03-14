const { models } = require('../db');
const emailService = require('./emailService');
const { shouldCreateNotification } = require('../utils/notificationPreferences');
const { NOTIFICATION_EVENTS, NOTIFICATION_MATRIX } = require('../config/notificationMatrix');

class NotificationOrchestrator {
  async dispatch({ eventKey, recipients, payload, dedupe = null, channelOverrides = null }) {
    const matrix = NOTIFICATION_MATRIX[eventKey];
    if (!matrix || !Array.isArray(recipients) || recipients.length === 0) {
      return { delivered: 0, skipped: recipients?.length || 0 };
    }

    const channels = channelOverrides
      ? { ...matrix.channels, ...channelOverrides }
      : matrix.channels;

    const recipientIds = [...new Set(recipients.map((r) => r.userId).filter(Boolean))];
    if (recipientIds.length === 0) {
      return { delivered: 0, skipped: 0 };
    }

    const users = await models.User.findAll({
      where: { id: recipientIds },
      attributes: ['id', 'email', 'firstName', 'lastName', 'role', 'status'],
      include: [{
        model: models.UserSettings,
        as: 'settings',
        required: false,
        attributes: ['emailNotifications', 'quietHours']
      }]
    });

    const userById = new Map(users.map((u) => [u.id, u]));
    let delivered = 0;
    let skipped = 0;

    for (const recipient of recipients) {
      const user = userById.get(recipient.userId);
      if (!user || user.status !== 'active') {
        skipped += 1;
        continue;
      }

      const settings = user.settings || null;
      const preferenceKey = matrix.preferenceKey;

      // In-app channel
      if (channels.inApp) {
        const shouldSkipInApp = await this.shouldSkipByDedupe(recipient.userId, matrix.type, dedupe);
        if (!shouldSkipInApp) {
          await models.Notification.create({
            userId: recipient.userId,
            type: matrix.type,
            title: payload.title,
            message: payload.message,
            actionUrl: payload.actionUrl || null,
            actionLabel: payload.actionLabel || null,
            relatedEntityType: payload.relatedEntityType || null,
            relatedEntityId: payload.relatedEntityId || null,
            status: 'unread'
          });
          delivered += 1;
        }
      }

      // Email channel
      if (channels.email) {
        const allowedByPrefs = shouldCreateNotification(settings, preferenceKey, {
          checkEmail: true,
          checkPush: false,
          respectQuietHours: false
        }).should_create;

        if (allowedByPrefs && user.email) {
          await emailService.sendEmail({
            to: user.email,
            subject: payload.emailSubject || payload.title,
            text: payload.emailText || payload.message,
            html: payload.emailHtml || null
          });
        }
      }

    }

    return { delivered, skipped };
  }

  async shouldSkipByDedupe(userId, type, dedupe) {
    if (!dedupe?.relatedEntityType || !dedupe?.relatedEntityId) {
      return false;
    }

    const existing = await models.Notification.findOne({
      where: {
        userId,
        type,
        relatedEntityType: dedupe.relatedEntityType,
        relatedEntityId: dedupe.relatedEntityId
      },
      attributes: ['id']
    });

    return Boolean(existing);
  }

  async sendWelcomeEmail(user) {
    return this.dispatch({
      eventKey: NOTIFICATION_EVENTS.ACCOUNT_CREATED_WELCOME,
      recipients: [{ userId: user.id }],
      payload: {
        title: 'Welcome to Pathment',
        message: `Welcome ${user.firstName || 'there'}! Your account is now ready.`,
        emailSubject: 'Welcome to Pathment',
        emailText: `Hi ${user.firstName || ''}, welcome to Pathment. Start your learning journey today.`
      }
    });
  }

  async sendPasswordResetEmail(user, resetToken) {
    const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

    return this.dispatch({
      eventKey: NOTIFICATION_EVENTS.PASSWORD_RESET,
      recipients: [{ userId: user.id }],
      payload: {
        title: 'Password reset request',
        message: 'A password reset was requested for your account.',
        emailSubject: 'Reset your Pathment password',
        emailText: `Use this link to reset your password: ${resetUrl}`
      }
    });
  }
}

module.exports = new NotificationOrchestrator();
module.exports.NOTIFICATION_EVENTS = NOTIFICATION_EVENTS;
