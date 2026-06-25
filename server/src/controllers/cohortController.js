const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const cohortService = require('../services/cohortService');
const submissionService = require('../services/submissionService');
const authzService = require('../services/authzService');
const { AuthorizationError } = require('../utils/errors/errorTypes');

/**
 * GET /api/mentor/cohort
 * The logged-in mentor's cohort for the Cockpit, with computed fairness signals.
 */
const getCohort = catchAsync(async (req, res) => {
  const { cohort, totals } = await cohortService.getCohort(req.user.id);
  res.status(200).json(successResponse('Cohort retrieved', { cohort, totals }));
});

/**
 * GET /api/mentor/cohort/activity?period=week|month
 * Period-scoped throughput for the cohort over the last 7 / 30 days.
 */
const getCohortActivity = catchAsync(async (req, res) => {
  const period = req.query?.period === 'month' ? 'month' : 'week';
  const activity = await cohortService.getPeriodActivity(req.user.id, period);
  res.status(200).json(successResponse('Cohort activity retrieved', { activity }));
});

/**
 * POST /api/mentor/cohort/report-summary  { period?: 'week' | 'month' }
 * AI-drafted narrative summary of the mentor's cohort (uses their AI connection).
 */
const getCohortReportSummary = catchAsync(async (req, res) => {
  const period = req.body?.period === 'month' ? 'month' : 'week';
  const result = await cohortService.generateReportSummary(req.user.id, period);
  res.status(200).json(successResponse('Report summary generated', result));
});

/**
 * GET /api/mentor/mentee/:id
 * Rich profile bundle for one mentee (fairness read + blockers + delays +
 * grouped tasks + derived summary/signals).
 */
const getMenteeProfile = catchAsync(async (req, res) => {
  // Authorize: the requester must actually be allowed to view this mentee
  // (admin, their match, or a mentee in a clan they mentor). Without this, any
  // mentor/co-mentor could pull any mentee's full profile.
  const allowed = await authzService.canViewMentee(req.user, req.params.id, {
    assignments: req.loadAssignments ? await req.loadAssignments() : undefined
  });
  if (!allowed) throw new AuthorizationError('You do not have access to this mentee');

  const profile = await cohortService.getMenteeDetail(req.params.id);
  if (!profile) {
    return res.status(404).json({ success: false, message: 'Mentee not found', statusCode: 404 });
  }
  // Pause state within the requester's clans (drives the Pause/Resume control).
  try { profile.pauseState = await require('../services/mentorshipPauseService').menteeState(req.user, req.params.id); } catch { profile.pauseState = { paused: false, clanId: null }; }
  res.status(200).json(successResponse('Mentee profile retrieved', { profile }));
});

/**
 * GET /api/mentor/approvals
 * The mentor's pending-review queue across their cohort.
 */
const getApprovals = catchAsync(async (req, res) => {
  const queue = await submissionService.getMentorApprovalsQueue(req.user.id);
  res.status(200).json(successResponse('Approvals queue retrieved', { queue }));
});

/**
 * GET /api/mentor/approvals/changes-requested
 * Tasks the mentor sent back for changes that are awaiting a resubmission.
 */
const getChangesRequested = catchAsync(async (req, res) => {
  const items = await submissionService.getMentorChangesRequestedQueue(req.user.id);
  res.status(200).json(successResponse('Changes-requested queue retrieved', { items }));
});

/**
 * POST /api/mentor/approvals/bulk  { submissionIds: [] }
 * Bulk-approve on-time submissions.
 */
const bulkApprove = catchAsync(async (req, res) => {
  const { submissionIds } = req.body;
  const results = await submissionService.bulkApprove(req.user.id, Array.isArray(submissionIds) ? submissionIds : []);
  res.status(200).json(successResponse('Bulk approval processed', { results }));
});

/**
 * POST /api/mentor/approvals/bulk-review
 * { submissionIds, decision, rating, feedbackText, revisionNotes, pointsAwarded }
 * Apply the same review decision (approve / request changes) to many submissions.
 */
