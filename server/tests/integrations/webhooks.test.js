'use strict';

/**
 * Outgoing webhooks end to end against a real local receiver: events come
 * from the models, are signed with the endpoint's secret, carry the public
 * shapes, are only sent to endpoints that want them, are retried on failure,
 * and an endpoint that keeps failing is turned off. Plus the URL checks.
 */
const http = require('http');
const crypto = require('crypto');
const { models } = require('../../src/db');
const seed = require('../helpers/seed');
const webhooks = require('../../src/webhooks/webhookService');
const { tick } = require('../../src/workers/webhookWorker');
const syncService = require('../../src/integrations/syncService');
const syncWorker = require('../../src/workers/syncWorker');

let receiver;
let received;
let reply;
let port;
let ctx;

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
/** Let the after-commit hooks run, then send what's due. */
async function flush() {
  await pause(30);
  await tick();
}
async function waitForDeliveries(where, n = 1) {
  for (let i = 0; i < 50; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await models.WebhookDelivery.count({ where }) >= n) return;
    // eslint-disable-next-line no-await-in-loop
    await pause(20);
  }
}

beforeAll(async () => {
  process.env.WEBHOOKS_ALLOW_PRIVATE = 'true';
  receiver = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      received.push({ headers: req.headers, body });
      res.statusCode = reply;
      res.end(reply < 300 ? 'ok' : 'nope');
    });
  });
  await new Promise((r) => receiver.listen(0, '127.0.0.1', r));
  port = receiver.address().port;
});
afterAll(async () => {
  delete process.env.WEBHOOKS_ALLOW_PRIVATE;
  await new Promise((r) => receiver.close(r));
});

beforeEach(async () => {
  await seed.cleanDb();
  received = [];
  reply = 200;
  webhooks._cache.clear();
  const admin = await seed.createAdmin();
  const program = await seed.createProgram({ createdBy: admin.id, name: 'Fellowship' });
  const cohort = await models.Cohort.create({ programId: program.id, name: 'Intake', status: 'open' });
  const { endpoint, secret } = await webhooks.create(admin, {
    url: `http://127.0.0.1:${port}/hooks`, events: ['applicant.created', 'applicant.accepted', 'sync.job.completed', 'certificate.issued'],
  });
  ctx = { admin, program, cohort, endpoint, secret };
});

const verify = (secret, headers, body) => {
  const [t, v1] = String(headers['pathment-signature']).split(',').map((p) => p.split('=')[1]);
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex')) && Math.abs(Date.now() / 1000 - Number(t)) < 300;
};

describe('sending events', () => {
  it('sends a signed applicant.created with the public Applicant shape', async () => {
    const app = await models.Application.create({ cohortId: ctx.cohort.id, email: 'ada@example.com', firstName: 'Ada', source: 'import', status: 'pending', responses: { city: 'Gaza' } });
    await waitForDeliveries({ eventType: 'applicant.created' });
    await flush();
    expect(received).toHaveLength(1);
    const { headers, body } = received[0];
    expect(verify(ctx.secret, headers, body)).toBe(true);
    expect(verify('whsec_wrong', headers, body)).toBe(false);
    const event = JSON.parse(body);
    expect(event).toMatchObject({ type: 'applicant.created', apiVersion: '2026-11-20' });
    expect(event.id).toMatch(/^evt_/);
    expect(headers['pathment-event-id']).toBe(event.id);
    expect(headers['pathment-event-type']).toBe('applicant.created');
    expect(event.data.applicant).toMatchObject({ id: app.id, intakeId: ctx.cohort.id, email: 'ada@example.com', stage: 'added', status: 'pending', responses: { city: 'Gaza' } });
    const delivery = await models.WebhookDelivery.findOne({ where: { eventType: 'applicant.created' } });
    expect(delivery).toMatchObject({ status: 'succeeded', attempts: 1, lastStatusCode: 200 });
  });

  it('sends applicant.accepted on the status change, and nothing for events the endpoint did not choose', async () => {
    const app = await models.Application.create({ cohortId: ctx.cohort.id, email: 'bo@example.com', source: 'import', status: 'pending', responses: {} });
    await waitForDeliveries({ eventType: 'applicant.created' });
    await app.update({ status: 'accepted' });
    await waitForDeliveries({ eventType: 'applicant.accepted' });
    const other = await models.Application.create({ cohortId: ctx.cohort.id, email: 'cy@example.com', source: 'import', status: 'pending', responses: {} });
    await waitForDeliveries({ eventType: 'applicant.created' }, 2);
    await other.update({ status: 'rejected' }); // not subscribed
    await flush();
    const types = received.map((r) => JSON.parse(r.body).type);
    expect(types.filter((t) => t === 'applicant.accepted')).toHaveLength(1);
    expect(types).not.toContain('applicant.rejected');
    expect(await models.WebhookDelivery.count({ where: { eventType: 'applicant.rejected' } })).toBe(0);
  });

  it('sends sync.job.completed with the Job, and certificate.issued with its verify link', async () => {
    const { run } = await syncService.enqueue({ cohortId: ctx.cohort.id, records: [{ email: 'd@example.com' }] });
    await syncWorker.tick();
    await waitForDeliveries({ eventType: 'sync.job.completed' });

    const template = await models.CertificateTemplate.create({ name: 'Completion', config: {}, createdBy: ctx.admin.id, programId: ctx.program.id });
    const mentee = await seed.createMentee({ email: 'cert@example.com' });
    await models.CertificateInstance.create({ templateId: template.id, menteeId: mentee.id, issuedBy: ctx.admin.id, certificateNumber: 'PM-WH-1', tier: 'completion' });
    await waitForDeliveries({ eventType: 'certificate.issued' });
    await flush();

    const byType = Object.fromEntries(received.map((r) => [JSON.parse(r.body).type, JSON.parse(r.body).data]));
    expect(byType['sync.job.completed'].job).toMatchObject({ id: run.id, status: 'succeeded', counts: { created: 1 } });
    expect(byType['certificate.issued']).toMatchObject({
      menteeId: mentee.id, programmeId: ctx.program.id,
      certificate: { number: 'PM-WH-1', verifyUrl: 'https://app.pathment.me/verify/PM-WH-1' },
    });
  });
});

