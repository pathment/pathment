const { models, sequelize } = require('../db');

/**
 * Resend delivery webhooks. The send call returning 200 only means Resend
 * accepted the message — whether it was actually delivered (or hard-bounced, or
 * marked spam) arrives LATER, here. This is the real answer to "why did a mail
 * fail." On a hard bounce or complaint we suppress the address so we stop
 * mailing it; repeatedly hitting dead addresses is what wrecks domain
 * deliverability for everyone else.
 *
 * POST /webhooks/resend
 *
 * Auth: Resend signs with Svix. We don't pull in the svix dep here; instead, if
 * RESEND_WEBHOOK_SECRET is set we require it as a shared secret (header
 * `x-webhook-secret` or `?secret=`). Set that secret in the Resend dashboard URL
 * and the env. If unset (dev), we accept unauthenticated.
 */
async function suppress(email, reason, detail) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return;
  const [row, created] = await models.SuppressedEmail.findOrCreate({
    where: { email: normalized },
    defaults: { email: normalized, reason, detail: detail || null, source: 'resend_webhook' },
  });
  if (!created) {
    await row.update({ reason, detail: detail || row.detail, source: 'resend_webhook' });
  }
}

exports.handleResendWebhook = async (req, res) => {
  // Optional shared-secret gate.
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers['x-webhook-secret'] || req.query.secret;
    if (provided !== secret) return res.status(401).json({ ok: false, error: 'bad_secret' });
  }

  const event = req.body || {};
  const type = event.type || event.event;
  const data = event.data || {};
  const recipients = Array.isArray(data.to) ? data.to : (data.to ? [data.to] : []);
  const messageId = data.email_id || data.id || null;

  try {
    switch (type) {
      case 'email.bounced': {
        // Only HARD bounces are permanent. Soft bounces (mailbox full, greylist)
        // are transient — let the queue's normal retry handle them.
        const bounceType = (data.bounce?.type || data.bounce_type || '').toLowerCase();
        const isHard = !bounceType || /hard|permanent|undetermined|suppress|invalid/.test(bounceType);
        if (isHard) {
          for (const r of recipients) await suppress(r, 'bounce', `hard bounce${bounceType ? `: ${bounceType}` : ''}`);
        }
        break;
      }
      case 'email.complained': {
        for (const r of recipients) await suppress(r, 'complaint', 'marked as spam');
        break;
      }
      case 'email.delivered': {
        // Best-effort: stamp the matching queue row as confirmed-delivered.
        if (messageId) {
          await models.EmailQueue.update(
            { metadata: sequelize.literal(`COALESCE(metadata,'{}'::jsonb) || '{"delivered":true}'::jsonb`) },
            { where: { providerMessageId: messageId } }
          );
        }
        break;
      }
      default:
        // Other events (email.sent, email.opened, …) — ignore for now.
        break;
    }
  } catch (e) {
    // Never make Resend retry the webhook for our internal error; just log it.
    console.error('[resend-webhook] processing error:', e?.message);
  }

  // Always 200 so Resend doesn't hammer retries.
  res.status(200).json({ ok: true });
};
