const quizKitService = require('../services/quizKitService');
const quizSessionService = require('../services/quizSessionService');
const { successResponse } = require('../utils/responses');
const { catchAsync } = require('../middlewares/errorHandler');

/**
 * Quiz kit authoring — a mentor builds reusable auto-gradable quizzes (single /
 * multi / boolean / short questions) they later assign as `quiz` tasks.
 */

// GET /api/quizzes/kits  (?status=published to limit to assignable kits)
exports.listKits = catchAsync(async (req, res) => {
  const statuses = req.query.status
    ? String(req.query.status).split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;
  const kits = await quizKitService.listKits(req.user.id, { statuses });
  res.status(200).json(successResponse('Quizzes retrieved', { kits }));
});

// POST /api/quizzes/kits
exports.createKit = catchAsync(async (req, res) => {
  const kit = await quizKitService.createKit(req.user.id, req.body);
  res.status(201).json(successResponse('Quiz created', { kit }, 201));
});

// GET /api/quizzes/kits/:id
exports.getKit = catchAsync(async (req, res) => {
  const kit = await quizKitService.getKit(req.user.id, req.params.id);
  res.status(200).json(successResponse('Quiz retrieved', { kit }));
});

// PATCH /api/quizzes/kits/:id
exports.updateKit = catchAsync(async (req, res) => {
  const kit = await quizKitService.updateKit(req.user.id, req.params.id, req.body);
  res.status(200).json(successResponse('Quiz updated', { kit }));
});

// DELETE /api/quizzes/kits/:id
exports.deleteKit = catchAsync(async (req, res) => {
  const result = await quizKitService.deleteKit(req.user.id, req.params.id);
  res.status(200).json(successResponse('Quiz deleted', result));
});

// ── Candidate runner — ownership enforced in the service ──────────────────────

// GET /api/quizzes/assignments/:taskId
exports.getCandidateQuiz = catchAsync(async (req, res) => {
  const data = await quizSessionService.getForCandidate(req.params.taskId, req.user.id);
  res.status(200).json(successResponse('Quiz retrieved', data));
});

// POST /api/quizzes/assignments/:taskId/start
exports.startQuiz = catchAsync(async (req, res) => {
  const session = await quizSessionService.startOrResume(req.params.taskId, req.user.id);
  res.status(200).json(successResponse('Quiz session ready', { session }));
});

// PATCH /api/quizzes/sessions/:sessionId/answer  { questionId, selectedOptionIds?, answerText? }
exports.saveAnswer = catchAsync(async (req, res) => {
  const { questionId, ...payload } = req.body;
  const result = await quizSessionService.saveAnswer(req.params.sessionId, req.user.id, questionId, payload);
  res.status(200).json(successResponse('Answer saved', result));
});

// POST /api/quizzes/sessions/:sessionId/submit
exports.submitQuiz = catchAsync(async (req, res) => {
  const result = await quizSessionService.submit(req.params.sessionId, req.user.id);
  res.status(200).json(successResponse('Quiz submitted', result));
});

// ── Mentor review (review mode) ───────────────────────────────────────────────

// GET /api/quizzes/review/:taskId
exports.getQuizReview = catchAsync(async (req, res) => {
  const data = await quizSessionService.getForReview(req.params.taskId, req.user.id);
  res.status(200).json(successResponse('Quiz review retrieved', data));
});

// PATCH /api/quizzes/review/:taskId/answer  { questionId, pointsAwarded?, scoreNote? }
exports.gradeQuizAnswer = catchAsync(async (req, res) => {
  const { questionId, pointsAwarded, scoreNote } = req.body;
  const result = await quizSessionService.gradeAnswer(req.params.taskId, req.user.id, questionId, { pointsAwarded, scoreNote });
  res.status(200).json(successResponse('Answer graded', result));
});

// POST /api/quizzes/review/:taskId/finalize  { overallNote? }
exports.finalizeQuizReview = catchAsync(async (req, res) => {
  const result = await quizSessionService.finalizeReview(req.params.taskId, req.user.id, { overallNote: req.body.overallNote });
  res.status(200).json(successResponse('Quiz review finalized', result));
});
