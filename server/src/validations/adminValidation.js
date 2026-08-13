const Joi = require('joi');

/**
 * Admin validation schemas
 */
const adminSchemas = {
  createInvite: Joi.object({
    email: Joi.string().email().required(),
    role: Joi.string().valid('mentor', 'mentee').required(),
    expiresInHours: Joi.number().integer().min(1).max(24 * 30).optional(),
    // Placement - id (UI) or name (CSV). Required-ness per role is enforced
    // in the service (mentee → program; mentor → clan).
    programId: Joi.string().optional().allow(null, ''),
    program: Joi.string().optional().allow(null, ''),
    clanId: Joi.string().optional().allow(null, ''),
    clan: Joi.string().optional().allow(null, '')
  }),

  // Everything else (email, role, placement) is carried over from the invite
  // being resent; only the expiry window may be overridden.
  resendInvite: Joi.object({
    expiresInHours: Joi.number().integer().min(1).max(24 * 30).optional()
  }),

  createAdmin: Joi.object({
    firstName: Joi.string().min(2).max(50).trim().required(),
    lastName: Joi.string().min(2).max(50).trim().required(),
    email: Joi.string().email().required(),
    password: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/)
      .required()
      .messages({
        'string.pattern.base': 'Password must include an uppercase letter, a lowercase letter, a number, and a special character (e.g. ! @ # $ % & *)'
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
    offset: Joi.number().integer().min(0).optional(),
    programId: Joi.string().uuid().optional().allow(null, ''),
    clanId: Joi.string().uuid().optional().allow(null, ''),
    search: Joi.string().trim().max(120).optional().allow('')
  }),

  bulkInvite: Joi.object({
    invites: Joi.array().items(
      Joi.object({
        email: Joi.string().email().required(),
        role: Joi.string().valid('mentor', 'mentee').required(),
        programId: Joi.string().optional().allow(null, ''),
        program: Joi.string().optional().allow(null, ''),
        clanId: Joi.string().optional().allow(null, ''),
        clan: Joi.string().optional().allow(null, '')
      })
    ).min(1).max(1000).required()
  })
};

module.exports = { adminSchemas };
