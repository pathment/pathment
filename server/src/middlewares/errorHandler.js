const { AppError } = require('../utils/errors/errorTypes');
const { errorResponse } = require('../utils/responses');

/**
 * Handle Sequelize Validation Errors
 */
const handleSequelizeValidationError = (err) => {
  const errors = err.errors.map(e => ({
    field: e.path,
    message: e.message
  }));
  return new AppError(JSON.stringify(errors), 400);
};

/**
 * Handle Sequelize Unique Constraint Errors
 */
const handleSequelizeUniqueConstraintError = (err) => {
  const field = err.errors[0].path;
  const message = `${field} already exists`;
  return new AppError(message, 409);
};

/**
 * Handle Sequelize Foreign Key Constraint Errors
 */
const handleSequelizeForeignKeyConstraintError = () => {
  return new AppError('Invalid reference. Related resource does not exist', 400);
};

/**
 * Handle JWT Errors
 */
const handleJWTError = () => {
  return new AppError('Invalid token. Please log in again', 401);
};

const handleJWTExpiredError = () => {
  return new AppError('Your token has expired. Please log in again', 401);
};

/**
 * Send error response in development mode
 */
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack
  });
};

/**
 * Send error response in production mode
 */
const sendErrorProd = (err, res) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    res.status(err.statusCode).json(errorResponse(err.message, err.statusCode));
  } else {
    // Programming or unknown error: don't leak error details
    console.error('ERROR 💥', err);
    res.status(500).json(errorResponse('Something went wrong', 500));
  }
};

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else {
    let error = { ...err };
    error.message = err.message;

    // Handle specific error types
    if (err.name === 'SequelizeValidationError') error = handleSequelizeValidationError(err);
    if (err.name === 'SequelizeUniqueConstraintError') error = handleSequelizeUniqueConstraintError(err);
    if (err.name === 'SequelizeForeignKeyConstraintError') error = handleSequelizeForeignKeyConstraintError(err);
    if (err.name === 'JsonWebTokenError') error = handleJWTError();
    if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();

    sendErrorProd(error, res);
  }
};

/**
 * Catch async errors wrapper
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * Handle 404 routes
 */
const notFound = (req, res, next) => {
  const err = new AppError(`Cannot find ${req.originalUrl} on this server`, 404);
  next(err);
};

module.exports = {
  errorHandler,
  catchAsync,
  notFound
};
