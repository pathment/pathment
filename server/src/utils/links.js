/**
 * Every link we put in an email.
 *
 * They all go through one host, `LINK_URL`, because Android verifies app links
 * per host. If invites came from devweekends.pathment.me and resets from
 * microtechx.pathment.me, each new customer would need a new mobile build
 * before their links could open the app. Through one host, a new customer costs
 * nothing in the app: the tenant travels in the path.
 *
 * With LINK_URL unset this returns exactly what it always returned, so the code
 * can ship before the DNS does.
 */

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const stripSlash = (value) => String(value || '').replace(/\/$/, '');

const clientUrl = () => require('./applicationUrl')('http://localhost:3000');
const linkHost = () => stripSlash(process.env.LINK_URL || '');
const { getRequestContext } = require('./auditContext');

/**
 * Which workspace the current request belongs to. Request context is the source
 * of truth on the shared API; the environment fallback is only for maintenance
 * scripts and jobs that predate organization-aware workers.
 */
function tenantSlug(requested) {
  const contextual = String(requested || getRequestContext().organizationSlug || '').trim().toLowerCase();
  if (SLUG.test(contextual)) return contextual;
  const explicit = String(process.env.TENANT_SLUG || '').trim().toLowerCase();
  if (SLUG.test(explicit)) return explicit;
  const fallback = String(process.env.DEFAULT_WORKSPACE_SLUG || '').trim().toLowerCase();
  if (SLUG.test(fallback)) return fallback;

  try {
    const label = new URL(clientUrl()).hostname.split('.')[0].toLowerCase();
    if (SLUG.test(label) && label !== 'localhost') return label;
  } catch {
    // A malformed CLIENT_URL is not worth throwing over inside an email.
  }

  return 'app';
}

function through(kind, token, directPath, requestedSlug) {
  const slug = tenantSlug(requestedSlug);
  const host = linkHost();
  if (!host || !token) return `${clientUrl()}/w/${slug}${directPath}`;

  return `${host}/${kind}/${slug}/${encodeURIComponent(token)}`;
}

/** A single-use registration invite for joining an existing organization. */
const inviteLink = (token) =>
  through('i', token, `/register?invite=${encodeURIComponent(token || '')}`);

const resetLink = (token) =>
  through('r', token, `/reset-password?token=${encodeURIComponent(token || '')}`);

const verifyLink = (token, workspaceSlug) =>
  through('v', token, `/verify-email?token=${encodeURIComponent(token || '')}`, workspaceSlug);

/** A one-time sign-in link. Fifteen minutes, single use, straight into a session. */
const signInLink = (token) =>
  through('m', token, `/sign-in?link=${encodeURIComponent(token || '')}`);

/**
 * Where a notification points, made absolute.
 *
 * `actionUrl` is a relative path because the bell and the mobile app both want
 * it that way. An email does not: a relative href has no base to resolve
 * against, which is why the button in every task, deadline and approval email
 * has been dead. Absolute URLs are passed through, since a few callers already
 * build their own.
 */
function pageLink(path) {
  const value = typeof path === 'string' ? path.trim() : '';
  if (/^https?:\/\//i.test(value)) return value;

  // A single leading slash and no more, so `//evil.com` cannot smuggle a host in.
  const safe = value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard';

  const host = linkHost();
  const slug = tenantSlug();
  if (!host) return `${clientUrl()}/w/${slug}${safe}`;

  return `${host}/g/${slug}?to=${encodeURIComponent(safe)}`;
}

module.exports = { inviteLink, resetLink, verifyLink, signInLink, pageLink, tenantSlug };
