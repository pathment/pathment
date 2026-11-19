'use strict';

/**
 * Pull connectors against a real local "other system": JSON with pages, CSV,
 * each sign-in method, redirects, the "nothing changed" skip, a broken source
 * showing up in the history, the schedule, and the credential never leaving
 * the server.
 */
const http = require('http');
const { models } = require('../../src/db');
const seed = require('../helpers/seed');
const syncService = require('../../src/integrations/syncService');
const pullService = require('../../src/integrations/pullService');
const syncWorker = require('../../src/workers/syncWorker');

let server;
let base;
let seen;
let people;

const page = (from, size) => people.slice(from, from + size);

beforeAll(async () => {
  process.env.OUTBOUND_ALLOW_PRIVATE = 'true';
  server = http.createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers });
    const url = new URL(req.url, 'http://x');
    const json = (status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
    switch (url.pathname) {
      case '/people': { // bearer token, cursor pages
        if (req.headers.authorization !== 'Bearer tok_123') return json(401, { error: 'no' });
        const from = Number(url.searchParams.get('from') || 0);
        const next = from + 2 < people.length ? `/people?from=${from + 2}` : null;
        return json(200, { data: { items: page(from, 2) }, links: { next } });
      }
      case '/plain': return json(200, people); // a bare array, no sign-in
      case '/keyed': // custom header
        return req.headers['x-api-key'] === 'k-9' ? json(200, { results: people }) : json(403, {});
      case '/basic':
        return req.headers.authorization === `Basic ${Buffer.from('ops:pw').toString('base64')}` ? json(200, { users: people }) : json(401, {});
      case '/sheet.csv':
        res.setHeader('Content-Type', 'text/csv');
        return res.end('﻿Email,Full Name,Student ID\r\nada@example.com,"Lovelace, Ada",S1\r\n"bo@example.com","Bo ""B"" Smith",S2\r\n,,\r\n');
      case '/moved': res.statusCode = 302; res.setHeader('Location', '/plain'); return res.end();
      case '/html': res.setHeader('Content-Type', 'text/html'); return res.end('<!DOCTYPE html><html>sign in</html>');
      case '/broken': return json(500, {});
      default: return json(404, {});
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  delete process.env.OUTBOUND_ALLOW_PRIVATE;
  await new Promise((r) => server.close(r));
});

let admin;
let cohort;
beforeEach(async () => {
  await seed.cleanDb();
  seen = [];
  people = [
    { id: 'u1', email: 'ada@example.com', name: 'Ada Lovelace' },
    { id: 'u2', email: 'bo@example.com', name: 'Bo Smith' },
    { id: 'u3', email: 'cy@example.com', name: 'Cy Young' },
  ];
  admin = await seed.createAdmin();
  const program = await seed.createProgram({ createdBy: admin.id, name: 'Fellowship' });
  cohort = await models.Cohort.create({ programId: program.id, name: 'Intake', status: 'open' });
});

const connect = (pull, extra = {}) => syncService.createConnection(admin, {
  name: 'Their system', cohortId: cohort.id,
  mapping: { fields: { externalId: { from: 'id' }, email: { from: 'email' }, firstName: { from: 'name', transform: 'first_name' } }, keepUnmapped: false },
  pull, ...extra,
});
const drain = () => syncWorker.tick();

describe('fetching', () => {
  it('follows pages with a bearer token and imports everyone through the normal sync', async () => {
    const c = await connect({ url: `${base}/people`, recordsPath: 'data.items', nextPath: 'links.next', auth: 'bearer' }, { pullSecret: 'tok_123' });
    const result = await pullService.pull(c.id, { force: true });
    expect(result).toMatchObject({ status: 'queued', total: 3 });
    expect(seen.map((s) => s.url)).toEqual(['/people', '/people?from=2']);
    await drain();
    const run = await models.SyncRun.findByPk(result.runs[0]);
    expect(run).toMatchObject({ status: 'succeeded', source: 'pull', connectionId: c.id });
    expect(run.counts.created).toBe(3);
    const ada = await models.Application.findOne({ where: { email: 'ada@example.com' } });
    expect(ada.firstName).toBe('Ada');
  });

  it('finds the list on its own, and works with a header or basic sign-in', async () => {
    const a = await pullService.test({ pull: { url: `${base}/plain` } });
    expect(a).toMatchObject({ ok: true, total: 3 });
    const b = await pullService.test({ pull: { url: `${base}/keyed`, auth: 'header', headerName: 'X-Api-Key' }, pullSecret: 'k-9' });
    expect(b).toMatchObject({ ok: true, total: 3 });
    const c = await pullService.test({ pull: { url: `${base}/basic`, auth: 'basic', username: 'ops' }, pullSecret: 'pw' });
    expect(c).toMatchObject({ ok: true, total: 3, samples: expect.arrayContaining([expect.objectContaining({ id: 'u1' })]) });
    const wrong = await pullService.test({ pull: { url: `${base}/basic`, auth: 'basic', username: 'ops' }, pullSecret: 'nope' });
    expect(wrong).toMatchObject({ ok: false, status: 401 });
    expect(wrong.error).toMatch(/refused the sign-in/);
  });

  it('reads CSV (quotes, commas, a BOM, blank lines) and follows a redirect', async () => {
    const csv = await pullService.test({ pull: { url: `${base}/sheet.csv` } });
    expect(csv.ok).toBe(true);
    expect(csv.samples).toEqual([
      { Email: 'ada@example.com', 'Full Name': 'Lovelace, Ada', 'Student ID': 'S1' },
      { Email: 'bo@example.com', 'Full Name': 'Bo "B" Smith', 'Student ID': 'S2' },
    ]);
    expect(await pullService.test({ pull: { url: `${base}/moved` } })).toMatchObject({ ok: true, total: 3 });
    const html = await pullService.test({ pull: { url: `${base}/html`, format: 'csv' } });
    expect(html.error).toMatch(/web page, not CSV/);
  });
});

