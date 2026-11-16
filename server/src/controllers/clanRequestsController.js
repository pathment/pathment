const { catchAsync } = require('../middlewares/errorHandler');
const { requestedClanId } = require('../middlewares/portalScope');
const { successResponse } = require('../utils/responses');
const clanRequestsService = require('../services/clanRequestsService');
const standingClanService = require('../services/standingClanService');
const authzService = require('../services/authzService');

const overview = catchAsync(async (req, res) => {
  const { tab, page, pageSize, programId, clanId } = req.query;
  const data = await clanRequestsService.overview(
    await authzService.adminProgramScope(req.user),
    { tab, page, pageSize, programId: programId || null, clanId: clanId || null },
  );
  res.status(200).json(successResponse('Clan requests retrieved', data));
});

const destinations = catchAsync(async (req, res) => {
  const clans = await clanRequestsService.destinationsForRequest(
    req.params.id, await authzService.adminProgramScope(req.user),
  );
  res.status(200).json(successResponse('Destinations', { clans }));
});

const createRequest = catchAsync(async (req, res) => {
  const request = await clanRequestsService.createRequest(req.body, req.user.id);
  res.status(201).json(successResponse('Request created', { request }, 201));
});

/**
 * The mentee's own clan-change surface. Everything their page needs in one
 * read, so the form, the sibling clans and their own history cannot disagree
 * about which clan they are in.
 */
const myClanChangeOptions = catchAsync(async (req, res) => {
  const data = await clanRequestsService.myClanChangeOptions(req.user.id);
  res.status(200).json(successResponse('Your clan options', data));
});

/** POST: the mentee asks to be moved. `menteeId` is never read from the body. */
const requestOwnMove = catchAsync(async (req, res) => {
  const request = await clanRequestsService.requestOwnMove(req.body, req.user);
  res.status(201).json(successResponse('Request sent to your program admin', { request }, 201));
});

/** POST: they withdraw it before anyone decided. */
const cancelOwnMove = catchAsync(async (req, res) => {
  const result = await clanRequestsService.cancelOwnMove(req.params.id, req.user.id);
  res.status(200).json(successResponse('Request withdrawn', result));
});

const resolveRequest = catchAsync(async (req, res) => {
  const request = await clanRequestsService.resolveRequest(req.params.id, req.body, req.user?.id);
  res.status(200).json(successResponse('Request resolved', { request }));
});

const listCrossClan = catchAsync(async (req, res) => {
  const crossClan = await clanRequestsService.listCrossClanForClan(req.query.clanId);
  res.status(200).json(successResponse('Cross-clan assignments', { crossClan }));
});

const createCrossClan = catchAsync(async (req, res) => {
  const assignment = await clanRequestsService.createCrossClan(req.body, req.user.id);
  res.status(201).json(successResponse('Assignment created', { assignment }, 201));
});

const removeCrossClan = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Assignment removed', await clanRequestsService.removeCrossClan(req.params.id, req.user.id)));
});

const listMyCrossClan = catchAsync(async (req, res) => {
  const crossClan = await clanRequestsService.listMyCrossClan(req.user.id);
  res.status(200).json(successResponse('Your cross-clan requests', { crossClan }));
});

const respondCrossClan = catchAsync(async (req, res) => {
  const result = await clanRequestsService.respondToCrossClan(req.params.id, req.user.id, req.body.accept === true);
  res.status(200).json(successResponse('Response recorded', result));
});

/**
 * GET /api/clan-requests/standing/eligible-programs
 *
 * Kept on its old path and shape so an older client keeps working, but it now
 * answers per CLAN: `clanId` is what a request is keyed on, and the programme
 * alone could not tell two clans of the same programme apart.
 */
const listStandingEligiblePrograms = catchAsync(async (req, res) => {
  const clans = await standingClanService.eligibleClans(req.user);
  res.status(200).json(successResponse('Eligible clans', clans.map((c) => ({
    // `id`/`name` stay the programme's, so a client that has not been deployed
    // yet still matches on programme and behaves exactly as it did.
    id: c.program.id,
    name: c.program.name,
    endDate: c.program.endDate,
    clanId: c.clanId,
    clanName: c.clanName,
  }))));
});

/** GET /api/clan-requests/standing */
const listStandingRequests = catchAsync(async (req, res) => {
  const requests = await standingClanService.list(req.user);
  res.status(200).json(successResponse('Standing clan requests', requests));
});

/** POST /api/clan-requests/standing */
const createStandingRequest = catchAsync(async (req, res) => {
  // The sidebar's clan, as a fallback for `sourceClanId`. The client and the
  // API deploy separately, so a frontend that predates that field would
  // otherwise be asked to choose a clan its UI never offered — while the
  // selected clan was on screen the whole time. The service only honours it
  // when it is one of the mentor's eligible clans.
  const request = await standingClanService.request(
    { ...req.body, activeClanId: req.body?.sourceClanId || requestedClanId(req) },
    req.user,
  );
  res.status(201).json(successResponse('Request submitted', request, 201));
});

/** GET/PUT /api/clan-requests/standing/settings — does a request wait for an admin? */
const standingSettings = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Standing clan settings', { requiresApproval: await standingClanService.requiresApproval() }));
});
const setStandingSettings = catchAsync(async (req, res) => {
  const requiresApproval = await standingClanService.setRequiresApproval(req.body?.requiresApproval !== false, req.user);
  res.status(200).json(successResponse('Standing clan settings saved', { requiresApproval }));
});

/** POST /api/clan-requests/standing/:id/decision */
const decideStandingRequest = catchAsync(async (req, res) => {
  const request = await standingClanService.decide(
    req.params.id,
    req.body.decision,
    req.body.note,
    req.user
  );
  res.status(200).json(successResponse('Decision recorded', request));
});

module.exports = {
  standingSettings,
  setStandingSettings,
  overview,
  destinations,
  createRequest,
  resolveRequest,
  myClanChangeOptions,
  requestOwnMove,
  cancelOwnMove,
  listCrossClan,
  createCrossClan,
  removeCrossClan,
  listMyCrossClan,
  respondCrossClan,
  listStandingEligiblePrograms,
  listStandingRequests,
  createStandingRequest,
  decideStandingRequest,
};
