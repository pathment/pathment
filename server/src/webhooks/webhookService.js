/**
 * Outgoing webhooks: tell a workspace's other systems when something happens.
 *
 *   something changes ─▶ emit(type) ─▶ one delivery per subscribed endpoint
 *                                     ─▶ the webhook worker POSTs it, signed
 *
 * Signing: `Pathment-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`
 * with the endpoint's secret. Receivers check it (and that t is recent).
 *
 * Delivery: a 2xx within 10 seconds is success. Anything else is retried with
 * growing gaps (1 min … 24 h, eight attempts over about a day and a half),
 * then marked failed. An endpoint that fails 50 attempts in a row is disabled,
 * with the reason, until an admin turns it back on.
 *
 * Safety: only https (http only for local development), and never to a
 * private, loopback or link-local address — checked on every connection, so a
 * DNS answer can't be switched to an internal address after the URL was saved.
 */
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { models } = require('../db');
const { ValidationError, NotFoundError } = require('../utils/errors/errorTypes');
const { encrypt, decrypt } = require('../utils/secretCrypto');
const { runWithRequestContext, getRequestContext } = require('../utils/auditContext');

const API_VERSION = '2026-11-20';

const EVENTS = {
  'applicant.created': 'Someone was added to an intake (by applying, an import or a sync)',
  'applicant.assessment_sent': 'An applicant was sent their assessment',
  'applicant.assessment_submitted': 'An applicant submitted their assessment',
  'applicant.accepted': 'An applicant was accepted',
  'applicant.rejected': 'An applicant was rejected',
  'mentee.joined': 'A mentee was placed in a clan',
  'task.approved': 'A mentee’s task was approved',
  'roadmap.completed': 'A mentee finished a roadmap',
  'certificate.issued': 'A certificate was issued',
  'sync.job.completed': 'A sync job finished (the same object as GET /jobs/:id)',
};

/** Minutes to wait before each retry (attempt 2, 3, …). */
const RETRY_MINUTES = [1, 5, 30, 120, 360, 720, 1440];
const MAX_ATTEMPTS = RETRY_MINUTES.length + 1;
const DISABLE_AFTER = 50;
const TIMEOUT_MS = 10_000;
const LEASE_MS = 2 * 60_000;
const CACHE_MS = 30_000;

const outbound = require('../utils/outboundHttp');

const { isPrivateAddress, safeLookup } = outbound;
function checkUrl(raw) {
  const href = outbound.checkUrl(raw, { credentialsMessage: 'Leave credentials out of the URL; check our signature instead' });
  if (href.length > 500) throw new ValidationError('The URL is too long');
  return href;
}

const newSecret = () => `whsec_${crypto.randomBytes(24).toString('base64url')}`;

function sign(secret, timestamp, body) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/** One POST, resolving with { status, body, ms } or rejecting on a network failure. */
function post(urlString, headers, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const started = Date.now();
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, {
      method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(body) }, timeout: TIMEOUT_MS, lookup: safeLookup,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { if (data.length < 2000) data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data.slice(0, 1000), ms: Date.now() - started }));
    });
    req.on('timeout', () => { req.destroy(new Error(`No response within ${TIMEOUT_MS / 1000} seconds`)); });
    req.on('error', reject);
    req.end(body);
  });
}

const present = (e) => ({
  id: e.id,
  url: e.url,
  description: e.description || null,
  events: e.events || [],
  status: e.status,
  disabledReason: e.disabledReason || null,
  consecutiveFailures: e.consecutiveFailures,
  lastSuccessAt: e.lastSuccessAt,
  lastFailureAt: e.lastFailureAt,
  createdAt: e.createdAt,
});

const presentDelivery = (d) => ({
  id: d.id,
  eventId: d.eventId,
  type: d.eventType,
  status: d.status,
  attempts: d.attempts,
  nextAttemptAt: ['pending', 'retrying'].includes(d.status) ? d.nextAttemptAt : null,
  lastStatusCode: d.lastStatusCode,
  lastError: d.lastError,
  lastResponseBody: d.lastResponseBody,
  lastDurationMs: d.lastDurationMs,
  deliveredAt: d.deliveredAt,
  createdAt: d.createdAt,
  payload: d.payload,
});

class WebhookService {
  constructor() {
    this.EVENTS = EVENTS;
    this.API_VERSION = API_VERSION;
    this.sign = sign;
    this.isPrivateAddress = isPrivateAddress;
    this._cache = new Map();
  }

  _forget(organizationId) { this._cache.delete(organizationId || getRequestContext().organizationId); }

