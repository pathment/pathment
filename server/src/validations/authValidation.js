const Joi = require('joi');

/**
 * Common validation patterns
 */
const patterns = {
  email: Joi.string().email().required(),
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number and one special character',
      'string.min': 'Password must be at least 8 characters long'
    }),
  uuid: Joi.string().uuid().required(),
  name: Joi.string().min(2).max(100).trim().required(),
  optionalString: Joi.string().trim().allow('', null),
  phoneNumber: Joi.string().pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/).optional()
};

/**
 * Auth validation schemas
 */
const authSchemas = {
  register: Joi.object({
    firstName: Joi.string().min(2).max(50).trim().required().messages({
      'string.empty': 'First name is required',
      'string.min': 'First name must be at least 2 characters',
      'string.max': 'First name cannot exceed 50 characters'
    }),
    lastName: Joi.string().min(2).max(50).trim().required().messages({
      'string.empty': 'Last name is required',
      'string.min': 'Last name must be at least 2 characters',
      'string.max': 'Last name cannot exceed 50 characters'
    }),
    email: patterns.email.messages({
      'string.email': 'Please provide a valid email address',
      'string.empty': 'Email is required'
    }),
    password: patterns.password,
    confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
      'any.only': 'Passwords do not match',
      'string.empty': 'Confirm password is required'
    }),
    role: Joi.string().valid('mentor', 'mentee').required().messages({
      'any.only': 'Role must be either mentor or mentee',
      'string.empty': 'Role is required'
    }),
    phoneNumber: patterns.phoneNumber,
    dateOfBirth: Joi.date().max('now').optional(),
    bio: Joi.string().max(500).optional()
  }),

  login: Joi.object({
    email: patterns.email.messages({
      'string.email': 'Please provide a valid email address',
      'string.empty': 'Email is required'
    }),
    password: Joi.string().required().messages({
      'string.empty': 'Password is required'
    })
  }),

  refreshToken: Joi.object({
    refreshToken: Joi.string().required().messages({
      'string.empty': 'Refresh token is required'
    })
  }),

  forgotPassword: Joi.object({
    email: patterns.email.messages({
      'string.email': 'Please provide a valid email address',
      'string.empty': 'Email is required'
    })
  }),

  resetPassword: Joi.object({
    token: Joi.string().required().messages({
      'string.empty': 'Reset token is required'
    }),
    password: patterns.password,
    confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
      'any.only': 'Passwords do not match',
      'string.empty': 'Confirm password is required'
    })
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required().messages({
      'string.empty': 'Current password is required'
    }),
    newPassword: patterns.password,
    confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required().messages({
      'any.only': 'Passwords do not match',
      'string.empty': 'Confirm password is required'
    })
  }),

  verifyEmail: Joi.object({
    token: Joi.string().required().messages({
      'string.empty': 'Verification token is required'
    })
  }),

  verify2FA: Joi.object({
    token: Joi.string().length(6).pattern(/^\d+$/).required().messages({
      'string.empty': '2FA token is required',
      'string.length': '2FA token must be 6 digits',
      'string.pattern.base': '2FA token must contain only digits'
    })
  }),

  verify2FALogin: Joi.object({
    code: Joi.string().length(6).pattern(/^\d+$/).required().messages({
      'string.empty': '2FA code is required',
      'string.length': '2FA code must be 6 digits',
      'string.pattern.base': '2FA code must contain only digits'
    })
  })
};

module.exports = {
  patterns,
  authSchemas
};
