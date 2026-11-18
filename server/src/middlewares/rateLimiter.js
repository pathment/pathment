// `ipKeyGenerator` normalises IPv6 to the right prefix. Keying on a raw req.ip
// would treat every address in a subscriber's /64 as a separate client, so the
// limit would be trivially bypassed by anyone with a v6 allocation.
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const config = require('../config');

/**
 * Build a limiter that returns a STRUCTURED 429 ({ success, message, retryAfter })
 * instead of express-rate-limit's plain-string body — so the client can show a
 * real "try again in N seconds" countdown rather than a misleading generic error.
 */
function make({
  windowMs, max, message, skipSuccessfulRequests = true, skipFailedRequests = false,
  keyGenerator, skip,
}) {
  return rateLimit({
    windowMs,
    max,
    skipSuccessfulRequests,
    skipFailedRequests,
    ...(keyGenerator ? { keyGenerator } : {}),
    ...(skip ? { skip } : {}),
    standardHeaders: true, // RateLimit-* + Retry-After headers
    legacyHeaders: false,
    handler: (req, res) => {
      const resetTime = req.rateLimit && req.rateLimit.resetTime;
      const retryAfter = resetTime
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : Math.ceil(windowMs / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      // Match the shape every other error uses (message + statusCode + SCREAMING
      // code) so a client can branch on `code` uniformly. The old value here was
      // lowercase `rate_limited`, which nothing read — the web client keys on the
      // 429 status and `retryAfter`, and lib/utils/api-error.ts already documents
      // RATE_LIMITED as the expected code.
      res.status(429).json({
        success: false,
        statusCode: 429,
        code: 'RATE_LIMITED',
        message,
        retryAfter,
      });
    },
  });
}

// Login: 5 attempts / 15 min (successful logins don't count).
const loginLimiter = make({ windowMs: 15 * 60 * 1000, max: 5, message: 'Too many login attempts. Please try again later.' });

// Password reset: 3 / hour.
const passwordResetLimiter = make({ windowMs: 60 * 60 * 1000, max: 3, message: 'Too many password reset requests. Please try again later.' });

// Sign-in link: 3 / hour. The only realistic abuse is mailbombing an address
// somebody already knows, so this is tighter than login and matches the reset
// limiter it sits beside.
const signInLinkLimiter = make({ windowMs: 60 * 60 * 1000, max: 3, message: 'Too many sign-in link requests. Please try again later.', skipSuccessfulRequests: false });

// Register: 5 / hour (count all attempts).
const registerLimiter = make({ windowMs: 60 * 60 * 1000, max: 5, message: 'Too many registration attempts. Please try again later.', skipSuccessfulRequests: false });

// Verify email: 5 / hour.
const verifyEmailLimiter = make({ windowMs: 60 * 60 * 1000, max: 5, message: 'Too many verification attempts. Please try again later.' });

// Resend verification: 5 / hour.
const resendVerificationLimiter = make({ windowMs: 60 * 60 * 1000, max: 5, message: 'Too many resend requests. Please try again later.' });

// Token refresh: 60 FAILED refreshes / hour (successful ones don't count, see
// skipSuccessfulRequests in make()). The old cap of 10 was set as if refreshing
// were rare, but a 15-minute access token means ~4 renewals per hour PER TAB,
// and several people can share one public IP (office / carrier NAT). Once the
// bucket tripped, /auth/refresh returned 429 and the client logged everyone out.
// This limit still stops refresh-token brute-forcing (only failures count) while
// never punishing a normal long session.
const refreshTokenLimiter = make({ windowMs: 60 * 60 * 1000, max: 60, message: 'Rate limit exceeded. Please try again later.' });

/**
 * Who is this request? The global limiter runs BEFORE `authenticate` (it guards
 * the router itself), so `req.user` does not exist yet and the caller has to be
 * identified from the raw header.
 *
 * We decode the JWT payload WITHOUT verifying it. That is safe here because the
 * value is only ever used to pick a counter bucket — a forged token cannot
 * borrow anyone's quota beyond what it could already spend from its own IP, and
 * real verification still happens downstream in `authenticate`.
 *
 * The previous version keyed on `token.slice(0, 57)`, which happens to cover the
 * JWT header plus roughly the first eight characters of the user id. It worked,
 * but only by accident of payload byte-ordering, and any two users sharing eight
 * leading hex characters silently shared a budget. Decoding the `id` claim is
 * the same cost and says what it means.
 */
function callerKey(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const payload = auth.slice(7).split('.')[1];
    if (payload) {
      try {
        const { id } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (id) return `u:${id}`;
      } catch {
        // Malformed token — fall through to the token string, which at least
        // buckets this caller consistently with themselves.
      }
    }
    return `t:${auth.slice(7, 64)}`;
  }
  return `ip:${ipKeyGenerator(req.ip)}`;
}

/**
 * Traffic that must never consume a person's budget.
 *
 * These are fixed-cost and are exactly what accumulates during a long session —
 * counting them meant a user could be locked out of the product by their own
 * idle tab. Preflights are not requests the client chose to make at all.
 */
