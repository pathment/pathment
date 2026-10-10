const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const clanRequestsService = require('../services/clanRequestsService');
const standingClanService = require('../services/standingClanService');

const overview = catchAsync(async (req, res) => {
  const data = await clanRequestsService.overview();
  res.status(200).json(successResponse('Clan requests retrieved', data));
});

const createRequest = catchAsync(async (req, res) => {
  const request = await clanRequestsService.createRequest(req.body, req.user.id);
  res.status(201).json(successResponse('Request created', { request }, 201));
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
  const request = await standingClanService.request(req.body, req.user);
  res.status(201).json(successResponse('Request submitted', request, 201));
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
  overview,
  createRequest,
  resolveRequest,
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
