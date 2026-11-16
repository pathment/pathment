const Joi = require('joi');

/**
 * Standing-clan request payloads for /api/clan-requests/standing*.
 * Move/cross-clan routes keep service-level checks (existing pattern).
 */
module.exports = {
  idParams: Joi.object({
    id: Joi.string().uuid().required()
  }),

  standingRequest: Joi.object({
    programId: Joi.string().uuid().required().messages({
      'any.required': 'Choose a completed program',
      'string.guid': 'Choose a completed program'
    }),
    sourceClanId: Joi.string().uuid().optional().messages({
      'string.guid': 'Choose the clan this continues'
    }),
    name: Joi.string().trim().min(1).max(150).required().messages({
      'string.empty': 'Choose a clan name of 1–150 characters',
      'string.max': 'Choose a clan name of 1–150 characters',
      'any.required': 'Choose a clan name of 1–150 characters'
    }),
    description: Joi.string().trim().max(4000).allow('', null).optional()
  }),

  /**
   * The mentee's own ask. `menteeId` is deliberately absent: it comes from the
   * session, never the body, so this payload cannot name somebody else.
   */
  ownMove: Joi.object({
    fromClanId: Joi.string().uuid().optional().messages({
      'string.guid': 'Choose which clan you want to leave'
    }),
    // Optional by design - a mentee may leave the destination to the admin.
    toClanId: Joi.string().uuid().allow('', null).optional().messages({
      'string.guid': 'Choose a clan from the list, or leave it to your admin'
    }),
    reasonCode: Joi.string().trim().required().messages({
      'string.empty': 'Choose a reason for the move',
      'any.required': 'Choose a reason for the move'
    }),
    note: Joi.string().trim().min(10).max(2000).required().messages({
      'string.empty': 'Tell your admin why you want to move',
      'string.min': 'Tell the admin a little more - at least a sentence about why',
      'string.max': 'Please keep this under 2000 characters',
      'any.required': 'Tell your admin why you want to move'
    })
  }),

  /** An admin's decision, which may name the clan for an open-ended ask. */
  resolveMove: Joi.object({
    status: Joi.string().valid('approved', 'denied').required().messages({
      'any.only': 'Choose approve or deny',
      'any.required': 'Choose approve or deny'
    }),
    toClanId: Joi.string().uuid().allow('', null).optional().messages({
      'string.guid': 'Choose the clan to move them into'
    }),
    note: Joi.string().trim().max(4000).allow('', null).optional(),
    // Required (true) only for a move into another programme; see resolveRequest.
    confirmCrossProgram: Joi.boolean().optional()
  }),

  standingDecision: Joi.object({
    decision: Joi.string().valid('approved', 'rejected').required().messages({
      'any.only': 'Choose approve or reject',
      'any.required': 'Choose approve or reject'
    }),
    note: Joi.when('decision', {
      is: 'rejected',
      then: Joi.string().trim().min(1).max(4000).required().messages({
        'string.empty': 'Explain the rejection so the mentor knows why',
        'any.required': 'Explain the rejection so the mentor knows why'
      }),
      otherwise: Joi.string().trim().max(4000).allow('', null).optional()
    })
  })
};
