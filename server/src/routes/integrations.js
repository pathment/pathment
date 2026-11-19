/**
 * Settings → Integrations, for workspace admins (system.settings):
 * API keys, sync connections (field mapping), and sync history.
 * The public API itself is src/publicApi/v1.js.
 */
const express = require('express');
const { authenticate } = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/authz');
const { catchAsync } = require('../middlewares/errorHandler');
const { PERMISSIONS } = require('../config/permissions');
const { successResponse } = require('../utils/responses');
const apiKeys = require('../integrations/apiKeyService');
const syncService = require('../integrations/syncService');
const { TARGET_FIELDS, TRANSFORMS } = require('../integrations/fieldMapping');
const { createAuditLog } = require('../utils/auditContext');
const webhooks = require('../webhooks/webhookService');

const router = express.Router();
router.use(authenticate, requirePermission(PERMISSIONS.SYSTEM_SETTINGS));

const audit = (req, action, entityType, entityId, newValues) =>
  createAuditLog({ userId: req.user.id, action, entityType, entityId, newValues }).catch(() => {});

// ── Vocabulary for the screens ────────────────────────────────────────────────
router.get('/meta', (req, res) => {
  res.json(successResponse('Integration options', {
    scopes: Object.entries(apiKeys.SCOPES).map(([key, description]) => ({ key, description })),
    fields: TARGET_FIELDS,
    transforms: TRANSFORMS,
    maxRecords: syncService.MAX_RECORDS,
    webhookEvents: Object.entries(webhooks.EVENTS).map(([key, description]) => ({ key, description })),
    baseUrl: process.env.PUBLIC_API_BASE_URL || 'https://api.pathment.me/api/v1',
  }));
});

// ── API keys ──────────────────────────────────────────────────────────────────
router.get('/api-keys', catchAsync(async (req, res) => {
  res.json(successResponse('API keys', { apiKeys: await apiKeys.list() }));
}));

router.post('/api-keys', catchAsync(async (req, res) => {
  const { key, apiKey } = await apiKeys.create(req.user, req.body || {});
  await audit(req, 'API_KEY_CREATED', 'ApiKey', apiKey.id, { name: apiKey.name, prefix: apiKey.prefix, scopes: apiKey.scopes });
  // The only response that ever carries the whole key.
  res.status(201).json(successResponse('API key created — copy it now, it will not be shown again', { key, apiKey }, 201));
}));

router.post('/api-keys/:id/revoke', catchAsync(async (req, res) => {
  const apiKey = await apiKeys.revoke(req.user, req.params.id);
  await audit(req, 'API_KEY_REVOKED', 'ApiKey', apiKey.id, { name: apiKey.name, prefix: apiKey.prefix });
  res.json(successResponse('API key revoked', { apiKey }));
}));

// ── Connections ───────────────────────────────────────────────────────────────
router.get('/connections', catchAsync(async (req, res) => {
  res.json(successResponse('Connections', { connections: await syncService.listConnections() }));
}));

router.post('/connections', catchAsync(async (req, res) => {
  const connection = await syncService.createConnection(req.user, req.body || {});
  await audit(req, 'SYNC_CONNECTION_CREATED', 'SyncConnection', connection.id, { name: connection.name });
  res.status(201).json(successResponse('Connection created', { connection }, 201));
}));

router.patch('/connections/:id', catchAsync(async (req, res) => {
  const connection = await syncService.updateConnection(req.params.id, req.body || {});
  await audit(req, 'SYNC_CONNECTION_UPDATED', 'SyncConnection', connection.id, { name: connection.name });
  res.json(successResponse('Connection saved', { connection }));
}));

router.delete('/connections/:id', catchAsync(async (req, res) => {
  await syncService.archiveConnection(req.params.id);
  await audit(req, 'SYNC_CONNECTION_ARCHIVED', 'SyncConnection', req.params.id, {});
  res.json(successResponse('Connection removed', { archived: true }));
}));

router.post('/connections/suggest', (req, res) => {
  res.json(successResponse('Suggested mapping', { mapping: syncService.suggest(req.body?.sample) }));
});

router.post('/connections/preview', (req, res) => {
  res.json(successResponse('Preview', syncService.preview(req.body?.mapping, req.body?.samples || [])));
});

