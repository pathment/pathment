const { AuthenticationError, AuthorizationError } = require('../utils/errors/errorTypes');
const { verifyAccessToken } = require('../utils/jwt');
const { catchAsync } = require('./errorHandler');
const { models } = require('../db');
const authzService = require('../services/authzService');
const { setRequestUser } = require('../utils/auditContext');

/**
 * Authenticate user with JWT
 */
const authenticate = catchAsync(async (req, res, next) => {
  // Get token from header
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('No token provided. Please log in to access this resource');
  }

  const token = authHeader.split(' ')[1];

  // Verify token
  const decoded = verifyAccessToken(token);

  // The 5-minute token minted between password and 2FA is signed with the SAME
  // secret as a real access token, so it verifies here. It must NOT authenticate
  // anything: accepting it would make the second factor optional for anyone who
  // simply stops after step one. Only authenticateTemporary() accepts it.
  if (decoded.temp) {
    throw new AuthenticationError(
      'Two-factor verification is not complete. Finish signing in first'
    );
  }

  // Get user from database
  const user = await models.User.findByPk(decoded.id, {
    attributes: { exclude: ['password'] }
  });

  if (!user) {
    throw new AuthenticationError('User no longer exists');
  }

  if (user.status !== 'active') {
    throw new AuthenticationError('Your account has been disabled');
  }

  if (!user.emailVerified) {
    throw new AuthenticationError('Please verify your email before logging in');
  }

  // Attach user to request
  req.user = user;

  // Lazily resolve the user's scoped roles, memoized for the whole request, so
  // authorize()/requirePermission() share ONE fetch and routes that don't gate
  // on roles pay nothing (the DB is cross-region — avoid per-request overhead).
  req.loadAssignments = () => {
    if (!req._assignmentsPromise) req._assignmentsPromise = authzService.getAssignments(user);
    return req._assignmentsPromise;
  };
  // Capabilities are DERIVED on demand (never the stored array), so a revoked
  // role stops granting access immediately — no stale capability survives.
  req.loadCapabilities = () => {
    if (!req._capabilitiesPromise) {
      req._capabilitiesPromise = req.loadAssignments()
        .then((assignments) => authzService.getCapabilities(user, { assignments }));
    }
    return req._capabilitiesPromise;
  };

  // Seed the audit context with WHO is acting (ip/ua/requestId were seeded by
  // requestContext before auth ran). Every audit write now records the actor.
  setRequestUser(user.id);

  next();
});

/**
 * Authenticate the SECOND factor only.
 *
 * Accepts exclusively the short-lived `temp: true` token issued after a correct
 * password when 2FA is on, and nothing else — a full access token is rejected
 * here too, so this route can never be used to re-mint a session from an
 * already-valid one. It attaches `req.user` so the 2FA controller knows who is
 * halfway through signing in, and deliberately performs no capability loading:
 * this user is not authorized for anything yet.
 */
const authenticateTemporary = catchAsync(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('No token provided. Please log in to access this resource');
  }

  const decoded = verifyAccessToken(authHeader.split(' ')[1]);

  if (!decoded.temp) {
    throw new AuthenticationError('This endpoint expects the temporary two-factor token');
  }

  const user = await models.User.findByPk(decoded.id, {
    attributes: { exclude: ['password'] }
  });

  if (!user) throw new AuthenticationError('User no longer exists');
  if (user.status !== 'active') throw new AuthenticationError('Your account has been disabled');

  req.user = user;
  next();
});

/**
 * Authorize user by role
 * @param {Array<String>} roles - Allowed roles
 */
const authorize = (roles) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('You must be logged in to access this resource');
      }

      // Capability-aware authorization against the user's LIVE capabilities
      // (derived from real roles, not the stored array), so a revoked clan/mentor
      // role can no longer reach role-scoped resources. A user who is e.g. both
      // admin and mentee still passes either view.
      const capabilities = req.loadCapabilities
        ? await req.loadCapabilities()
        : (Array.isArray(req.user.capabilities) && req.user.capabilities.length ? req.user.capabilities : [req.user.role]);

      const permitted = allowedRoles.some((r) => capabilities.includes(r));
      if (!permitted) {
        throw new AuthorizationError(`This resource is only accessible to ${allowedRoles.join(', ')} users`);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Optional authentication - doesn't fail if no token provided
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = verifyAccessToken(token);

      // A half-finished 2FA sign-in is not a signed-in user, even optionally.
      if (!decoded.temp) {
        const user = await models.User.findByPk(decoded.id, {
          attributes: { exclude: ['password'] }
        });

        if (user && user.status === 'active') {
          req.user = user;
        }
      }
    }
  } catch (error) {
    // Silently fail for optional auth
  }
  
  next();
};

module.exports = {
  authenticate,
  authenticateTemporary,
  authorize,
  optionalAuth
};
