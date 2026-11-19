/**
 * Workspace API keys.
 *
 *   pk_live_ + 32 random base62 characters. The whole key is shown once, at
 *   creation; we keep its SHA-256 hash and its first 12 characters (the
 *   prefix), which is how a key is found and how people recognise it later.
 *
 * A key belongs to one workspace and carries scopes. Revoking is immediate.
 */
const crypto = require('crypto');
const { Op } = require('sequelize');
const { models } = require('../db');
const { ValidationError, NotFoundError } = require('../utils/errors/errorTypes');

const SCOPES = {
  'intakes:read': 'Read intakes, their applicants and sync jobs',
  'applicants:write': 'Add and update applicants in an intake',
  'programmes:read': 'Read programmes and clans',
  'mentees:read': 'Read mentees — names, emails and where they are enrolled (personal data)',
  'progress:read': 'Read progress: completion, tasks, roadmap steps, attendance, certificates (no names)',
};
const KEY_PREFIX = 'pk_live_';
const PREFIX_LENGTH = 12;
const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const hashKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');

function randomBase62(length) {
  const out = [];
  while (out.length < length) {
    for (const byte of crypto.randomBytes(length * 2)) {
      if (byte < 248 && out.length < length) out.push(BASE62[byte % 62]); // 248 = 62*4: no modulo bias
    }
  }
  return out.join('');
}

/** A public API failure the v1 error handler turns into its envelope. */
class ApiAuthError extends Error {
  constructor(code, message, status = 401, type = 'authentication_error') {
    super(message);
    this.code = code;
    this.status = status;
    this.type = type;
  }
}

/** What the app (and GET /me) shows about a key — never the hash. */
const present = (k) => ({
  id: k.id,
  name: k.name,
  prefix: k.prefix,
  scopes: k.scopes || [],
  createdAt: k.createdAt,
  lastUsedAt: k.lastUsedAt,
  expiresAt: k.expiresAt,
  revokedAt: k.revokedAt,
  status: k.revokedAt ? 'revoked' : (k.expiresAt && new Date(k.expiresAt) <= new Date() ? 'expired' : 'active'),
});

class ApiKeyService {
  constructor() {
    this.SCOPES = SCOPES;
    this.hashKey = hashKey;
    this.present = present;
  }

  /** Create a key in the current workspace. Returns the full key — the only time it exists. */
  async create(user, { name, scopes, expiresAt = null }) {
    const clean = String(name || '').trim();
    if (!clean) throw new ValidationError('Give the key a name (what uses it)');
    if (clean.length > 100) throw new ValidationError('The name is too long (100 characters at most)');
    const wanted = [...new Set(Array.isArray(scopes) ? scopes : [])];
    if (!wanted.length) throw new ValidationError('Choose at least one scope');
    const unknown = wanted.filter((s) => !SCOPES[s]);
    if (unknown.length) throw new ValidationError(`Unknown scope: ${unknown.join(', ')}`);
    let expiry = null;
    if (expiresAt) {
      expiry = new Date(expiresAt);
      if (Number.isNaN(expiry.getTime()) || expiry <= new Date()) throw new ValidationError('The expiry date must be in the future');
    }

    // A prefix clash is vanishingly rare; try again rather than fail.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const key = `${KEY_PREFIX}${randomBase62(32)}`;
      const prefix = key.slice(0, PREFIX_LENGTH);
      // eslint-disable-next-line no-await-in-loop
      const clash = await models.ApiKey.findOne({ where: { prefix }, skipOrganizationScope: true, attributes: ['id'] });
      if (clash) continue;
      // eslint-disable-next-line no-await-in-loop
      const row = await models.ApiKey.create({
        name: clean, prefix, keyHash: hashKey(key), scopes: wanted, createdBy: user?.id || null, expiresAt: expiry,
      });
      return { key, apiKey: present(row) };
    }
    throw new Error('Could not create a unique key; try again');
  }

  async list() {
    const rows = await models.ApiKey.findAll({ order: [['createdAt', 'DESC']] });
    return rows.map(present);
  }

  async revoke(user, id) {
    const row = await models.ApiKey.findByPk(id);
    if (!row) throw new NotFoundError('API key not found');
    if (!row.revokedAt) await row.update({ revokedAt: new Date(), revokedBy: user?.id || null });
    return present(row);
  }

  /**
   * The key behind `Authorization: Bearer …`, or an ApiAuthError saying why
   * not. Looked up across workspaces by prefix (the request has no workspace
   * yet), then the hash is compared in constant time.
   */
  async authenticate(header) {
    const raw = String(header || '').match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!raw) throw new ApiAuthError('missing_api_key', 'Send your API key as `Authorization: Bearer pk_live_…`.');
    if (!raw.startsWith(KEY_PREFIX) || raw.length < PREFIX_LENGTH + 8) throw new ApiAuthError('invalid_api_key', 'That API key is not valid.');
    const row = await models.ApiKey.findOne({ where: { prefix: raw.slice(0, PREFIX_LENGTH) }, skipOrganizationScope: true });
    const given = Buffer.from(hashKey(raw), 'hex');
    const stored = Buffer.from(row?.keyHash || '0'.repeat(64), 'hex');
    if (!row || !crypto.timingSafeEqual(given, stored)) throw new ApiAuthError('invalid_api_key', 'That API key is not valid.');
    if (row.revokedAt) throw new ApiAuthError('revoked_api_key', 'This API key has been revoked.');
    if (row.expiresAt && new Date(row.expiresAt) <= new Date()) throw new ApiAuthError('expired_api_key', 'This API key has expired.');
    // Note when it was last used, at most once a minute (no write per request).
    if (!row.lastUsedAt || Date.now() - new Date(row.lastUsedAt).getTime() > 60_000) {
      models.ApiKey.update({ lastUsedAt: new Date() }, { where: { id: row.id }, skipOrganizationScope: true }).catch(() => {});
    }
    return row;
  }

  /** Keys created and still usable, for the "last used" column — workspace-scoped. */
  async activeCount() {
    return models.ApiKey.count({ where: { revokedAt: null, [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }] } });
  }
}

module.exports = new ApiKeyService();
module.exports.ApiAuthError = ApiAuthError;
