const programReviewService = require('../services/programReviewService');
const { successResponse } = require('../utils/responses');
const { catchAsync } = require('../middlewares/errorHandler');

/**
 * Mentee submits (or updates) anonymous feedback for a completed enrollment.
 * POST /api/program-reviews/enrollment/:enrollmentId
 */
exports.submitReview = catchAsync(async (req, res) => {
  const { enrollmentId } = req.params;
  const { dimensions, reviewText, wouldRecommend } = req.body;
  const result = await programReviewService.submitReview(enrollmentId, req.user.id, { dimensions, reviewText, wouldRecommend });
  res.status(result.updated ? 200 : 201).json(successResponse('Feedback submitted. Thank you!', result));
});

/**
 * Mentee fetches their own review state for an enrollment (can review? already did?).
 * GET /api/program-reviews/enrollment/:enrollmentId/me
 */
exports.getMyReview = catchAsync(async (req, res) => {
  const { enrollmentId } = req.params;
  const data = await programReviewService.getMyReview(enrollmentId, req.user.id);
  res.status(200).json(successResponse('Review state retrieved', data));
});

/**
 * Mentor sees their own aggregate feedback (hidden until enough responses).
 * GET /api/program-reviews/mentor/me/summary
 */
exports.getMyFeedbackSummary = catchAsync(async (req, res) => {
  const summary = await programReviewService.getMentorFeedbackSummary(req.user.id);
  res.status(200).json(successResponse('Mentor feedback summary retrieved', { summary }));
});

/**
 * Admin moderation view of a mentor's raw feedback.
 * GET /api/program-reviews/mentor/:mentorId/admin?includeReviewer=true
 */
exports.getMentorFeedbackForAdmin = catchAsync(async (req, res) => {
  const { mentorId } = req.params;
  const includeReviewer = req.query.includeReviewer === 'true';
  const data = await programReviewService.getMentorFeedbackForAdmin(mentorId, { includeReviewer });
  res.status(200).json(successResponse('Mentor feedback retrieved', data));
});
