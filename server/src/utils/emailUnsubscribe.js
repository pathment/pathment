/**
 * Signed, no-login unsubscribe links for notification email.
 *
 * The token uses `uid` (not `id`) so it can NEVER be replayed as an access token
 * (the auth middleware reads `id` → would resolve no user). It also carries a
 * `purpose` we verify. Long-lived because email links live in inboxes for months.
 *
 * The unsubscribe URL points at the API (needs `API_PUBLIC_URL`), which handles
 * both a human GET and the one-click POST that Gmail/Yahoo send.
 */
const jwt = require('jsonwebtoken');

const PURPOSE = 'email_unsubscribe';

function apiBase() {
  return (process.env.API_PUBLIC_URL || 'https://api-devweekends.pathment.me').replace(/\/$/, '');
}

/** Build the unsubscribe URL for a user (or null if we can't). */
function unsubscribeUrl(userId) {
  if (!userId || !process.env.JWT_SECRET) return null;
  const token = jwt.sign({ uid: userId, purpose: PURPOSE }, process.env.JWT_SECRET, { expiresIn: '400d' });
  return `${apiBase()}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Verify a token → the user id, or null. */
function userIdFromToken(token) {
  try {
    const d = jwt.verify(String(token || ''), process.env.JWT_SECRET);
    return d && d.purpose === PURPOSE && d.uid ? d.uid : null;
  } catch { return null; }
}

module.exports = { unsubscribeUrl, userIdFromToken };
