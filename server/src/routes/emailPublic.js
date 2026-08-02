/**
 * Public (no-auth) email endpoints — the one-click unsubscribe target for the
 * List-Unsubscribe header. Both GET (human clicks the link) and POST (Gmail/Yahoo
 * one-click, RFC 8058) turn the user's notification email off.
 */
const express = require('express');
const router = express.Router();
const { models } = require('../db');
const { userIdFromToken } = require('../utils/emailUnsubscribe');

async function unsubscribe(userId) {
  if (!userId) return false;
  const [settings] = await models.UserSettings.findOrCreate({ where: { userId }, defaults: { userId } });
  const current = settings.emailNotifications && typeof settings.emailNotifications === 'object' ? settings.emailNotifications : {};
  await settings.update({ emailNotifications: { ...current, enabled: false } });
  return true;
}

// One-click (mail-provider POST). Must be fast and return 2xx.
router.post('/unsubscribe', async (req, res) => {
  const uid = userIdFromToken(req.query.token || (req.body && req.body.token));
  try { await unsubscribe(uid); } catch { /* still 200 — never make a provider retry */ }
  res.status(200).send('OK');
});

// Human click — unsubscribe + a tiny confirmation page.
router.get('/unsubscribe', async (req, res) => {
  const uid = userIdFromToken(req.query.token);
  let ok = false;
  try { ok = await unsubscribe(uid); } catch { ok = false; }
  const manage = `${(process.env.CLIENT_URL || 'https://pathment.me').replace(/\/$/, '')}/settings`;
  res.status(200).type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;margin:0;padding:48px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:32px;text-align:center;">
    <div style="color:#2563eb;font-size:20px;font-weight:700;margin-bottom:16px;">Pathment</div>
    ${ok
      ? `<h1 style="font-size:20px;color:#0f172a;margin:0 0 8px;">You're unsubscribed</h1>
         <p style="color:#475569;font-size:15px;line-height:1.6;">You'll no longer get notification emails from Pathment. Security emails (password reset, verification) still send.</p>`
      : `<h1 style="font-size:20px;color:#0f172a;margin:0 0 8px;">Link expired</h1>
         <p style="color:#475569;font-size:15px;line-height:1.6;">This unsubscribe link is no longer valid. You can manage email settings from your account.</p>`}
    <p style="margin-top:20px;"><a href="${manage}" style="color:#2563eb;">Manage email preferences</a></p>
  </div>
</body></html>`);
});

module.exports = router;
