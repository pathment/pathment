const matchingService = require('../services/matchingService');
const { successResponse } = require('../utils/responses');
const { catchAsync } = require('../middlewares/errorHandler');

/**
 * Create mentor-mentee match
 * POST /api/matches
 */
exports.createMatch = catchAsync(async (req, res) => {
  const { enrollmentId, mentorId, levelId } = req.body;
  const matchedBy = req.user.id;
  
  const match = await matchingService.createMatch(enrollmentId, mentorId, levelId, matchedBy);
  res.status(201).json(successResponse('Match created successfully', { match }, 201));
});

/**
 * Get AI match suggestions for enrollment
 * GET /api/matches/suggestions/:enrollmentId
 */
exports.getAISuggestions = catchAsync(async (req, res) => {
  const { enrollmentId } = req.params;
  
  const suggestions = await matchingService.getAISuggestions(enrollmentId);
  res.status(200).json(successResponse('AI suggestions retrieved', { suggestions }));
});

/**
 * Get mentors assigned to a level
 * GET /api/matches/levels/:levelId/mentors
 */
exports.getLevelMentors = catchAsync(async (req, res) => {
  const { levelId } = req.params;
  
  const mentors = await matchingService.getLevelMentors(levelId);
  res.status(200).json(successResponse('Level mentors retrieved', { mentors }));
});

/**
 * Get all matches with filters
 * GET /api/matches
 */
exports.getMatches = catchAsync(async (req, res) => {
  const { status, mentorId, menteeId, enrollmentId } = req.query;
  const filters = { status, mentorId, menteeId, enrollmentId };
  
  const matches = await matchingService.getMatches(filters);
  res.status(200).json(successResponse('Matches retrieved', { matches }));
});

/**
 * Update match status
 * PATCH /api/matches/:id/status
 */
exports.updateMatchStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  const match = await matchingService.updateMatchStatus(id, status, req.user.id, req.user.role);
  res.status(200).json(successResponse('Match status updated', { match }));
});

module.exports = exports;
