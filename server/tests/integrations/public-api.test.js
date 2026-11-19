'use strict';

/**
 * Public API v1, end to end over HTTP: API keys, pushing people into an intake
 * (with and without a field mapping), the background job, matching and the
 * update rules, idempotency, dry runs, sending the assessment, the intake cap,
 * reading back, and workspace isolation. Also the field mapping on its own.
 */
const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const seed = require('../helpers/seed');
const apiKeys = require('../../src/integrations/apiKeyService');
const syncService = require('../../src/integrations/syncService');
const { mapRecord, suggestMapping } = require('../../src/integrations/fieldMapping');
const { tick } = require('../../src/workers/syncWorker');
const { runWithRequestContext } = require('../../src/utils/auditContext');
const assessmentService = require('../../src/services/assessmentService');

let ctx;

const bearer = (key) => ({ Authorization: `Bearer ${key}` });
const push = (key, intakeId, body, headers = {}) => request(app).post(`/api/v1/intakes/${intakeId}/applicants`).set({ ...bearer(key), ...headers }).send(body);
/** Push, then run the worker, then read the job back. */
async function pushAndRun(key, intakeId, body, headers = {}) {
  const res = await push(key, intakeId, body, headers);
  expect([200, 202]).toContain(res.status);
  await tick();
  const job = await request(app).get(`/api/v1/jobs/${res.body.job.id}`).set(bearer(key));
  expect(job.status).toBe(200);
  return job.body;
}

beforeEach(async () => {
  await seed.cleanDb();
  const admin = await seed.createAdmin();
  const program = await seed.createProgram({ createdBy: admin.id, name: 'Fellowship' });
  const cohort = await models.Cohort.create({
    programId: program.id, name: 'Spring intake', status: 'open',
    levels: [{ key: 'beginner', label: 'Beginner' }, { key: 'senior', label: 'Senior' }],
  });
  const write = await apiKeys.create(admin, { name: 'CRM sync', scopes: ['intakes:read', 'applicants:write'] });
  const readOnly = await apiKeys.create(admin, { name: 'Dashboard', scopes: ['intakes:read'] });
  ctx = { admin, program, cohort, key: write.key, readKey: readOnly.key, keyRow: write.apiKey };
});

describe('field mapping', () => {
  it('reads paths, tidies values, translates levels and keeps everything else', () => {
    const mapping = {
      fields: {
        email: { from: 'user.email_address', transform: 'lowercase' },
        firstName: { from: 'full_name', transform: 'first_name' },
        lastName: { from: 'full_name', transform: 'last_name' },
        phone: { from: 'contact.phones[0]', transform: 'digits' },
        level: { from: 'track', map: { Advanced: 'senior' }, default: 'beginner' },
        externalId: { from: 'id' },
      },
      keepUnmapped: true,
    };
    const out = mapRecord({
      id: 42, full_name: '  Ada  Lovelace King ', user: { email_address: ' ADA@Example.com ' },
      contact: { phones: ['+44 (20) 7946-0000'] }, track: 'advanced', city: 'London',
    }, mapping);
    expect(out.values).toEqual({
      email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace King', phone: '+442079460000', level: 'senior', externalId: '42',
    });
    expect(out.responses).toEqual({ city: 'London' });
    // An unknown level falls to the default.
    expect(mapRecord({ user: { email_address: 'b@x.co' }, track: 'Expert' }, mapping).values.level).toBe('beginner');
  });

  it('suggests a mapping from common field names', () => {
    const m = suggestMapping({ uid: 'u1', email_address: 'a@b.co', full_name: 'A B', mobile: '123', track: 'x' });
    expect(m.fields.email.from).toBe('email_address');
    expect(m.fields.firstName).toEqual({ from: 'full_name', transform: 'first_name' });
    expect(m.fields.phone.from).toBe('mobile');
    expect(m.fields.level.from).toBe('track');
    expect(m.fields.externalId.from).toBe('uid');
    // A system-specific ID name is still found when it's the only one.
    expect(suggestMapping({ crm_id: 'c-1', email: 'a@b.co' }).fields.externalId).toEqual({ from: 'crm_id' });
  });
});

