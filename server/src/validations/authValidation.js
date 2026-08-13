const Joi = require('joi');

/**
 * Common validation patterns
 */
const patterns = {
  email: Joi.string().email().required(),
  // Require lower + upper + digit + at least one special (ANY non-alphanumeric),
  // and allow any characters in the password. The previous rule only accepted
  // specials from a 7-char set (@$!%*?&), so common picks like `Welcome2024#`
  // failed server-side even though the client accepted them — the cause of the
  // widespread "password rejected" confusion.
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/)
    .required()
    .messages({
      'string.pattern.base': 'Password must include an uppercase letter, a lowercase letter, a number, and a special character (e.g. ! @ # $ % & *)',
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
    inviteToken: Joi.string().trim().required().messages({
      'string.empty': 'Invite token is required'
    }),
    phoneNumber: patterns.phoneNumber,
    dateOfBirth: Joi.date().max('now').optional(),
    bio: Joi.string().max(500).optional()
  }),

  // NOTE: validate() runs with stripUnknown:true, so anything not declared here
  // is silently deleted before the controller sees it. `rememberMe` was missing,
  // which quietly pinned every session to the 1-day refresh TTL.
  login: Joi.object({
    email: patterns.email.messages({
      'string.email': 'Please provide a valid email address',
      'string.empty': 'Email is required'
    }),
    password: Joi.string().required().messages({
      'string.empty': 'Password is required'
    }),
    rememberMe: Joi.boolean().default(false),
    // Lets a native client ask for the long session without pretending to be a
    // browser checkbox; also recorded on the refresh token for the sessions view.
    client: Joi.string().valid('web', 'ios', 'android').default('web')
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

  resendVerification: Joi.object({
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

  // The controller reads `code || token` and `rememberMe`; all three must be
  // declared or stripUnknown deletes them (`token` callers got "code is
  // required", and rememberMe was silently ignored here too).
  verify2FALogin: Joi.object({
    code: Joi.string().length(6).pattern(/^\d+$/).messages({
      'string.length': '2FA code must be 6 digits',
      'string.pattern.base': '2FA code must contain only digits'
    }),
    token: Joi.string().length(6).pattern(/^\d+$/).messages({
      'string.length': '2FA code must be 6 digits',
      'string.pattern.base': '2FA code must contain only digits'
    }),
    rememberMe: Joi.boolean().default(false),
    client: Joi.string().valid('web', 'ios', 'android').default('web')
  })
    .or('code', 'token')
    .messages({ 'object.missing': '2FA code is required' })
};

module.exports = {
  patterns,
  authSchemas
};