  _cleanEvents(events) {
    const list = [...new Set(Array.isArray(events) ? events : [])];
    if (!list.length) throw new ValidationError('Choose at least one event');
    const unknown = list.filter((e) => e !== '*' && !EVENTS[e]);
    if (unknown.length) throw new ValidationError(`Unknown event: ${unknown.join(', ')}`);
    return list.includes('*') ? ['*'] : list;
  }

  // ── Endpoints (the app) ────────────────────────────────────────────────────
  async list() {
    return (await models.WebhookEndpoint.findAll({ order: [['createdAt', 'DESC']] })).map(present);
  }

  async create(user, { url, description, events }) {
    const secret = newSecret();
    const row = await models.WebhookEndpoint.create({
      url: checkUrl(url),
      description: description ? String(description).trim().slice(0, 200) || null : null,
      events: this._cleanEvents(events),
      secretEncrypted: encrypt(secret),
      createdBy: user?.id || null,
    });
    this._forget();
    return { endpoint: present(row), secret };
  }

  async _find(id) {
    const row = await models.WebhookEndpoint.findByPk(id);
    if (!row) throw new NotFoundError('Webhook endpoint not found');
    return row;
  }

  async update(id, { url, description, events, status }) {
    const row = await this._find(id);
    const patch = {};
    if (url !== undefined) patch.url = checkUrl(url);
    if (description !== undefined) patch.description = description ? String(description).trim().slice(0, 200) || null : null;
    if (events !== undefined) patch.events = this._cleanEvents(events);
    if (status !== undefined) {
      if (!['enabled', 'disabled'].includes(status)) throw new ValidationError('status must be "enabled" or "disabled"');
      patch.status = status;
      // Turning it back on is a fresh start.
      if (status === 'enabled') Object.assign(patch, { disabledReason: null, consecutiveFailures: 0 });
      else patch.disabledReason = 'Turned off by an admin';
    }
    await row.update(patch);
    this._forget();
    return present(row);
  }

  async remove(id) {
    const row = await this._find(id);
    await row.destroy();
    this._forget();
    return { deleted: true };
  }

  async revealSecret(id) {
    return { secret: decrypt((await this._find(id)).secretEncrypted) };
  }

  async rotateSecret(id) {
    const row = await this._find(id);
    const secret = newSecret();
    await row.update({ secretEncrypted: encrypt(secret) });
    return { secret };
  }

  async deliveries(endpointId, { limit = 50 } = {}) {
    await this._find(endpointId);
    const rows = await models.WebhookDelivery.findAll({
      where: { endpointId }, order: [['createdAt', 'DESC']], limit: Math.min(Math.max(Number(limit) || 50, 1), 200),
    });
    return rows.map(presentDelivery);
  }

  async redeliver(deliveryId) {
    const row = await models.WebhookDelivery.findByPk(deliveryId);
    if (!row) throw new NotFoundError('Delivery not found');
    await row.update({ status: 'pending', nextAttemptAt: new Date() });
    setImmediate(() => require('../workers/webhookWorker').kick());
    return presentDelivery(row);
  }

  /** Send a `ping` to one endpoint right now and report what came back. */
  async ping(endpointId) {
    const endpoint = await this._find(endpointId);
    const eventId = `evt_${crypto.randomUUID()}`;
    const row = await models.WebhookDelivery.create({
      endpointId: endpoint.id, eventId, eventType: 'ping',
      payload: { id: eventId, type: 'ping', apiVersion: API_VERSION, createdAt: new Date().toISOString(), data: { message: 'Hello from Pathment. Your endpoint is receiving webhooks.' } },
      status: 'pending', nextAttemptAt: new Date(Date.now() + LEASE_MS),
    });
    await this.attempt(row, endpoint);
    return presentDelivery(await row.reload());
  }

