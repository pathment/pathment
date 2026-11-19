/**
 * Pathment public API, v1 — https://api.pathment.me/api/v1
 *
 * Documented at https://pathment.me/docs. Keep this file and the docs in step:
 * the docs promise these paths, fields, error codes and limits.
 *
 *   Auth          Authorization: Bearer pk_live_…   (one workspace per key)
 *   Errors        { error: { type, code, message, field? }, requestId }
 *   Rate limit    120 requests / minute / key, X-RateLimit-* headers
 *   Pagination    ?limit (1–100, default 50) & ?cursor → { data, hasMore, nextCursor }
 *
 * Responses are shaped here, from stable fields — never raw rows — so internal
 * changes don't break integrations.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const apiKeys = require('../integrations/apiKeyService');
const syncService = require('../integrations/syncService');
const { setRequestOrganization } = require('../utils/auditContext');

const router = express.Router();

// ── Errors ────────────────────────────────────────────────────────────────────
const TYPE_BY_STATUS = {
  400: 'invalid_request', 401: 'authentication_error', 403: 'permission_error', 404: 'not_found',
  409: 'conflict', 429: 'rate_limited', 500: 'api_error',
};
const DEFAULT_CODE = {
  400: 'validation_failed', 401: 'invalid_api_key', 403: 'insufficient_scope', 404: 'not_found',
  409: 'conflict', 429: 'rate_limited', 500: 'internal_error',
};

function sendError(req, res, status, code, message, field = null) {
  res.status(status).json({
    error: { type: TYPE_BY_STATUS[status] || 'api_error', code, message, ...(field ? { field } : {}) },
    requestId: req.id || null,
  });
}

class V1Error extends Error {
  constructor(status, code, message, field = null) {
    super(message);
    this.v1 = { status, code, field };
  }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ── Authentication: the key decides the workspace ───────────────────────────────
router.use(wrap(async (req, _res, next) => {
  let key;
  try {
    key = await apiKeys.authenticate(req.headers.authorization);
  } catch (e) {
    if (e instanceof apiKeys.ApiAuthError) throw new V1Error(e.status, e.code, e.message);
    throw e;
  }
  const organization = await models.Organization.findByPk(key.organizationId, { skipOrganizationScope: true });
  if (!organization) throw new V1Error(401, 'invalid_api_key', 'That API key is not valid.');
  try {
    require('../services/organizationService').assertWorkspaceAvailable(organization);
  } catch {
    throw new V1Error(403, 'workspace_unavailable', 'This workspace is not active. Contact your Pathment administrator.');
  }
  req.apiKey = key;
  req.organization = organization;
  req.organizationId = organization.id;
  setRequestOrganization(organization.id, organization.slug);
  next();
}));

// ── Rate limit: per key ─────────────────────────────────────────────────────────
router.use(rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  // Authentication runs first, so there is always a key here: limit per key, never per IP.
  keyGenerator: (req) => `v1:${req.apiKey?.id || 'unauthenticated'}`,
  standardHeaders: false,
  legacyHeaders: true, // X-RateLimit-Limit / -Remaining / -Reset
  handler: (req, res) => {
    const reset = req.rateLimit?.resetTime;
    res.setHeader('Retry-After', String(reset ? Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000)) : 60));
    sendError(req, res, 429, 'rate_limited', 'Too many requests for this API key. Wait for Retry-After seconds and try again.');
  },
}));

const requireScope = (...anyOf) => (req, _res, next) => {
  const have = req.apiKey?.scopes || [];
  if (anyOf.some((s) => have.includes(s))) return next();
  return next(new V1Error(403, 'insufficient_scope', `This API key needs the ${anyOf.map((s) => `\`${s}\``).join(' or ')} scope.`));
};

// ── Pagination: an opaque cursor over (createdAt, id) ───────────────────────────
function pageParams(req) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
  let after = null;
  if (req.query.cursor) {
    try {
      const [t, id] = Buffer.from(String(req.query.cursor), 'base64url').toString('utf8').split('|');
      if (!t || !id || Number.isNaN(Date.parse(t))) throw new Error('bad');
      after = { t: new Date(t), id };
    } catch { throw new V1Error(400, 'validation_failed', 'That cursor is not valid. Use the nextCursor from the previous page.', 'cursor'); }
  }
  return { limit, after };
}
const afterWhere = (after) => (after ? { [Op.or]: [{ createdAt: { [Op.gt]: after.t } }, { createdAt: after.t, id: { [Op.gt]: after.id } }] } : {});
function page(rows, limit, present) {
  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit);
  const last = data[data.length - 1];
  return {
    data: data.map(present),
    hasMore,
    nextCursor: hasMore && last ? Buffer.from(`${new Date(last.createdAt).toISOString()}|${last.id}`, 'utf8').toString('base64url') : null,
  };
}

// ── Shapes ──────────────────────────────────────────────────────────────────────
const presentIntake = (c, applicantCount) => ({
  id: c.id,
  name: c.name,
  programme: c.program ? { id: c.program.id, name: c.program.name } : null,
  status: c.status,
  levels: (Array.isArray(c.levels) ? c.levels : []).map((l) => ({ key: l.key, label: l.label })),
  assessmentMode: c.assessmentMode || 'after_form',
  applicantCount: applicantCount ?? 0,
  createdAt: c.createdAt,
});

async function identitiesFor(appIds) {
  if (!appIds.length) return new Map();
  const rows = await models.ExternalIdentity.findAll({ where: { applicationId: appIds }, attributes: ['applicationId', 'externalId', 'updatedAt'], order: [['updatedAt', 'DESC']] });
  const out = new Map();
  for (const r of rows) if (!r.externalId.startsWith('email:') && !out.has(r.applicationId)) out.set(r.applicationId, r.externalId);
  return out;
}

const presentApplicant = (a, stage, externalId) => {
  const responses = { ...(a.responses || {}) };
  return {
    id: a.id,
    intakeId: a.cohortId,
    externalId: externalId || null,
    email: a.email,
    firstName: a.firstName || null,
    lastName: a.lastName || null,
    phone: a.phone || null,
    level: a.level || null,
    country: typeof responses.country === 'string' ? responses.country : null,
    status: a.status,
    stage,
    responses,
    source: a.source,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
};

async function findIntake(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw new V1Error(404, 'intake_not_found', 'No intake with that ID in this workspace.');
  const cohort = await models.Cohort.findByPk(id, { include: [{ model: models.Program, as: 'program', attributes: ['id', 'name'] }] });
  if (!cohort) throw new V1Error(404, 'intake_not_found', 'No intake with that ID in this workspace.');
  return cohort;
}

// ── Endpoints ───────────────────────────────────────────────────────────────────
router.get('/me', wrap(async (req, res) => {
  const k = req.apiKey;
  res.json({
    organization: { id: req.organization.id, name: req.organization.name, slug: req.organization.slug },
    apiKey: { id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes || [], expiresAt: k.expiresAt || null },
  });
}));

router.get('/intakes', requireScope('intakes:read'), wrap(async (req, res) => {
  const { limit, after } = pageParams(req);
  const rows = await models.Cohort.findAll({
    where: afterWhere(after),
    include: [{ model: models.Program, as: 'program', attributes: ['id', 'name'] }],
    order: [['createdAt', 'ASC'], ['id', 'ASC']],
    limit: limit + 1,
  });
  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? await models.Application.count({ where: { cohortId: ids }, group: ['cohortId'] })
    : [];
  const byId = new Map(counts.map((c) => [c.cohortId || c.cohort_id, Number(c.count)]));
  res.json(page(rows, limit, (c) => presentIntake(c, byId.get(c.id))));
}));

router.get('/intakes/:intakeId', requireScope('intakes:read'), wrap(async (req, res) => {
  const cohort = await findIntake(req.params.intakeId);
  const count = await models.Application.count({ where: { cohortId: cohort.id } });
  res.json(presentIntake(cohort, count));
}));

router.post('/intakes/:intakeId/applicants', requireScope('applicants:write'), wrap(async (req, res) => {
  const cohort = await findIntake(req.params.intakeId);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (body.dryRun != null && typeof body.dryRun !== 'boolean') throw new V1Error(400, 'validation_failed', '`dryRun` must be true or false.', 'dryRun');
  if (body.sendAssessment != null && typeof body.sendAssessment !== 'boolean') throw new V1Error(400, 'validation_failed', '`sendAssessment` must be true or false.', 'sendAssessment');
  if (body.connection != null && (typeof body.connection !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.connection))) {
    throw new V1Error(400, 'validation_failed', '`connection` must be a connection ID.', 'connection');
  }
  const idem = req.headers['idempotency-key'];
  if (idem != null && (String(idem).length === 0 || String(idem).length > 255)) throw new V1Error(400, 'validation_failed', 'Idempotency-Key must be 1 to 255 characters.', 'Idempotency-Key');
  const { run, replay } = await syncService.enqueue({
    cohortId: cohort.id,
    records: body.records,
    connectionId: body.connection || null,
    dryRun: !!body.dryRun,
    sendAssessment: body.sendAssessment,
    idempotencyKey: idem || null,
    apiKeyId: req.apiKey.id,
    source: 'api',
  });
  res.status(replay ? 200 : 202).json({ job: syncService.presentJob(run) });
}));

router.get('/intakes/:intakeId/applicants', requireScope('intakes:read'), wrap(async (req, res) => {
  const cohort = await findIntake(req.params.intakeId);
  const { limit, after } = pageParams(req);
  const where = { cohortId: cohort.id, ...afterWhere(after) };
  if (req.query.updatedSince) {
    const since = new Date(String(req.query.updatedSince));
    if (Number.isNaN(since.getTime())) throw new V1Error(400, 'validation_failed', '`updatedSince` must be an ISO 8601 date.', 'updatedSince');
    where.updatedAt = { [Op.gt]: since };
  }
  if (req.query.email) where.email = String(req.query.email).trim().toLowerCase();
  if (req.query.externalId) {
    const ids = await models.ExternalIdentity.findAll({ where: { externalId: String(req.query.externalId) }, attributes: ['applicationId'] });
    where.id = ids.map((i) => i.applicationId);
  }
  const rows = await models.Application.findAll({ where, order: [['createdAt', 'ASC'], ['id', 'ASC']], limit: limit + 1 });

  // Stage needs each one's submission and programme invite (batched, as the app does).
  const pipeline = require('../services/assessmentPipelineService');
  const ids = rows.map((r) => r.id);
  const subs = ids.length ? await models.AssessmentSubmission.findAll({ where: { applicationId: ids }, attributes: ['applicationId', 'status', 'startedAt', 'submittedAt', 'gradedAt'] }) : [];
  const subBy = new Map();
  for (const s of subs) {
    const prev = subBy.get(s.applicationId);
    if (!prev || new Date(s.submittedAt || 0) > new Date(prev.submittedAt || 0)) subBy.set(s.applicationId, s);
  }
  const inviteIds = rows.map((r) => r.inviteId).filter(Boolean);
  const invites = inviteIds.length ? await models.RegistrationInvite.findAll({ where: { id: inviteIds }, attributes: ['id', 'usedAt', 'createdAt'] }) : [];
  const inviteBy = new Map(invites.map((i) => [i.id, i]));
  const externalBy = await identitiesFor(ids);

  let data = rows;
  const stageOf = (a) => pipeline.stageOf(a, subBy.get(a.id) || null, a.inviteId ? inviteBy.get(a.inviteId) : null);
  if (req.query.stage) data = rows.filter((a) => stageOf(a) === String(req.query.stage));
  const out = page(rows, limit, (a) => presentApplicant(a, stageOf(a), externalBy.get(a.id)));
  if (req.query.stage) {
    const keep = new Set(data.map((a) => a.id));
    out.data = out.data.filter((a) => keep.has(a.id));
  }
  res.json(out);
}));

router.get('/jobs/:jobId', requireScope('intakes:read', 'applicants:write'), wrap(async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(String(req.params.jobId))) throw new V1Error(404, 'job_not_found', 'No job with that ID in this workspace.');
  const run = await models.SyncRun.findByPk(req.params.jobId, { attributes: { exclude: ['records'] } });
  if (!run) throw new V1Error(404, 'job_not_found', 'No job with that ID in this workspace.');
  res.json(syncService.presentJob(run));
}));

// ── Phase 2: programmes, clans, mentees, progress (read only) ───────────────────
const reads = require('./readService');
const UUID = /^[0-9a-f-]{36}$/i;
const idOr404 = (id, code, what) => { if (!UUID.test(String(id))) throw new V1Error(404, code, `No ${what} with that ID in this workspace.`); };
const optionalUuid = (req, name) => {
  const v = req.query[name];
  if (v == null || v === '') return null;
  if (!UUID.test(String(v))) throw new V1Error(400, 'validation_failed', `\`${name}\` must be an ID.`, name);
  return String(v);
};
const since = (req) => {
  if (!req.query.updatedSince) return null;
  const d = new Date(String(req.query.updatedSince));
  if (Number.isNaN(d.getTime())) throw new V1Error(400, 'validation_failed', '`updatedSince` must be an ISO 8601 date.', 'updatedSince');
  return d;
};
/** A page from rows fetched with limit+1, presented by id. */
function pageOf(rows, limit, present) {
  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit);
  const last = data[data.length - 1];
  return {
    data: data.map(present),
    hasMore,
    nextCursor: hasMore && last ? Buffer.from(`${new Date(last.createdAt).toISOString()}|${last.id}`, 'utf8').toString('base64url') : null,
  };
}

