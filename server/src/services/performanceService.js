const { requireWorkspaceId } = require('../utils/workspaceExecution');
const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const cohortService = require('./cohortService');
const scoringSettingsService = require('./scoringSettingsService');
const { NotFoundError } = require('../utils/errors/errorTypes');
const { isNonProgrammeClan } = require('../config/clanKinds');
const {
  DIFFICULTY_WEIGHT,
  taskOutputWeight,
  EFFORT_HOURS,
  ELIGIBILITY,
  attendanceScore,
  band,
  combine
} = require('../config/scoring');

/**
 * The performance score: one number per mentee, and the parts it came from.
 *
 * Everything here is computed for a GROUP at once, never per mentee, and that
 * is a correctness requirement rather than an optimisation. Two of the six
 * dimensions only mean anything relative to peers:
 *
 *   - Output is a percentile. "Finished eleven things" says nothing until you
 *     know whether the rest of the clan finished three or thirty.
 *   - Quality is divided by the mentor's own average, so a generous mentor
 *     cannot manufacture a clan of champions and a strict one cannot bury a
 *     good mentee. Without this the leaderboard mostly ranks mentors.
 *
 * Score a mentee alone and both of those silently become meaningless.
 */

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** On track reads as Strong rather than perfect, leaving room to be ahead. */
const ON_TRACK_SCORE = 75;

/** End of the UTC calendar day for an as-of instant (whole close day counts). */
function asOfDayEnd(asOf) {
  if (!asOf) return null;
  const d = new Date(asOf);
  if (Number.isNaN(d.getTime())) return null;
  const dateKey = d.toISOString().slice(0, 10);
  return { dateKey, end: new Date(`${dateKey}T23:59:59.999Z`) };
}

class PerformanceService {
  /**
   * Attendance tallies per mentee, in one grouped query.
   *
   * `excused` and unmarked entries are counted but deliberately kept out of the
   * denominator by `attendanceScore`. They are returned so a screen can show
   * "3 of 4, plus 2 excused" rather than an unexplained percentage.
   */
  async attendanceCounts(menteeIds, scope = {}) {
    const empty = {};
    if (!menteeIds.length) return empty;

    const sessionWhere = { ...cohortService.clanWhere(scope) };
    if (scope.asOfDateKey) sessionWhere.sessionDate = { [Op.lte]: scope.asOfDateKey };

    const rows = await models.CohortReviewEntry.findAll({
      where: { menteeId: { [Op.in]: menteeIds } },
      attributes: [
        'menteeId',
        'attendance',
        [sequelize.fn('COUNT', sequelize.col('CohortReviewEntry.id')), 'n']
      ],
      include: [{ model: models.CohortReviewSession, as: 'session', attributes: [], required: true, where: sessionWhere }],
      group: ['mentee_id', 'attendance'],
      raw: true
    });

    for (const row of rows) {
      const bucket = (empty[row.menteeId] ??= { present: 0, absent: 0, excused: 0, unmarked: 0 });
      const key = row.attendance || 'unmarked';
      if (key in bucket) bucket[key] += Number(row.n) || 0;
    }
    return empty;
  }

  /**
   * Weeks in which the mentee finished something, against weeks they have been
   * enrolled. Turning up most weeks scores higher than one heroic fortnight
   * followed by silence.
   */
  async consistencyCounts(menteeIds, scope = {}) {
    const out = {};
    if (!menteeIds.length) return out;

    const asOfSql = scope.asOfEnd ? 'AND completed_at <= :asOfEnd' : '';
    const [rows] = await sequelize.query(
      `SELECT mentee_id,
              COUNT(DISTINCT date_trunc('week', completed_at))::int AS active_weeks
         FROM assigned_tasks
        WHERE organization_id = :organizationId AND mentee_id IN (:ids)
          AND status = 'completed'
          AND completed_at IS NOT NULL
          ${asOfSql}
          AND ${cohortService.taskSql(scope)}
        GROUP BY mentee_id`,
      { replacements: { ids: menteeIds, organizationId: requireWorkspaceId(), asOfEnd: scope.asOfEnd || null } }
    );


    for (const row of rows) out[row.mentee_id] = Number(row.active_weeks) || 0;
    return out;
  }

