const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const cohortService = require('./cohortService');
const scoringSettingsService = require('./scoringSettingsService');
const {
  DIFFICULTY_WEIGHT,
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

class PerformanceService {
  /**
   * Attendance tallies per mentee, in one grouped query.
   *
   * `excused` and unmarked entries are counted but deliberately kept out of the
   * denominator by `attendanceScore`. They are returned so a screen can show
   * "3 of 4, plus 2 excused" rather than an unexplained percentage.
   */
  async attendanceCounts(menteeIds) {
    const empty = {};
    if (!menteeIds.length) return empty;

    const rows = await models.CohortReviewEntry.findAll({
      where: { menteeId: { [Op.in]: menteeIds } },
      attributes: [
        'menteeId',
        'attendance',
        [sequelize.fn('COUNT', sequelize.col('id')), 'n']
      ],
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
  async consistencyCounts(menteeIds) {
    const out = {};
    if (!menteeIds.length) return out;

    const [rows] = await sequelize.query(
      `SELECT mentee_id,
              COUNT(DISTINCT date_trunc('week', completed_at))::int AS active_weeks
         FROM assigned_tasks
        WHERE mentee_id IN (:ids)
          AND status = 'completed'
          AND completed_at IS NOT NULL
        GROUP BY mentee_id`,
      { replacements: { ids: menteeIds } }
    );

    for (const row of rows) out[row.mentee_id] = Number(row.active_weeks) || 0;
    return out;
  }

  /**
   * Each mentor's average rating across everyone they grade, which is what
   * quality gets divided by.
   */
  async mentorAverages(menteeIds) {
    const out = {};
    if (!menteeIds.length) return out;

    const [rows] = await sequelize.query(
      `SELECT mentor_id, AVG(final_rating)::float AS avg_rating
         FROM assigned_tasks
        WHERE final_rating IS NOT NULL
          AND mentor_id IS NOT NULL
        GROUP BY mentor_id`,
      {}
    );

    for (const row of rows) out[row.mentor_id] = Number(row.avg_rating) || null;
    return out;
  }

  /** Which mentor grades this mentee, so their generosity can be divided out. */
  async gradingMentors(menteeIds) {
    const out = {};
    if (!menteeIds.length) return out;

    const [rows] = await sequelize.query(
      `SELECT DISTINCT ON (mentee_id) mentee_id, mentor_id
         FROM assigned_tasks
        WHERE mentee_id IN (:ids) AND mentor_id IS NOT NULL
        ORDER BY mentee_id, updated_at DESC`,
      { replacements: { ids: menteeIds } }
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
  async effortHours(menteeIds) {
    const out = {};
    if (!menteeIds.length) return out;

    const sizeCase = Object.entries(EFFORT_HOURS)
      .map(([size, hours]) => `WHEN '${size}' THEN ${hours}`)
      .join(' ');

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
        WHERE a.mentee_id IN (:ids)
          AND a.status = 'completed'
        GROUP BY a.mentee_id`,
      { replacements: { ids: menteeIds } }
    );

    for (const row of rows) out[row.mentee_id] = Number(row.hours) || 0;
    return out;
  }

  /** Difficulty-weighted count of finished work. */
  weightedOutput(row) {
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
  async scoreMentees(menteeIds, { clanId = null } = {}) {
    const ids = [...new Set(menteeIds)].filter(Boolean);
    if (!ids.length) return { weights: {}, disabled: [], mentees: [] };

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
      cohortService.preloadMenteeData(ids),
      this.attendanceCounts(ids),
      this.consistencyCounts(ids),
      this.mentorAverages(ids),
      this.gradingMentors(ids),
      this.effortHours(ids)
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

    return { weights, disabled, disabledBy, mentees };
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
      .map((m, index) => ({ ...m, rank: index + 1 }));

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
}

module.exports = new PerformanceService();