describe('pulling again', () => {
  it('skips a scheduled pull when nothing changed, but not a "Pull now", and picks up changes', async () => {
    const c = await connect({ url: `${base}/plain` });
    expect((await pullService.pull(c.id)).status).toBe('queued');
    await drain();
    expect((await pullService.pull(c.id)).status).toBe('unchanged');
    expect((await models.SyncConnection.findByPk(c.id)).pullLastStatus).toBe('unchanged');

    const forced = await pullService.pull(c.id, { force: true });
    expect(forced.status).toBe('queued');
    await drain();
    expect((await models.SyncRun.findByPk(forced.runs[0])).counts.unchanged).toBe(3);

    people[0].name = 'Augusta Lovelace';
    expect((await pullService.pull(c.id)).status).toBe('queued');
    await drain();
    expect((await models.Application.findOne({ where: { email: 'ada@example.com' } })).firstName).toBe('Augusta');
  });

  it('records a source that can’t be reached in the history', async () => {
    const c = await connect({ url: `${base}/broken` });
    const result = await pullService.pull(c.id);
    expect(result).toMatchObject({ status: 'failed', error: 'The server answered HTTP 500' });
    const run = await models.SyncRun.findByPk(result.runs[0]);
    expect(run).toMatchObject({ status: 'failed', source: 'pull', total: 0 });
    expect(run.errorMessage).toMatch(/Couldn’t fetch the records: The server answered HTTP 500/);
    expect((await models.SyncConnection.findByPk(c.id)).pullLastError).toBe('The server answered HTTP 500');
  });
});

describe('the schedule', () => {
  it('pulls what is due, once, and books the next pull', async () => {
    const c = await connect({ url: `${base}/plain` }, { pullSchedule: 'hourly' });
    expect(c.pullNextAt).toBeTruthy();
    await models.SyncConnection.update({ pullNextAt: new Date(Date.now() - 1000) }, { where: { id: c.id } });
    await syncWorker.pullTick();
    await drain();
    expect(await models.Application.count({ where: { cohortId: cohort.id } })).toBe(3);
    const after = await models.SyncConnection.findByPk(c.id);
    const minutes = (new Date(after.pullNextAt) - Date.now()) / 60000;
    expect(minutes).toBeGreaterThan(58);
    expect(minutes).toBeLessThan(61);
    // Not due again: nothing more is fetched.
    seen = [];
    await syncWorker.pullTick();
    expect(seen).toHaveLength(0);

    // Back to manual: off the schedule.
    await syncService.updateConnection(c.id, { pullSchedule: 'manual' });
    expect((await models.SyncConnection.findByPk(c.id)).pullNextAt).toBeNull();
  });
});

describe('settings', () => {
  it('keeps the credential encrypted and never sends it back', async () => {
    const c = await connect({ url: `${base}/people`, auth: 'bearer' }, { pullSecret: 'tok_123' });
    const json = JSON.parse(JSON.stringify(c));
    expect(json.hasPullSecret).toBe(true);
    expect(JSON.stringify(json)).not.toContain('tok_123');
    expect(json.pullSecretEncrypted).toBeUndefined();
    const listed = JSON.stringify(await syncService.listConnections());
    expect(listed).not.toContain('tok_123');

    // Saving again without the secret keeps it; the test can use the stored one.
    await syncService.updateConnection(c.id, { pull: { url: `${base}/people`, auth: 'bearer', recordsPath: 'data.items' } });
    expect(await pullService.test({ pull: { url: `${base}/people`, auth: 'bearer', recordsPath: 'data.items' }, connectionId: c.id }))
      .toMatchObject({ ok: true, total: 2 });
  });

  it('refuses unsafe or incomplete settings', () => {
    delete process.env.OUTBOUND_ALLOW_PRIVATE;
    try {
      expect(() => pullService.cleanConfig({ url: 'http://example.com/x' })).toThrow(/https/);
      expect(() => pullService.cleanConfig({ url: 'https://10.1.2.3/x' })).toThrow(/public internet/);
      expect(() => pullService.cleanConfig({ url: 'https://ops:pw@example.com/x' })).toThrow(/sign-in settings/);
      expect(() => pullService.cleanConfig({ url: 'https://example.com/x', auth: 'header', headerName: 'Host' })).toThrow(/sets Host itself/);
      expect(() => pullService.cleanConfig({ url: 'https://example.com/x', recordsPath: 'a;drop' })).toThrow(/path like/);
      expect(pullService.cleanConfig({ url: 'https://docs.google.com/spreadsheets/d/e/x/pub?output=csv' }).format).toBe('csv');
      expect(() => pullService.columnsFor({ pull: { url: 'https://example.com/x', auth: 'bearer' } })).toThrow(/Give the token/);
    } finally {
      process.env.OUTBOUND_ALLOW_PRIVATE = 'true';
    }
  });
});
