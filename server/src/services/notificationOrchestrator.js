const { Op } = require('sequelize');
const { models } = require('../db');
const emailService = require('./emailService');
const { shouldCreateNotification } = require('../utils/notificationPreferences');
const { NOTIFICATION_EVENTS, NOTIFICATION_MATRIX } = require('../config/notificationMatrix');

class NotificationOrchestrator {
  isNotificationEmailEnabled() {
    const raw = String(process.env.EMAIL_NOTIFICATION_EMAILS_ENABLED || 'false').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
  }

  getDisabledEmailEvents() {
    const raw = process.env.EMAIL_DISABLED_EVENTS || '';
    return new Set(
      raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    );
  }

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

      const shouldSkipByDedupe = await this.shouldSkipByDedupe(recipient.userId, matrix.type, dedupe, payload);

      const settings = user.settings || null;
      const preferenceKey = matrix.preferenceKey;

      // In-app channel
      if (channels.inApp) {
        if (!shouldSkipByDedupe) {
          const created = await models.Notification.create({
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

          // Push it live so the recipient's bell updates without a refresh
          // (the client NotificationDrawer listens for 'notification:new').
          try {
            const { emitToUser } = require('../socket');
            emitToUser(recipient.userId, 'notification:new', {
              id: created.id,
              type: created.type,
              title: created.title,
              message: created.message,
              status: created.status,
              actionUrl: created.actionUrl,
              actionLabel: created.actionLabel,
              relatedEntityType: created.relatedEntityType,
              relatedEntityId: created.relatedEntityId,
              createdAt: created.createdAt
            });
          } catch (e) {
            console.error('[Notifications] socket emit failed:', e.message);
          }
        }
      }

      // Email channel
      if (channels.email) {
        const notificationEmailEnabled = this.isNotificationEmailEnabled();
        const isEventEmailDisabled = this.getDisabledEmailEvents().has(eventKey);
        const allowedByPrefs = shouldCreateNotification(settings, preferenceKey, {
          checkEmail: true,
          checkPush: false,
          respectQuietHours: false
        }).should_create;

        if (notificationEmailEnabled && !isEventEmailDisabled && !shouldSkipByDedupe && allowedByPrefs && user.email) {
          await emailService.sendEmail({
            to: user.email,
            subject: payload.emailSubject || payload.title,
            text: payload.emailText || payload.message,
            html: payload.emailHtml || null,
            emailType: eventKey,
            recipientId: recipient.userId,
            metadata: {
              relatedEntityType: payload.relatedEntityType || null,
              relatedEntityId: payload.relatedEntityId || null
            }
          });
        }
      }
    }

    return { delivered, skipped };
  }

  async shouldSkipByDedupe(userId, type, dedupe, payload = null) {
    const dedupeType = dedupe?.relatedEntityType || null;
    const dedupeId = dedupe?.relatedEntityId || null;
    const payloadType = payload?.relatedEntityType || null;
    const payloadId = payload?.relatedEntityId || null;

    const candidates = [
      dedupeType && dedupeId ? { relatedEntityType: dedupeType, relatedEntityId: dedupeId } : null,
      payloadType && payloadId ? { relatedEntityType: payloadType, relatedEntityId: payloadId } : null
    ].filter(Boolean);

    if (candidates.length === 0) {
      return false;
    }

    const existing = await models.Notification.findOne({
      where: {
        userId,
        type,
        [Op.or]: candidates
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
        emailText: `Hi ${user.firstName || ''}, welcome to Pathment. Start your learning journey today.`,
        emailHtml: `
          <div style="font-family: 'Inter', 'Segoe UI', sans-serif; background-color: #f8fafc; padding: 40px 20px; margin: 0;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); overflow: hidden;">
              <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 40px 20px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 700; letter-spacing: 0.5px;">Pathment</h1>
              </div>
              <div style="padding: 40px; color: #334155;">
                <h2 style="margin-top: 0; color: #0f172a; font-size: 24px;">Welcome aboard, ${user.firstName || 'there'}! 👋</h2>
                <p style="font-size: 16px; line-height: 1.6; color: #475569;">We are thrilled to have you join Pathment. Get ready to embark on an exciting learning journey with top mentors and structured paths.</p>
                <div style="text-align: center; margin: 35px 0;">
                  <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/login" style="background-color: #3b82f6; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.25);">Get Started Now</a>
                </div>
              </div>
              <div style="background-color: #f1f5f9; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0; color: #64748b; font-size: 14px;">&copy; ${new Date().getFullYear()} Pathment. All rights reserved.</p>
              </div>
            </div>
          </div>
        `
      }
    });
  }