router.get('/programmes', requireScope('programmes:read'), wrap(async (req, res) => {
  const { limit, after } = pageParams(req);
  const where = afterWhere(after);
  if (req.query.status) where.status = String(req.query.status);
  const rows = await reads.programmes(where, limit + 1);
  res.json(pageOf(rows, limit, (p) => p));
}));

router.get('/programmes/:programmeId', requireScope('programmes:read'), wrap(async (req, res) => {
  idOr404(req.params.programmeId, 'programme_not_found', 'programme');
  const p = await reads.programme(req.params.programmeId);
  if (!p) throw new V1Error(404, 'programme_not_found', 'No programme with that ID in this workspace.');
  res.json(p);
}));

router.get('/programmes/:programmeId/progress', requireScope('progress:read'), wrap(async (req, res) => {
  idOr404(req.params.programmeId, 'programme_not_found', 'programme');
  const exists = await models.Program.findByPk(req.params.programmeId, { attributes: ['id'] });
  if (!exists) throw new V1Error(404, 'programme_not_found', 'No programme with that ID in this workspace.');
  const { limit, after } = pageParams(req);
  const { rows, present } = await reads.programmeProgress(req.params.programmeId, { clanId: optionalUuid(req, 'clanId'), after }, limit + 1);
  res.json(pageOf(rows, limit, (e) => present.get(e.id)));
}));

