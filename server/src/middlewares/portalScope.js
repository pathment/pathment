/**
 * portalScope - which hat is the caller wearing right now?
 *
 * A person can hold several roles at once: lead mentor of one clan, co-mentor
 * of a second, and a learner in a third. Until now the client knew which portal
 * the user had open (`/mentee/...` vs `/mentor/...`) and the server did not, so
 * every "my stuff" endpoint answered with the UNION of every hat - a mentor's
 * own Roadblocks page listed their mentees' roadblocks, and their mentee inbox
 * listed the conversations they hold as a mentor. The portal is a real part of
 * the question being asked, so it travels with the request.
 *
 *   X-Portal-Role  'mentee' | 'mentor' | 'admin'   the portal the user is in
 *   X-Active-Clan  <uuid> | 'all'                  the mentor clan selector
 *
 * This middleware only PARSES (no DB, no I/O) - `req.portal` is a stated
 * preference, not a grant. It can only ever NARROW what a user sees: every
 * consumer still runs the same authorization it ran before, and a portal the
 * user does not actually hold resolves to nothing rather than to more. Routes
 * that ignore `req.portal` behave exactly as they did.
 */
const PORTAL_ROLES = ['mentee', 'mentor', 'admin'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 'all' and anything that is not a uuid mean "no clan filter". */
function parseClanId(raw) {
  const value = String(raw || '').trim();
  return UUID_RE.test(value) ? value : null;
}

function portalScope(req, res, next) {
  const role = String(req.headers['x-portal-role'] || '').trim().toLowerCase();
  req.portal = {
    role: PORTAL_ROLES.includes(role) ? role : null,
    clanId: parseClanId(req.headers['x-active-clan'])
  };
  next();
}

/** The portal off a request, safe on requests that never went through the middleware. */
const portalOf = (req) => (req && req.portal) || { role: null, clanId: null };

/** Explicit query/body wins; otherwise the parsed X-Active-Clan header. */
function requestedClanId(req) {
  const fromBody = req && req.body && req.body.clanId;
  const fromQuery = req && req.query && req.query.clanId;
  return parseClanId(fromBody || fromQuery || portalOf(req).clanId);
}

module.exports = portalScope;
module.exports.portalOf = portalOf;
module.exports.requestedClanId = requestedClanId;
module.exports.PORTAL_ROLES = PORTAL_ROLES;
