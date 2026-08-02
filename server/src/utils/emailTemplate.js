/**
 * One shared, deliverability‑friendly email template.
 *
 * Why it looks the way it does (these all reduce spam scoring / render right):
 *  - table‑based layout + inline CSS (Outlook and most clients ignore <style>),
 *  - a hidden **preheader** (preview text) so inboxes don't show raw HTML,
 *  - a real **plain‑text** alternative is always sent alongside (see `plainText`),
 *  - a light, high‑contrast design (no image‑only emails, no link shorteners),
 *  - `color-scheme` meta so dark‑mode clients don't invert it oddly,
 *  - a footer with sender identity + (for non‑transactional mail) an unsubscribe.
 *
 * Usage:
 *   const { renderEmail, plainText } = require('../utils/emailTemplate');
 *   const html = renderEmail({ heading, bodyHtml, cta:{label,url}, preheader, unsubscribeUrl });
 *   const text = plainText({ heading, bodyText, cta, unsubscribeUrl });
 */

const BRAND = '#2563eb';
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const siteUrl = () => (process.env.CLIENT_URL || 'https://pathment.me').replace(/\/$/, '');
const footerAddress = () => process.env.EMAIL_FOOTER_ADDRESS || 'Pathment';

/**
 * @param {object} o
 * @param {string} o.heading        big headline in the body
 * @param {string} o.bodyHtml       inner HTML (paragraphs, lists) — already trusted markup
 * @param {{label:string,url:string}} [o.cta]   optional primary button
 * @param {string} [o.preheader]    hidden preview text (defaults to the heading)
 * @param {string} [o.footerNote]   small line above the standard footer
 * @param {string} [o.unsubscribeUrl] if set, shows an unsubscribe link (marketing/notification mail only)
 */
function renderEmail({ heading, bodyHtml, cta, preheader, footerNote, unsubscribeUrl } = {}) {
  const pre = esc(preheader || heading || 'Pathment');
  const year = new Date().getFullYear();
  const button = cta && cta.url
    ? `<tr><td align="center" style="padding:8px 0 4px;">
         <a href="${esc(cta.url)}" target="_blank"
            style="background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;line-height:1;padding:14px 30px;border-radius:8px;display:inline-block;">${esc(cta.label)}</a>
       </td></tr>`
    : '';
  const unsub = unsubscribeUrl
    ? `<p style="margin:10px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;">
         You get this because of your Pathment notification settings.
         <a href="${esc(unsubscribeUrl)}" target="_blank" style="color:#64748b;text-decoration:underline;">Unsubscribe</a> ·
         <a href="${esc(siteUrl())}/settings" target="_blank" style="color:#64748b;text-decoration:underline;">Manage preferences</a>
       </p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${esc(heading || 'Pathment')}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;-webkit-text-size-adjust:100%;">
  <!-- preheader (hidden) -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f1f5f9;font-size:1px;line-height:1px;">${pre}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background:${BRAND};padding:22px 24px;">
          <span style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:.3px;">Pathment</span>
        </td></tr>
        <tr><td style="padding:32px 32px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
          <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#0f172a;">${esc(heading || '')}</h1>
          <div style="font-size:15px;line-height:1.65;color:#475569;">${bodyHtml || ''}</div>
        </td></tr>
        ${button ? `<tr><td style="padding:8px 32px 24px;"><table role="presentation" width="100%"><tbody>${button}</tbody></table></td></tr>` : '<tr><td style="height:16px;"></td></tr>'}
        <tr><td style="padding:22px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;">
          ${footerNote ? `<p style="margin:0 0 8px;color:#64748b;font-size:13px;line-height:1.6;">${esc(footerNote)}</p>` : ''}
          <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
            &copy; ${year} ${esc(footerAddress())}. Sent by <a href="${esc(siteUrl())}" target="_blank" style="color:#64748b;text-decoration:underline;">pathment.me</a>.
          </p>
          ${unsub}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Build the plain-text alternative — always send this alongside the HTML. */
function plainText({ heading, bodyText, cta, unsubscribeUrl } = {}) {
  const lines = [];
  if (heading) lines.push(heading, '');
  if (bodyText) lines.push(String(bodyText).trim(), '');
  if (cta && cta.url) lines.push(`${cta.label || 'Open'}: ${cta.url}`, '');
  lines.push('—', 'Pathment · ' + siteUrl());
  if (unsubscribeUrl) lines.push(`Unsubscribe: ${unsubscribeUrl}`);
  return lines.join('\n');
}

module.exports = { renderEmail, plainText };