  async sendPasswordResetEmail(user, resetToken) {
    const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

    // Transactional security email: always send regardless of notification preferences.
    return emailService.sendEmail({
      to: user.email,
      subject: 'Reset your Pathment password',
      text: `Hi ${user.firstName || ''}, use this secure link to reset your password: ${resetUrl}`,
      html: `
        <div style="font-family: 'Inter', 'Segoe UI', sans-serif; background-color: #f8fafc; padding: 40px 20px; margin: 0;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); overflow: hidden;">
            <div style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 700; letter-spacing: 0.5px;">Pathment</h1>
            </div>
            <div style="padding: 40px; color: #334155;">
              <h2 style="margin-top: 0; color: #0f172a; font-size: 24px;">Reset Password 🔒</h2>
              <p style="font-size: 16px; line-height: 1.6; color: #475569;">Hi ${user.firstName || 'there'}, we received a request to reset your password. It's okay, it happens to the best of us! Click the button below to choose a new one.</p>
              <div style="text-align: center; margin: 35px 0;">
                <a href="${resetUrl}" style="background-color: #8b5cf6; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(139, 92, 246, 0.25);">Reset Password</a>
              </div>
              <p style="font-size: 14px; color: #64748b; line-height: 1.5; margin-bottom: 0;">If you did not request this, please safely ignore this email.</p>
            </div>
            <div style="background-color: #f1f5f9; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #64748b; font-size: 14px;">&copy; ${new Date().getFullYear()} Pathment. All rights reserved.</p>
            </div>
          </div>
        </div>
      `
    });
  }

  async sendEmailVerificationEmail(user, verificationToken) {
    const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(verificationToken)}`;

    // Transactional auth email: always send regardless of notification preferences.
    return emailService.sendEmail({
      to: user.email,
      subject: 'Verify your Pathment email',
      text: `Hi ${user.firstName || ''}, verify your email by opening this link: ${verifyUrl}`,
      html: `
        <div style="font-family: 'Inter', 'Segoe UI', sans-serif; background-color: #f8fafc; padding: 40px 20px; margin: 0;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); overflow: hidden;">
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 700; letter-spacing: 0.5px;">Pathment</h1>
            </div>
            <div style="padding: 40px; color: #334155;">
              <h2 style="margin-top: 0; color: #0f172a; font-size: 24px;">Verify Your Email ✉️</h2>
              <p style="font-size: 16px; line-height: 1.6; color: #475569;">Hi ${user.firstName || 'there'}, you're almost ready to start! Please click the button below to verify your email address and activate your account.</p>
              <div style="text-align: center; margin: 35px 0;">
                <a href="${verifyUrl}" style="background-color: #10b981; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.25);">Verify Email Address</a>
              </div>
            </div>
            <div style="background-color: #f1f5f9; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #64748b; font-size: 14px;">&copy; ${new Date().getFullYear()} Pathment. All rights reserved.</p>
            </div>
          </div>
        </div>
      `
    });
  }

  async sendRegistrationInviteEmail({ email, role, inviteUrl }) {
    return emailService.sendEmail({
      to: email,
      subject: `You're invited to join Pathment as a ${role}`,
      text: `You were invited to join Pathment as a ${role}. Use this one-time invite link: ${inviteUrl}`,
      html: `
        <div style="font-family: 'Inter', 'Segoe UI', sans-serif; background-color: #f8fafc; padding: 40px 20px; margin: 0;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); overflow: hidden;">
            <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 700; letter-spacing: 0.5px;">Pathment</h1>
            </div>
            <div style="padding: 40px; color: #334155;">
              <h2 style="margin-top: 0; color: #0f172a; font-size: 24px;">You're Invited! 🎉</h2>
              <p style="font-size: 16px; line-height: 1.6; color: #475569;">Hello! You have been specially invited to join the Pathment community as a <strong>${role}</strong>. Tap the button below to accept your invitation and set up your profile.</p>
              <div style="text-align: center; margin: 35px 0;">
                <a href="${inviteUrl}" style="background-color: #f59e0b; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(245, 158, 11, 0.25);">Accept Invitation</a>
              </div>
              <p style="font-size: 14px; color: #64748b; line-height: 1.5; margin-bottom: 0;">Note: This is a secure, one-time use link that may expire.</p>
            </div>
            <div style="background-color: #f1f5f9; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #64748b; font-size: 14px;">&copy; ${new Date().getFullYear()} Pathment. All rights reserved.</p>
            </div>
          </div>
        </div>
      `
    });
  }
}

module.exports = new NotificationOrchestrator();
module.exports.NOTIFICATION_EVENTS = NOTIFICATION_EVENTS;
