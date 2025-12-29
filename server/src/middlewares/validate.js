const { ValidationError } = require('../utils/errors/errorTypes');
const { errorResponse } = require('../utils/responses');

/**
 * Validation middleware factory
 * @param {Object} schema - Joi schema to validate against
 * @param {String} property - Request property to validate ('body', 'query', 'params')
 * @returns {Function} Express middleware function
 */
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false, // Collect all errors
      stripUnknown: true, // Remove unknown fields
      convert: true // Type conversion
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/["']/g, '')
      }));

      return res.status(400).json(errorResponse('Validation failed', 400, errors));
    }

    // Replace request property with validated and sanitized value
    req[property] = value;
    next();
  };
};

/**
 * Validate request body
 */
const validateBody = (schema) => validate(schema, 'body');

/**
 * Validate query parameters
 */
const validateQuery = (schema) => validate(schema, 'query');

/**
 * Validate URL parameters
 */
const validateParams = (schema) => validate(schema, 'params');

module.exports = {
  validate,
  validateBody,
  validateQuery,
  validateParams
};