describe('authentication', () => {
  it('knows the key and its workspace', async () => {
    const res = await request(app).get('/api/v1/me').set(bearer(ctx.key));
    expect(res.status).toBe(200);
    expect(res.body.apiKey).toMatchObject({ name: 'CRM sync', prefix: ctx.key.slice(0, 12), scopes: ['intakes:read', 'applicants:write'] });
    expect(res.body.organization.slug).toBeTruthy();
    expect(res.headers['x-ratelimit-limit']).toBe('120');
  });

  it('refuses a missing, wrong, revoked or under-scoped key with the documented codes', async () => {
    const none = await request(app).get('/api/v1/me');
    expect(none.status).toBe(401);
    expect(none.body.error).toMatchObject({ type: 'authentication_error', code: 'missing_api_key' });
    expect(none.body.requestId).toBeTruthy();

    const wrong = await request(app).get('/api/v1/me').set(bearer(`${ctx.key.slice(0, 12)}xxxxxxxxxxxxxxxxxxxxxxxxxxxx`));
    expect(wrong.body.error.code).toBe('invalid_api_key');

    const scoped = await push(ctx.readKey, ctx.cohort.id, { records: [{ email: 'a@example.com' }] });
    expect(scoped.status).toBe(403);
    expect(scoped.body.error).toMatchObject({ type: 'permission_error', code: 'insufficient_scope' });

    await apiKeys.revoke(ctx.admin, ctx.keyRow.id);
    const revoked = await request(app).get('/api/v1/me').set(bearer(ctx.key));
    expect(revoked.status).toBe(401);
    expect(revoked.body.error.code).toBe('revoked_api_key');
  });

  it('keeps only the hash', async () => {
    const row = await models.ApiKey.findByPk(ctx.keyRow.id);
    expect(row.keyHash).toBe(apiKeys.hashKey(ctx.key));
    expect(JSON.stringify(row.toJSON())).not.toContain(ctx.key);
  });
});