const bulkReview = catchAsync(async (req, res) => {
  const { submissionIds, decision, rating, feedbackText, revisionNotes, pointsAwarded } = req.body;
  const ids = Array.isArray(submissionIds) ? submissionIds : [];
  if (ids.length === 0) {
    return res.status(400).json({ success: false, message: 'submissionIds is required', statusCode: 400 });
  }

  const isApproved = decision === 'approved' || decision === 'approved_notes';
  const reviewData = {
    decision,
    isApproved,
    rating,
    feedbackText,
    // Revision notes only make sense when changes are requested.
    ...(isApproved ? {} : { revisionNotes }),
    // Points only count on approval.
    ...(isApproved ? { pointsAwarded } : {})
  };

  const results = await submissionService.bulkReview(req.user.id, ids, reviewData);
  res.status(200).json(successResponse('Bulk review applied', { results }));
});

/**
 * POST /api/mentor/nudge  { menteeId, message? }
 * Send a gentle in-app nudge to a mentee.
 */
const nudge = catchAsync(async (req, res) => {
  const { menteeId, message } = req.body;
  if (!menteeId) {
    return res.status(400).json({ success: false, message: 'menteeId is required', statusCode: 400 });
  }
  const result = await cohortService.sendNudge(req.user.id, menteeId, message);
  res.status(200).json(successResponse('Nudge sent', result));
});

/**
 * GET /api/mentee/progress
 * The logged-in mentee's own fairness read (self-facing My Progress).
 */
const getMyProgress = catchAsync(async (req, res) => {
  const profile = await cohortService.getMenteeDetail(req.user.id);
  if (!profile) {
    return res.status(404).json({ success: false, message: 'No progress data yet', statusCode: 404 });
  }
  res.status(200).json(successResponse('Progress retrieved', { profile }));
});

/**
 * PATCH /api/mentor/mentee/:id/personality  { consistency, communication, resilience, independence }
 */
const updatePersonality = catchAsync(async (req, res) => {
  const personality = await cohortService.updatePersonality(req.params.id, req.body);
  res.status(200).json(successResponse('Personality updated', { personality }));
});

/**
 * POST /api/mentor/mentee/:id/insights  { kind, note, source }
 */
const addInsight = catchAsync(async (req, res) => {
  const insight = await cohortService.addInsight(req.params.id, req.body, req.user.id);
  res.status(201).json(successResponse('Insight logged', { insight }, 201));
});

/**
 * POST /api/mentor/mentee/:id/notes  { date?, kind?, summary, sentiment?, issues?, nextSteps? }
 */
const logMeetingNote = catchAsync(async (req, res) => {
  const note = await cohortService.logMeetingNote(req.params.id, req.body, req.user.id);
  res.status(201).json(successResponse('1:1 logged', { note }, 201));
});

/** POST /api/mentor/mentee/:id/collaborators  { name, role, email? } */
const addCollaborator = catchAsync(async (req, res) => {
  const collaborator = await cohortService.addCollaborator(req.params.id, req.body, req.user.id);
  res.status(201).json(successResponse('Collaborator invited', { collaborator }, 201));
});

/** DELETE /api/mentor/mentee/:id/collaborators/:collaboratorId */
const removeCollaborator = catchAsync(async (req, res) => {
  const result = await cohortService.removeCollaborator(req.params.id, req.params.collaboratorId);
  res.status(200).json(successResponse('Collaborator removed', result));
});

/** POST /api/mentor/mentee/:id/attendance  { status } — cohort-review attendance. */
const setAttendance = catchAsync(async (req, res) => {
  const result = await cohortService.setAttendance(req.params.id, req.user.id, req.body.status);
  res.status(200).json(successResponse('Attendance saved', result));
});

/** GET /api/mentor/review/attendance — today's attendance map for this mentor. */
const getReviewAttendance = catchAsync(async (req, res) => {
  const attendance = await cohortService.getTodayAttendance(req.user.id);
  res.status(200).json(successResponse('Attendance', { attendance }));
});

/** GET /api/mentor/mentee/:id/attendance/history — full cohort-review attendance (newest first). */
const getMenteeAttendanceHistory = catchAsync(async (req, res) => {
  const history = await cohortService.getAttendanceHistory(req.params.id);
  res.status(200).json(successResponse('Attendance history', { history }));
});

module.exports = { getCohort, getCohortActivity, getCohortReportSummary, getMenteeProfile, getApprovals, getChangesRequested, bulkApprove, bulkReview, nudge, getMyProgress, updatePersonality, addInsight, logMeetingNote, addCollaborator, removeCollaborator, setAttendance, getReviewAttendance, getMenteeAttendanceHistory };
