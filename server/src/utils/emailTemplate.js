
/**
 * One shared, deliverability‑friendly email template.
 *
 * Why it looks the way it does (these all reduce spam scoring / render right):
 *  - table‑based layout + inline CSS (Outlook and most clients ignore <style>),
 *  - a hidden **preheader** (preview text) so inboxes don't show raw HTML,
 *  - a real **plain‑text** alternative is always sent alongside (see `plainText`),
 *  - a light, high‑contrast design (no image−only emails, no link shorteners),
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

function plainText({ heading, bodyText, cta, unsubscribeUrl } = {}) {
  const lines = [];
  if (heading) lines.push(heading, '');
  if (bodyText) lines.push(String(bodyText).trim(), '');
  if (cta && cta.url) lines.push(`${cta.label || 'Open'}: ${cta.url}`, '');
  lines.push('—', 'Pathment · ' + siteUrl());
  if (unsubscribeUrl) lines.push(`Unsubscribe: ${unsubscribeUrl}`);
  return lines.join('\n');
}

const escHtml = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function certificateAwardedEmail({ firstName, lastName, templateName, tier, tierDisplayName, imageUrl, certificateLink }) {
  const tierBg = tier === 'gold' ? '#f59e0b' : tier === 'silver' ? '#64748b' : '#b45309';
  return {
    subject: `Congratulations! Your certificate for "${templateName}" is ready`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; padding: 40px 20px; color: #1e293b;">
        <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <div style="background-color: #4f46e5; padding: 24px; text-align: center;">
            <span style="font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px;">PATHMENT</span>
          </div>

          <div style="padding: 32px 24px; text-align: center;">
            <div style="margin-bottom: 24px;">
              <span style="font-size: 24px; font-weight: 800; color: #1e293b; display: block; margin-bottom: 8px;">Congratulations, ${escHtml(firstName)}! 🎉</span>
              <p style="font-size: 14px; color: #64748b; margin: 0; font-weight: 500;">You have successfully earned a new program credential.</p>
            </div>

            ${imageUrl ? `
            <div style="margin: 24px 0; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);">
              <img src="${imageUrl}" alt="Certificate Preview" style="width: 100%; max-width: 100%; display: block; height: auto;" />
            </div>
            ` : ''}

            <div style="background-color: #f1f5f9; border-radius: 12px; padding: 16px; margin-bottom: 24px; text-align: left;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <tr>
                  <td style="color: #64748b; font-weight: 600; padding: 4px 0;">Credential Name:</td>
                  <td style="color: #1e293b; font-weight: 700; padding: 4px 0; text-align: right;">${escHtml(templateName)}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; font-weight: 600; padding: 4px 0;">Awarded Tier:</td>
                  <td style="color: #1e293b; font-weight: 700; padding: 4px 0; text-align: right; text-transform: uppercase; font-size: 11px;">
                    <span style="background-color: ${tierBg}; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-weight: 800;">${escHtml(tierDisplayName)}</span>
                  </td>
                </tr>
                <tr>
                  <td style="color: #64748b; font-weight: 600; padding: 4px 0;">Recipient:</td>
                  <td style="color: #1e293b; font-weight: 700; padding: 4px 0; text-align: right;">${escHtml(firstName)} ${escHtml(lastName)}</td>
                </tr>
              </table>
            </div>

            <div style="margin: 32px 0 16px 0;">
              <a href="${certificateLink}" target="_blank" style="background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 12px; font-size: 13px; font-weight: 700; box-shadow: 0 4px 6px rgba(79, 70, 229, 0.2); display: inline-block;">
                View in Dashboard
              </a>
            </div>

            <p style="font-size: 12px; color: #94a3b8; margin-top: 24px; font-weight: 500;">
              A print-ready official PDF version of your certificate is also attached to this email.
            </p>
          </div>

          <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; font-weight: 500;">
            <p style="margin: 0 0 8px 0;">© ${new Date().getFullYear()} Pathment Platform. All rights reserved.</p>
            <p style="margin: 0;">Keep pushing forward, build your roadmap, achieve greatness!</p>
          </div>
        </div>
      </div>
    `
  };
}

module.exports = { renderEmail, plainText, certificateAwardedEmail };