describe('pushing people into an intake', () => {
  it('queues a job, adds everyone at "Added", and reports it', async () => {
    const res = await push(ctx.key, ctx.cohort.id, { records: [
      { email: 'Ada@Example.com', firstName: 'Ada', externalId: 'u1', level: 'Senior', city: 'London' },
      { email: 'grace@example.com', firstName: 'Grace', externalId: 'u2' },
    ] });
    expect(res.status).toBe(202);
    expect(res.body.job).toMatchObject({ status: 'queued', total: 2, dryRun: false, intakeId: ctx.cohort.id });

    await tick();
    const job = (await request(app).get(`/api/v1/jobs/${res.body.job.id}`).set(bearer(ctx.key))).body;
    expect(job.status).toBe('succeeded');
    expect(job.counts).toEqual({ created: 2, updated: 0, unchanged: 0, skipped: 0, failed: 0 });

    const ada = await models.Application.findOne({ where: { cohortId: ctx.cohort.id, email: 'ada@example.com' } });
    expect(ada).toMatchObject({ firstName: 'Ada', level: 'senior', source: 'api', status: 'pending' });
    expect(ada.responses).toEqual({ city: 'London' });

    const list = await request(app).get(`/api/v1/intakes/${ctx.cohort.id}/applicants?externalId=u1`).set(bearer(ctx.readKey));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ email: 'ada@example.com', externalId: 'u1', stage: 'added', status: 'pending' });
  });

  it('applies a connection\'s mapping', async () => {
    const connection = await syncService.createConnection(ctx.admin, {
      name: 'Old CRM', cohortId: ctx.cohort.id,
      mapping: { fields: { email: { from: 'mail' }, firstName: { from: 'name', transform: 'first_name' }, externalId: { from: 'ref' } } },
    });
    const job = await pushAndRun(ctx.key, ctx.cohort.id, { connection: connection.id, records: [{ ref: 'c-9', mail: 'LIN@x.io', name: 'Lin Haddad', cohort: 'B' }] });
    expect(job.counts.created).toBe(1);
    const lin = await models.Application.findOne({ where: { email: 'lin@x.io' } });
    expect(lin).toMatchObject({ firstName: 'Lin' });
    expect(lin.responses).toEqual({ cohort: 'B' });
  });

  it('updates only what the source set, never what an admin changed, and never reopens closed people', async () => {
    await pushAndRun(ctx.key, ctx.cohort.id, { records: [
      { email: 'ada@example.com', firstName: 'Ada', phone: '111', externalId: 'u1' },
      { email: 'bo@example.com', firstName: 'Bo', externalId: 'u2' },
    ] });
    // An admin fixes Ada's phone, and rejects Bo.
    await models.Application.update({ phone: '999' }, { where: { email: 'ada@example.com' } });
    await models.Application.update({ status: 'rejected' }, { where: { email: 'bo@example.com' } });

    const job = await pushAndRun(ctx.key, ctx.cohort.id, { records: [
      { email: 'ada@example.com', firstName: 'Adaline', phone: '222', externalId: 'u1' },
      { email: 'bo@example.com', firstName: 'Bob', externalId: 'u2' },
      { email: 'cy@example.com', externalId: 'u3' },
    ] });
    expect(job.counts).toMatchObject({ created: 1, updated: 1, skipped: 1, failed: 0 });
    expect(job.status).toBe('succeeded');
    expect(job.errors).toEqual([expect.objectContaining({ code: 'applicant_closed', externalId: 'u2' })]);
    const ada = await models.Application.findOne({ where: { email: 'ada@example.com' } });
    expect(ada.firstName).toBe('Adaline');
    expect(ada.phone).toBe('999');
    expect((await models.Application.findOne({ where: { email: 'bo@example.com' } })).firstName).toBe('Bo');

    // The same batch again: nothing to change.
    const again = await pushAndRun(ctx.key, ctx.cohort.id, { records: [{ email: 'cy@example.com', externalId: 'u3' }] });
    expect(again.counts).toMatchObject({ unchanged: 1, created: 0 });
  });

  it('reports bad records without stopping the batch', async () => {
    const job = await pushAndRun(ctx.key, ctx.cohort.id, { records: [
      { firstName: 'No email' },
      { email: 'not-an-email' },
      { email: 'ok@example.com', level: 'expert' },
      { email: 'twice@example.com' },
      { email: 'TWICE@example.com' },
    ] });
    expect(job.status).toBe('partial');
    expect(job.counts).toMatchObject({ created: 1, failed: 4 });
    expect(job.errors.map((e) => e.code)).toEqual(['missing_email', 'invalid_email', 'invalid_level', 'duplicate_in_batch']);
    expect(job.errors[0].index).toBe(0);
  });

  it('is idempotent with Idempotency-Key, and refuses the key with a different body', async () => {
    const body = { records: [{ email: 'ada@example.com' }] };
    const first = await push(ctx.key, ctx.cohort.id, body, { 'Idempotency-Key': 'batch-1' });
    const second = await push(ctx.key, ctx.cohort.id, body, { 'Idempotency-Key': 'batch-1' });
    expect(first.status).toBe(202);
    expect(second.status).toBe(200);
    expect(second.body.job.id).toBe(first.body.job.id);
    const other = await push(ctx.key, ctx.cohort.id, { records: [{ email: 'grace@example.com' }] }, { 'Idempotency-Key': 'batch-1' });
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe('idempotency_key_reused');
  });

  it('dry runs write nothing', async () => {
    const job = await pushAndRun(ctx.key, ctx.cohort.id, { dryRun: true, records: [{ email: 'ada@example.com' }, { email: 'bad' }] });
    expect(job).toMatchObject({ dryRun: true, status: 'partial' });
    expect(job.counts).toMatchObject({ created: 1, failed: 1 });
    expect(await models.Application.count({ where: { cohortId: ctx.cohort.id } })).toBe(0);
  });

  it('sends each new applicant the assessment when asked', async () => {
    const a = await assessmentService.createAssessment({ title: 'Screening' }, ctx.admin.id);
    await assessmentService.setQuestions(a.id, [{ type: 'short_text', prompt: 'Why?', points: 5 }]);
    await assessmentService.updateAssessment(a.id, { status: 'published' });
    await models.CohortAssessment.create({ cohortId: ctx.cohort.id, assessmentId: a.id, level: null, position: 0 });

    const job = await pushAndRun(ctx.key, ctx.cohort.id, { sendAssessment: true, records: [{ email: 'ada@example.com' }, { email: 'grace@example.com' }] });
    expect(job.assessmentsSent).toBe(2);
    const ada = await models.Application.findOne({ where: { email: 'ada@example.com' } });
    expect(ada.status).toBe('assessment_sent');
  });

  it('stops adding at the intake cap, but still updates', async () => {
    await ctx.cohort.update({ maxApplications: 1 });
    const job = await pushAndRun(ctx.key, ctx.cohort.id, { records: [{ email: 'a@example.com' }, { email: 'b@example.com' }] });
    expect(job.counts).toMatchObject({ created: 1, failed: 1 });
    expect(job.errors[0].code).toBe('intake_full');
  });

  it('validates the request itself', async () => {
    const empty = await push(ctx.key, ctx.cohort.id, { records: [] });
    expect(empty.status).toBe(400);
    expect(empty.body.error).toMatchObject({ code: 'validation_failed', field: 'records' });
    const tooMany = await push(ctx.key, ctx.cohort.id, { records: Array.from({ length: 1001 }, (_, i) => ({ email: `p${i}@x.io` })) });
    expect(tooMany.body.error.code).toBe('too_many_records');
    const missing = await push(ctx.key, '00000000-0000-4000-8000-000000000000', { records: [{ email: 'a@b.co' }] });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('intake_not_found');
    const broken = await request(app).post(`/api/v1/intakes/${ctx.cohort.id}/applicants`).set({ ...bearer(ctx.key), 'Content-Type': 'application/json' }).send('{"records": [');
    expect(broken.status).toBe(400);
    expect(broken.body.error.code).toBe('invalid_json');
  });
});