const EXEMPT_PATHS = new Set([
  '/health',                    // uptime pings, mounted inside /api
  '/activity/session/heartbeat', // one beacon per minute per open tab
]);

// Methods that only read. HEAD is included because it is a GET without a body.
const SAFE_METHODS = new Set(['GET', 'HEAD']);

// An assessment attempt in progress (autosave, proctoring, snapshots, video)
// has its own per-link limiter. Counted against the shared per-IP backstop, a
// classroom taking it together on one network would lock each other out.
const ASSESSMENT_ATTEMPT = /^\/public\/applications\/[^/]+\/assessment(\/(start|draft|proctor|snapshot|video|video\/sign))?$/;

function isExempt(req) {
  return req.method === 'OPTIONS' || EXEMPT_PATHS.has(req.path) || ASSESSMENT_ATTEMPT.test(req.path);
}

/**
 * Global backstop on /api. Split in two.
 *
 * Not a security control — the per-route limiters above are. This exists so a
 * runaway client loop or a crawler cannot exhaust the database on a Heroku dyno.
 *
 * The single combined budget was the problem: one mentor dashboard fires on the
 * order of twenty calls before anyone touches anything, and polling adds tens
 * more per window, so ordinary use could exhaust the very budget that is meant
 * to protect writes. Reads now get a generous ceiling of their own and writes
 * keep a tighter one, so a chatty screen can no longer spend the allowance that
 * actually matters.
 *
 * NOTE ON THE STORE: no `store` is configured, so counters live in the dyno's
 * memory. They are per-dyno (N dynos = N x max in practice, and which bucket you
 * hit depends on routing) and reset on every restart. That is an acceptable
 * trade for a backstop — the Redis-backed worker was deliberately removed to
 * stay inside the Upstash command budget — but it is not a security boundary.
 */
const apiReadLimiter = make({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: 'Too many requests. Please slow down and try again shortly.',
  skipSuccessfulRequests: false,
  keyGenerator: callerKey,
  skip: (req) => isExempt(req) || !SAFE_METHODS.has(req.method),
});

const apiWriteLimiter = make({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxWriteRequests,
  message: 'Too many requests. Please slow down and try again shortly.',
  skipSuccessfulRequests: false,
  keyGenerator: callerKey,
  skip: (req) => isExempt(req) || SAFE_METHODS.has(req.method),
});

/** Mount both: each skips the other's methods, so exactly one ever counts. */
const apiLimiter = [apiReadLimiter, apiWriteLimiter];

// Unauthenticated public intake: anyone on the internet can POST an application
// or upload a file here, so it needs a real cap rather than the global backstop.
const publicIntakeLimiter = make({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: 'Too many requests. Please try again later.',
  skipSuccessfulRequests: false,
});

// An applicant taking their assessment: autosave, proctor events, snapshots and
// video uploads arrive every few seconds for up to a few hours. Counted per
// private link (not per IP — a classroom shares one), generous enough for a
// real attempt and still a ceiling on a script hammering one link.
const assessmentAttemptLimiter = make({
  windowMs: 60 * 1000,
  max: 40,
  message: 'Too many requests. Please slow down.',
  skipSuccessfulRequests: false,
  keyGenerator: (req) => `assessment:${String(req.params?.token || '').slice(0, 128)}`,
});

// Public credential verification. A twelve-character code out of 5.3 x 10^17
// cannot realistically be brute-forced, so this is not the thing keeping
// credentials private — it stops the endpoint being used as free lookup traffic
// and keeps one scraper from crowding out people actually checking a CV. Read
// only, so the cap is generous: a recruiter checking a dozen codes is normal.
const certificateVerifyLimiter = make({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many verification lookups. Please try again shortly.',
  skipSuccessfulRequests: false
});

const workspaceCreationLimiter = make({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: req => `workspace-owner:${req.user.id}`,
  message: 'Too many workspace creation attempts. Please try again later.',
  skipSuccessfulRequests: false,
});

// Owner activation is unauthenticated (it is how the first password gets set),
// so it is paced per caller IP like other public auth endpoints.
const platformActivationLimiter = make({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many activation attempts. Please try again later.',
  skipSuccessfulRequests: false,
});

// Public lead intake from the marketing site.
const buyerLeadLimiter = make({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many enquiries from this address. Please try again later.',
  skipSuccessfulRequests: false,
});

module.exports = {
  workspaceCreationLimiter,
  platformActivationLimiter,
  buyerLeadLimiter,
  loginLimiter,
  passwordResetLimiter,
  signInLinkLimiter,
  registerLimiter,
  verifyEmailLimiter,
  resendVerificationLimiter,
  refreshTokenLimiter,
  apiLimiter,
  publicIntakeLimiter,
  assessmentAttemptLimiter,
  certificateVerifyLimiter,
  // Exported for tests: the bucketing and exemption rules are the whole point of
  // the backstop, and they are easier to pin directly than through 3000 requests.
  callerKey,
  isExempt,
  SAFE_METHODS,
};
