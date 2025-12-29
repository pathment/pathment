const AppError = require('./AppError');

/**
 * Predefined error types for common scenarios
 */
class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(message, 400);
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 403);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409);
  }
}

class UnprocessableEntityError extends AppError {
  constructor(message = 'Unable to process the request') {
    super(message, 422);
  }
}

class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super(message, 429);
  }
}

class InternalServerError extends AppError {
  constructor(message = 'Internal server error') {
    super(message, 500);
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
  TooManyRequestsError,
  InternalServerError
};