router.get('/clans', requireScope('programmes:read'), wrap(async (req, res) => {
  const { limit, after } = pageParams(req);
  const where = afterWhere(after);
  const programmeId = optionalUuid(req, 'programmeId');
  if (programmeId) where.programId = programmeId;
  if (req.query.status) where.status = String(req.query.status);
  const rows = await reads.clans(where, limit + 1);
  res.json(pageOf(rows, limit, (c) => c));
}));

router.get('/clans/:clanId', requireScope('programmes:read'), wrap(async (req, res) => {
  idOr404(req.params.clanId, 'clan_not_found', 'clan');
  const c = await reads.clan(req.params.clanId);
  if (!c) throw new V1Error(404, 'clan_not_found', 'No clan with that ID in this workspace.');
  res.json(c);
}));

router.get('/mentees', requireScope('mentees:read'), wrap(async (req, res) => {
  const { limit, after } = pageParams(req);
  const { rows, present } = await reads.mentees({
    programmeId: optionalUuid(req, 'programmeId'),
    clanId: optionalUuid(req, 'clanId'),
    email: req.query.email ? String(req.query.email) : null,
    externalId: req.query.externalId ? String(req.query.externalId) : null,
    updatedSince: since(req),
    after,
  }, limit + 1);
  res.json(pageOf(rows, limit, (u) => present.get(u.id)));
}));

