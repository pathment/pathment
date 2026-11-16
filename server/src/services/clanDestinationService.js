const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { VISIBLE_MEMBERSHIP_STATUSES } = require('../config/membership');

/**
 * Every clan a mentee could be sent to, in any programme, and how alive it is.
 *
 * One list for both sides of a clan change: the mentee choosing a preference
 * and the admin deciding. Both used to see only live cohort clans of open
 * programmes, and only in the mentee's own programme for a move. In a
 * workspace whose main programme has closed that left Qantara 1 and 2 — while
 * the real activity was in that programme's STANDING clans, several of them
 * holding reviews every week.
 *
 * What makes a clan "alive" is whether its mentors actually run the weekly
 * review, so that is measured, not inferred: weeks in the last four with at
 * least one Clan Review, and the date of the last one.
 */

const WINDOW_DAYS = 28;
const fullName = (u) => (u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || null : null);

/** "regular" 3-4 of 4 weeks · "irregular" 1-2 · "none" — no review in four weeks. */
const activityOf = (weeks) => (weeks >= 3 ? 'regular' : weeks >= 1 ? 'irregular' : 'none');

/**
 * What approving into `dest` does, given where the mentee is now.
 *   move        same programme, live clan → they leave it, their work comes with them
 *   move_cross  live clan → another programme: their current enrolment and its
 *               tasks are REMOVED (reassignMentee), so it needs confirming
 *   placement   from a closed/standing clan: nothing is ended
 *   join        into a standing clan: added, their current clan is unchanged
 */
function effectOf(fromClan, dest) {
  if (dest.kind === 'standing') return 'join';
  const live = fromClan && fromClan.kind === 'cohort' && !fromClan.frozenAt;
  if (!live) return 'placement';
  return dest.programId === fromClan.programId ? 'move' : 'move_cross';
}

/**
 * @param {object}   o
 * @param {object}   [o.fromClan]        the clan they would leave ({ id, kind, frozenAt, programId })
 * @param {string}   [o.preferredClanId] the mentee's stated preference
 * @param {string[]} [o.excludeClanIds]  clans they are already in
 * @param {string[]|null} [o.programIds] an admin's programme scope (null = all)
 */
async function list({ fromClan = null, preferredClanId = null, excludeClanIds = [], programIds = null } = {}) {
  const where = {
    status: { [Op.ne]: 'archived' },
    [Op.or]: [{ kind: 'standing' }, { kind: 'cohort', frozenAt: null }],
  };
  if (Array.isArray(programIds)) where.programId = { [Op.in]: programIds };
  if (excludeClanIds.length) where.id = { [Op.notIn]: excludeClanIds };

  const clans = (await models.Clan.findAll({
    where,
    attributes: ['id', 'name', 'kind', 'status', 'programId', 'avatarUrl', 'frozenAt'],
    include: [
      { model: models.User, as: 'leadMentor', attributes: ['id', 'firstName', 'lastName'], required: false },
      { model: models.Program, as: 'program', attributes: ['id', 'name', 'closedAt'], required: false },
    ],
  }))
    // A cohort clan of a closed programme is a record; its standing clan is
    // where that programme lives on.
    .filter((c) => c.kind === 'standing' || !c.program?.closedAt);
  if (!clans.length) return [];

  const ids = clans.map((c) => c.id);
  const [counts, reviews] = await Promise.all([
    models.ClanMembership.findAll({
      where: { clanId: { [Op.in]: ids }, role: 'mentee', status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES } },
      attributes: ['clanId', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
      group: ['clanId'],
      raw: true,
    }),
    // Raw because it is one grouped read over a known, already-scoped id list.
    sequelize.query(
      `SELECT clan_id,
              COUNT(DISTINCT date_trunc('week', session_date)) FILTER (WHERE session_date >= current_date - :days) AS weeks,
              MAX(session_date) AS last_review
         FROM cohort_review_sessions
        WHERE clan_id IN (:ids) AND kind = 'review'
        GROUP BY clan_id`,
      { replacements: { ids, days: WINDOW_DAYS }, type: sequelize.QueryTypes.SELECT },
    ),
  ]);
  const menteesOf = Object.fromEntries(counts.map((r) => [r.clanId, Number(r.n)]));
  const reviewOf = Object.fromEntries(reviews.map((r) => [r.clan_id, r]));

  const shaped = clans.map((c) => {
    const weeks = Number(reviewOf[c.id]?.weeks || 0);
    const effect = effectOf(fromClan, c);
    return {
      id: c.id,
      name: c.name,
      avatarUrl: c.avatarUrl || null,
      kind: c.kind,
      // The admin's own on/off switch for the clan (see config/clanStatus).
      status: c.status || 'active',
      programId: c.programId,
      programName: c.program?.name || null,
      programClosed: Boolean(c.program?.closedAt),
      mentor: fullName(c.leadMentor),
      mentees: menteesOf[c.id] || 0,
      reviewWeeks: weeks,
      lastReviewAt: reviewOf[c.id]?.last_review || null,
      activity: activityOf(weeks),
      sameProgram: Boolean(fromClan && c.programId === fromClan.programId),
      preferred: c.id === preferredClanId,
      effect,
    };
  });

  /*
   * Suggested order: what they asked for, then their own programme, then the
   * clans whose mentors actually meet, then the lighter load. Inactive clans
   * and cross-programme moves sink — still offered, never recommended.
   */
  const score = (d) => (d.preferred ? 1e6 : 0)
    + (d.sameProgram ? 1e4 : 0)
    + d.reviewWeeks * 100
    + (d.status === 'active' ? 50 : -500)
    + (d.effect === 'move_cross' ? -300 : 0)
    - d.mentees;
  shaped.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));

  let picks = 0;
  for (const d of shaped) {
    d.suggested = !d.preferred && picks < 3 && d.status === 'active' && d.activity !== 'none' && d.effect !== 'move_cross';
    if (d.suggested) picks += 1;
  }
  return shaped;
}

module.exports = { list, effectOf, activityOf };