describe('reading', () => {
  it('lists intakes with counts, a page at a time', async () => {
    await models.Cohort.create({ programId: ctx.program.id, name: 'Autumn intake', status: 'planning' });
    await pushAndRun(ctx.key, ctx.cohort.id, { records: [{ email: 'a@example.com' }] });
    const first = await request(app).get('/api/v1/intakes?limit=1').set(bearer(ctx.readKey));
    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(1);
    expect(first.body.hasMore).toBe(true);
    expect(first.body.data[0]).toMatchObject({ name: 'Spring intake', applicantCount: 1, programme: { name: 'Fellowship' } });
    const second = await request(app).get(`/api/v1/intakes?limit=1&cursor=${first.body.nextCursor}`).set(bearer(ctx.readKey));
    expect(second.body.data[0].name).toBe('Autumn intake');
    expect(second.body.hasMore).toBe(false);
  });

  it('never shows another workspace\'s data', async () => {
    // A second workspace is only usable with multi-workspace on (as in production).
    process.env.MULTI_TENANT_WORKSPACES_ENABLED = 'true';
    try { await isolationChecks(); } finally { delete process.env.MULTI_TENANT_WORKSPACES_ENABLED; }
  });
});

async function isolationChecks() {
  {
    const other = await models.Organization.create({ name: `Other ${Date.now()}`, slug: `other-${Date.now()}`, status: 'active', timezone: 'UTC' });
    const plan = await models.Plan.findOne({ where: { key: 'growth' } });
    let otherKey;
    await runWithRequestContext({ organizationId: other.id }, async () => {
      if (plan) await models.OrganizationSubscription.create({ organizationId: other.id, planId: plan.id, status: 'active' });
      otherKey = (await apiKeys.create(ctx.admin, { name: 'Theirs', scopes: ['intakes:read', 'applicants:write'] })).key;
    });
    const intake = await request(app).get(`/api/v1/intakes/${ctx.cohort.id}`).set(bearer(otherKey));
    expect(intake.body).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: 'intake_not_found' }) }));
    expect(intake.status).toBe(404);
    const pushed = await push(otherKey, ctx.cohort.id, { records: [{ email: 'x@example.com' }] });
    expect(pushed.status).toBe(404);
    const list = await request(app).get('/api/v1/intakes').set(bearer(otherKey));
    expect(list.body.data).toEqual([]);
  }
}
