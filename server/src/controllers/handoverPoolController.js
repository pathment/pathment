const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const pool = require('../services/handoverPoolService');
const { requestedClanId } = require('../middlewares/portalScope');

/**
 * The handover pool: mentors offer mentees out of a clan, mentors take them in.
 *
 * One controller serves both the mentor and the admin surface. The service
 * resolves what the caller may see and do from their own access, so the two
 * differ in what comes back, not in which endpoint they call — which is what
 * keeps a programme admin correct without a third code path.
 */

const clanOf = (req) => req.body?.clanId || req.query?.clanId || requestedClanId(req) || null;

/** GET /api/pool?programId=&status= — the pool as this caller sees it. */
const list = catchAsync(async (req, res) => {
  const result = await pool.list(req.user, {
    programId: req.query.programId || null,
    status: req.query.status || 'open',
    limit: req.query.limit,
  });
  res.status(200).json(successResponse('Handover pool', result));
});

/** GET /api/pool/overview?programId= — the queue with its ages, for admins. */
const overview = catchAsync(async (req, res) => {
  const result = await pool.overview(req.user, { programId: req.query.programId || null });
  res.status(200).json(successResponse('Handover pool overview', result));
});

/** GET /api/pool/claimable-clans — the clans this caller could pull into. */
const claimableClans = catchAsync(async (req, res) => {
  const clans = await pool.claimableClans(req.user);
  res.status(200).json(successResponse('Clans you can pull into', { clans }));
});

/** GET /api/handover-pool/:entryId/profile — read-only decision context. */
const profile = catchAsync(async (req, res) => {
  const result = await pool.profile(req.user, req.params.entryId);
  res.status(200).json(successResponse('Pool mentee profile', result));
});

/** POST /api/pool/push  { menteeId, clanId?, reason?, handoverNote? } */
const push = catchAsync(async (req, res) => {
  const { menteeId, reason, handoverNote } = req.body || {};
  const result = await pool.push(req.user, { menteeId, clanId: clanOf(req), reason, handoverNote });
  res.status(result.alreadyOpen ? 200 : 201).json(successResponse(
    result.alreadyOpen ? 'They are already in the pool' : 'Added to the handover pool', result,
  ));
});

/** POST /api/pool/push-clan  { clanId, reason?, handoverNote? } — whole clan. */
const pushClan = catchAsync(async (req, res) => {
  const { reason, handoverNote } = req.body || {};
  const result = await pool.pushClan(req.user, { clanId: clanOf(req), reason, handoverNote });
  res.status(200).json(successResponse(`${result.pushed} of ${result.total} added to the pool`, result));
});

/**
 * POST /api/pool/push-many  { mentees: [{ menteeId, clanId }], reason?, handoverNote? }
 *
 * A chosen set, which may span clans. Each item carries its own clan because
 * the selection comes from a screen that can be showing every clan at once,
 * and handing somebody out of one clan is not the same act as handing them
 * out of another they also belong to.
 */
const pushMany = catchAsync(async (req, res) => {
  const { mentees, reason, handoverNote } = req.body || {};
  const result = await pool.pushMany(req.user, { mentees, reason, handoverNote });
  const parts = [`${result.pushed} of ${result.total} added to the pool`];
  if (result.alreadyOffered) parts.push(`${result.alreadyOffered} already there`);
  if (result.failed) parts.push(`${result.failed} could not be offered`);
  res.status(200).json(successResponse(parts.join(', '), result));
});

/** POST /api/pool/:entryId/claim  { toClanId } — take them, with their work. */
const claim = catchAsync(async (req, res) => {
  const result = await pool.claim(req.user, {
    entryId: req.params.entryId,
    toClanId: req.body?.toClanId || clanOf(req),
  });
  res.status(200).json(successResponse('Mentee moved into your clan', result));
});

/**
 * GET /api/handover-pool/suggestions?programId= — a proposed clan for every
 * open offer: the active clan with the fewest active mentees. Read-only.
 */
const suggestions = catchAsync(async (req, res) => {
  const result = await pool.suggest(req.user, { programId: req.query.programId || null });
  res.status(200).json(successResponse('Placement suggestions', result));
});

/** POST /api/handover-pool/claim-many  { placements: [{ entryId, toClanId }] } — apply them. */
const claimMany = catchAsync(async (req, res) => {
  const result = await pool.claimMany(req.user, { placements: req.body?.placements });
  const parts = [`${result.placed} of ${result.total} placed`];
  if (result.failed) parts.push(`${result.failed} could not be placed`);
  res.status(200).json(successResponse(parts.join(', '), result));
});

/** POST /api/pool/:entryId/withdraw — take the offer back. */
const withdraw = catchAsync(async (req, res) => {
  const entry = await pool.withdraw(req.user, req.params.entryId);
  res.status(200).json(successResponse('Offer withdrawn', { entry }));
});

module.exports = { list, overview, claimableClans, suggestions, push, pushClan,
  pushMany, profile, claim, claimMany, withdraw };
