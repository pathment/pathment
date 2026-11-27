const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { VISIBLE_MEMBERSHIP_STATUSES } = require('../config/membership');
const { isProgrammeClan, isNonProgrammeClan, isStandingClan } = require('../config/clanKinds');

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
  // Added rather than moved: their current clan is left alone. True of a
  // standing clan and of a selection round, neither of which is a programme
  // placement.
  if (isNonProgrammeClan(dest)) return 'join';
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
    // A selection round is not somewhere you move a mentee TO: it is a trial
    // they are invited into. Without naming the kinds that may be a
    // destination, a pool clan passed the "programme still open" test and was
    // offered alongside real clans.
    .filter((c) => isStandingClan(c) || (isProgrammeClan(c) && !c.program?.closedAt));
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

  /*
   * A closed clan lives on in the standing clan approved to continue it. When
   * someone asked for (or is leaving) a clan that has since closed, that
   * continuation is the obvious answer, so it is found and named.
   */
  const continuedFrom = new Map();
  const closedIds = [preferredClanId, fromClan?.id].filter(Boolean);
  if (closedIds.length && models.StandingClanRequest) {
    const links = await models.StandingClanRequest.findAll({
      where: { sourceClanId: { [Op.in]: closedIds }, status: 'approved', createdClanId: { [Op.ne]: null } },
      attributes: ['sourceClanId', 'createdClanId'],
      include: [{ model: models.Clan, as: 'sourceClan', attributes: ['name'], required: false }],
    }).catch(() => []);
    for (const l of links) continuedFrom.set(l.createdClanId, l.sourceClan?.name || 'their clan');
  }
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
      // "Continues Algorithm Avengers Clan 2026": the standing clan a closed one became.
      continues: continuedFrom.get(c.id) || null,
      effect,
    };
  });

  /*
   * Suggested order: what they asked for, then their own programme, then the
   * clans whose mentors actually meet, then the lighter load. Inactive clans
   * and cross-programme moves sink — still offered, never recommended.
   */
  const score = (d) => (d.preferred ? 1e6 : 0)
    + (d.continues ? 5e5 : 0)
    + (d.sameProgram ? 1e4 : 0)
    + d.reviewWeeks * 100
    + (d.status === 'active' ? 50 : -500)
    + (d.effect === 'move_cross' ? -300 : 0)
    - d.mentees;
  shaped.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));

  let picks = 0;
  for (const d of shaped) {
    d.suggested = !d.preferred && (Boolean(d.continues) || (picks < 3 && d.status === 'active' && d.activity !== 'none' && d.effect !== 'move_cross'));
    if (d.suggested) picks += 1;
  }
  return shaped;
}

module.exports = { list, effectOf, activityOf };
