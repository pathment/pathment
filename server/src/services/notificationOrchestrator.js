const { Op } = require('sequelize');
const { models } = require('../db');
const emailService = require('./emailService');
const { shouldCreateNotification } = require('../utils/notificationPreferences');
const { NOTIFICATION_EVENTS, NOTIFICATION_MATRIX } = require('../config/notificationMatrix');

class NotificationOrchestrator {
  isNotificationEmailEnabled() {
    const raw = String(process.env.EMAIL_NOTIFICATION_EMAILS_ENABLED || '').trim().toLowerCase();
    // Explicit kill-switch wins either way.
    if (raw === '0' || raw === 'false' || raw === 'no') return false;
    if (raw === '1' || raw === 'true' || raw === 'yes') return true;
    // Default: ON when Resend is configured (e.g. the Pro plan), OFF otherwise -
    // so important notification emails work out of the box without extra config.
    return Boolean(process.env.RESEND_API_KEY);
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
          // ENQUEUE, don't send inline. The DB worker owns delivery + retries,
          // so a slow/failing Resend call never blocks the request or aborts the
          // recipient loop. Wrapped defensively for the same reason.
          const idemKey = payload.relatedEntityId
            ? `${eventKey}:${recipient.userId}:${payload.relatedEntityType || 'e'}:${payload.relatedEntityId}`
            : null;
          try {
            await emailService.enqueue({
              to: user.email,
              subject: payload.emailSubject || payload.title,
              text: payload.emailText || payload.message,
              html: payload.emailHtml || null,
              emailType: eventKey,
              recipientId: recipient.userId,
              idempotencyKey: idemKey,
              metadata: {
                relatedEntityType: payload.relatedEntityType || null,
                relatedEntityId: payload.relatedEntityId || null
              }
            });
          } catch (e) {
            console.error('[notify] enqueue failed for', user.email, e?.message);
          }
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
    // Intentionally plain + transactional (no banner image, no emoji, single CTA,
    // visible URL, strong text part) so Gmail keeps it in Primary, not Promotions.
    const text =
      `Hi,\n\n` +
      `You've been invited to set up your Pathment account as a ${role}.\n\n` +
      `Get started here:\n${inviteUrl}\n\n` +
      `This link is for you only, can be used once, and expires soon. ` +
      `If you weren't expecting this, you can ignore this email.\n\n` +
      `- The Pathment team`;

    return emailService.enqueue({
      to: email,
      emailType: 'registration_invite',
      priority: 3,
      idempotencyKey: `invite:${email.toLowerCase()}:${inviteUrl.split('invite=')[1] || inviteUrl}`,
      subject: `Set up your Pathment account`,
      text,
      html: `
        <div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; font-size: 15px; line-height: 1.6; max-width: 520px; margin: 0 auto; padding: 8px 4px;">
          <p style="margin: 0 0 14px;">Hi,</p>
          <p style="margin: 0 0 14px;">You've been invited to set up your <strong>Pathment</strong> account as a ${role}. Use the link below to get started:</p>
          <p style="margin: 0 0 18px;">
            <a href="${inviteUrl}" style="color: #0052D6; font-weight: 600; text-decoration: underline;">Set up my account</a>
          </p>
          <p style="margin: 0 0 14px; color: #475569;">Or paste this link into your browser:<br>
            <a href="${inviteUrl}" style="color: #0052D6; word-break: break-all;">${inviteUrl}</a>
          </p>
          <p style="margin: 0 0 14px; color: #64748b; font-size: 13px;">This link is for you only, can be used once, and expires soon. If you weren't expecting this, you can ignore this email.</p>
          <p style="margin: 18px 0 0; color: #475569;">- The Pathment team</p>
        </div>
      `
    });
  }
}

module.exports = new NotificationOrchestrator();
module.exports.NOTIFICATION_EVENTS = NOTIFICATION_EVENTS;
