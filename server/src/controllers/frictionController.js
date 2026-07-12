const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const { ForbiddenError } = require('../utils/errors/errorTypes');
const frictionService = require('../services/frictionService');

/**
 * A mentee can ONLY ever access their own records. Mentors/admins may
 * specify a target menteeId, or omit it to see their scoped cohort.
 */
function resolveMenteeId(req) {
  const { role, id: userId } = req.user;

  if (role === 'mentee') {
    const targetId = req.query.menteeId || (req.body && req.body.menteeId);
    if (targetId && targetId !== userId) {
      throw new ForbiddenError('You can only access your own records');
    }
    return userId;
  }

  if (req.query.menteeId) return req.query.menteeId;
  if (req.body && req.body.menteeId) return req.body.menteeId;

  return undefined;
}

// ── Blockers ──────────────────────────────────────────────────────────────
const listBlockers = catchAsync(async (req, res) => {
  const blockers = await frictionService.listBlockers({
    menteeId: resolveMenteeId(req),
    status: req.query.status,
    user: req.user
  });
  res.status(200).json(successResponse('Blockers retrieved', { blockers }));
});

const createBlocker = catchAsync(async (req, res) => {
  const menteeId = req.user.role === 'mentee' ? req.user.id : (req.body.menteeId || undefined);
  const blocker = await frictionService.createBlocker({ ...req.body, menteeId }, req.user.id);
  res.status(201).json(successResponse('Blocker logged', { blocker }, 201));
});

const resolveBlocker = catchAsync(async (req, res) => {
  const blocker = await frictionService.resolveBlocker(req.params.id);
  res.status(200).json(successResponse('Blocker resolved', { blocker }));
});

const deleteBlocker = catchAsync(async (req, res) => {
  const result = await frictionService.deleteBlocker(req.params.id, req.user);
  res.status(200).json(successResponse('Blocker deleted', result));
});

// ── Delays ──────────────────────────────────────────────────────────────
const listDelays = catchAsync(async (req, res) => {
  const delays = await frictionService.listDelays({
    menteeId: resolveMenteeId(req),
    user: req.user
  });
  res.status(200).json(successResponse('Delays retrieved', { delays }));
});

const createDelay = catchAsync(async (req, res) => {
  const menteeId = req.user.role === 'mentee' ? req.user.id : (req.body.menteeId || undefined);
  const delay = await frictionService.createDelay({ ...req.body, menteeId }, req.user.id);
  res.status(201).json(successResponse('Delay logged', { delay }, 201));
});

const acceptDelay = catchAsync(async (req, res) => {
  const delay = await frictionService.acceptDelay(req.params.id, req.body);
  res.status(200).json(successResponse('Delay updated', { delay }));
});

const rejectDelay = catchAsync(async (req, res) => {
  const result = await frictionService.rejectDelay(req.params.id);
  res.status(200).json(successResponse('Delay rejected', result));
});

module.exports = {
  listBlockers,
  createBlocker,
  resolveBlocker,
  deleteBlocker,
  listDelays,
  createDelay,
  acceptDelay,
  rejectDelay
};