describe('failures', () => {
  it('retries a failed delivery later and counts the failure', async () => {
    reply = 500;
    await models.Application.create({ cohortId: ctx.cohort.id, email: 'e@example.com', source: 'import', status: 'pending', responses: {} });
    await waitForDeliveries({ eventType: 'applicant.created' });
    await flush();
    const d = await models.WebhookDelivery.findOne({ where: { eventType: 'applicant.created' } });
    expect(d).toMatchObject({ status: 'retrying', attempts: 1, lastStatusCode: 500, lastError: 'HTTP 500' });
    const waitMs = new Date(d.nextAttemptAt).getTime() - Date.now();
    expect(waitMs).toBeGreaterThan(50_000);
    expect(waitMs).toBeLessThan(70_000);
    expect((await models.WebhookEndpoint.findByPk(ctx.endpoint.id)).consecutiveFailures).toBe(1);

    // Redelivering sends it now; a success resets the failure count.
    reply = 200;
    await webhooks.redeliver(d.id);
    await tick();
    expect((await d.reload()).status).toBe('succeeded');
    expect((await models.WebhookEndpoint.findByPk(ctx.endpoint.id)).consecutiveFailures).toBe(0);
  });

  it('turns an endpoint off after 50 failures in a row, and stops sending to it', async () => {
    reply = 500;
    await models.WebhookEndpoint.update({ consecutiveFailures: 49 }, { where: { id: ctx.endpoint.id } });
    await models.Application.create({ cohortId: ctx.cohort.id, email: 'f@example.com', source: 'import', status: 'pending', responses: {} });
    await waitForDeliveries({ eventType: 'applicant.created' });
    await flush();
    const ep = await models.WebhookEndpoint.findByPk(ctx.endpoint.id);
    expect(ep.status).toBe('disabled');
    expect(ep.disabledReason).toMatch(/50 failed deliveries/);
    // Nothing more is queued for it.
    await models.Application.create({ cohortId: ctx.cohort.id, email: 'g@example.com', source: 'import', status: 'pending', responses: {} });
    await pause(60);
    expect(await models.WebhookDelivery.count({ where: { eventType: 'applicant.created' } })).toBe(1);
  });

  it('pings right away and reports the response', async () => {
    const d = await webhooks.ping(ctx.endpoint.id);
    expect(d).toMatchObject({ type: 'ping', status: 'succeeded', lastStatusCode: 200, lastResponseBody: 'ok' });
    expect(JSON.parse(received[0].body).data.message).toMatch(/receiving webhooks/);
  });
});

describe('endpoint checks', () => {
  it('refuses non-https and internal addresses outside local development', () => {
    const { checkUrl } = require('../../src/webhooks/webhookService');
    delete process.env.WEBHOOKS_ALLOW_PRIVATE;
    try {
      expect(() => checkUrl('http://example.com/hook')).toThrow(/https/);
      expect(() => checkUrl('https://127.0.0.1/hook')).toThrow(/public internet/);
      expect(() => checkUrl('https://10.0.0.5/hook')).toThrow(/public internet/);
      expect(() => checkUrl('https://localhost/hook')).toThrow(/public internet/);
      expect(() => checkUrl('https://user:pw@example.com/hook')).toThrow(/credentials/);
      expect(checkUrl('https://hooks.example.com/pathment')).toBe('https://hooks.example.com/pathment');
      expect(webhooks.isPrivateAddress('192.168.1.4')).toBe(true);
      expect(webhooks.isPrivateAddress('::ffff:10.1.2.3')).toBe(true);
      expect(webhooks.isPrivateAddress('8.8.8.8')).toBe(false);
    } finally {
      process.env.WEBHOOKS_ALLOW_PRIVATE = 'true';
    }
  });

  it('only accepts known events, and keeps the secret encrypted', async () => {
    await expect(webhooks.create(ctx.admin, { url: 'https://hooks.example.com/x', events: ['applicant.exploded'] })).rejects.toThrow(/Unknown event/);
    const row = await models.WebhookEndpoint.findByPk(ctx.endpoint.id);
    expect(row.secretEncrypted).not.toContain(ctx.secret);
    expect((await webhooks.revealSecret(ctx.endpoint.id)).secret).toBe(ctx.secret);
    const { secret } = await webhooks.rotateSecret(ctx.endpoint.id);
    expect(secret).not.toBe(ctx.secret);
    expect(secret).toMatch(/^whsec_/);
  });
});
