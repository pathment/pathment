const { Op } = require('sequelize');
const { models } = require('../db');
const emailService = require('./emailService');
const pushService = require('./pushService');
const { shouldCreateNotification } = require('../utils/notificationPreferences');
const { NOTIFICATION_EVENTS, NOTIFICATION_MATRIX, resolveAudience } = require('../config/notificationMatrix');
const { renderEmail, plainText } = require('../utils/emailTemplate');
const { unsubscribeUrl } = require('../utils/emailUnsubscribe');
const { resetLink, verifyLink, signInLink, pageLink } = require('../utils/links');

const escHtml = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clientUrl = () => (process.env.CLIENT_URL || 'https://pathment.me').replace(/\/$/, '');

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

  /**
   * @param {boolean} [emailOnlyIfOffline] Send the email ONLY to recipients who
   *   have no live socket right now. Someone sitting in the app already got the
   *   bell (and a toast) the instant this fired — mailing them too is noise. Used
   *   for time-sensitive asks that need a nudge if the person isn't looking.
   *   Still subject to the user's email preferences and the global switches.
   */
  async dispatch({ eventKey, recipients, payload, dedupe = null, channelOverrides = null, emailOnlyIfOffline = false }) {
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
            audience: resolveAudience(eventKey, payload.actionUrl),
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
              audience: created.audience,
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

        // "Only if they're not here": a live socket means they're in the app and
        // already saw the bell. Presence is best-effort — if we can't tell, we
        // send (missing a time-sensitive email is worse than one extra email).
        let onlineNow = false;
        if (emailOnlyIfOffline) {
          try { onlineNow = require('../socket').isUserOnline(recipient.userId); } catch { onlineNow = false; }
        }

        if (notificationEmailEnabled && !isEventEmailDisabled && !shouldSkipByDedupe && allowedByPrefs && user.email && !onlineNow) {
          // ENQUEUE, don't send inline. The DB worker owns delivery + retries,
          // so a slow/failing Resend call never blocks the request or aborts the
          // recipient loop. Wrapped defensively for the same reason.
          const idemKey = payload.relatedEntityId
            ? `${eventKey}:${recipient.userId}:${payload.relatedEntityType || 'e'}:${payload.relatedEntityId}`
            : null;
          try {
            // Non-transactional mail → one-click unsubscribe + a rendered HTML
            // body (many events only carried plain text before, which looks poor
            // and scores worse for spam).
            const unsub = unsubscribeUrl(recipient.userId);
            const heading = payload.title || 'Pathment';
            const bodyText = payload.emailText || payload.message || '';
            // actionUrl is a relative path, because the bell and the mobile app
            // both want it that way. An email does not: `href="/mentor/clan-team"`
            // has no base to resolve against, which is why the button in every
            // task, deadline and approval email did nothing. Only the email copy
            // is made absolute; what is stored and what is pushed stay relative.
            const cta = { label: 'Open Pathment', url: pageLink(payload.actionUrl) };
            const html = payload.emailHtml || renderEmail({
              heading,
              bodyHtml: payload.emailBodyHtml || `<p style="margin:0 0 14px;">${escHtml(bodyText)}</p>`,
              cta,
              preheader: payload.emailPlainBody || bodyText,
              unsubscribeUrl: unsub,
            });
            const text = payload.emailText
              ? payload.emailText
              : plainText({ heading, bodyText: payload.emailPlainBody || bodyText, cta, unsubscribeUrl: unsub });
            await emailService.enqueue({
              to: user.email,
              subject: payload.emailSubject || payload.title,
              text,
              html,
              emailType: eventKey,
              recipientId: recipient.userId,
              idempotencyKey: idemKey,
              metadata: {
                relatedEntityType: payload.relatedEntityType || null,
                relatedEntityId: payload.relatedEntityId || null,
                listUnsubscribe: unsub || undefined,
              }
            });
          } catch (e) {
            console.error('[notify] enqueue failed for', user.email, e?.message);
          }
        }
      }

      // Push channel. The matrix carries no push flag, so push follows inApp:
      // anything worth a bell in the app is worth a buzz on the phone, and the
      // alternative is forty near-identical edits that would drift apart.
      //
      // Quiet hours ARE respected here and deliberately not for email, because a
      // buzz at 3am wakes someone and an email does not.
      if (channels.push ?? channels.inApp) {
        const pushAllowed = shouldCreateNotification(settings, preferenceKey, {
          checkEmail: false,
          checkPush: true,
          respectQuietHours: true
        }).should_create;

        if (!shouldSkipByDedupe && pushAllowed) {
          // Deliberately not awaited. A phone that could not be reached must
          // never fail, slow, or abort the thing that triggered the
          // notification: the submission is submitted either way.
          pushService
            .send([recipient.userId], {
              title: payload.title,
              body: payload.message,
              data: {
                actionUrl: payload.actionUrl || null,
                type: matrix.type,
                relatedEntityType: payload.relatedEntityType || null,
                relatedEntityId: payload.relatedEntityId || null
              }
            })
            .catch((e) => console.error('[Push] dispatch failed:', e.message));
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
    // No inline HTML: dispatch renders it through the shared template (with the
    // unsubscribe footer/header) from title + message + actionUrl.
    return this.dispatch({
      eventKey: NOTIFICATION_EVENTS.ACCOUNT_CREATED_WELCOME,
      recipients: [{ userId: user.id }],
      payload: {
        title: `Welcome to Pathment, ${user.firstName || 'there'}!`,
        message: `Your account is ready. Jump in to meet your mentor, follow your roadmap and start making progress.`,
        emailSubject: 'Welcome to Pathment',
        actionUrl: `${clientUrl()}/login`,
      }
    });
  }

  async sendPasswordResetEmail(user, resetToken) {
    const resetUrl = resetLink(resetToken);

    // Transactional security email: always send, no unsubscribe (a security email
    // must reach the user).
    const heading = 'Reset your password';
    return emailService.sendEmail({
      to: user.email,
      emailType: 'password_reset',
      subject: 'Reset your Pathment password',
      text: plainText({ heading, bodyText: `Hi ${user.firstName || 'there'}, use this secure link to reset your Pathment password. It expires soon and can be used once. If you didn't request this, ignore this email.`, cta: { label: 'Reset password', url: resetUrl } }),
      html: renderEmail({
        heading,
        bodyHtml: `<p style="margin:0 0 14px;">Hi ${escHtml(user.firstName || 'there')}, we got a request to reset your Pathment password. Click below to choose a new one.</p>`,
        cta: { label: 'Reset password', url: resetUrl },
        preheader: 'Reset your Pathment password',
        footerNote: "For your security this link expires soon and works once. Didn't request it? Ignore this email — your password stays the same.",
      }),
    });
  }

  /**
   * The link that signs somebody in.
   *
   * Transactional and never suppressed: somebody is waiting on this with the
   * app open. The wording is deliberately blunt about what the link does,
   * because a link that hands over a session is worth being able to recognise
   * when it arrives and nobody asked for it.
   */
  async sendSignInLinkEmail(user, linkToken) {
    const url = signInLink(linkToken);
    const heading = 'Your sign-in link';

    return emailService.sendEmail({
      to: user.email,
      emailType: 'sign_in_link',
      subject: 'Your Pathment sign-in link',
      text: plainText({
        heading,
        bodyText: `Hi ${user.firstName || 'there'}, this link signs you in to Pathment. It works once and expires in 15 minutes. If you did not ask for it, ignore this email and nothing happens.`,
        cta: { label: 'Sign in', url }
      }),
      html: renderEmail({
        heading,
        bodyHtml: `<p style="margin:0 0 14px;">Hi ${escHtml(user.firstName || 'there')}, tap below and you are in. No password needed.</p>`,
        cta: { label: 'Sign in', url },
        preheader: 'Your Pathment sign-in link',
        footerNote: "This link works once and expires in 15 minutes. Didn't ask for it? Ignore this email — nobody can sign in without opening the link."
      })
    });
  }

  async sendEmailVerificationEmail(user, verificationToken) {
    const verifyUrl = verifyLink(verificationToken);

    // Transactional auth email: always send, no unsubscribe.
    const heading = 'Verify your email';
    return emailService.sendEmail({
      to: user.email,
      emailType: 'email_verification',
      subject: 'Verify your Pathment email',
      text: plainText({ heading, bodyText: `Hi ${user.firstName || 'there'}, confirm your email to activate your Pathment account.`, cta: { label: 'Verify email', url: verifyUrl } }),
      html: renderEmail({
        heading,
        bodyHtml: `<p style="margin:0 0 14px;">Hi ${escHtml(user.firstName || 'there')}, you're almost set. Confirm your email address to activate your Pathment account.</p>`,
        cta: { label: 'Verify email', url: verifyUrl },
        preheader: 'Confirm your email to activate your account',
      }),
    });
  }

  /**
   * Applicant rejected — a courteous decision email with the reviewer's reason
   * (if any). Plain + transactional so it lands in Primary, not Promotions.
   */
  async sendApplicationRejectedEmail({ email, firstName, reason, programName, applicationId }) {
    const name = firstName ? firstName.trim() : 'there';
    const prog = programName ? ` for ${programName}` : '';
    const reasonText = reason ? `\n\nFeedback from the review team:\n${reason}\n` : '\n';
    const reasonHtml = reason
      ? `<p style="margin:0 0 14px;color:#475569;"><strong>Feedback from the review team:</strong><br>${escHtml(reason).replace(/\n/g, '<br>')}</p>`
      : '';
    const text =
      `Hi ${name},\n\n` +
      `Thank you for applying${prog}. After careful review, we're unable to offer you a place in this cohort.` +
      reasonText +
      `\nWe truly appreciate the effort you put in, and we'd welcome an application from you for a future cohort.\n\n` +
      `- The Pathment team`;
    return emailService.enqueue({
      to: email,
      emailType: 'application_rejected',
      priority: 3,
      idempotencyKey: `reject:${email.toLowerCase()}:${applicationId || reason || 'decided'}`,
      subject: `Your Pathment application${prog}`,
      text,
      html: `
        <div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; font-size: 15px; line-height: 1.6; max-width: 520px; margin: 0 auto; padding: 8px 4px;">
          <p style="margin: 0 0 14px;">Hi ${escHtml(name)},</p>
          <p style="margin: 0 0 14px;">Thank you for applying${escHtml(prog)}. After careful review, we're unable to offer you a place in this cohort.</p>
          ${reasonHtml}
          <p style="margin: 0 0 14px; color:#475569;">We truly appreciate the effort you put in, and we'd welcome an application from you for a future cohort.</p>
          <p style="margin: 18px 0 0; color: #475569;">- The Pathment team</p>
        </div>
      `
    });
  }

  async sendRegistrationInviteEmail({ email, role, inviteUrl, whatsappLink }) {
    // Intentionally plain + transactional (no banner image, no emoji, single CTA,
    // visible URL, strong text part) so Gmail keeps it in Primary, not Promotions.
    const whatsappText = whatsappLink
      ? `\nAfter you set up your account, join your clan's WhatsApp group:\n${whatsappLink}\n\n`
      : '';
    const text =
      `Hi,\n\n` +
      `You've been invited to set up your Pathment account as a ${role}.\n\n` +
      `Get started here:\n${inviteUrl}\n\n` +
      whatsappText +
      `This link is for you only, can be used once, and expires soon. ` +
      `If you weren't expecting this, you can ignore this email.\n\n` +
      `- The Pathment team`;

    return emailService.enqueue({
      to: email,
      // Account-access: an invited user can't log in until they set up via this
      // link, so it's treated as critical (top priority, bypasses the daily cap).
      emailType: 'registration_invite',
      priority: 1,
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
          ${whatsappLink ? `<p style="margin: 0 0 14px;">After setup, join your clan's WhatsApp group:<br><a href="${whatsappLink}" style="color:#0052D6; word-break:break-all;">${escHtml(whatsappLink)}</a></p>` : ''}
          <p style="margin: 0 0 14px; color: #64748b; font-size: 13px;">This link is for you only, can be used once, and expires soon. If you weren't expecting this, you can ignore this email.</p>
          <p style="margin: 18px 0 0; color: #475569;">- The Pathment team</p>
        </div>
      `
    });
  }
}

module.exports = new NotificationOrchestrator();
module.exports.NOTIFICATION_EVENTS = NOTIFICATION_EVENTS;
