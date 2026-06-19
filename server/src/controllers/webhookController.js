const crypto = require('crypto');
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
 * Auth: Resend signs with Svix (headers svix-id / svix-timestamp / svix-signature,
 * an HMAC-SHA256 over the RAW body). Set RESEND_WEBHOOK_SECRET to the dashboard
 * "Signing Secret" (the `whsec_…` value) and we verify the signature. If the env
 * value is NOT a whsec secret we treat it as a legacy shared secret (header
 * `x-webhook-secret` or `?secret=`) for backward compatibility. If unset (dev),
 * we accept unauthenticated.
 *
 * NOTE: the previous version only did the shared-secret check — Resend never
 * sends that header, so a set secret rejected every real event (401) and Resend
 * disabled the endpoint. Verifying the Svix signature is the actual fix.
 */

/** Verify a Svix-signed webhook against the raw body. */
function verifySvixSignature(req, signingSecret) {
  const id = req.headers['svix-id'];
  const timestamp = req.headers['svix-timestamp'];
  const signatureHeader = req.headers['svix-signature'];
  if (!id || !timestamp || !signatureHeader) return false;

  // Replay guard: reject timestamps more than 5 minutes from now.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const body = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
  const signedContent = `${id}.${timestamp}.${body}`;
  const key = Buffer.from(signingSecret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(signedContent).digest('base64');

  // Header is a space-separated list of "v1,<base64sig>"; any match passes.
  return signatureHeader.split(' ').some((part) => {
    const sig = part.split(',')[1];
    if (!sig || sig.length !== expected.length) return false;
    try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); }
    catch { return false; }
  });
}
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
  // Auth gate. whsec_… → verify the Svix signature; anything else → legacy
  // shared secret; unset → open (dev).
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret) {
    const ok = secret.startsWith('whsec_')
      ? verifySvixSignature(req, secret)
      : (req.headers['x-webhook-secret'] === secret || req.query.secret === secret);
    if (!ok) return res.status(401).json({ ok: false, error: 'unauthorized' });
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
