const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const clanRequestsService = require('../services/clanRequestsService');

const overview = catchAsync(async (req, res) => {
  const data = await clanRequestsService.overview();
  res.status(200).json(successResponse('Clan requests retrieved', data));
});

const createRequest = catchAsync(async (req, res) => {
  const request = await clanRequestsService.createRequest({ ...req.body, menteeId: req.user.id }, req.user.id);
  res.status(201).json(successResponse('Request created', { request }, 201));
});

const listMyRequests = catchAsync(async (req, res) => {
  const requests = await clanRequestsService.listMyRequests(req.user.id);
  res.status(200).json(successResponse('My clan change requests', { requests }));
});

const resolveRequest = catchAsync(async (req, res) => {
  const request = await clanRequestsService.resolveRequest(req.params.id, req.body);
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

module.exports = { overview, createRequest, listMyRequests, resolveRequest, listCrossClan, createCrossClan, removeCrossClan, listMyCrossClan, respondCrossClan };
