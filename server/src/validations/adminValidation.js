const Joi = require('joi');

/**
 * Admin validation schemas
 */
const adminSchemas = {
  createInvite: Joi.object({
    email: Joi.string().email().required(),
    role: Joi.string().valid('mentor', 'mentee').required(),
    expiresInHours: Joi.number().integer().min(1).max(24 * 30).optional()
  }),

  createAdmin: Joi.object({
    firstName: Joi.string().min(2).max(50).trim().required(),
    lastName: Joi.string().min(2).max(50).trim().required(),
    email: Joi.string().email().required(),
    password: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .required()
      .messages({
        'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number and one special character'
      }),
    permissions: Joi.array().items(
      Joi.string().valid(
        'all',
        'manage_users',
        'manage_programs',
        'manage_content',
        'view_analytics',
        'manage_settings'
      )
    ).optional()
  }),

  updatePermissions: Joi.object({
    permissions: Joi.array().items(
      Joi.string().valid(
        'all',
        'manage_users',
        'manage_programs',
        'manage_content',
        'view_analytics',
        'manage_settings'
      )
    ).required()
  }),

  inviteListQuery: Joi.object({
    status: Joi.string().valid('all', 'active', 'used', 'expired', 'revoked').optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    offset: Joi.number().integer().min(0).optional()
  }),

  bulkInvite: Joi.object({
    invites: Joi.array().items(
      Joi.object({
        email: Joi.string().email().required(),
        role: Joi.string().valid('mentor', 'mentee').required()
      })
    ).min(1).max(1000).required()
  })
};

module.exports = { adminSchemas };
