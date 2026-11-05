/**
 * How a mentee did in a group discussion, as one 1-5 star rating.
 *
 * Two halves, weighted:
 *
 *   FEEDBACK (70%) - the mentor's five 0-100 criteria, averaged. When more
 *   than one mentor rated them, each mentor's average counts once.
 *
 *   ACTIVITY (30%) - what the platform measured: chat messages, time holding
 *   the floor in the meeting, voice notes, and images, videos and files. Each
 *   is the mentee's count against the busiest member of the same group, so a
 *   quiet group is not marked down for being quiet and nobody is compared
 *   with another group. A measure nobody in the group used (no voice notes at
 *   all, say) is left out rather than counted as zero for everybody.
 *
 * Activity is the smaller half on purpose: it counts how much somebody said,
 * not whether it was any good, which is what the mentor's feedback is for.
 * With only one half available the rating is that half alone, and `basis`
 * says which, so a screen can say "activity only".
 *
 * Stars run 1 to 5 in half steps: 1 + 4 x score, rounded to the nearest half.
 * The one exception is a mentee with no feedback and no activity at all while
 * others in the group took part: they get 0, so absence never shows a star.
 * This is the group discussion rating only; no other task uses it.
 */

const FEEDBACK_WEIGHT = 0.7;
const ACTIVITY_WEIGHT = 0.3;

/** Within activity. They sum to 1; a measure left out is shared among the rest. */
const ACTIVITY_WEIGHTS = {
  messages: 0.4,
  talk: 0.25,
  voice: 0.2,
  files: 0.15,
};

const CRITERIA = ['communication', 'relevance', 'openness', 'criticalThinking', 'collaboration'];

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const round = (n, places = 2) => Math.round(n * 10 ** places) / 10 ** places;

/** The mean of each criterion across mentors' rows, 0-100, or null with none. */
function averageCriteria(rows) {
  if (!rows || !rows.length) return null;
  const out = {};
  for (const key of CRITERIA) {
    out[key] = round(rows.reduce((sum, row) => sum + Number(row[key] || 0), 0) / rows.length, 1);
  }
  return out;
}

/** The feedback half, 0-1: the mean of the averaged criteria. */
function feedbackScore(criteria) {
  if (!criteria) return null;
  return clamp01(CRITERIA.reduce((sum, key) => sum + criteria[key], 0) / CRITERIA.length / 100);
}

/**
 * The activity half, 0-1, and what went into it.
 * @param {{messages:number, talk:number, voice:number, files:number}} mine
 * @param {{messages:number, talk:number, voice:number, files:number}} groupMax
 */
function activityScore(mine, groupMax) {
  const parts = {};
  let weight = 0;
  let total = 0;
  for (const [key, w] of Object.entries(ACTIVITY_WEIGHTS)) {
    const max = Number(groupMax[key] || 0);
    if (max <= 0) continue;
    const share = clamp01(Number(mine[key] || 0) / max);
    parts[key] = round(share);
    weight += w;
    total += w * share;
  }
  return { score: weight ? clamp01(total / weight) : null, parts };
}

const toStars = (score) => Math.round((1 + 4 * clamp01(score)) * 2) / 2;

/**
 * The rating for one mentee.
 * @returns {{ stars: number|null, score: number|null, basis: 'both'|'feedback'|'activity'|null,
 *   feedback: { score: number|null, criteria: object|null, raters: number },
 *   activity: { score: number|null, parts: object } }}
 */
function discussionRating({ feedbackRows = [], mine, groupMax }) {
  const criteria = averageCriteria(feedbackRows);
  const fb = feedbackScore(criteria);
  const act = activityScore(mine, groupMax);

  let score = null;
  let basis = null;
  if (fb !== null && act.score !== null) {
    score = FEEDBACK_WEIGHT * fb + ACTIVITY_WEIGHT * act.score;
    basis = 'both';
  } else if (fb !== null) {
    score = fb;
    basis = 'feedback';
  } else if (act.score !== null) {
    score = act.score;
    basis = 'activity';
  }

  // Nothing to rate them on: no feedback, and nothing measured against a group
  // that did speak or post. That is 0 stars, not the 1 the scale starts at -
  // a mentee who never showed up must not read as having earned a star.
  const nothingDone = basis === 'activity' && act.score === 0;

  return {
    stars: score === null ? null : nothingDone ? 0 : toStars(score),
    score: score === null ? null : round(score),
    basis,
    feedback: { score: fb === null ? null : round(fb), criteria, raters: feedbackRows.length },
    activity: { score: act.score === null ? null : round(act.score), parts: act.parts },
  };
}

module.exports = {
  discussionRating,
  averageCriteria,
  activityScore,
  toStars,
  CRITERIA,
  FEEDBACK_WEIGHT,
  ACTIVITY_WEIGHT,
  ACTIVITY_WEIGHTS,
};
