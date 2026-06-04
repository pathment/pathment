const crypto = require('crypto');
const { models } = require('../db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors/errorTypes');

/**
 * aiConnectionService — AI provider keys (bring-your-own-key) + feature routing.
 *
 * Scope: a connection's ownerId is NULL for org-wide keys (admin-managed) or a
 * user id for a mentor's personal keys. A user only ever sees/manages the keys
 * in their own scope (admins → org, mentors → personal). Keys are AES-256-GCM
 * encrypted at rest and only ever surfaced masked.
 *
 * Resolution (resolveActiveConfig) is what the live AI client consumes: a
 * mentor's personal routing wins, then org routing, then any connected org key,
 * then the env fallback (handled by the caller).
 */

// OpenAI-compatible default base URLs + a /models probe used to test a key.
const PROVIDER_BASE = {
  groq: 'https://api.groq.com/openai/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  custom: null
};
const PROVIDERS = Object.keys(PROVIDER_BASE);
const FEATURES = ['summary', 'delay', 'atrisk', 'nudge', 'stall', 'coaching', 'feedback'];

const isAdmin = (user) => {
  const caps = Array.isArray(user?.capabilities) && user.capabilities.length ? user.capabilities : [user?.role];
  return caps.includes('admin');
};
// The scope a user manages: org (null) for admins, personal (their id) otherwise.
const ownerFor = (user) => (isAdmin(user) ? null : user.id);
const routingKey = (ownerId) => (ownerId ? `ai.routing:${ownerId}` : 'ai.routing');

function encKey() {
  const secret = process.env.AI_ENCRYPTION_KEY || process.env.JWT_SECRET || 'pathment-ai-default-secret';
  return crypto.createHash('sha256').update(secret).digest(); // 32 bytes
}
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc.toString('hex')}`;
}
function decrypt(payload) {
  const [ivHex, tagHex, dataHex] = String(payload).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}
const maskKey = (key) => (!key || key.length < 8 ? '••••' : `${key.slice(0, 4)}••••${key.slice(-4)}`);

const publicShape = (c) => ({
  id: c.id, provider: c.provider, label: c.label, model: c.model,
  baseUrl: c.baseUrl, status: c.status, keyMasked: c.keyMasked, addedAt: c.createdAt
});

class AIConnectionService {
  // ── owner-scoped CRUD ───────────────────────────────────────────────────
  async list(user) {
    const rows = await models.AIConnection.findAll({ where: { ownerId: ownerFor(user) }, order: [['created_at', 'DESC']] });
    return rows.map(publicShape);
  }

  async create(data, user) {
    const { provider, label, model, baseUrl, key } = data;
    if (!PROVIDERS.includes(provider)) throw new ValidationError('Invalid provider');
    if (!label || !label.trim()) throw new ValidationError('A label is required');
    if (!key || !key.trim()) throw new ValidationError('An API key is required');
    if (provider === 'custom' && !baseUrl) throw new ValidationError('Custom providers need a base URL');

    const row = await models.AIConnection.create({
      provider,
      label: label.trim(),
      model: model || null,
      baseUrl: baseUrl || PROVIDER_BASE[provider] || null,
      keyEncrypted: encrypt(key.trim()),
      keyMasked: maskKey(key.trim()),
      status: 'untested',
      ownerId: ownerFor(user),
      createdBy: user.id
    });
    return publicShape(row);
  }

  /** Load a connection the user is allowed to manage (same scope), or throw. */
  async _ownedRow(id, user) {
    const row = await models.AIConnection.findByPk(id);
    if (!row) throw new NotFoundError('Connection not found');
    if (row.ownerId !== ownerFor(user)) throw new ForbiddenError('Not your connection');
    return row;
  }

  async remove(id, user) {
    const row = await this._ownedRow(id, user);
    await row.destroy();
    const routing = await this.getRouting(user);
    let changed = false;
    for (const f of FEATURES) { if (routing[f] === id) { routing[f] = null; changed = true; } }
    if (changed) await this.setRouting(user, routing);
    return { removed: true };
  }

  /** Probe the provider's /models endpoint with the stored key. */
  async test(id, user) {
    const row = await this._ownedRow(id, user);
    const ok = await this._probe(row);
    await row.update({ status: ok ? 'connected' : 'error' });
    return { status: ok ? 'connected' : 'error' };
  }

  async _probe(row) {
    try {
      const key = decrypt(row.keyEncrypted);
      const base = row.baseUrl || PROVIDER_BASE[row.provider];
      let url; let headers = {};
      if (row.provider === 'gemini') {
        url = `${base}/models?key=${encodeURIComponent(key)}`;
      } else if (row.provider === 'anthropic') {
        url = `${base}/models`;
        headers = { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
      } else {
        url = `${base.replace(/\/$/, '')}/models`;
        headers = { Authorization: `Bearer ${key}` };
      }
      const res = await fetch(url, { headers });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── routing (per owner) ─────────────────────────────────────────────────
  async _readRouting(ownerId) {
    const row = await models.SystemSettings.findOne({ where: { settingKey: routingKey(ownerId) } });
    let stored = {};
    try { stored = row?.settingValue ? JSON.parse(row.settingValue) : {}; } catch { stored = {}; }
    const routing = {};
    FEATURES.forEach((f) => { routing[f] = stored[f] || null; });
    return routing;
  }

  async getRouting(user) {
    return this._readRouting(ownerFor(user));
  }

  async setRouting(user, routing) {
    const ownerId = ownerFor(user);
    const clean = {};
    FEATURES.forEach((f) => { clean[f] = routing[f] || null; });
    const serialized = JSON.stringify(clean);
    const key = routingKey(ownerId);
    const [row] = await models.SystemSettings.findOrCreate({
      where: { settingKey: key },
      defaults: { settingKey: key, settingValue: serialized, settingType: 'json', category: 'ai', isPublic: false }
    });
    row.settingValue = serialized;
    await row.save();
    return clean;
  }

  // ── resolution for the live AI client ────────────────────────────────────
  _toConfig(row) {
    return {
      apiKey: decrypt(row.keyEncrypted),
      baseURL: row.baseUrl || PROVIDER_BASE[row.provider],
      model: row.model || null,
      provider: row.provider
    };
  }

  /**
   * Resolve the AI config the app should use: a mentor's personal routing for
   * `feature` wins, then org routing, then any connected org key, then null
   * (the caller falls back to env). `userId` enables the personal path.
   */
  async resolveActiveConfig(feature = null, userId = null) {
    // 1) Personal routing for this user + feature.
    if (userId && feature) {
      const personal = await this._readRouting(userId);
      if (personal[feature]) {
        const row = await models.AIConnection.findOne({ where: { id: personal[feature], ownerId: userId } });
        if (row) return this._toConfig(row);
      }
    }
    // 2) Org routing for the feature.
    if (feature) {
      const org = await this._readRouting(null);
      if (org[feature]) {
        const row = await models.AIConnection.findOne({ where: { id: org[feature], ownerId: null } });
        if (row) return this._toConfig(row);
      }
    }
    // 3) Any org connection — prefer a connected one, else most recent.
    const orgRows = await models.AIConnection.findAll({ where: { ownerId: null }, order: [['created_at', 'DESC']] });
    if (orgRows.length) {
      const chosen = orgRows.find((r) => r.status === 'connected') || orgRows[0];
      return this._toConfig(chosen);
    }
    return null;
  }
}

module.exports = new AIConnectionService();
module.exports.FEATURES = FEATURES;
module.exports.PROVIDERS = PROVIDERS;