  /**
   * Each mentor's average rating across everyone they grade, which is what
   * quality gets divided by.
   */
  async mentorAverages(menteeIds, scope = {}) {
    const out = {};
    if (!menteeIds.length) return out;

    const asOfSql = scope.asOfEnd ? 'AND completed_at IS NOT NULL AND completed_at <= :asOfEnd' : '';
    const [rows] = await sequelize.query(
      `SELECT mentor_id, AVG(final_rating)::float AS avg_rating
         FROM assigned_tasks
        WHERE organization_id = :organizationId AND final_rating IS NOT NULL
          AND mentor_id IS NOT NULL
          ${asOfSql}
          AND ${cohortService.taskSql(scope)}
        GROUP BY mentor_id`,
      { replacements: { organizationId: requireWorkspaceId(), asOfEnd: scope.asOfEnd || null } }
    );


    for (const row of rows) out[row.mentor_id] = Number(row.avg_rating) || null;
    return out;
  }

  /** Which mentor grades this mentee, so their generosity can be divided out. */
  async gradingMentors(menteeIds, scope = {}) {
    const out = {};
    if (!menteeIds.length) return out;

    const asOfSql = scope.asOfEnd ? 'AND COALESCE(assigned_at, created_at) <= :asOfEnd' : '';
    const [rows] = await sequelize.query(
      `SELECT DISTINCT ON (mentee_id) mentee_id, mentor_id
         FROM assigned_tasks
        WHERE organization_id = :organizationId AND mentee_id IN (:ids) AND mentor_id IS NOT NULL
          ${asOfSql}
          AND ${cohortService.taskSql(scope)}
        ORDER BY mentee_id, updated_at DESC`,
      { replacements: { ids: menteeIds, organizationId: requireWorkspaceId(), asOfEnd: scope.asOfEnd || null } }
    );


    for (const row of rows) out[row.mentee_id] = row.mentor_id;
    return out;
  }

  /**
   * Expected hours of finished work per mentee, in one query.
   *
   * Two generations of roadmap authoring sit in this table and they are
   * mutually exclusive: older tasks carry `estimated_hours`, newer linear
   * roadmap steps carry an `effort` size. Every assigned task has one of them,
   * so both are read onto the same hour scale here rather than one of them
   * being silently worth nothing.
   */
  async effortHours(menteeIds, scope = {}) {
    const out = {};
    if (!menteeIds.length) return out;

    const sizeCase = Object.entries(EFFORT_HOURS)
      .map(([size, hours]) => `WHEN '${size}' THEN ${hours}`)
      .join(' ');

    const asOfSql = scope.asOfEnd ? 'AND a.completed_at IS NOT NULL AND a.completed_at <= :asOfEnd' : '';
    const [rows] = await sequelize.query(
      `SELECT a.mentee_id,
              COALESCE(SUM(
                COALESCE(
                  rt.estimated_hours,
                  CASE lower(rt.effort) ${sizeCase} ELSE NULL END
                )
              ), 0)::float AS hours
         FROM assigned_tasks a
         JOIN roadmap_tasks rt ON rt.id = a.roadmap_task_id
        WHERE a.organization_id = :organizationId AND rt.organization_id = :organizationId AND a.mentee_id IN (:ids)
          AND a.status = 'completed'
          ${asOfSql}
          AND ${cohortService.taskSql(scope, 'a')}
        GROUP BY a.mentee_id`,
      { replacements: { ids: menteeIds, organizationId: requireWorkspaceId(), asOfEnd: scope.asOfEnd || null } }
    );


    for (const row of rows) out[row.mentee_id] = Number(row.hours) || 0;
    return out;
  }

  /** Task Type x Difficulty-weighted count of finished work. */
  weightedOutput(row) {
    if (Array.isArray(row.completedTasks)) {
      return row.completedTasks.reduce((sum, task) => {
        const type = task.typeOverride || task.type || task.roadmapTask?.type || 'custom';
        const difficulty = task.difficulty || task.roadmapTask?.difficulty || 'medium';
        return sum + taskOutputWeight(type, difficulty);
      }, 0);
    }

    return (
      (row.tasksEasy || 0) * DIFFICULTY_WEIGHT.easy +
      (row.tasksMedium || 0) * DIFFICULTY_WEIGHT.medium +
      (row.tasksHard || 0) * DIFFICULTY_WEIGHT.hard
    );
  }

  /**
   * Where a value sits among its peers, 0 to 100.
   *
   * With one person there is nobody to compare against, so this returns a
   * neutral score rather than crowning them: being the only mentee in a clan is
   * not an achievement.
   */
  percentile(value, all) {
    if (all.length < 2) return 50;
    const below = all.filter((v) => v < value).length;
    const equal = all.filter((v) => v === value).length;
    // Midpoint of the tie band, so identical work scores identically.
    return Math.round(((below + equal / 2) / all.length) * 100);
  }

