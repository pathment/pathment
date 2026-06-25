const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const pauseService = require('../services/mentorshipPauseService');

/** POST /api/mentor/mentees/:menteeId/pause  { clanId?, reason? } */
const pause = catchAsync(async (req, res) => {
  const { clanId, reason } = req.body || {};
  const result = await pauseService.pause(req.user, req.params.menteeId, clanId, reason || null, 'mentor');
  res.status(200).json(successResponse('Mentee paused', result));
});

/** POST /api/mentor/mentees/:menteeId/resume  { clanId? } */
const resume = catchAsync(async (req, res) => {
  const { clanId } = req.body || {};
  const result = await pauseService.resume(req.user, req.params.menteeId, clanId);
  res.status(200).json(successResponse('Mentee resumed', result));
});

/** GET /api/mentor/mentees/:menteeId/pause-state — is this mentee paused? */
const menteeState = catchAsync(async (req, res) => {
  const state = await pauseService.menteeState(req.user, req.params.menteeId);
  res.status(200).json(successResponse('Pause state', state));
});

/** GET /api/mentor/paused — paused mentees across the requester's clans. */
const listPaused = catchAsync(async (req, res) => {
  const paused = await pauseService.listPaused(req.user);
  res.status(200).json(successResponse('Paused mentees', { paused }));
});

/** GET /api/mentor/pause-suggestions — active mentees that look inactive. */
const listSuggestions = catchAsync(async (req, res) => {
  const suggestions = await pauseService.listSuggestions(req.user);
  res.status(200).json(successResponse('Pause suggestions', { suggestions }));
});

/** POST /api/mentor/pause-suggestions/:menteeId/dismiss  { clanId? } */
const dismissSuggestion = catchAsync(async (req, res) => {
  const { clanId } = req.body || {};
  const result = await pauseService.dismissSuggestion(req.user, req.params.menteeId, clanId);
  res.status(200).json(successResponse('Suggestion dismissed', result));
});

module.exports = { pause, resume, listPaused, listSuggestions, dismissSuggestion, menteeState };
