const { Resend } = require('resend');
const { Op } = require('sequelize');
const { models, sequelize } = require('../db');

class EmailService {
  constructor() {
    this.client = null;
    this.enabled = false;
    this.from = process.env.RESEND_FROM || process.env.EMAIL_FROM || 'Pathment <noreply@pathment.me>';
    this.replyTo = process.env.RESEND_REPLY_TO || process.env.EMAIL_REPLY_TO || null;
    this.init();
  }

  init() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.enabled = false;
      return;
    }

    this.client = new Resend(apiKey);
    this.enabled = true;
  }

  parsePositiveInt(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  getUtcStartOfDay(date = new Date()) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  async isWithinDailyLimits(recipientEmail) {
    const globalLimit = this.parsePositiveInt(process.env.EMAIL_DAILY_LIMIT, 100);
    const perRecipientLimit = this.parsePositiveInt(process.env.EMAIL_DAILY_LIMIT_PER_RECIPIENT, 20);
    const startOfDay = this.getUtcStartOfDay();

    const sentToday = await models.EmailQueue.count({
      where: {
        status: 'sent',
        sentAt: { [Op.gte]: startOfDay }
      }
    });

    if (sentToday >= globalLimit) {
      return { allowed: false, reason: 'global_daily_limit_reached' };
    }

    const sentToRecipientToday = await models.EmailQueue.count({
      where: {
        status: 'sent',
        recipientEmail,
        sentAt: { [Op.gte]: startOfDay }
      }
    });

    if (sentToRecipientToday >= perRecipientLimit) {
      return { allowed: false, reason: 'recipient_daily_limit_reached' };
    }

    return { allowed: true };
  }

  normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  /** Is this address on the suppression list? Returns the reason or null. */
  async isSuppressed(email) {
    const row = await models.SuppressedEmail.findOne({
      where: { email: this.normalizeEmail(email) }, attributes: ['reason']
    });
    return row ? row.reason : null;
  }

  /** Decide whether a send error is worth retrying. */
  classifyError(error) {
    const status = error?.statusCode || error?.status || error?.response?.status || error?.response?.statusCode;
    const blob = `${error?.name || ''} ${error?.message || ''} ${error?.response?.data?.name || ''}`.toLowerCase();
    // Permanent: validation, invalid recipient, auth/config — retrying won't help.
    if ([400, 401, 403, 404, 422].includes(Number(status))) return 'permanent';
    if (/invalid|validation|not a valid|unsubscribed|suppress|malformed|no recipients/.test(blob)) return 'permanent';
    // Transient: rate limit, server errors, network/timeouts — retry with backoff.
    if (Number(status) === 429 || (Number(status) >= 500 && Number(status) <= 599)) return 'transient';
    if (/timeout|etimedout|econn|enotfound|socket|network|rate.?limit|throttl|temporar/.test(blob)) return 'transient';
    // Unknown → retry a few times, then DLQ. Safer than dropping silently.
    return 'transient';
  }

  /** Exponential backoff with jitter: 60s, 2m, 4m… capped at 2h. */
  backoffMs(attempt) {
    const base = Math.min(2 * 60 * 60 * 1000, 60 * 1000 * Math.pow(2, Math.max(0, attempt - 1)));
    return base + Math.floor(Math.random() * 30 * 1000);
  }

  async _deliverViaResend(row, toList) {
    const payload = { from: this.from, to: toList, subject: row.subject, text: row.bodyText, html: row.bodyHtml };
    if (this.replyTo) payload.replyTo = this.replyTo;
    // Resend honors an idempotency key at the provider too (belt + suspenders).
    const opts = row.idempotencyKey ? { idempotencyKey: String(row.idempotencyKey).slice(0, 256) } : undefined;
    return opts ? this.client.emails.send(payload, opts) : this.client.emails.send(payload);
  }

  /**
   * Enqueue an email for the DB-backed worker to deliver. This is the ONE entry
   * point for all mail. Idempotent: an existing row with the same
   * idempotencyKey is never enqueued twice. With `mustSendNow` (transactional
   * auth mail) we attempt one immediate delivery; the worker owns retries either
   * way, so a failed inline attempt is never lost.
   */
  async enqueue({ to, subject, text, html, emailType = 'system', recipientId = null, metadata = null, idempotencyKey = null, priority = 5, mustSendNow = false }) {
    if (!to || !subject) return { queued: false, reason: 'invalid_payload' };
    const toList = (Array.isArray(to) ? to : [to]).map((x) => String(x).trim()).filter(Boolean);
    const primary = this.normalizeEmail(toList[0]);
    if (!primary) return { queued: false, reason: 'invalid_payload' };

    if (idempotencyKey) {
      const existing = await models.EmailQueue.findOne({ where: { idempotencyKey }, attributes: ['id', 'status'] });
      if (existing) return { queued: false, deduped: true, id: existing.id, status: existing.status };
    }

    let row;
    try {
      row = await models.EmailQueue.create({
        recipientId, recipientEmail: primary, subject,
        bodyHtml: html || null, bodyText: text || null, emailType,
        status: 'pending', priority,
        attemptCount: 0, maxAttempts: this.parsePositiveInt(process.env.EMAIL_MAX_ATTEMPTS, 5),
        nextAttemptAt: new Date(), idempotencyKey: idempotencyKey || null,
        metadata: { ...(metadata || {}), recipients: toList },
      });
    } catch (e) {
      // Race on the unique idempotency key → someone else already enqueued it.
      if (e?.name === 'SequelizeUniqueConstraintError' && idempotencyKey) {
        const existing = await models.EmailQueue.findOne({ where: { idempotencyKey }, attributes: ['id'] });
        return { queued: false, deduped: true, id: existing?.id };
      }
      throw e;
    }

    if (mustSendNow) {
      try { const r = await this.processRow(row); return { queued: true, id: row.id, ...r }; }
      catch { return { queued: true, id: row.id, sent: false }; }
    }
    return { queued: true, id: row.id, sent: false };
  }

  /**
   * Deliver ONE queue row: suppression check → send → categorize the outcome.
   * Transient failure → stay 'pending' with backoff. Permanent failure or
   * exhausted attempts → 'dead' (the DLQ). Never throws for expected outcomes.
   */
  async processRow(row) {
    const meta = row.metadata || {};
    const toList = Array.isArray(meta.recipients) && meta.recipients.length ? meta.recipients : [row.recipientEmail];
    const primary = this.normalizeEmail(toList[0]);
    const attempt = (row.attemptCount || 0) + 1;

    const suppressedReason = await this.isSuppressed(primary);
    if (suppressedReason) {
      await row.update({ status: 'dead', errorCategory: 'permanent', lastError: `suppressed:${suppressedReason}`, failedAt: new Date(), lastAttemptAt: new Date(), attemptCount: attempt });
      return { sent: false, reason: 'suppressed', dead: true };
    }

    if (!this.enabled) {
      console.log('[email:disabled]', { to: primary, subject: row.subject });
      await row.update({ status: 'dead', errorCategory: 'permanent', lastError: 'resend_not_configured', failedAt: new Date(), lastAttemptAt: new Date() });
      return { sent: false, reason: 'resend_not_configured', dead: true };
    }

    // Soft daily cap: defer to tomorrow rather than fail.
    const limit = await this.isWithinDailyLimits(primary);
    if (!limit.allowed) {
      await row.update({ status: 'pending', errorCategory: 'transient', lastError: limit.reason, nextAttemptAt: this.getUtcStartOfDay(new Date(Date.now() + 86400000)) });
      return { sent: false, reason: limit.reason, deferred: true };
    }

    try {
      const result = await this._deliverViaResend(row, toList);
      await row.update({
        status: 'sent', sentAt: new Date(), lastAttemptAt: new Date(), attemptCount: attempt,
        providerMessageId: result?.data?.id || null, errorCategory: null, lastError: null,
        metadata: { ...(row.metadata || {}), resendId: result?.data?.id || null, sentTo: toList },
      });
      return { sent: true, id: result?.data?.id || null };
    } catch (error) {
      const category = this.classifyError(error);
      const dead = category === 'permanent' || attempt >= (row.maxAttempts || 5);
      await row.update({
        status: dead ? 'dead' : 'pending',
        attemptCount: attempt, lastAttemptAt: new Date(),
        failedAt: dead ? new Date() : null,
        nextAttemptAt: dead ? null : new Date(Date.now() + this.backoffMs(attempt)),
        errorCategory: category, lastError: String(error?.message || 'email_send_failed').slice(0, 500),
      });
      return { sent: false, reason: error?.message, category, dead };
    }
  }

  /** Reset rows wedged in 'sending' (worker died mid-send) back to pending. */
  async reapStuck() {
    await sequelize.query(`UPDATE email_queue SET status='pending', next_attempt_at=NOW(), updated_at=NOW()
      WHERE status='sending' AND last_attempt_at < NOW() - INTERVAL '10 minutes'`);
  }

  /** Atomically claim a batch of due rows (FOR UPDATE SKIP LOCKED = multi-worker safe). */
  async claimDue(batchSize = 20) {
    const [rows] = await sequelize.query(`
      UPDATE email_queue SET status='sending', last_attempt_at=NOW(), updated_at=NOW()
      WHERE id IN (
        SELECT id FROM email_queue
        WHERE status='pending' AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
        ORDER BY priority ASC, next_attempt_at ASC NULLS FIRST
        LIMIT :batch
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id`, { replacements: { batch: batchSize } });
    const ids = (rows || []).map((r) => r.id);
    if (!ids.length) return [];
    return models.EmailQueue.findAll({ where: { id: ids } });
  }

  /** One worker tick: reap, claim a batch, deliver each. */
  async processBatch(batchSize = 20) {
    await this.reapStuck();
    const rows = await this.claimDue(batchSize);
    let sent = 0, failed = 0, dead = 0;
    for (const row of rows) {
      try {
        const r = await this.processRow(row);
        if (r.sent) sent++; else if (r.dead) dead++; else failed++;
      } catch (e) {
        failed++;
        // Unexpected error: don't leave it stuck in 'sending'.
        try { await row.update({ status: 'pending', nextAttemptAt: new Date(Date.now() + this.backoffMs((row.attemptCount || 0) + 1)), lastError: String(e?.message || 'worker_error').slice(0, 500) }); } catch { /* noop */ }
      }
    }
    return { claimed: rows.length, sent, failed, dead };
  }

  /**
   * Back-compat entry point for transactional callers (verification, password
   * reset, magic links). Enqueues + attempts immediate delivery, returning the
   * familiar { sent } shape. The worker still owns retries.
   */
  async sendEmail({ to, subject, text, html, emailType = 'system', recipientId = null, metadata = null, idempotencyKey = null, priority = 1 }) {
    return this.enqueue({ to, subject, text, html, emailType, recipientId, metadata, idempotencyKey, priority, mustSendNow: true });
  }
}

module.exports = new EmailService();