  /**
   * Score a set of mentees together.
   *
   * @param {string[]} menteeIds
   * @param {object}   options.clanId  scopes which dimensions are switched off
   */
  async scoreMentees(menteeIds, { clanId = null, programId = null, live = false, asOf = null } = {}) {
    const ids = [...new Set(menteeIds)].filter(Boolean);
    if (!ids.length) return { weights: {}, disabled: [], mentees: [], eligibility: ELIGIBILITY };
    // Standing clans share a programId with the closed cohort but must never
    // inherit that program scope — only this clan's own work is scored.
    let standing = false;
    if (clanId) {
      const clan = await models.Clan.findByPk(clanId);
      if (isNonProgrammeClan(clan)) standing = true;
      else programId = clan?.programId || programId;
    }
    const bounds = asOfDayEnd(asOf);
    const scope = {
      clanId,
      ...(standing ? { standing: true } : { programId }),
      ...(bounds ? { asOfEnd: bounds.end, asOfDateKey: bounds.dateKey } : {}),
    };
    // Score live evidence; when asOf is set (program close date), ignore later activity.

    const [
      { weights, disabled, disabledBy },
      preloads,
      attendance,
      activeWeeks,
      mentorAvgs,
      mentorOf,
      hoursDone
    ] = await Promise.all([
      scoringSettingsService.effectiveWeights(clanId),
      cohortService.preloadMenteeData(ids, scope),
      this.attendanceCounts(ids, scope),
      this.consistencyCounts(ids, scope),
      this.mentorAverages(ids, scope),
      this.gradingMentors(ids, scope),
      this.effortHours(ids, scope)
    ]);

    const rows = (await Promise.all(ids.map((id) => cohortService.buildMenteeRow(id, preloads))))
      .filter(Boolean);

    // Peer context, computed once for the whole group.
    const outputs = rows.map((r) => this.weightedOutput(r));
    const efforts = rows.map((r) => hoursDone[r.id] || 0);
    const ratings = rows.map((r) => Number(r.avgRating) || 0).filter((n) => n > 0);
    const peerAvgRating = ratings.length
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : null;

    const mentees = rows.map((row) => {
      const expected = row.totalWeeks
        ? clamp(Math.round((row.week / row.totalWeeks) * 100), 0, 100)
        : null;

      // Progress: where they are against where the programme expects them.
      const progress = expected
        ? clamp(Math.round((row.absoluteProgress / expected) * ON_TRACK_SCORE), 0, 100)
        : row.absoluteProgress;

      // Output: how much finished work, weighted by difficulty, against peers.
      const output = this.percentile(this.weightedOutput(row), outputs);

      // Effort: expected hours of finished work, against the clan. Deliberately
      // the ESTIMATE rather than time anybody logged, so the dimension rewards
      // taking on bigger work and never rewards being slow at small work.
      const effortDone = hoursDone[row.id] ?? null;
      const effort = effortDone === null ? null : this.percentile(effortDone, efforts);

      // Quality: their rating, divided by their own mentor's generosity.
      const raw = Number(row.avgRating) || 0;
      const mentorAvg = mentorAvgs[mentorOf[row.id]] || null;
      let quality = null;
      if (raw > 0) {
        const adjusted =
          mentorAvg && peerAvgRating && mentorAvg > 0 ? raw * (peerAvgRating / mentorAvg) : raw;
        quality = clamp(Math.round((adjusted / 5) * 100), 0, 100);
      }

      const reliability = Number.isFinite(row.onTimeRate) ? row.onTimeRate : null;

      const tally = attendance[row.id] || null;
      const attended = tally ? attendanceScore(tally) : null;

      // Consistency: weeks they finished something, against weeks enrolled.
      const weeksIn = Math.max(1, row.week || 1);
      const consistency = clamp(
        Math.round(((activeWeeks[row.id] || 0) / weeksIn) * 100),
        0,
        100
      );

      const scores = {
        progress,
        output,
        effort,
        quality,
        reliability,
        attendance: attended,
        consistency
      };
      const { score, parts, covered } = combine(scores, weights);

      // Eligibility is about having enough evidence, not about being good.
      const reviewed = row.tasksCompleted || 0;
      const blockers = [];
      if (reviewed < ELIGIBILITY.minReviewedTasks) {
        blockers.push(`only ${reviewed} reviewed ${reviewed === 1 ? 'task' : 'tasks'}`);
      }
      if (row.absoluteProgress < ELIGIBILITY.minProgressPercent) {
        blockers.push(`${row.absoluteProgress}% through the programme`);
      }

      return {
        id: row.id,
        name: row.name,
        avatar: row.avatar,
        profilePictureUrl: row.profilePictureUrl,
        program: row.program,
        score,
        band: band(score),
        parts,
        covered,
        eligible: blockers.length === 0 && score !== null,
        notRankedBecause: blockers.length ? blockers.join(', ') : null,
        // Preserve the compact roster report alongside the scored components.
        report: Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'completedTasks')),
        evidence: {
          absoluteProgress: row.absoluteProgress,
          relativeProgress: row.relativeProgress,
          expectedProgress: expected,
          tasksCompleted: reviewed,
          onTimeRate: row.onTimeRate,
          avgRating: raw || null,
          mentorAvgRating: mentorAvg ? Math.round(mentorAvg * 100) / 100 : null,
          attendance: tally,
          effortHours: Math.round((hoursDone[row.id] || 0) * 10) / 10,
          activeWeeks: activeWeeks[row.id] || 0,
          weeksEnrolled: weeksIn,
          risk: row.risk
        }
      };
    });

    // The bar travels with the answer. Without it a client can say "only 2
    // reviewed tasks" but not "2 of 3", which is the difference between a
    // statement and something a mentor can act on this week.
    return { weights, disabled, disabledBy, mentees, eligibility: ELIGIBILITY };
  }

  /**
   * The ranked list. Ineligible mentees are returned too, separately, so a
   * mentor can see who was left out and why rather than wondering.
   */
  async leaderboard(menteeIds, { clanId = null, limit = null } = {}) {
    const { weights, disabled, disabledBy, mentees } = await this.scoreMentees(menteeIds, { clanId });

    const eligible = mentees
      .filter((m) => m.eligible)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .map((m, index) => ({ ...m, rank: m.historical ? m.rank : index + 1 }));

    const notRanked = mentees
      .filter((m) => !m.eligible)
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      weights,
      disabled,
      disabledBy,
      ranked: limit ? eligible.slice(0, limit) : eligible,
      notRanked,
      counted: eligible.length
    };
  }

  /** Every active mentee in one clan, ranked. */
  async clanLeaderboard(clanId, options = {}) {
    const menteeIds = await cohortService.resolveMenteeIdsForClan(clanId);
    return this.leaderboard(menteeIds, { ...options, clanId });
  }

  /** A clan's own number: the mean score of everybody in it with one. */
  async clanAverage(clanId) {
    const menteeIds = await cohortService.resolveMenteeIdsForClan(clanId);
    if (!menteeIds.length) return null;

    const { mentees } = await this.scoreMentees(menteeIds, { clanId });
    const scored = mentees.filter((m) => m.eligible);
    if (!scored.length) return null;

    return Math.round(scored.reduce((sum, m) => sum + m.score, 0) / scored.length);
  }

  /**
   * Where one clan sits among the others in its own programme.
   *
   * Only within the programme. Clans on different curricula are scored against
   * different work, and ranking them together would produce a league table that
   * says more about which programme is harder than about anybody's mentoring.
   *
   * Returns the asking clan's position and nothing else: no other clan's name,
   * id or score. A mentor learning they are third of nine is useful; a mentor
   * learning which of their colleagues is ninth is a staffroom problem, and the
   * mentees in that clan never agreed to be a data point in it.
   *
   * A clan with nobody scored yet has no position rather than last place. There
   * is a real difference between doing badly and not having started.
   */
  async clanStanding(clanId) {
    const clan = await models.Clan.findByPk(clanId, { attributes: ['id', 'programId', 'kind'] });
    if (!clan) throw new NotFoundError('Clan not found');
    // Outside the programme (standing, or a selection round): nothing to rank
    // against, and a trial must never place somebody on a programme ladder.
    if (isNonProgrammeClan(clan)) return { average: null, band: null, rank: null, outOf: 0, ranked: 0 };

    const siblings = await models.Clan.findAll({
      where: { programId: clan.programId, kind: 'cohort' },
      attributes: ['id']
    });

    const averages = await Promise.all(
      siblings.map(async (sibling) => ({
        id: sibling.id,
        average: await this.clanAverage(sibling.id)
      }))
    );

    const scored = averages
      .filter((entry) => entry.average !== null)
      .sort((a, b) => b.average - a.average);

    const mine = averages.find((entry) => entry.id === clanId);
    const at = scored.findIndex((entry) => entry.id === clanId);

    return {
      average: mine ? mine.average : null,
      band: band(mine && mine.average !== null ? mine.average : null),
      rank: at >= 0 ? at + 1 : null,
      // Every clan in the programme, including the ones with nobody scored, so
      // "third of nine" is not silently "third of the four that had started".
      outOf: siblings.length,
      /** How many have enough work to be placed at all. */
      ranked: scored.length
    };
  }
}

module.exports = new PerformanceService();
