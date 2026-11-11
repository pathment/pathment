/**
 * clanDistribution — the one rule the system uses to spread mentees over clans.
 *
 * Every flow that moves people into clans on the admin's behalf (candidate-pool
 * placement, intake assignment, handover-pool suggestions) asks the same
 * question: of the clans this person could go to, which one should the system
 * propose? The answer is the clan with the FEWEST ACTIVE mentees.
 *
 * Active, not seated. A paused mentee still holds a seat — capacity counts them,
 * so a clan never overfills when they come back — but they are not attending,
 * so they put no load on the mentor. A clan of 20 with 12 paused is carrying 8
 * people and should be offered before a clan of 14 who all turn up.
 *
 * Inactive clans are never proposed (see config/clanStatus). They still appear
 * in every picker so an admin can choose one on purpose.
 *
 * Pure functions over plain objects plus one counting query, so the three flows
 * share the rule without sharing their very different candidate filters.
 */
const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { isClanSuggestable } = require('../config/clanStatus');

/**
 * Per-clan mentee load: { active, paused, seated } for each clan id.
 * Missing clans come back as zeroes so callers never branch on absence.
 */
async function menteeLoad(clanIds, { transaction } = {}) {
  const out = new Map((clanIds || []).map((id) => [id, { active: 0, paused: 0, seated: 0 }]));
  if (!out.size) return out;
  const rows = await models.ClanMembership.findAll({
    where: { clanId: { [Op.in]: [...out.keys()] }, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } },
    attributes: ['clanId', 'status', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
    group: ['clanId', 'status'],
    raw: true,
    transaction,
  });
  for (const r of rows) {
    const load = out.get(r.clanId);
    if (!load) continue;
    const n = parseInt(r.n, 10) || 0;
    if (r.status === 'active') load.active += n; else load.paused += n;
    load.seated += n;
  }
  return out;
}

/**
 * Pick the least-loaded clan from `candidates`.
 *
 * Each candidate: { id, name, status, active, seated, cap, planned? }.
 *   active   active (non-paused) mentees now
 *   seated   active + paused, what capacity is measured against
 *   cap      max mentees, or null/0 for no limit
 *   planned  people already proposed for this clan earlier in the same run
 *
 * Load = active + planned. Ties go to the clan with more room, then by name so
 * a re-run proposes the same thing. Inactive and full clans are skipped.
 * Returns the chosen candidate or null.
 */
function pickLeastLoaded(candidates, { planned = new Map() } = {}) {
  const extra = (c) => planned.get(c.id) || c.planned || 0;
  const room = (c) => (c.cap ? c.cap - c.seated - extra(c) : Infinity);
  const load = (c) => c.active + extra(c);
  const usable = (candidates || []).filter((c) => isClanSuggestable(c.status) && room(c) > 0);
  if (!usable.length) return null;
  return usable.sort((a, b) => (load(a) - load(b))
    || (room(b) - room(a))
    || String(a.name || '').localeCompare(String(b.name || '')))[0];
}

/** Human reason for a suggestion, shown next to it so the admin can trust it. */
function loadReason(clan, plannedSoFar = 0) {
  const n = clan.active + plannedSoFar;
  return `Fewest active mentees (${n} active${clan.paused ? `, ${clan.paused} paused` : ''})`;
}

module.exports = { menteeLoad, pickLeastLoaded, loadReason };
