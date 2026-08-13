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
 * Global backstop on /api.
 *
 * Not a security control — the per-route limiters above are. This exists so a
 * runaway client loop or a crawler cannot exhaust the database on a Heroku dyno,
 * and it is set well above real usage: a busy screen fires a handful of requests
 * and a long session a few hundred an hour, against a default of 1000 per 15
 * minutes. Sustaining more than one request a second for a quarter of an hour is
 * a bug or an attack, not a person.
 *
 * Keyed per authenticated user where possible, so an office or carrier NAT does
 * not put a whole team in one bucket (the same mistake that once made
 * /auth/refresh 429 and log everyone out).
 */
const apiLimiter = make({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: 'Too many requests. Please slow down and try again shortly.',
  skipSuccessfulRequests: false,
  keyGenerator: (req) => {
    const auth = req.headers.authorization;
    // The token itself identifies the session without needing to verify it here
    // (verification happens in authenticate); a forged token just buckets alone.
    if (auth && auth.startsWith('Bearer ')) return `t:${auth.slice(7, 64)}`;
    return `ip:${ipKeyGenerator(req.ip)}`;
  },
});

// Unauthenticated public intake: anyone on the internet can POST an application
// or upload a file here, so it needs a real cap rather than the global backstop.
const publicIntakeLimiter = make({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: 'Too many requests. Please try again later.',
  skipSuccessfulRequests: false,
});

module.exports = {
  loginLimiter,
  passwordResetLimiter,
  registerLimiter,
  verifyEmailLimiter,
  resendVerificationLimiter,
  refreshTokenLimiter,
  apiLimiter,
  publicIntakeLimiter,
};
