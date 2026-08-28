const interviewKitService = require('../services/interviewKitService');
const interviewSessionService = require('../services/interviewSessionService');
const { successResponse } = require('../utils/responses');
const { catchAsync } = require('../middlewares/errorHandler');

/**
 * Interview kit authoring — a mentor builds reusable structured interviews
 * (voice / code / text questions) they later assign as `interview` tasks.
 */

// GET /api/interviews/kits  (?status=published to limit to assignable kits)
exports.listKits = catchAsync(async (req, res) => {
  const statuses = req.query.status
    ? String(req.query.status).split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;
  const kits = await interviewKitService.listKits(req.user.id, { statuses });
  res.status(200).json(successResponse('Interview kits retrieved', { kits }));
});

// POST /api/interviews/kits
exports.createKit = catchAsync(async (req, res) => {
  const kit = await interviewKitService.createKit(req.user.id, req.body);
  res.status(201).json(successResponse('Interview kit created', { kit }, 201));
});

// POST /api/interviews/kits/prompt-audio  (multipart: audio) → { url, publicId }
exports.uploadPromptAudio = catchAsync(async (req, res) => {
  const result = await interviewKitService.uploadPromptAudio(req.user.id, req.file);
  res.status(200).json(successResponse('Prompt audio uploaded', result));
});

// GET /api/interviews/kits/:id
exports.getKit = catchAsync(async (req, res) => {
  const kit = await interviewKitService.getKit(req.user.id, req.params.id);
  res.status(200).json(successResponse('Interview kit retrieved', { kit }));
});

// PATCH /api/interviews/kits/:id
exports.updateKit = catchAsync(async (req, res) => {
  const kit = await interviewKitService.updateKit(req.user.id, req.params.id, req.body);
  res.status(200).json(successResponse('Interview kit updated', { kit }));
});

// DELETE /api/interviews/kits/:id
exports.deleteKit = catchAsync(async (req, res) => {
  const result = await interviewKitService.deleteKit(req.user.id, req.params.id);
  res.status(200).json(successResponse('Interview kit deleted', result));
});

// ── Candidate runner (Phase 2) — ownership enforced in the service ────────────

// PATCH /api/interviews/assignments/:taskId/options  — mentor adjusts timing, etc.
exports.updateAssignmentOptions = catchAsync(async (req, res) => {
  const data = await interviewSessionService.updateAssignmentForMentor(
    req.params.taskId,
    req.user.id,
    req.body
  );
  res.status(200).json(successResponse('Interview assignment updated', data));
});

// GET /api/interviews/assignments/:taskId/manage — mentor view of assignment state
exports.getAssignmentForMentor = catchAsync(async (req, res) => {
  const data = await interviewSessionService.getAssignmentForMentor(req.params.taskId, req.user.id);
  res.status(200).json(successResponse('Interview assignment retrieved', data));
});

// POST /api/interviews/assignments/:taskId/abandon — mentor ends an in-progress attempt
exports.abandonActiveInterview = catchAsync(async (req, res) => {
  const data = await interviewSessionService.abandonActiveForMentor(req.params.taskId, req.user.id);
  res.status(200).json(successResponse('Interview attempt ended', data));
});

// GET /api/interviews/assignments/:taskId
exports.getCandidateInterview = catchAsync(async (req, res) => {
  const data = await interviewSessionService.getForCandidate(req.params.taskId, req.user.id);
  res.status(200).json(successResponse('Interview retrieved', data));
});

// POST /api/interviews/assignments/:taskId/start
exports.startInterview = catchAsync(async (req, res) => {
  const session = await interviewSessionService.startOrResume(req.params.taskId, req.user.id);
  res.status(200).json(successResponse('Interview session ready', { session }));
});

// POST /api/interviews/sessions/:sessionId/question/start  { questionId }
exports.startQuestion = catchAsync(async (req, res) => {
  const result = await interviewSessionService.startQuestion(req.params.sessionId, req.user.id, req.body.questionId);
  res.status(200).json(successResponse('Question started', result));
});

// PATCH /api/interviews/sessions/:sessionId/answer
exports.saveAnswer = catchAsync(async (req, res) => {
  const { questionId, ...payload } = req.body;
  const result = await interviewSessionService.saveAnswer(req.params.sessionId, req.user.id, questionId, payload);
  res.status(200).json(successResponse('Answer saved', result));
});

