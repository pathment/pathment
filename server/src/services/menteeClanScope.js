const { Op } = require('sequelize');
const { models } = require('../db');
const { ValidationError, AuthorizationError } = require('../utils/errors/errorTypes');
const { VISIBLE_MEMBERSHIP_STATUSES } = require('../config/membership');

/**
 * Resolve which clan a mentee's work belongs to.
 *
 * Never picks array[0] when more than one clan is possible. Omitted clanId is
 * allowed only when the mentee has exactly one visible mentee membership (or
 * the actor mentors exactly one of those clans).
 */
async function listMenteeClans(menteeId) {
  if (!menteeId) return [];
  return models.ClanMembership.findAll({
    where: {
      userId: menteeId,
      role: 'mentee',
      status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES }
    },
    attributes: ['id', 'clanId', 'enrollmentId', 'status']
  });
}

async function assertMenteeOfClan(menteeId, clanId) {
  if (!clanId) throw new ValidationError('clanId is required');
  const row = await models.ClanMembership.findOne({
    where: {
      userId: menteeId,
      clanId,
      role: 'mentee',
      status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES }
    }
  });
  if (!row) throw new AuthorizationError('You do not have mentee access to this clan');
  return row;
}

async function resolveMenteeClanId(menteeId, requestedClanId, { actorId } = {}) {
  const rows = await listMenteeClans(menteeId);
  if (requestedClanId) {
    const hit = rows.find((r) => r.clanId === requestedClanId);
    if (!hit) throw new AuthorizationError('You do not have mentee access to this clan');
    return requestedClanId;
  }
  if (rows.length === 1) return rows[0].clanId;
  if (rows.length === 0) return null;

  if (actorId && actorId !== menteeId) {
    const authzService = require('./authzService');
    const mentored = new Set(await authzService.mentoredClanIds(actorId));
    const shared = rows.filter((r) => mentored.has(r.clanId));
    if (shared.length === 1) return shared[0].clanId;
  }

  throw new ValidationError('clanId is required when the mentee belongs to more than one clan');
}

/** Query fragment: this clan's rows, plus unscoped legacy rows when they can only belong here. */
function clanScopedWhere(base, clanId, membershipCount) {
  if (!clanId) return base;
  if (membershipCount === 1) {
    return { ...base, [Op.or]: [{ clanId }, { clanId: null }] };
  }
  return { ...base, clanId };
}

module.exports = {
  listMenteeClans,
  assertMenteeOfClan,
  resolveMenteeClanId,
  clanScopedWhere
};