  // ── Emitting ───────────────────────────────────────────────────────────────
  /** The workspace's enabled endpoints (cached briefly; this runs on every hook). */
  async _endpointsFor(organizationId) {
    const hit = this._cache.get(organizationId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.endpoints;
    const rows = await models.WebhookEndpoint.findAll({
      where: { organizationId, status: 'enabled' }, attributes: ['id', 'events'], skipOrganizationScope: true,
    });
    const endpoints = rows.map((r) => ({ id: r.id, events: r.events || [] }));
    this._cache.set(organizationId, { at: Date.now(), endpoints });
    return endpoints;
  }

  /** Is anyone in this workspace listening for `type`? Cheap: no payload is built otherwise. */
  async wants(organizationId, type) {
    if (!organizationId) return false;
    const endpoints = await this._endpointsFor(organizationId);
    return endpoints.some((e) => e.events.includes('*') || e.events.includes(type));
  }

  /**
   * Queue `type` for every endpoint in the workspace that wants it. `data` may
   * be a function, called only when someone is listening. Never throws: a
   * webhook must not break the change it reports.
   */
  async emit(organizationId, type, data) {
    try {
      if (!organizationId || !EVENTS[type]) return 0;
      const endpoints = (await this._endpointsFor(organizationId)).filter((e) => e.events.includes('*') || e.events.includes(type));
      if (!endpoints.length) return 0;
      return await runWithRequestContext({ organizationId, workspaceJob: true }, async () => {
        const body = typeof data === 'function' ? await data() : data;
        if (body == null) return 0;
        const eventId = `evt_${crypto.randomUUID()}`;
        const payload = { id: eventId, type, apiVersion: API_VERSION, createdAt: new Date().toISOString(), data: body };
        await models.WebhookDelivery.bulkCreate(endpoints.map((e) => ({
          organizationId, endpointId: e.id, eventId, eventType: type, payload, status: 'pending', nextAttemptAt: new Date(),
        })));
        setImmediate(() => require('../workers/webhookWorker').kick());
        return endpoints.length;
      });
    } catch (error) {
      require('../utils/logger').error('Webhook emit failed', { type, message: error.message });
      return 0;
    }
  }

  // ── Delivering ─────────────────────────────────────────────────────────────
  /** One attempt for one delivery; records the outcome and schedules the next try. */
  async attempt(delivery, endpoint = null) {
    const ep = endpoint || await models.WebhookEndpoint.findByPk(delivery.endpointId);
    if (!ep) { await delivery.update({ status: 'failed', lastError: 'The endpoint was deleted' }); return; }
    if (ep.status !== 'enabled' && delivery.eventType !== 'ping') {
      await delivery.update({ status: 'failed', lastError: 'The endpoint is disabled' });
      return;
    }
    const body = JSON.stringify(delivery.payload);
    const t = Math.floor(Date.now() / 1000);
    const attempts = delivery.attempts + 1;
    let outcome;
    try {
      const secret = decrypt(ep.secretEncrypted);
      const res = await post(ep.url, {
        'Content-Type': 'application/json',
        'User-Agent': 'Pathment-Webhooks/1.0 (+https://pathment.me/docs/guides/webhooks)',
        'Pathment-Event-Id': delivery.eventId,
        'Pathment-Event-Type': delivery.eventType,
        'Pathment-Delivery-Attempt': String(attempts),
        'Pathment-Signature': `t=${t},v1=${sign(secret, t, body)}`,
      }, body);
      outcome = { ok: res.status >= 200 && res.status < 300, code: res.status, body: res.body, ms: res.ms, error: res.status >= 300 ? `HTTP ${res.status}` : null };
    } catch (e) {
      outcome = { ok: false, code: null, body: null, ms: null, error: String(e.message || e).slice(0, 500) };
    }

    if (outcome.ok) {
      await delivery.update({ status: 'succeeded', attempts, lastStatusCode: outcome.code, lastError: null, lastResponseBody: outcome.body, lastDurationMs: outcome.ms, deliveredAt: new Date() });
      if (delivery.eventType !== 'ping') await ep.update({ consecutiveFailures: 0, lastSuccessAt: new Date() });
      return;
    }
    const final = attempts >= MAX_ATTEMPTS || delivery.eventType === 'ping';
    await delivery.update({
      status: final ? 'failed' : 'retrying',
      attempts,
      lastStatusCode: outcome.code,
      lastError: outcome.error,
      lastResponseBody: outcome.body,
      lastDurationMs: outcome.ms,
      nextAttemptAt: final ? delivery.nextAttemptAt : new Date(Date.now() + RETRY_MINUTES[attempts - 1] * 60_000),
    });
    if (delivery.eventType === 'ping') return;
    const failures = ep.consecutiveFailures + 1;
    const disable = failures >= DISABLE_AFTER && ep.status === 'enabled';
    await ep.update({
      consecutiveFailures: failures,
      lastFailureAt: new Date(),
      ...(disable ? { status: 'disabled', disabledReason: `Disabled after ${DISABLE_AFTER} failed deliveries in a row (last: ${outcome.error})` } : {}),
    });
    if (disable) this._forget(ep.organizationId);
  }

  /** Lease up to `limit` due deliveries (any workspace), so no two workers send the same one. */
  async claimDue(limit = 20) {
    const { sequelize } = require('../db');
    const [rows] = await sequelize.query(`
      UPDATE webhook_deliveries SET next_attempt_at = NOW() + INTERVAL '${LEASE_MS / 1000} seconds', updated_at = NOW()
      WHERE id IN (
        SELECT id FROM webhook_deliveries
        WHERE status IN ('pending', 'retrying') AND next_attempt_at <= NOW()
        ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT ${Number(limit)}
      )
      RETURNING id, organization_id`);
    return rows;
  }
}

module.exports = new WebhookService();
module.exports.checkUrl = checkUrl;
module.exports.EVENTS = EVENTS;