// ── Runs (sync history) ───────────────────────────────────────────────────────
router.get('/runs', catchAsync(async (req, res) => {
  const runs = await syncService.listRuns({ cohortId: req.query.cohortId, connectionId: req.query.connectionId, limit: req.query.limit });
  res.json(successResponse('Sync history', {
    runs: runs.map((r) => ({
      ...syncService.presentJob(r),
      connectionName: r.connection?.name || null,
      intakeName: r.cohort?.name || null,
      apiKey: r.apiKey ? { name: r.apiKey.name, prefix: r.apiKey.prefix } : null,
      source: r.source,
    })),
  }));
}));

router.get('/runs/:id', catchAsync(async (req, res) => {
  res.json(successResponse('Sync run', { run: syncService.presentJob(await syncService.getRun(req.params.id)) }));
}));

router.get('/runs/:id/errors.csv', catchAsync(async (req, res) => {
  const run = await syncService.getRun(req.params.id);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="sync-${run.id.slice(0, 8)}-errors.csv"`);
  res.send(syncService.errorsCsv(run));
}));

// From the app: paste or upload records and run them through a connection (or a dry run).
router.post('/runs', catchAsync(async (req, res) => {
  const b = req.body || {};
  const { run } = await syncService.enqueue({
    cohortId: b.cohortId,
    records: b.records,
    connectionId: b.connectionId || null,
    dryRun: !!b.dryRun,
    sendAssessment: b.sendAssessment,
    triggeredBy: req.user.id,
    source: 'app',
  });
  res.status(202).json(successResponse('Sync queued', { run: syncService.presentJob(run) }, 202));
}));

// ── Webhooks ──────────────────────────────────────────────────────────────────
router.get('/webhooks', catchAsync(async (req, res) => {
  res.json(successResponse('Webhook endpoints', { endpoints: await webhooks.list() }));
}));

router.post('/webhooks', catchAsync(async (req, res) => {
  const { endpoint, secret } = await webhooks.create(req.user, req.body || {});
  await audit(req, 'WEBHOOK_ENDPOINT_CREATED', 'WebhookEndpoint', endpoint.id, { url: endpoint.url, events: endpoint.events });
  res.status(201).json(successResponse('Webhook endpoint added', { endpoint, secret }, 201));
}));

router.patch('/webhooks/:id', catchAsync(async (req, res) => {
  const endpoint = await webhooks.update(req.params.id, req.body || {});
  await audit(req, 'WEBHOOK_ENDPOINT_UPDATED', 'WebhookEndpoint', endpoint.id, { url: endpoint.url, events: endpoint.events, status: endpoint.status });
  res.json(successResponse('Webhook endpoint saved', { endpoint }));
}));

router.delete('/webhooks/:id', catchAsync(async (req, res) => {
  await webhooks.remove(req.params.id);
  await audit(req, 'WEBHOOK_ENDPOINT_DELETED', 'WebhookEndpoint', req.params.id, {});
  res.json(successResponse('Webhook endpoint deleted', { deleted: true }));
}));

router.post('/webhooks/:id/reveal-secret', catchAsync(async (req, res) => {
  const out = await webhooks.revealSecret(req.params.id);
  await audit(req, 'WEBHOOK_SECRET_REVEALED', 'WebhookEndpoint', req.params.id, {});
  res.json(successResponse('Signing secret', out));
}));

router.post('/webhooks/:id/rotate-secret', catchAsync(async (req, res) => {
  const out = await webhooks.rotateSecret(req.params.id);
  await audit(req, 'WEBHOOK_SECRET_ROTATED', 'WebhookEndpoint', req.params.id, {});
  res.json(successResponse('New signing secret — update your receiver now', out));
}));

router.post('/webhooks/:id/ping', catchAsync(async (req, res) => {
  res.json(successResponse('Test event sent', { delivery: await webhooks.ping(req.params.id) }));
}));

router.get('/webhooks/:id/deliveries', catchAsync(async (req, res) => {
  res.json(successResponse('Deliveries', { deliveries: await webhooks.deliveries(req.params.id, { limit: req.query.limit }) }));
}));

router.post('/webhooks/deliveries/:id/redeliver', catchAsync(async (req, res) => {
  res.json(successResponse('Queued again', { delivery: await webhooks.redeliver(req.params.id) }));
}));

module.exports = router;
