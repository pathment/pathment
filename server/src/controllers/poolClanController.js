/**
 * A selection round that is a clan — the operator endpoints.
 *
 * The mirror of `poolController`'s selection half, for `Clan.kind = 'pool'`.
 * Authorisation lives in the routes (`pool.*` at the clan's programme, see
 * routes/clans.js); everything here is thin.
 *
 * Reviewing the work, the roster and the chat are not here on purpose: a round
 * is a clan, so they are the clan's own endpoints, which is the entire point
 * of making it one.
 */
const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const poolClanService = require('../services/poolClanService');
const selection = require('../services/poolClanSelectionService');
const poolPlacementService = require('../services/poolPlacementService');

const ok = (res, message, data, status = 200) => res.status(status).json(successResponse(message, data, status));

// ─── The rounds themselves ────────────────────────────────────────────────────

/** The selection rounds of the programmes this caller can see. */
exports.listRounds = catchAsync(async (req, res) => {
  const authzService = require('../services/authzService');
  const programIds = await authzService.poolProgramScope(req.user, {
    assignments: req.loadAssignments ? await req.loadAssignments() : undefined,
  });
  const rounds = await selection.listRounds({ programIds, programId: req.query.programId || null });
  ok(res, 'Rounds retrieved', { rounds });
});

exports.createRound = catchAsync(async (req, res) => {
  const clan = await poolClanService.createRound(req.body, req.user);
  ok(res, 'Round created', { round: { id: clan.id, name: clan.name } }, 201);
});

exports.getRound = catchAsync(async (req, res) => {
  ok(res, 'Round', await selection.detail(req.params.id));
});

exports.attachIntake = catchAsync(async (req, res) => {
  ok(res, 'Intake attached', await poolClanService.attachToIntake(req.params.id, req.body.cohortId || null, req.user));
});

exports.roster = catchAsync(async (req, res) => {
  ok(res, 'Candidates', await selection.roster(req.params.id));
});

/** The round's terms and the work each level is set to do. */
exports.getSettings = catchAsync(async (req, res) => {
  const clan = await selection.round(req.params.id);
  ok(res, 'Selection settings', {
    settings: poolClanService.selectionSettings(clan),
    levelRules: poolClanService.levelRules(clan),
    work: await poolClanService.workItems(clan),
  });
});

exports.setSettings = catchAsync(async (req, res) => {
  ok(res, 'Selection settings saved', {
    settings: await poolClanService.setSelectionSettings(req.params.id, req.body, req.user),
  });
});

exports.setLevelRules = catchAsync(async (req, res) => {
  ok(res, 'Work set by level', {
    levelRules: await poolClanService.setLevelRules(req.params.id, req.body.rules, req.user),
  });
});

exports.setMemberLevel = catchAsync(async (req, res) => {
  const result = await poolClanService.setMemberLevel(req.params.id, req.params.userId, req.body.level, req.user);
  ok(res, 'Level set', { level: result.membership.level, assigned: result.assigned || 0, reason: result.reason || null });
});

// ─── One candidate's work, and the time they ask for ──────────────────────────

exports.candidateWork = catchAsync(async (req, res) => {
  ok(res, 'Candidate work', await poolClanService.candidateWork(req.params.id, req.params.userId));
});

exports.giveWork = catchAsync(async (req, res) => {
  const out = await poolClanService.giveWork(req.params.id, req.params.userId, {
    roadmapId: req.body.roadmapId,
    stepIndexes: req.body.stepIndexes || null,
  }, req.user);
  ok(res, out.assigned ? 'Work given' : 'They already hold that work', out);
});

exports.takeWorkBack = catchAsync(async (req, res) => {
  ok(res, 'Work taken back', await poolClanService.takeWorkBack(req.params.id, req.params.taskId, req.user));
});

exports.openExtensions = catchAsync(async (req, res) => {
  ok(res, 'Requests for more time', { extensions: await poolClanService.openExtensions(req.params.id) });
});

exports.answerExtension = catchAsync(async (req, res) => {
  await poolClanService.answerExtension(req.params.id, req.params.submissionId, {
    approved: req.body.approved === true || req.body.approved === 'true',
    newDueDate: req.body.newDueDate || null,
  }, req.user);
  ok(res, req.body.approved ? 'More time granted' : 'Request declined', {});
});

// ─── Scores, shortlist, decisions ─────────────────────────────────────────────

exports.scores = catchAsync(async (req, res) => {
  ok(res, 'Scores', await selection.liveScores(req.params.id));
});

exports.listShortlists = catchAsync(async (req, res) => {
  ok(res, 'Shortlists', { shortlists: await selection.listShortlists(req.params.id) });
});

exports.generateShortlist = catchAsync(async (req, res) => {
  const result = await selection.generate(req.params.id, req.user);
  ok(res, result.reused ? 'Nothing changed — this is the latest shortlist' : 'Shortlist generated', result, result.reused ? 200 : 201);
});

exports.getShortlist = catchAsync(async (req, res) => {
  ok(res, 'Shortlist', { shortlist: await selection.getShortlist(req.params.id, req.params.shortlistId) });
});

exports.confirmShortlist = catchAsync(async (req, res) => {
  const shortlist = await selection.confirm(req.params.id, req.params.shortlistId, req.body, req.user);
  ok(res, 'Selection confirmed', { shortlist });
});

exports.setDecision = catchAsync(async (req, res) => {
  const member = await selection.setDecision(req.params.id, req.params.memberId, req.body, req.user);
  ok(res, 'Decision changed', { member });
});

// ─── Placement ────────────────────────────────────────────────────────────────

exports.placementPreview = catchAsync(async (req, res) => {
  const clanIds = req.query.clanIds ? String(req.query.clanIds).split(',').filter(Boolean) : null;
  ok(res, 'Placement preview', await poolPlacementService.preview(req.params.id, { clanIds }));
});

exports.setPlacementTargets = catchAsync(async (req, res) => {
  ok(res, 'Placement planned', await poolPlacementService.setTargets(req.params.id, req.body.targets, req.user));
});

exports.runPlacement = catchAsync(async (req, res) => {
  ok(res, 'Placement run', await poolPlacementService.place(req.params.id, { memberIds: req.body.memberIds || null }, req.user));
});
