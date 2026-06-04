const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors/errorTypes');

/**
 * Anonymous, structured mentee→mentor feedback collected at program completion.
 *
 * Design intent (the "clever, fair" mechanism):
 *  - Feedback is per-dimension (responsiveness/helpfulness/clarity/support) on a
 *    1–5 scale, plus optional free text and a would-recommend flag.
 *  - It is ANONYMOUS to the mentor: the mentor only ever sees AGGREGATES, and
 *    only once there are enough responses to mask any single voice.
 *  - To resist a single angry/over-generous review skewing things, aggregates
 *    are computed with a trimmed mean (drop the highest & lowest once n is large
 *    enough). This protects the mentor from outliers and the mentee from being
 *    identifiable.
 *  - Admins can see the raw distribution (still without reviewer identity by
 *    default) for moderation.
 */
const DIMENSIONS = ['responsiveness', 'helpfulness', 'clarity', 'support'];
const MIN_RESPONSES_TO_REVEAL = 3; // mentor sees nothing until 3 reviews exist

class ProgramReviewService {
  /**
   * Resolve the mentor being reviewed for an enrollment: prefer an active 1:1
   * match, else the lead mentor of the mentee's active clan for that program,
   * else any co/core mentor. Returns a mentor userId or null.
   */
  async _resolveMentorForEnrollment(enrollment) {
    const match = await models.MentorMenteeMatch.findOne({
      where: { enrollmentId: enrollment.id, status: 'active' },
      attributes: ['mentorId']
    });
    if (match) return match.mentorId;

    const menteeClans = await models.ClanMembership.findAll({
      where: { userId: enrollment.menteeId, status: 'active', role: 'mentee' },
      include: [{ model: models.Clan, as: 'clan', attributes: ['programId'] }]
    });
    const clanIds = menteeClans
      .filter((m) => !m.clan || m.clan.programId === enrollment.programId)
      .map((m) => m.clanId);
    if (!clanIds.length) return null;

    const mentors = await models.ClanMembership.findAll({
      where: { clanId: { [Op.in]: clanIds }, status: 'active', role: { [Op.in]: ['lead_mentor', 'co_mentor', 'core_team'] } },
      attributes: ['userId', 'role']
    });
    if (!mentors.length) return null;
    const lead = mentors.find((m) => m.role === 'lead_mentor');
    return (lead || mentors[0]).userId;
  }

