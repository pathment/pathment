const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const openSourceOrgService = require('../services/openSourceOrgService');

exports.list = catchAsync(async (req, res) => {
  const orgs = await openSourceOrgService.list(req.query);
  res.json(successResponse('Open source orgs retrieved', { orgs }));
});

exports.create = catchAsync(async (req, res) => {
  const { org, created } = await openSourceOrgService.findOrCreate({
    ...req.body,
    userId: req.user.id
  });
  res.status(created ? 201 : 200).json(
    successResponse(created ? 'Organization created' : 'Organization already exists', { org })
  );
});

exports.searchGithub = catchAsync(async (req, res) => {
  const orgs = await openSourceOrgService.searchGithubOrgs(req.query.q || '');
  res.json(successResponse('GitHub orgs retrieved', { orgs }));
});

