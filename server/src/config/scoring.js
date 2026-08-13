/**
 * The performance score — what "how is this mentee doing" means numerically.
 *
 * Six dimensions, each scored 0 to 100 on its own, then combined by weight.
 * They are kept separate rather than multiplied together because they answer
 * different questions, and because a mentee who is asked "why am I 78" deserves
 * an answer with parts they recognise rather than one number from a formula.
 *
 * Every weight here is a DEFAULT. An org can override them in system_settings,
 * and a clan can switch individual dimensions off. See `resolveWeights`.
 *
 * On what is deliberately NOT in here:
 *
 *   - Impact, independence and learning value. There is nowhere to read them
 *     from. A dimension with no data is not a cautious zero, it is a fabricated
 *     number, and it would move real rankings.
 */

/** Each dimension: what it answers, and what it is worth by default. */
const DIMENSIONS = Object.freeze({
  progress: {
    label: 'Progress',
    question: 'Are they where the programme expects them to be?',
    weight: 22
  },
  output: {
    label: 'Output',
    question: 'How much, and how hard, was the work they finished?',
    weight: 17
  },
  effort: {
    label: 'Effort',
    question: 'How much time-weighted work have they taken on?',
    weight: 15
  },
  quality: {
    label: 'Quality',
    question: 'How well was it done, judged against their own mentor?',
    weight: 18
  },
  reliability: {
    label: 'Reliability',
    question: 'Do they deliver by the date they agreed?',
    weight: 13
  },
  attendance: {
    label: 'Attendance',
    question: 'Do they turn up to their clan reviews?',
    weight: 8
  },
  consistency: {
    label: 'Consistency',
    question: 'Do they keep going week to week?',
    weight: 7
  }
});

const DIMENSION_KEYS = Object.freeze(Object.keys(DIMENSIONS));

/** Difficulty as a multiplier on output. Ratios, not the raw point values. */
const DIFFICULTY_WEIGHT = Object.freeze({
  easy: 0.6,
  medium: 1.0,
  hard: 1.6,
  expert: 2.2
});

const DEFAULT_DIFFICULTY_WEIGHT = DIFFICULTY_WEIGHT.medium;

/**
 * How long a piece of work was expected to take.
 *
 * Two generations of roadmap authoring are in the database and they are
 * mutually exclusive: older tasks carry `estimated_hours`, newer linear roadmap
 * steps carry an `effort` t-shirt size, and nothing carries both or neither.
 * Every assigned task has one of them, so effort is the best covered signal
 * there is, but only if both are read onto the same scale.
 *
 * The sizes are mapped onto the hour values actually in use (1, 2, 4, 5, 8, 12)
 * rather than an invented curve, so a size and an estimate mean the same thing.
 */
const EFFORT_HOURS = Object.freeze({
  xs: 1,
  s: 2,
  m: 4,
  l: 8,
  xl: 12
});

/** Hours for a task, from whichever field it happens to carry. */
function effortHours(task) {
  const stated = Number(task?.estimatedHours ?? task?.estimated_hours);
  if (Number.isFinite(stated) && stated > 0) return stated;

  const size = String(task?.effort || '').toLowerCase();
  return EFFORT_HOURS[size] ?? null;
}

/**
 * Nobody is ranked until they have done enough for a ranking to mean anything.
 *
 * Without this, somebody with two excellent tasks outranks somebody with forty
 * good ones, because every dimension is an average. The gate is about having
 * enough evidence, not about being good.
 */
const ELIGIBILITY = Object.freeze({
  minReviewedTasks: 3,
  minProgressPercent: 20
});

function difficultyWeight(difficulty) {
  const key = String(difficulty || '').toLowerCase();
  return DIFFICULTY_WEIGHT[key] ?? DEFAULT_DIFFICULTY_WEIGHT;
}

