const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const externalAppService = require('../services/externalAppService');
const platformAudit = require('../services/platformAuditService');
const { models, sequelize } = require('../db');
const { INTEGRATIONS } = require('../config/externalApps');

/**
 * The app catalog, operated from the platform console. The catalog is global -
 * one row is shared by every workspace - so authoring lives here, not under any
 * workspace. Workspaces keep their read-and-connect surface at /api/apps.
 */

/** connections per app across ALL workspaces - the blast radius of a change. */
async function connectionCounts() {
  const rows = await models.OrganizationApp.findAll({
    skipOrganizationScope: true,
    raw: true,
    attributes: ['appId', [sequelize.fn('COUNT', '*'), 'count']],
    group: ['app_id'],
  });
  return Object.fromEntries(rows.map((row) => [row.appId, Number(row.count)]));
}

const list = catchAsync(async (req, res) => {
  const [apps, counts] = await Promise.all([
    externalAppService.listCatalog(req.query),
    connectionCounts(),
  ]);
  res.status(200).json(successResponse('App catalog retrieved', {
    apps: apps.map((app) => ({ ...app, connections: counts[app.id] || 0 })),
    // What the create/edit form can offer: each key, and whether an app
    // already claims it (integration_key is unique).
    integrations: Object.keys(INTEGRATIONS).map((key) => ({
      key,
      label: INTEGRATIONS[key].label || key,
      credentialFields: INTEGRATIONS[key].credentialFields,
      usedBy: apps.find((app) => app.integrationKey === key)?.name || null,
    })),
  }));
});

const create = catchAsync(async (req, res) => {
  const app = await externalAppService.create(req.body, req.user);
  await platformAudit.record({
    action: 'PLATFORM_APP_CREATED', targetType: 'ExternalApp', targetId: app.name,
    newValues: { id: app.id, type: app.type, integrationKey: app.integrationKey, backendUrl: app.backendUrl, frontendUrl: app.frontendUrl, isActive: app.isActive },
    actor: req.user,
  });
  res.status(201).json(successResponse('App created', { app: { ...app, connections: 0 } }, 201));
});

const update = catchAsync(async (req, res) => {
  const before = await models.ExternalApp.findByPk(req.params.id);
  const app = await externalAppService.update(req.params.id, req.body);
  await platformAudit.record({
    action: 'PLATFORM_APP_UPDATED', targetType: 'ExternalApp', targetId: app.name,
    oldValues: before ? {
      name: before.name, type: before.type, integrationKey: before.integrationKey,
      backendUrl: before.backendUrl, frontendUrl: before.frontendUrl, isActive: before.isActive,
    } : null,
    newValues: req.body,
    actor: req.user,
  });
  const counts = await connectionCounts();
  res.status(200).json(successResponse('App updated', { app: { ...app, connections: counts[app.id] || 0 } }));
});

const remove = catchAsync(async (req, res) => {
  const before = await models.ExternalApp.findByPk(req.params.id);
  const counts = await connectionCounts();
  const result = await externalAppService.remove(req.params.id);
  await platformAudit.record({
    action: 'PLATFORM_APP_DELETED', targetType: 'ExternalApp', targetId: before?.name || req.params.id,
    oldValues: before ? { name: before.name, type: before.type, integrationKey: before.integrationKey } : null,
    newValues: { connectionsRemoved: counts[req.params.id] || 0 },
    actor: req.user,
  });
  res.status(200).json(successResponse('App deleted', result));
});

module.exports = { list, create, update, remove };
