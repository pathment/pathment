const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const orgSystemSettingsService = require('../services/orgSystemSettingsService');
const cohortReviewAccessService = require('../services/cohortReviewAccessService');

/** GET /api/admin/system-settings */
const getSystemSettings = catchAsync(async (req, res) => {
  const settings = await orgSystemSettingsService.get();
  res.status(200).json(successResponse('System settings', { settings }));
});

/** PUT /api/admin/system-settings */
const updateSystemSettings = catchAsync(async (req, res) => {
  const settings = await orgSystemSettingsService.update(req.user.id, req.body || {});
  res.status(200).json(successResponse('System settings updated', { settings }));
});

/** GET /api/admin/cohort-review/edit-requests */
const listEditRequests = catchAsync(async (req, res) => {
  const status = req.query.status || 'pending';
  const requests = await cohortReviewAccessService.listEditRequests({ status });
  res.status(200).json(successResponse('Cohort review edit requests', { requests }));
});

/** POST /api/admin/cohort-review/edit-requests/:id/resolve */
const resolveEditRequest = catchAsync(async (req, res) => {
  const request = await cohortReviewAccessService.resolveEditRequest(req.user.id, req.params.id, req.body || {});
  res.status(200).json(successResponse('Request resolved', { request }));
});

/** POST /api/admin/cohort-review/clan-grants */
const createClanGrant = catchAsync(async (req, res) => {
  const grant = await cohortReviewAccessService.createClanGrant(req.user.id, req.body || {});
  res.status(201).json(successResponse('Clan grant created', { grant }, 201));
});

/** GET /api/admin/cohort-review/clan-grants */
const listClanGrants = catchAsync(async (req, res) => {
  const grants = await cohortReviewAccessService.listActiveClanGrants();
  res.status(200).json(successResponse('Active clan grants', { grants }));
});

module.exports = {
  getSystemSettings,
  updateSystemSettings,
  listEditRequests,
  resolveEditRequest,
  createClanGrant,
  listClanGrants,
};
