const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors/errorTypes');
const { INTEGRATIONS } = require('../config/externalApps');
const { encrypt, decrypt, mask } = require('../utils/secretCrypto');
const organizationService = require('./organizationService');
const buildmentClient = require('./buildmentClient');

/**
 * externalAppService - the external app catalog + per-workspace connections.
 *
 * Two audiences:
 *  - Workspace admins see the ACTIVE catalog annotated with whether their own
 *    workspace has connected each app, and connect/disconnect apps.
 *  - Platform admins author the catalog itself (create/update/delete). The
 *    catalog is global, so those writes affect every workspace.
 *
 * Connecting an integration-backed app means: the admin enters the provider's
 * keys, the provider verifies them, and only then are they stored (encrypted).
 * A connection is therefore always one the provider has confirmed at least once.
 */

// integrationKey → verify(credentials) → { connected, error, metadata }.
// `credentials` here already carries the app's API host (see withEndpoint).
const VERIFIERS = {
  buildment: async (credentials) => {
    const result = await buildmentClient.verifyConnection(credentials);
    return {
      connected: result.connected,
      error: result.error,
      metadata: { organizationSlug: result.organizationSlug, organizationName: result.organizationName },
    };
  },
};

const catalogShape = (app) => ({
  id: app.id,
  name: app.name,
  type: app.type,
  description: app.description || null,
  iconUrl: app.iconUrl || null,
  integrationKey: app.integrationKey || null,
  apiBaseUrl: app.apiBaseUrl || null,
  appUrl: app.appUrl || null,
  isActive: app.isActive,
  createdAt: app.createdAt,
  updatedAt: app.updatedAt
});

const filterWhere = ({ search, type } = {}) => {
  const where = {};
  if (type) where.type = type;
  const term = (search || '').trim();
  if (term) where.name = { [Op.iLike]: `%${term}%` };
  return where;
};

/** Stored without a trailing slash; '' / null clear it. */
const cleanUrl = (value) => String(value || '').trim().replace(/\/+$/, '') || null;

/**
 * The stored keys plus where to send them. The URL lives on the catalog app,
 * not in the encrypted blob, so a platform owner changing it applies to every
 * workspace at once without anyone reconnecting.
 */
const withEndpoint = (app, credentials) => ({ ...credentials, baseUrl: app?.apiBaseUrl || undefined });

const isDuplicateName = (error) => error?.name === 'SequelizeUniqueConstraintError';

const workspaceShape = (app, row) => ({
  id: app.id,
  name: app.name,
  type: app.type,
  description: app.description || null,
  iconUrl: app.iconUrl || null,
  // Only apps with a server-side integration can be connected; the fields are
  // what the connect dialog asks for.
  connectable: Boolean(INTEGRATIONS[app.integrationKey]),
  credentialFields: INTEGRATIONS[app.integrationKey]?.credentialFields || [],
  connected: Boolean(row),
  status: row ? row.status : null,
  credentialsMasked: row?.credentialsMasked || null,
  accountName: row?.metadata?.organizationName || null,
  connectedAt: row ? row.createdAt : null,
  lastVerifiedAt: row?.lastVerifiedAt || null
});

/** Trim and require every field the integration declares; drop anything else. */
function cleanCredentials(integrationKey, input = {}) {
  const clean = {};
  for (const field of INTEGRATIONS[integrationKey].credentialFields) {
    const value = typeof input?.[field.key] === 'string' ? input[field.key].trim() : '';
    if (!value) throw new ValidationError(`${field.label} is required`);
    clean[field.key] = value;
  }
  return clean;
}

class ExternalAppService {
  // ── workspace view ──────────────────────────────────────────────────────
  async listForOrganization(organizationId, filters = {}) {
    const orgId = organizationId || await organizationService.currentId();
    const [apps, connections] = await Promise.all([
      models.ExternalApp.findAll({ where: { ...filterWhere(filters), isActive: true }, order: [['name', 'ASC']] }),
      models.OrganizationApp.findAll({ where: { organizationId: orgId } })
    ]);
    const rowByApp = new Map(connections.map((row) => [row.appId, row]));
    return apps.map((app) => workspaceShape(app, rowByApp.get(app.id)));
  }

  /**
   * Verify the keys with the provider, then store them. Nothing is saved when
   * the provider says no, so a failed attempt never replaces working keys.
   * Connecting an already-connected app replaces its keys (rotation).
   */
  async connect(user, organizationId, appId, credentialsInput) {
    const orgId = organizationId || await organizationService.currentId();
    const app = await models.ExternalApp.findOne({ where: { id: appId, isActive: true } });
    if (!app) throw new NotFoundError('App not found');
    if (!INTEGRATIONS[app.integrationKey]) throw new ValidationError(`${app.name} cannot be connected yet`);

    const credentials = cleanCredentials(app.integrationKey, credentialsInput);
    const result = await VERIFIERS[app.integrationKey](withEndpoint(app, credentials));
    if (!result.connected) {
      throw new ValidationError(`${app.name} did not accept these keys${result.error ? `: ${result.error}` : ''}`);
    }

    const values = {
      status: 'connected',
      credentialsEncrypted: encrypt(JSON.stringify(credentials)),
      credentialsMasked: mask(credentials[INTEGRATIONS[app.integrationKey].credentialFields[0].key]),
      metadata: result.metadata || {},
      lastVerifiedAt: new Date()
    };
    const [row, created] = await models.OrganizationApp.findOrCreate({
      where: { organizationId: orgId, appId },
      defaults: { organizationId: orgId, appId, connectedBy: user.id, ...values }
    });
    if (!created) await row.update({ ...values, connectedBy: user.id });
    return workspaceShape(app, row);
  }

