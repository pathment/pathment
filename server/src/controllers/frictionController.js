const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const frictionService = require('../services/frictionService');

// ── Blockers ──────────────────────────────────────────────────────────────
const listBlockers = catchAsync(async (req, res) => {
  const blockers = await frictionService.listBlockers({
    menteeId: req.query.menteeId,
    status: req.query.status,
    user: req.user
  });
  res.status(200).json(successResponse('Blockers retrieved', { blockers }));
});

const createBlocker = catchAsync(async (req, res) => {
  const blocker = await frictionService.createBlocker(req.body, req.user.id, req.user);
  res.status(201).json(successResponse('Blocker logged', { blocker }, 201));
});

const resolveBlocker = catchAsync(async (req, res) => {
  const blocker = await frictionService.resolveBlocker(req.params.id, req.user);
  res.status(200).json(successResponse('Blocker resolved', { blocker }));
});

const deleteBlocker = catchAsync(async (req, res) => {
  const result = await frictionService.deleteBlocker(req.params.id, req.user);
  res.status(200).json(successResponse('Blocker deleted', result));
});

// ── Delays ──────────────────────────────────────────────────────────────
const listDelays = catchAsync(async (req, res) => {
  const delays = await frictionService.listDelays({
    menteeId: req.query.menteeId,
    user: req.user
  });
  res.status(200).json(successResponse('Delays retrieved', { delays }));
});

const createDelay = catchAsync(async (req, res) => {
  const delay = await frictionService.createDelay(req.body, req.user.id, req.user);
  res.status(201).json(successResponse('Delay logged', { delay }, 201));
});

const acceptDelay = catchAsync(async (req, res) => {
  const delay = await frictionService.acceptDelay(req.params.id, req.body, req.user);
  res.status(200).json(successResponse('Delay updated', { delay }));
});

const rejectDelay = catchAsync(async (req, res) => {
  const result = await frictionService.rejectDelay(req.params.id, req.user);
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
