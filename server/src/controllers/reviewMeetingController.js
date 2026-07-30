const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const svc = require('../services/reviewMeetingService');
const cfg = require('../config/reviewMeeting');

// Feature availability, independent of any session — the mentor panel needs to
// know whether to render (or show "coming soon") BEFORE a session exists, i.e.
// while today's review is still a draft. Cheap, no DB.
const config = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Review meeting config', { enabled: cfg.enabled, comingSoon: cfg.comingSoon }));
});

// ── Host (mentor) ──────────────────────────────────────────────────────────
const start = catchAsync(async (req, res) => {
  const result = await svc.startMeeting(req.user.id, req.params.id, { externalUrl: req.body?.externalUrl });
  res.status(200).json(successResponse('Meeting started', result));
});
const end = catchAsync(async (req, res) => {
  const result = await svc.endMeeting(req.user.id, req.params.id);
  res.status(200).json(successResponse('Meeting ended', result));
});
const setAttendanceTracking = catchAsync(async (req, res) => {
  const result = await svc.setAttendanceTracking(req.user.id, req.params.id, req.body?.enabled === true);
  res.status(200).json(successResponse('Attendance tracking updated', result));
});
const hostView = catchAsync(async (req, res) => {
  const result = await svc.hostView(req.user.id, req.params.id);
  res.status(200).json(successResponse('Meeting view', result));
});
const markPresent = catchAsync(async (req, res) => {
  // Host marks a roster mentee present (Path B / override). Reuses the review
  // entry service so it flows through the same attendance logic.
  const cohortReviewService = require('../services/cohortReviewService');
  const result = await cohortReviewService.setEntry(req.user.id, req.params.id, req.params.menteeId, { attendance: req.body?.present === false ? 'absent' : 'present' });
  res.status(200).json(successResponse('Attendance updated', result));
});
const recordTalk = catchAsync(async (req, res) => {
  const result = await svc.recordTalkTime(req.user.id, req.params.id, req.body?.items || []);
  res.status(200).json(successResponse('Talk time recorded', result));
});
const proposeContribution = catchAsync(async (req, res) => {
  const proposed = await svc.proposeContribution(req.user.id, req.params.id);
  res.status(200).json(successResponse('Proposed contribution', { proposed }));
});
const finalizeContribution = catchAsync(async (req, res) => {
  const result = await svc.finalizeContribution(req.user.id, req.params.id, req.body?.menteeIds || []);
  res.status(200).json(successResponse('Contribution awarded', result));
});

// ── Mentee (self) ──────────────────────────────────────────────────────────
const active = catchAsync(async (req, res) => {
  const meeting = await svc.activeForMentee(req.user.id);
  res.status(200).json(successResponse('Active review', { meeting }));
});
const join = catchAsync(async (req, res) => {
  const result = await svc.selfPresent(req.user.id, req.params.id);
  res.status(200).json(successResponse('Joined', result));
});
const leave = catchAsync(async (req, res) => {
  const result = await svc.selfLeave(req.user.id, req.params.id, req.body?.seconds);
  res.status(200).json(successResponse('Left', result));
});

module.exports = { config, start, end, setAttendanceTracking, hostView, markPresent, recordTalk, proposeContribution, finalizeContribution, active, join, leave };
