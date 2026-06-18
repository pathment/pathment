const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const orgGovernanceService = require('../services/orgGovernanceService');

/** GET /api/governance — org governance settings (admin). */
const get = catchAsync(async (req, res) => {
  const governance = await orgGovernanceService.get();
  res.status(200).json(successResponse('Governance settings', { governance }));
});

/** PUT /api/governance — update org governance settings (admin). */
const update = catchAsync(async (req, res) => {
  const governance = await orgGovernanceService.update(req.user.id, req.body || {});
  res.status(200).json(successResponse('Governance settings updated', { governance }));
});

module.exports = { get, update };
