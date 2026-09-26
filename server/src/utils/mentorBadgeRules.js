'use strict';

/**
 * Automatic mentor badge rules.
 *
 * Historical policy (award + catalog progress share this):
 * Qualifying activity from any time in the organization counts toward the
 * threshold. Publishing a badge does NOT scan the org. Awards run only when
 * checkAndAwardMentorBadges is invoked after the mentor’s next qualifying
 * event (or another mentor activity hook), so concurrent retries stay
 * idempotent via the existing UserBadge unique constraint.
 *
 * Manual-only (not implemented here): custom / Thoughtful Feedback subjectivity,
 * Timely Support (latency+quality), Blocker Resolver (no resolvedBy),
 * Mentee Growth (no mentor-attributed growth metric).
 */

const { Op } = require('sequelize');

const MENTOR_AUTO_CRITERIA = Object.freeze([
  'mentor_accepted_answers',
  'mentor_qualifying_reviews',
  'mentor_distinct_mentees',
  'mentor_rating',
  'mentor_sessions_finished',
  'mentor_cert_verifications',
]);

const REVIEW_STUB_TEXT = ['Approved.', 'Changes requested.', 'Approved', 'Rejected.'];

/** Bulk rubber-stamps lack individual review substance. */
function qualifyingReviewWhere(mentorId) {
  return {
    mentorId,
    [Op.not]: {
      [Op.and]: [
        { feedbackText: { [Op.in]: REVIEW_STUB_TEXT } },
        {
          [Op.or]: [
            { decision: null },
            { decision: 'approved' },
          ],
        },
        {
          [Op.or]: [
            { inlineFeedback: null },
            { inlineFeedback: [] },
          ],
        },
        {
          [Op.or]: [
            { checkedCriteria: null },
            { checkedCriteria: [] },
          ],
        },
      ],
    },
  };
}

function isMentorAutoCriteria(criteriaType) {
  return MENTOR_AUTO_CRITERIA.includes(criteriaType);
}

async function countAcceptedAnswers(models, mentorId, organizationId) {
  // Trusted source: same ledger that pays mentor accepted-answer XP
  // (excludes self-accept; org-scoped; one row per accepted question event).
  return models.PointsHistory.count({
    where: {
      userId: mentorId,
      sourceType: 'community_answer',
      organizationId,
      pointsChange: { [Op.gt]: 0 },
    },
  });
}

async function countQualifyingReviews(models, mentorId) {
  return models.TaskFeedback.count({ where: qualifyingReviewWhere(mentorId) });
}

async function countDistinctMenteesReviewed(models, sequelize, mentorId) {
  const [row] = await models.TaskFeedback.findAll({
    attributes: [[sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('assignedTask.mentee_id'))), 'cnt']],
    where: qualifyingReviewWhere(mentorId),
    include: [{
      model: models.AssignedTask,
      as: 'assignedTask',
      attributes: [],
      required: true,
    }],
    raw: true,
  });
  return Number(row?.cnt || 0);
}

async function mentorRatingStats(models, mentorId, { minReviews = 3 } = {}) {
  const reviews = await models.ProgramReview.findAll({
    where: { mentorId },
    attributes: ['rating'],
  });
  const ratings = reviews.map((r) => Number(r.rating)).filter((n) => Number.isFinite(n));
  const count = ratings.length;
  if (count < minReviews) {
    return { count, average: null, qualifies: false };
  }
  const sorted = [...ratings].sort((a, b) => a - b);
  let mean;
  if (sorted.length >= 4) {
    const trimmed = sorted.slice(1, -1);
    mean = trimmed.reduce((s, n) => s + n, 0) / trimmed.length;
  } else {
    mean = sorted.reduce((s, n) => s + n, 0) / sorted.length;
  }
  return { count, average: mean, qualifies: true };
}

async function countFinishedSessions(models, mentorId) {
  // Credit the mentor who started the session (only reliable attribution today).
  return models.CohortReviewSession.count({
    where: { mentorId, status: 'finished' },
  });
}

async function countCertVerifications(models, mentorId, organizationId) {
  return models.CertificateVerification.count({
    where: {
      verifiedBy: mentorId,
      status: 'verified',
      organizationId,
    },
  });
}

async function measureMentorCriteria(models, sequelize, mentorId, organizationId, badge) {
  const type = badge.criteriaType;
  const value = badge.criteriaValue || {};
  switch (type) {
    case 'mentor_accepted_answers': {
      const current = await countAcceptedAnswers(models, mentorId, organizationId);
      const target = Number(value.count || 0);
      return {
        measurable: target > 0,
        current,
        target,
        unit: 'accepted answers',
        label: `${Math.min(current, target)}/${target} accepted answers`,
        met: target > 0 && current >= target,
      };
    }
    case 'mentor_qualifying_reviews': {
      const current = await countQualifyingReviews(models, mentorId);
      const target = Number(value.count || 0);
      return {
        measurable: target > 0,
        current,
        target,
        unit: 'qualifying reviews',
        label: `${Math.min(current, target)}/${target} qualifying reviews`,
        met: target > 0 && current >= target,
      };
    }
    case 'mentor_distinct_mentees': {
      const current = await countDistinctMenteesReviewed(models, sequelize, mentorId);
      const target = Number(value.menteeCount || 0);
      return {
        measurable: target > 0,
        current,
        target,
        unit: 'mentees reviewed',
        label: `${Math.min(current, target)}/${target} mentees reviewed`,
        met: target > 0 && current >= target,
      };
    }
    case 'mentor_rating': {
      const minRating = Number(value.minRating || 0);
      const minReviews = Math.max(3, Number(value.minReviews || 3));
      const stats = await mentorRatingStats(models, mentorId, { minReviews });
      return {
        measurable: minRating > 0,
        current: stats.average == null ? 0 : Number(stats.average.toFixed(2)),
        target: minRating,
        unit: 'avg rating',
        label: stats.qualifies
          ? `${stats.average.toFixed(2)}/${minRating} avg (${stats.count} reviews)`
          : `${stats.count}/${minReviews} reviews needed`,
        met: stats.qualifies && stats.average >= minRating,
      };
    }
    case 'mentor_sessions_finished': {
      const current = await countFinishedSessions(models, mentorId);
      const target = Number(value.count || 0);
      return {
        measurable: target > 0,
        current,
        target,
        unit: 'finished sessions',
        label: `${Math.min(current, target)}/${target} finished sessions`,
        met: target > 0 && current >= target,
      };
    }
    case 'mentor_cert_verifications': {
      const current = await countCertVerifications(models, mentorId, organizationId);
      const target = Number(value.count || 0);
      return {
        measurable: target > 0,
        current,
        target,
        unit: 'verifications',
        label: `${Math.min(current, target)}/${target} verifications`,
        met: target > 0 && current >= target,
      };
    }
    default:
      return { measurable: false, met: false };
  }
}

module.exports = {
  MENTOR_AUTO_CRITERIA,
  REVIEW_STUB_TEXT,
  isMentorAutoCriteria,
  qualifyingReviewWhere,
  measureMentorCriteria,
};