  _validateDimensions(dimensions) {
    if (!dimensions || typeof dimensions !== 'object') {
      throw new ValidationError('Feedback ratings are required');
    }
    const clean = {};
    let provided = 0;
    for (const key of DIMENSIONS) {
      const v = dimensions[key];
      if (v === undefined || v === null || v === '') continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 1 || n > 5) {
        throw new ValidationError(`"${key}" must be a rating between 1 and 5`);
      }
      clean[key] = Math.round(n * 100) / 100;
      provided += 1;
    }
    if (provided === 0) throw new ValidationError('Rate at least one dimension');
    return clean;
  }

  /**
   * Mentee submits (or updates) their review for a completed enrollment.
   * One review per (program, reviewer) — enforced by a unique index; we upsert.
   */
  async submitReview(enrollmentId, reviewerId, { dimensions, reviewText, wouldRecommend } = {}) {
    const enrollment = await models.Enrollment.findByPk(enrollmentId);
    if (!enrollment) throw new NotFoundError('Enrollment not found');
    if (enrollment.menteeId !== reviewerId) {
      throw new ForbiddenError('You can only review your own program');
    }
    if (enrollment.status !== 'program_completed') {
      throw new ValidationError('You can leave feedback once the program is completed');
    }

    const clean = this._validateDimensions(dimensions);
    const values = Object.values(clean);
    const overall = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
    const mentorId = await this._resolveMentorForEnrollment(enrollment);

    const existing = await models.ProgramReview.findOne({
      where: { programId: enrollment.programId, reviewerId }
    });

    const payload = {
      programId: enrollment.programId,
      reviewerId,
      enrollmentId,
      mentorId,
      rating: overall,
      mentorQualityRating: overall,
      reviewText: reviewText ? String(reviewText).trim().slice(0, 4000) : null,
      dimensions: clean,
      wouldRecommend: typeof wouldRecommend === 'boolean' ? wouldRecommend : null
    };

    if (existing) {
      await existing.update(payload);
      return { review: existing, updated: true };
    }
    const review = await models.ProgramReview.create(payload);
    return { review, updated: false };
  }

  /** Has this mentee already reviewed this enrollment's program? */
  async getMyReview(enrollmentId, reviewerId) {
    const enrollment = await models.Enrollment.findByPk(enrollmentId, { attributes: ['id', 'programId', 'menteeId', 'status'] });
    if (!enrollment) throw new NotFoundError('Enrollment not found');
    if (enrollment.menteeId !== reviewerId) throw new ForbiddenError('Not your enrollment');
    const review = await models.ProgramReview.findOne({
      where: { programId: enrollment.programId, reviewerId }
    });
    return {
      canReview: enrollment.status === 'program_completed',
      hasReviewed: Boolean(review),
      review: review ? { dimensions: review.dimensions, reviewText: review.reviewText, wouldRecommend: review.wouldRecommend, rating: Number(review.rating) } : null,
      dimensions: DIMENSIONS
    };
  }

  /** Trimmed mean — drops one high + one low once there are ≥4 values. */
  _trimmedMean(nums) {
    if (!nums.length) return null;
    if (nums.length < 4) {
      return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
    }
    const sorted = [...nums].sort((a, b) => a - b);
    const trimmed = sorted.slice(1, -1);
    return Math.round((trimmed.reduce((a, b) => a + b, 0) / trimmed.length) * 100) / 100;
  }

  /**
   * Aggregate feedback for a mentor. Returns { revealed:false } until there are
   * at least MIN_RESPONSES_TO_REVEAL reviews, so no single mentee is exposed.
   * Aggregates use a trimmed mean to blunt outliers.
   */
  async getMentorFeedbackSummary(mentorId) {
    const reviews = await models.ProgramReview.findAll({
      where: { mentorId },
      attributes: ['dimensions', 'rating', 'wouldRecommend', 'reviewText', 'createdAt']
    });

    const total = reviews.length;
    if (total < MIN_RESPONSES_TO_REVEAL) {
      return { revealed: false, total, minResponses: MIN_RESPONSES_TO_REVEAL, dimensions: DIMENSIONS };
    }

    const perDimension = {};
    for (const key of DIMENSIONS) {
      const vals = reviews.map((r) => Number(r.dimensions?.[key])).filter((n) => Number.isFinite(n));
      perDimension[key] = vals.length ? { average: this._trimmedMean(vals), responses: vals.length } : null;
    }

    const overallVals = reviews.map((r) => Number(r.rating)).filter(Number.isFinite);
    const recommendVals = reviews.map((r) => r.wouldRecommend).filter((v) => typeof v === 'boolean');
    const recommendRate = recommendVals.length
      ? Math.round((recommendVals.filter(Boolean).length / recommendVals.length) * 100)
      : null;

    // Anonymized highlight quotes (text only, no attribution), most recent first.
    const quotes = reviews
      .filter((r) => r.reviewText && r.reviewText.trim())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5)
      .map((r) => r.reviewText.trim());

    return {
      revealed: true,
      total,
      overall: this._trimmedMean(overallVals),
      perDimension,
      recommendRate,
      recommendResponses: recommendVals.length,
      quotes,
      dimensions: DIMENSIONS
    };
  }

  /**
   * Admin moderation view: raw reviews for a mentor (reviewer identity withheld
   * by default to honour the anonymity promise; pass includeReviewer for audit).
   */
  async getMentorFeedbackForAdmin(mentorId, { includeReviewer = false } = {}) {
    const reviews = await models.ProgramReview.findAll({
      where: { mentorId },
      include: [
        { model: models.Program, as: 'program', attributes: ['id', 'name'] },
        ...(includeReviewer ? [{ model: models.User, as: 'reviewer', attributes: ['id', 'firstName', 'lastName'] }] : [])
      ],
      order: [['createdAt', 'DESC']]
    });
    const summary = await this.getMentorFeedbackSummary(mentorId);
    return {
      summary: { ...summary, revealed: true }, // admins always see aggregates
      reviews: reviews.map((r) => ({
        id: r.id,
        program: r.program ? { id: r.program.id, name: r.program.name } : null,
        rating: Number(r.rating),
        dimensions: r.dimensions,
        reviewText: r.reviewText,
        wouldRecommend: r.wouldRecommend,
        createdAt: r.createdAt,
        reviewer: includeReviewer && r.reviewer ? { id: r.reviewer.id, name: `${r.reviewer.firstName} ${r.reviewer.lastName}`.trim() } : null
      }))
    };
  }
}

module.exports = new ProgramReviewService();