// POST /api/interviews/sessions/:sessionId/audio  (multipart: audio + questionId)
exports.uploadAnswerAudio = catchAsync(async (req, res) => {
  const result = await interviewSessionService.attachAudio(req.params.sessionId, req.user.id, req.body.questionId, req.file);
  res.status(200).json(successResponse('Audio saved', result));
});

// POST /api/interviews/sessions/:sessionId/proctor  { events: [] }
exports.logProctor = catchAsync(async (req, res) => {
  const result = await interviewSessionService.logProctorEvents(req.params.sessionId, req.user.id, req.body.events || []);
  res.status(200).json(successResponse('Proctor events logged', result));
});

// POST /api/interviews/sessions/:sessionId/snapshot  (multipart: image)
exports.uploadSnapshot = catchAsync(async (req, res) => {
  const result = await interviewSessionService.attachSnapshot(req.params.sessionId, req.user.id, req.file, req.body.questionId || null);
  res.status(200).json(successResponse('Snapshot saved', result));
});

// POST /api/interviews/sessions/:sessionId/submit
exports.submitInterview = catchAsync(async (req, res) => {
  const result = await interviewSessionService.submit(req.params.sessionId, req.user.id);
  res.status(200).json(successResponse('Interview submitted', result));
});

// ── Mentor review (Phase 4) ───────────────────────────────────────────────────

// GET /api/interviews/review/:taskId
exports.getInterviewReview = catchAsync(async (req, res) => {
  const data = await interviewSessionService.getForReview(req.params.taskId, req.user.id);
  res.status(200).json(successResponse('Interview review retrieved', data));
});

// PATCH /api/interviews/review/:taskId/answer  { questionId, pointsAwarded?, scoreNote? }
exports.gradeInterviewAnswer = catchAsync(async (req, res) => {
  const { questionId, pointsAwarded, scoreNote } = req.body;
  const result = await interviewSessionService.gradeAnswer(req.params.taskId, req.user.id, questionId, { pointsAwarded, scoreNote });
  res.status(200).json(successResponse('Answer graded', result));
});

// POST /api/interviews/review/:taskId/ai-draft  { questionId }
exports.aiDraftInterviewAnswer = catchAsync(async (req, res) => {
  const result = await interviewSessionService.aiDraftAnswer(req.params.taskId, req.user.id, req.body.questionId);
  res.status(200).json(successResponse('AI draft ready', { aiDraft: result }));
});

// POST /api/interviews/review/:taskId/ai-draft-all
exports.aiDraftAllInterview = catchAsync(async (req, res) => {
  const result = await interviewSessionService.aiDraftAll(req.params.taskId, req.user.id, { questionIds: req.body.questionIds });
  res.status(200).json(successResponse('AI grading complete', result));
});

// POST /api/interviews/review/:taskId/finalize  { overallNote? }
exports.finalizeInterviewReview = catchAsync(async (req, res) => {
  const result = await interviewSessionService.finalizeReview(req.params.taskId, req.user.id, { overallNote: req.body.overallNote });
  res.status(200).json(successResponse('Interview review finalized', result));
});

// POST /api/interviews/review/:taskId/request-redo  { questionIds: [...], note? }
exports.requestInterviewRedo = catchAsync(async (req, res) => {
  const result = await interviewSessionService.requestRedo(req.params.taskId, req.user.id, {
    questionIds: req.body.questionIds, note: req.body.note,
  });
  res.status(200).json(successResponse('Sent back for redo', result));
});

// DELETE /api/interviews/review/:taskId/snapshots
exports.deleteInterviewSnapshots = catchAsync(async (req, res) => {
  const result = await interviewSessionService.deleteSnapshots(req.params.taskId, req.user.id);
  res.status(200).json(successResponse('Proctor snapshots deleted', result));
});

// POST /api/interviews/review/:taskId/flag  { flagged, reason? }
exports.flagInterview = catchAsync(async (req, res) => {
  const result = await interviewSessionService.setFlag(req.params.taskId, req.user.id, { flagged: req.body.flagged, reason: req.body.reason });
  res.status(200).json(successResponse('Interview flag updated', { flag: result }));
});
