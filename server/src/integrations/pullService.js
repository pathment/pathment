/**
 * Pull connectors: Pathment fetches a connection's records from a URL, now or
 * on a schedule, instead of waiting for the other system to send them.
 *
 *   URL (JSON or CSV, pages followed) ─▶ records ─▶ the same sync pipeline
 *                                                   (mapping, matching, history)
 *
 * A pull queues ordinary sync runs (source "pull"), at most 1,000 records
 * each, so everything a push guarantees holds here too: people are matched by
 * their ID or email, an admin's edits stay, closed applicants aren't reopened,
 * nobody is deleted. A scheduled pull whose data hasn't changed since the last
 * one (same records, same mapping, same intake) is skipped, so the history
 * only shows pulls that could change something.
 *
 * Calls go through utils/outboundHttp: https only, never an internal address,
 * the credential only ever sent to the URL's own host.
 */
const crypto = require('crypto');
const { models, sequelize } = require('../db');
const { ValidationError, NotFoundError } = require('../utils/errors/errorTypes');
const { encrypt, decrypt } = require('../utils/secretCrypto');
const outbound = require('../utils/outboundHttp');
const { getPath } = require('./fieldMapping');

const SCHEDULE_MINUTES = { manual: null, hourly: 60, every_6_hours: 360, daily: 1440 };
const FORMATS = ['json', 'csv'];
const AUTH = ['none', 'bearer', 'header', 'basic'];
const MAX_PAGES = 20;
const MAX_TOTAL = 10_000;
const PER_RUN = 1000;
const TIMEOUT_MS = 30_000;
const MAX_BYTES = 10_000_000;
const LEASE_MINUTES = 15;
/** When a JSON object holds its list under one of these, that's the list. */
const LIST_KEYS = ['data', 'results', 'items', 'records', 'rows', 'users', 'people', 'applicants', 'students', 'entries', 'list'];
const PATH_RE = /^[A-Za-z0-9_$\-.[\] ]{1,200}$/;
const FORBIDDEN_HEADERS = ['host', 'content-length', 'content-type', 'connection', 'transfer-encoding', 'accept-encoding', 'cookie'];

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const blank = (v) => v == null || String(v).trim() === '';

