const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const svc = require('../services/reviewScheduleService');

const list = catchAsync(async (req, res) => {
  const schedules = await svc.listSchedules(req.user.id);
  res.status(200).json(successResponse('Review schedules', schedules));
});

const create = catchAsync(async (req, res) => {
  const schedule = await svc.createSchedule(req.user.id, req.body || {});
  res.status(201).json(successResponse('Review schedule created', schedule));
});

const remove = catchAsync(async (req, res) => {
  const result = await svc.cancelSchedule(req.user.id, req.params.id);
  res.status(200).json(successResponse('Review schedule cancelled', result));
});

module.exports = { list, create, remove };
