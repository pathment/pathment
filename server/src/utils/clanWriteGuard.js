const { models } = require('../db');
const { ForbiddenError } = require('./errors/errorTypes');
const { isProgrammeClan } = require('../config/clanKinds');

/**
 * Block mentor writes against a frozen cohort clan.
 * Standing clans and legacy rows without clanId stay allowed.
 */
async function assertClanWritableForMentor(clanId) {
  if (!clanId) return;
  const clan = await models.Clan.findByPk(clanId, { attributes: ['kind', 'frozenAt'] });
  // Only a programme clan freezes when its programme closes.
  if (clan && isProgrammeClan(clan) && clan.frozenAt) {
    throw new ForbiddenError('This cohort clan is historical. Reviews are view-only.');
  }
}

async function assertTaskClanWritableForMentor(task) {
  await assertClanWritableForMentor(task?.clanId || null);
}

module.exports = { assertClanWritableForMentor, assertTaskClanWritableForMentor };