// ── CSV ─────────────────────────────────────────────────────────────────────────
/** RFC 4180: quoted fields, "" inside quotes, commas and newlines inside quotes, a BOM. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((v) => v.trim() !== ''));
  if (!header) return [];
  const names = header.map((h) => h.trim());
  return body.map((r) => {
    const out = {};
    names.forEach((name, i) => { if (name) out[name] = (r[i] ?? '').trim(); });
    return out;
  });
}

// ── JSON ────────────────────────────────────────────────────────────────────────
function listIn(body, recordsPath) {
  if (recordsPath) {
    const found = getPath(body, recordsPath);
    if (!Array.isArray(found)) throw new outbound.OutboundError(`There's no list of records at "${recordsPath}" in the response`);
    return found;
  }
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object') {
    for (const k of LIST_KEYS) if (Array.isArray(body[k])) return body[k];
    const arrays = Object.keys(body).filter((k) => Array.isArray(body[k]));
    if (arrays.length === 1) return body[arrays[0]];
  }
  throw new outbound.OutboundError('Couldn’t find the list of records in the response — say where it is under "Records are at" (for example data.items)');
}

function nextPageUrl(body, headers, nextPath, current) {
  let next = nextPath ? getPath(body, nextPath) : null;
  if (!next && headers.link) {
    const m = String(headers.link).split(',').map((p) => p.trim()).find((p) => /rel="?next"?/i.test(p));
    if (m) next = (m.match(/<([^>]+)>/) || [])[1];
  }
  if (!next || typeof next !== 'string') return null;
  const url = new URL(next, current);
  // Pages must stay on the same host — the credential goes with them.
  if (url.host !== new URL(current).host) throw new outbound.OutboundError('The next page is on a different host; Pathment only follows pages on the same host');
  return url.href;
}

// ── Settings ──────────────────────────────────────────────────────────────────
class PullService {
  constructor() {
    this.SCHEDULE_MINUTES = SCHEDULE_MINUTES;
    this.parseCsv = parseCsv;
  }

  /** Validated pull settings, or a ValidationError saying what's wrong. */
  cleanConfig(input) {
    if (!input || typeof input !== 'object') throw new ValidationError('Give the URL to fetch the records from');
    const url = outbound.checkUrl(input.url, { credentialsMessage: 'Leave the username and password out of the URL — use the sign-in settings below' });
    const guessed = /\.csv($|\?)|[?&](output|format)=csv/i.test(url) ? 'csv' : 'json';
    const format = input.format || guessed;
    if (!FORMATS.includes(format)) throw new ValidationError('The format must be JSON or CSV');
    const path = (v, label) => {
      if (blank(v)) return null;
      const p = String(v).trim();
      if (!PATH_RE.test(p)) throw new ValidationError(`"${label}" must be a path like data.items`);
      return p;
    };
    const auth = input.auth || 'none';
    if (!AUTH.includes(auth)) throw new ValidationError('Unknown sign-in method');
    let headerName = null;
    if (auth === 'header') {
      headerName = String(input.headerName || '').trim();
      if (!/^[A-Za-z0-9-]{1,100}$/.test(headerName)) throw new ValidationError('Give the header name, for example X-Api-Key');
      if (FORBIDDEN_HEADERS.includes(headerName.toLowerCase())) throw new ValidationError(`Pathment sets ${headerName} itself; use another header`);
    }
    let username = null;
    if (auth === 'basic') {
      username = String(input.username || '').trim().slice(0, 200);
      if (!username) throw new ValidationError('Give the username');
    }
    return {
      url,
      format,
      recordsPath: format === 'json' ? path(input.recordsPath, 'Records are at') : null,
      nextPath: format === 'json' ? path(input.nextPath, 'Next page is at') : null,
      auth,
      headerName,
      username,
    };
  }

  /**
   * The columns to write for a connection's pull settings, from the request
   * body (`pull`, `pullSecret`, `pullSchedule`). `pull: null` turns pulling off.
   * A secret not sent keeps the stored one.
   */
  columnsFor(data, existing = null) {
    const out = {};
    if (data.pull === undefined && data.pullSecret === undefined && data.pullSchedule === undefined) return out;
    const config = data.pull === undefined ? existing?.pullConfig || null : data.pull === null ? null : this.cleanConfig(data.pull);
    if (!config) {
      return { pullConfig: null, pullSecretEncrypted: null, pullSchedule: 'manual', pullNextAt: null, pullLastHash: null };
    }
    out.pullConfig = config;

    if (config.auth === 'none') out.pullSecretEncrypted = null;
    else if (typeof data.pullSecret === 'string' && data.pullSecret.trim()) {
      if (data.pullSecret.length > 4000) throw new ValidationError('That credential is too long');
      out.pullSecretEncrypted = encrypt(data.pullSecret.trim());
    } else if (!existing?.pullSecretEncrypted || existing.pullConfig?.auth !== config.auth) {
      throw new ValidationError(config.auth === 'basic' ? 'Give the password' : config.auth === 'bearer' ? 'Give the token' : 'Give the header value');
    }

    const schedule = data.pullSchedule !== undefined ? data.pullSchedule : existing?.pullSchedule || 'manual';
    if (!(schedule in SCHEDULE_MINUTES)) throw new ValidationError('The schedule must be manual, hourly, every 6 hours or daily');
    out.pullSchedule = schedule;
    const wasScheduled = existing?.pullSchedule && existing.pullSchedule !== 'manual' && existing.pullNextAt;
    if (schedule === 'manual') out.pullNextAt = null;
    else if (!wasScheduled || existing.pullSchedule !== schedule) out.pullNextAt = new Date(Date.now() + 60_000); // first pull in a minute
    // Anything about where the data comes from changed: the next pull must not be skipped as "unchanged".
    if (JSON.stringify(config) !== JSON.stringify(existing?.pullConfig || null)) out.pullLastHash = null;
    return out;
  }

  // ── Fetching ────────────────────────────────────────────────────────────────
  _headers(config, secret) {
    const headers = {
      'User-Agent': 'Pathment-Sync/1.0 (+https://pathment.me/docs/guides/pulling)',
      Accept: config.format === 'csv' ? 'text/csv, text/plain;q=0.9, */*;q=0.5' : 'application/json',
    };
    if (config.auth === 'bearer') headers.Authorization = `Bearer ${secret}`;
    else if (config.auth === 'basic') headers.Authorization = `Basic ${Buffer.from(`${config.username}:${secret}`).toString('base64')}`;
    else if (config.auth === 'header') headers[config.headerName] = secret;
    return headers;
  }

  /** Every record at the URL (following pages), up to 10,000. */
  async fetchRecords(config, secret) {
    const headers = this._headers(config, secret);
    const records = [];
    let url = config.url;
    let pages = 0;
    let truncated = false;
    while (url) {
      pages += 1;
      // eslint-disable-next-line no-await-in-loop
      const res = await outbound.request(url, {
        headers, timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES, maxRedirects: 5, secretHeaders: config.headerName ? [config.headerName] : [],
      });
      if (res.status === 401 || res.status === 403) throw new outbound.OutboundError(`The server refused the sign-in (HTTP ${res.status}) — check the credential`, res.status);
      if (res.status < 200 || res.status >= 300) throw new outbound.OutboundError(`The server answered HTTP ${res.status}`, res.status);
      let page;
      let body = null;
      if (config.format === 'csv') {
        if (/^\s*<(!doctype|html)/i.test(res.body)) throw new outbound.OutboundError('The URL returned a web page, not CSV — for a Google Sheet use File → Share → Publish to web → CSV');
        page = parseCsv(res.body);
      } else {
        try { body = JSON.parse(res.body); } catch { throw new outbound.OutboundError('The response isn’t JSON — if it is a spreadsheet export, choose CSV'); }
        page = listIn(body, config.recordsPath);
      }
      for (const r of page) {
        if (records.length >= MAX_TOTAL) { truncated = true; break; }
        if (r && typeof r === 'object' && !Array.isArray(r)) records.push(r);
      }
      if (truncated || config.format === 'csv') break;
      const next = nextPageUrl(body, res.headers, config.nextPath, res.url);
      if (next && pages >= MAX_PAGES) { truncated = true; break; }
      url = next && next !== url ? next : null;
    }
    return { records, pages, truncated };
  }

  async _secretOf(connection) {
    if (!connection?.pullSecretEncrypted) return null;
    return decrypt(connection.pullSecretEncrypted);
  }

  /**
   * Fetch without importing: how many records, and the first few — the app's
   * "Test" button. `secret` may be left out to use the connection's stored one.
   */
  async test({ pull, pullSecret, connectionId }) {
    const config = this.cleanConfig(pull);
    let secret = typeof pullSecret === 'string' && pullSecret.trim() ? pullSecret.trim() : null;
    if (!secret && config.auth !== 'none' && connectionId) {
      const row = await models.SyncConnection.findOne({ where: { id: connectionId, archivedAt: null } });
      secret = await this._secretOf(row);
    }
    if (!secret && config.auth !== 'none') throw new ValidationError('Give the credential to test with');
    try {
      const { records, pages, truncated } = await this.fetchRecords(config, secret);
      return { ok: true, total: records.length, pages, truncated, samples: records.slice(0, 5) };
    } catch (e) {
      if (!(e instanceof outbound.OutboundError)) throw e;
      return { ok: false, error: e.message, status: e.status || null };
    }
  }

  // ── Pulling ─────────────────────────────────────────────────────────────────
  /**
   * Pull a connection now. `force` (someone pressed "Pull now") skips the
   * "unchanged since last time" check. Resolves with what happened:
   *   { status: 'queued', runs, total, truncated } | { status: 'unchanged' | 'empty' } | { status: 'failed', error }
   */
  async pull(connectionId, { force = false, triggeredBy = null } = {}) {
    const connection = await models.SyncConnection.findOne({ where: { id: connectionId, archivedAt: null } });
    if (!connection) throw new NotFoundError('Connection not found');
    if (!connection.pullConfig) throw new ValidationError('This connection doesn’t fetch from a URL');
    if (!connection.cohortId) throw new ValidationError('Choose the intake this connection fills before pulling');
    const syncService = require('./syncService');
    const done = (fields) => connection.update({ pullLastAt: new Date(), ...fields });

    let fetched;
    try {
      fetched = await this.fetchRecords(connection.pullConfig, await this._secretOf(connection));
    } catch (e) {
      const message = String(e.message || e).slice(0, 480);
      if (!(e instanceof outbound.OutboundError)) require('../utils/logger').error('Pull failed', { connectionId, message });
      await done({ pullLastStatus: 'failed', pullLastError: message });
      // Into the history (and sync.job.completed), so a broken source is seen.
      const run = await models.SyncRun.create({
        connectionId: connection.id, cohortId: connection.cohortId, triggeredBy, source: 'pull', status: 'failed',
        total: 0, counts: { created: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 },
        errorMessage: `Couldn’t fetch the records: ${message}`, startedAt: new Date(), finishedAt: new Date(),
      });
      await require('../webhooks/webhookService').emit(run.organizationId, 'sync.job.completed', () => ({ job: syncService.presentJob(run) }));
      return { status: 'failed', error: message, runs: [run.id] };
    }

    const { records, truncated } = fetched;
    if (!records.length) {
      await done({ pullLastStatus: 'empty', pullLastError: null });
      return { status: 'empty', total: 0 };
    }
    const hash = sha256(JSON.stringify({ records, mapping: connection.mapping, cohortId: connection.cohortId, afterSync: connection.afterSync }));
    if (!force && hash === connection.pullLastHash) {
      await done({ pullLastStatus: 'unchanged', pullLastError: null });
      return { status: 'unchanged', total: records.length };
    }

    const runs = [];
    for (let i = 0; i < records.length; i += PER_RUN) {
      // eslint-disable-next-line no-await-in-loop
      const { run } = await syncService.enqueue({
        cohortId: connection.cohortId, connectionId: connection.id, records: records.slice(i, i + PER_RUN), triggeredBy, source: 'pull',
      });
      runs.push(run.id);
    }
    await done({
      pullLastStatus: 'ok',
      pullLastError: truncated ? `Only the first ${records.length.toLocaleString('en')} records were taken (the limit per pull)` : null,
      pullLastHash: hash,
    });
    return { status: 'queued', total: records.length, truncated, runs };
  }

  // ── The schedule (called by the sync worker) ─────────────────────────────────
  /**
   * Lease one connection that's due: its next pull moves 15 minutes out, so no
   * other dyno takes it and a crash just means it's tried again later.
   */
  async claimDue() {
    const [rows] = await sequelize.query(`
      UPDATE sync_connections SET pull_next_at = NOW() + INTERVAL '${LEASE_MINUTES} minutes', updated_at = NOW()
      WHERE id = (
        SELECT id FROM sync_connections
        WHERE pull_next_at <= NOW() AND archived_at IS NULL AND pull_config IS NOT NULL AND pull_schedule <> 'manual'
        ORDER BY pull_next_at FOR UPDATE SKIP LOCKED LIMIT 1
      )
      RETURNING id, organization_id, pull_schedule`);
    return rows[0] || null;
  }

  /** A scheduled pull, then the next one booked. Never throws. */
  async runScheduled(job) {
    try {
      await this.pull(job.id, { force: false });
    } catch (e) {
      require('../utils/logger').error('Scheduled pull failed', { connectionId: job.id, message: e.message });
      await models.SyncConnection.update({ pullLastAt: new Date(), pullLastStatus: 'failed', pullLastError: String(e.message).slice(0, 480) }, { where: { id: job.id } }).catch(() => {});
    }
    const minutes = SCHEDULE_MINUTES[job.pull_schedule];
    if (minutes) {
      await models.SyncConnection.update({ pullNextAt: new Date(Date.now() + minutes * 60_000) }, { where: { id: job.id, pullSchedule: job.pull_schedule } }).catch(() => {});
    }
  }
}

module.exports = new PullService();
