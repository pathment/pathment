const Joi = require('joi');

/**
 * Clan query/body validation. `listQuery` caps pagination server-side so a
 * crafted `?limit=10000` can never dump the whole table — it 400s instead.
 */
module.exports = {
  listQuery: Joi.object({
    programId: Joi.string().uuid().optional().allow(null, ''),
    status: Joi.string().valid('active', 'inactive', 'archived').optional().allow(null, ''),
    search: Joi.string().trim().max(120).optional().allow(''),
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional()
  })
};
