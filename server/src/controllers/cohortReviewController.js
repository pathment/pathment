const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const cohortReviewService = require('../services/cohortReviewService');

/** GET /api/mentor/review/sessions/today — today's session if it exists, else
 *  null + today's date. Lazy: we DON'T create a row just because the page was
 *  opened (that produced accidental phantom sessions). The session is created on
 *  the first real action (see POST /sessions). */
const today = catchAsync(async (req, res) => {
  const result = await cohortReviewService.getTodayOrNull(req.user.id, req.query.clanId || null);
  res.status(200).json(successResponse('Review session', result));
});

/** GET /api/mentor/review/sessions?clanId= — full history (for the clan) with counts. */
const list = catchAsync(async (req, res) => {
  const sessions = await cohortReviewService.listSessions(req.user.id, req.query.clanId || null);
  res.status(200).json(successResponse('Review sessions', { sessions }));
});

/** POST /api/mentor/review/sessions — start a new session ({ date?, title? }). */
const create = catchAsync(async (req, res) => {
  const session = await cohortReviewService.createSession(req.user.id, req.body || {});
  res.status(201).json(successResponse('Review session created', { session }, 201));
});

/** GET /api/mentor/review/sessions/:id */
const get = catchAsync(async (req, res) => {
  const session = await cohortReviewService.getSession(req.user.id, req.params.id);
  res.status(200).json(successResponse('Review session', { session }));
});

/** PATCH /api/mentor/review/sessions/:id — edit title/note/date. */
const update = catchAsync(async (req, res) => {
  const session = await cohortReviewService.updateSession(req.user.id, req.params.id, req.body || {});
  res.status(200).json(successResponse('Review session updated', { session }));
});

/** PUT /api/mentor/review/sessions/:id/entries/:menteeId — set attendance/status/note. */
const setEntry = catchAsync(async (req, res) => {
  const entry = await cohortReviewService.setEntry(req.user.id, req.params.id, req.params.menteeId, req.body || {});
  res.status(200).json(successResponse('Entry saved', { entry }));
});

/** POST /api/mentor/review/sessions/:id/finish */
const finish = catchAsync(async (req, res) => {
  const session = await cohortReviewService.finishSession(req.user.id, req.params.id);
  res.status(200).json(successResponse('Review finished', { session }));
});

/** POST /api/mentor/review/sessions/:id/reopen */
const reopen = catchAsync(async (req, res) => {
  const session = await cohortReviewService.reopenSession(req.user.id, req.params.id);
  res.status(200).json(successResponse('Review reopened', { session }));
});

/** DELETE /api/mentor/review/sessions/:id */
const remove = catchAsync(async (req, res) => {
  const result = await cohortReviewService.deleteSession(req.user.id, req.params.id);
  res.status(200).json(successResponse('Review session deleted', result));
});

module.exports = { today, list, create, get, update, setEntry, finish, reopen, remove };
