const organizationService = require('../services/organizationService');
const { successResponse } = require('../utils/responses');
const { catchAsync } = require('../middlewares/errorHandler');

const current = catchAsync(async (req, res) => {
  const data = await organizationService.overview(req.user.id, req.organizationId);
  res.json(successResponse('Organization retrieved', data));
});

const listMine = catchAsync(async (req, res) => {
  const organizations = await organizationService.memberships(req.user.id);
  res.json(successResponse('Organizations retrieved', { organizations, workspaceCreationEnabled: organizationService.workspaceCreationEnabled() }));
});

const create = catchAsync(async (req, res) => {
  const organization = await organizationService.create(req.user.id, req.body || {});
  res.status(201).json(successResponse('Organization created', { organization }, 201));
});

const listPlans = catchAsync(async (_req, res) => {
  const plans = await organizationService.plans();
  res.json(successResponse('Plans retrieved', { plans }));
});

const updateCurrent = catchAsync(async (req, res) => {
  const organization = await organizationService.update(req.user.id, req.organizationId, req.body || {});
  res.json(successResponse('Organization updated', { organization }));
});

const uploadLogo = catchAsync(async (req, res) => {
  const organization = await organizationService.setLogo(req.user.id, req.organizationId, req.file);
  res.json(successResponse('Organization logo updated', { organization }));
});

const removeLogo = catchAsync(async (req, res) => {
  const organization = await organizationService.removeLogo(req.user.id, req.organizationId);
  res.json(successResponse('Organization logo removed', { organization }));
});

const requestPlan = catchAsync(async (req, res) => {
  const subscription = await organizationService.requestPlan(req.user.id, req.organizationId, req.body?.planKey);
  res.json(successResponse('Plan change requested', { subscription }));
});

const demo = catchAsync(async (req, res) => {
  if (!require('../utils/stagingWorkspaceDemo').isDemo(req.organization)) {
    throw new (require('../utils/errors/errorTypes').NotFoundError)('Workspace demo not available');
  }
  const { models } = require('../db');
  // Explicit ownership predicates in addition to ORM hooks. Never return global
  // profile fields, counters, credentials or another workspace's membership.
  const memberships = await models.OrganizationMembership.findAll({
    where: { organizationId: req.organizationId, status: 'active' },
    include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }],
    order: [['joinedAt', 'ASC']],
  });
  const programs = await models.Program.findAll({
    where: { organizationId: req.organizationId }, attributes: ['id', 'name'],
  });
  const clans = await models.Clan.findAll({
    where: { organizationId: req.organizationId }, attributes: ['id', 'name', 'programId'],
  });
  const roles = await models.ClanMembership.findAll({
    where: { organizationId: req.organizationId }, attributes: ['userId', 'role', 'clanId'],
  });
  res.set('Cache-Control', 'no-store');
  res.json(successResponse('Restricted workspace demo', {
    members: memberships.map(m => ({ id: m.userId, name: `${m.user.firstName} ${m.user.lastName}`,
      workspaceRole: m.role, clanRoles: roles.filter(r => r.userId === m.userId).map(r => r.role) })),
    programs, clans,
  }));
});

module.exports = { demo, current, listMine, create, listPlans, updateCurrent, uploadLogo, removeLogo, requestPlan };