router.get('/mentees/:menteeId', requireScope('mentees:read'), wrap(async (req, res) => {
  idOr404(req.params.menteeId, 'mentee_not_found', 'mentee');
  const m = await reads.mentee(req.params.menteeId);
  if (!m) throw new V1Error(404, 'mentee_not_found', 'No mentee with that ID in this workspace.');
  res.json(m);
}));

router.get('/mentees/:menteeId/progress', requireScope('progress:read'), wrap(async (req, res) => {
  idOr404(req.params.menteeId, 'mentee_not_found', 'mentee');
  // A mentee of this workspace (progress needs no personal data, but the person must be ours).
  const [[known]] = await sequelize.query(`SELECT 1 AS ok FROM clan_memberships WHERE organization_id = :org AND user_id = :id AND role = 'mentee' LIMIT 1`,
    { replacements: { org: req.organizationId, id: req.params.menteeId } });
  if (!known) throw new V1Error(404, 'mentee_not_found', 'No mentee with that ID in this workspace.');
  const data = await reads.menteeProgress(req.params.menteeId, { programmeId: optionalUuid(req, 'programmeId') });
  res.json({ data });
}));

router.use((req, _res, next) => next(new V1Error(404, 'not_found', `No endpoint ${req.method} ${req.baseUrl}${req.path}. See https://pathment.me/docs/api.`)));

// ── The v1 error envelope ───────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, _next) => {
  if (err.v1) return sendError(req, res, err.v1.status, err.v1.code, err.message, err.v1.field);
  if (err.apiCode) {
    const status = err.statusCode || 400;
    return sendError(req, res, status, err.apiCode, err.message, err.apiField || null);
  }
  const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
  if (status === 500) require('../utils/logger').error('Public API error', { path: req.path, message: err.message });
  return sendError(req, res, status, DEFAULT_CODE[status] || 'internal_error',
    status === 500 ? 'Something went wrong on our side. Try again; if it keeps happening, contact support with the requestId.' : err.message);
});

module.exports = router;
module.exports.sendError = sendError;
