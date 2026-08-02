const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const { models } = require('../db');
const { NotFoundError } = require('../utils/errors/errorTypes');
const svc = require('../services/adminMeetingService');

// ── Admin (host) side ─────────────────────────────────────────────────────────

/** POST /api/admin/meetings */
const create = catchAsync(async (req, res) => {
  const meeting = await svc.createMeeting(req.user.id, req.body || {});
  res.status(201).json(successResponse('Meeting scheduled', { meeting }));
});

/** GET /api/admin/meetings */
const list = catchAsync(async (req, res) => {
  const meetings = await svc.listMeetings();
  res.status(200).json(successResponse('Meetings', { meetings }));
});

/** POST /api/admin/meetings/:id/start */
const start = catchAsync(async (req, res) => {
  const meeting = await svc.startMeeting(req.params.id);
  res.status(200).json(successResponse('Meeting live', { meeting }));
});

/** POST /api/admin/meetings/:id/end */
const end = catchAsync(async (req, res) => {
  const meeting = await svc.endMeeting(req.params.id);
  res.status(200).json(successResponse('Meeting ended', { meeting }));
});

/** DELETE /api/admin/meetings/:id — cancel */
const cancel = catchAsync(async (req, res) => {
  await svc.cancelMeeting(req.params.id);
  res.status(200).json(successResponse('Meeting cancelled', { ok: true }));
});

// ── Attendee side (any authenticated user) ─────────────────────────────────────

/** GET /api/meetings/live — admin meetings this user can join now / soon. */
const live = catchAsync(async (req, res) => {
  const meetings = await svc.liveForUser(req.user.id);
  res.status(200).json(successResponse('Live meetings', { meetings }));
});

/** GET /api/meetings/admin/:id/join — room details, audience-gated. */
const join = catchAsync(async (req, res) => {
  const meeting = await models.AdminMeeting.findByPk(req.params.id);
  if (!meeting) throw new NotFoundError('Meeting not found');
  const info = await svc.joinInfo(meeting, req.user);
  res.status(200).json(successResponse('Join details', { meeting: info }));
});

module.exports = { create, list, start, end, cancel, live, join };