  /** Re-verify the stored keys and record the outcome. */
  async test(organizationId, appId) {
    const orgId = organizationId || await organizationService.currentId();
    const row = await models.OrganizationApp.findOne({
      where: { organizationId: orgId, appId },
      include: [{ model: models.ExternalApp, as: 'app' }]
    });
    if (!row) throw new NotFoundError('App is not connected');
    const integrationKey = row.app?.integrationKey;
    if (!INTEGRATIONS[integrationKey] || !row.credentialsEncrypted) {
      throw new ValidationError('This connection has no keys to test — connect it again');
    }
    const result = await VERIFIERS[integrationKey](withEndpoint(row.app, JSON.parse(decrypt(row.credentialsEncrypted))));
    await row.update({
      status: result.connected ? 'connected' : 'error',
      ...(result.connected ? { metadata: result.metadata || {}, lastVerifiedAt: new Date() } : {})
    });
    return { appId, status: row.status, error: result.connected ? null : result.error };
  }

  async disconnect(organizationId, appId) {
    const orgId = organizationId || await organizationService.currentId();
    const row = await models.OrganizationApp.findOne({ where: { organizationId: orgId, appId } });
    if (!row) throw new NotFoundError('App is not connected');
    await row.destroy();
    return { appId, connected: false };
  }

  // ── for integration services (never exposed over HTTP) ──────────────────
  /**
   * The workspace's live connection to an integration, with decrypted
   * credentials — or null when it is not connected / the keys were rejected.
   */
  async getConnection(organizationId, integrationKey) {
    const orgId = organizationId || await organizationService.currentId();
    const row = await models.OrganizationApp.findOne({
      where: { organizationId: orgId, status: 'connected' },
      include: [{ model: models.ExternalApp, as: 'app', where: { integrationKey, isActive: true }, required: true }]
    });
    if (!row || !row.credentialsEncrypted) return null;
    return {
      row,
      credentials: withEndpoint(row.app, JSON.parse(decrypt(row.credentialsEncrypted))),
      metadata: row.metadata || {},
      endpoint: { baseUrl: row.app.apiBaseUrl || null, appUrl: row.app.appUrl || null },
    };
  }

  /** The provider rejected the stored keys mid-flight: stop offering the integration. */
  async markRejected(row) {
    await row.update({ status: 'error' });
  }

  // ── catalog authoring (platform admin) ──────────────────────────────────
  async listCatalog(filters = {}) {
    const apps = await models.ExternalApp.findAll({ where: filterWhere(filters), order: [['name', 'ASC']] });
    return apps.map(catalogShape);
  }

  async create(data, user) {
    try {
      const app = await models.ExternalApp.create({
        name: data.name,
        type: data.type,
        description: data.description || null,
        iconUrl: data.iconUrl || null,
        integrationKey: data.integrationKey || null,
        apiBaseUrl: cleanUrl(data.apiBaseUrl),
        appUrl: cleanUrl(data.appUrl),
        isActive: data.isActive !== false,
        createdBy: user?.id || null
      });
      return catalogShape(app);
    } catch (error) {
      if (isDuplicateName(error)) throw new ConflictError('An app with that name or integration already exists');
      throw error;
    }
  }

  async update(id, data) {
    const app = await models.ExternalApp.findByPk(id);
    if (!app) throw new NotFoundError('App not found');
    const patch = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.type !== undefined) patch.type = data.type;
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.iconUrl !== undefined) patch.iconUrl = data.iconUrl || null;
    if (data.integrationKey !== undefined) patch.integrationKey = data.integrationKey || null;
    if (data.apiBaseUrl !== undefined) patch.apiBaseUrl = cleanUrl(data.apiBaseUrl);
    if (data.appUrl !== undefined) patch.appUrl = cleanUrl(data.appUrl);
    if (data.isActive !== undefined) patch.isActive = data.isActive;
    try {
      await app.update(patch);
    } catch (error) {
      if (isDuplicateName(error)) throw new ConflictError('An app with that name or integration already exists');
      throw error;
    }
    return catalogShape(app);
  }

  /** Deleting a catalog app also removes every workspace's connection to it (FK cascade). */
  async remove(id) {
    const app = await models.ExternalApp.findByPk(id);
    if (!app) throw new NotFoundError('App not found');
    await app.destroy();
    return { removed: true };
  }
}

module.exports = new ExternalAppService();
