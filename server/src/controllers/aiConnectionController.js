const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const aiConnectionService = require('../services/aiConnectionService');

const list = catchAsync(async (req, res) => {
  const [connections, routing] = await Promise.all([
    aiConnectionService.list(req.user),
    aiConnectionService.getRouting(req.user)
  ]);
  res.status(200).json(successResponse('AI connections retrieved', { connections, routing }));
});

const create = catchAsync(async (req, res) => {
  const connection = await aiConnectionService.create(req.body, req.user);
  res.status(201).json(successResponse('Connection added', { connection }, 201));
});

const remove = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Connection removed', await aiConnectionService.remove(req.params.id, req.user)));
});

const test = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Connection tested', await aiConnectionService.test(req.params.id, req.user)));
});

const setRouting = catchAsync(async (req, res) => {
  const routing = await aiConnectionService.setRouting(req.user, req.body.routing || {});
  res.status(200).json(successResponse('Routing updated', { routing }));
});

module.exports = { list, create, remove, test, setRouting };