/**
 * The weights actually in force, after the org's overrides and whatever the
 * clan has switched off.
 *
 * The redistribution is the part that matters. Switching a dimension off must
 * not quietly cost everybody its weight: if attendance is worth 10 and a clan
 * turns it off, the other five are scaled up so the total is still 100.
 * Otherwise every score in that clan drops by ten points and the clan can no
 * longer be compared with any other, which is the opposite of what a mentor
 * turning off an irrelevant dimension was trying to do.
 *
 * @param {object} overrides  partial map of key → weight, from system_settings
 * @param {string[]} disabled keys the clan or org has switched off
 */
function resolveWeights(overrides = {}, disabled = []) {
  const off = new Set(disabled);

  const active = {};
  for (const key of DIMENSION_KEYS) {
    if (off.has(key)) continue;
    const override = Number(overrides?.[key]);
    const weight = Number.isFinite(override) && override >= 0 ? override : DIMENSIONS[key].weight;
    if (weight > 0) active[key] = weight;
  }

  const total = Object.values(active).reduce((sum, w) => sum + w, 0);
  if (total <= 0) return {};

  // Scale back to 100 so a score is comparable whatever is switched off.
  const scaled = {};
  for (const [key, weight] of Object.entries(active)) {
    scaled[key] = (weight / total) * 100;
  }
  return scaled;
}

/**
 * Combine per-dimension scores into one number.
 *
 * A dimension with no data is DROPPED rather than counted as zero, and the rest
 * are rescaled. A clan that has never held a review has no attendance to score,
 * and scoring them zero for it would read as "they never turn up" when the
 * truth is "there was nothing to turn up to".
 *
 * @param {object} scores  key → 0..100, or null when there is nothing to read
 * @param {object} weights from resolveWeights
 */
function combine(scores, weights) {
  const parts = [];
  let totalWeight = 0;

  for (const [key, weight] of Object.entries(weights)) {
    const value = scores?.[key];
    if (value === null || value === undefined || !Number.isFinite(Number(value))) continue;

    const clamped = Math.max(0, Math.min(100, Number(value)));
    parts.push({ key, label: DIMENSIONS[key].label, score: Math.round(clamped), weight });
    totalWeight += weight;
  }

  if (!parts.length) return { score: null, parts: [], covered: 0 };

  const weighted = parts.reduce((sum, p) => sum + p.score * p.weight, 0) / totalWeight;

  return {
    score: Math.round(weighted),
    // Each part carries the share it actually contributed, which is what an
    // explanation screen needs to show.
    parts: parts.map((p) => ({
      ...p,
      share: Math.round((p.weight / totalWeight) * 100),
      contributed: Math.round((p.score * p.weight) / totalWeight)
    })),
    covered: Math.round(totalWeight)
  };
}

/** The words next to the number. A score with no reading is just a number. */
function band(score) {
  if (score === null || score === undefined) return 'Not enough yet';
  if (score >= 90) return 'Exceptional';
  if (score >= 80) return 'Excellent';
  if (score >= 70) return 'Strong';
  if (score >= 60) return 'Developing';
  return 'Needs attention';
}

/**
 * Attendance as a percentage.
 *
 * Only `present` and `absent` count toward the denominator.
 *
 *   - `excused` means they told somebody in advance. That is the opposite of
 *     not turning up, and counting it against them punishes the communication
 *     the programme is trying to encourage.
 *   - not marked means the MENTOR did not take the register. A mentee cannot
 *     be scored down for their mentor's admin.
 *
 * Returns null when nobody was ever marked, so the dimension drops out instead
 * of reading as zero.
 */
function attendanceScore({ present = 0, absent = 0 } = {}) {
  const counted = Number(present) + Number(absent);
  if (counted <= 0) return null;
  return Math.round((Number(present) / counted) * 100);
}

module.exports = {
  DIMENSIONS,
  DIMENSION_KEYS,
  DIFFICULTY_WEIGHT,
  EFFORT_HOURS,
  effortHours,
  ELIGIBILITY,
  difficultyWeight,
  resolveWeights,
  combine,
  band,
  attendanceScore
};
