const { AuthenticationError, AuthorizationError } = require('../utils/errors/errorTypes');
const { verifyAccessToken } = require('../utils/jwt');
const { catchAsync } = require('./errorHandler');
const { models } = require('../db');

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

  // Attach user to request
  req.user = user;
  next();
});

/**
 * Authorize user by role
 * @param  {...String} roles - Allowed roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      throw new AuthenticationError('You must be logged in to access this resource');
    }

    if (!roles.includes(req.user.role)) {
      throw new AuthorizationError(`This resource is only accessible to ${roles.join(', ')} users`);
    }

    next();
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
      
      const user = await models.User.findByPk(decoded.id, {
        attributes: { exclude: ['password'] }
      });

      if (user && user.status === 'active') {
        req.user = user;
      }
    }
  } catch (error) {
    // Silently fail for optional auth
  }
  
  next();
};

module.exports = {
  authenticate,
  authorize,
  optionalAuth
};
