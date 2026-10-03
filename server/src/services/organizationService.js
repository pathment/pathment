const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { getRequestContext } = require('../utils/auditContext');
const { NotFoundError, ForbiddenError, ValidationError, ConflictError } = require('../utils/errors/errorTypes');
const { uploadToCloudinary, deleteFromCloudinary, extractPublicId } = require('../utils/cloudinaryUpload');

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const RESERVED_SLUGS = new Set(['pathment', 'www', 'app', 'api', 'links', 'meet', 'staging', 'status', 'support', 'admin', 'mail', 'cdn', 'assets']);
const ORGANIZATION_LOGO_CACHE_TTL_MS = 30000;
const ORGANIZATION_LOGO_CACHE_MAX_ENTRIES = 500;
const organizationLogoCache = new Map();
const organizationLogoCacheGenerations = new Map();

const organizationLogoCacheKey = (organizationId) => `organization-logo:${organizationId}`;
const organizationLogoCacheGeneration = (organizationId) => organizationLogoCacheGenerations.get(organizationId) || 0;

const getCachedOrganizationLogo = (organizationId) => {
  const key = organizationLogoCacheKey(organizationId);
  const entry = organizationLogoCache.get(key);
  if (!entry) return { hit: false };
  if (entry.expiresAt <= Date.now()) {
    organizationLogoCache.delete(key);
    return { hit: false };
  }
  return { hit: true, logoUrl: entry.logoUrl };
};

const cacheOrganizationLogo = (organizationId, logoUrl) => {
  organizationLogoCache.set(organizationLogoCacheKey(organizationId), {
    logoUrl: logoUrl || null,
    expiresAt: Date.now() + ORGANIZATION_LOGO_CACHE_TTL_MS,
  });
  while (organizationLogoCache.size > ORGANIZATION_LOGO_CACHE_MAX_ENTRIES) {
    organizationLogoCache.delete(organizationLogoCache.keys().next().value);
  }
};

const invalidateOrganizationLogo = (organizationId) => {
  organizationLogoCache.delete(organizationLogoCacheKey(organizationId));
  organizationLogoCacheGenerations.set(organizationId, organizationLogoCacheGeneration(organizationId) + 1);
};

const serializeOrganization = (organization, membership = null, logoUrl = organization.logoUrl) => ({
  id: organization.id,
  name: organization.name,
  slug: organization.slug,
  status: organization.status,
  logoUrl: logoUrl || null,
  primaryColor: organization.primaryColor,
  timezone: organization.timezone,
  settings: organization.settings || {},
  membershipRole: membership?.role || null,
});

class OrganizationService {
  workspaceCreationEnabled() {
    return process.env.MULTI_TENANT_WORKSPACES_ENABLED === 'true';
  }

  assertWorkspaceAvailable(organization) {
    if (!organization) throw new NotFoundError('Organization not found');
    if (['suspended', 'archived'].includes(organization.status)) {
      throw new ForbiddenError('This workspace is unavailable');
    }
    if (!this.workspaceCreationEnabled() && organization.slug !== this.defaultSlug() &&
        !require('../utils/stagingWorkspaceDemo').isDemo(organization)) {
      throw new ForbiddenError('Additional workspaces are not available during the workspace rollout');
    }
  }

  normalizeSlug(value) {
    const slug = String(value || '').trim().toLowerCase();
    return SLUG.test(slug) && !slug.startsWith('api-') && !RESERVED_SLUGS.has(slug) ? slug : null;
  }

  defaultSlug() {
    return this.normalizeSlug(process.env.DEFAULT_ORGANIZATION_SLUG || process.env.TENANT_SLUG || 'devweekends');
  }

  async bySlug(slug) {
    const normalized = this.normalizeSlug(slug);
    if (!normalized) return null;
    return models.Organization.findOne({ where: { slug: normalized, status: { [Op.notIn]: ['archived'] } } });
  }

  async byHostname(hostname) {
    const host = String(hostname || '').split(':')[0].trim().toLowerCase();
    if (!host) return null;
    const domain = await models.OrganizationDomain.findOne({
      skipOrganizationScope: true, // Bootstrap lookup before a workspace context exists.
      where: { hostname: host, status: 'verified' }, include: [{ model: models.Organization, as: 'organization' }],
    });
    if (domain?.organization) return domain.organization;
    const suffix = String(process.env.TENANT_DOMAIN_SUFFIX || 'pathment.me').toLowerCase();
    if (host.endsWith(`.${suffix}`)) {
      let slug = host.slice(0, -(suffix.length + 1));
      if (slug.startsWith('api-')) slug = slug.slice(4);
      if (!RESERVED_SLUGS.has(slug)) return this.bySlug(slug);
    }
    return null;
  }

  async isDefaultWorkspace() {
    const id = getRequestContext().organizationId;
    if (!id) return !this.workspaceCreationEnabled();
    const organization = await models.Organization.findByPk(id, { attributes: ['slug'] });
    return organization?.slug === this.defaultSlug();
  }

  async currentId({ required = true } = {}) {
    const id = getRequestContext().organizationId;
    if (id) return id;
    const fallback = await this.bySlug(this.defaultSlug());
    if (fallback) return fallback.id;
    if (required) throw new ValidationError('No active organization is selected');
    return null;
  }

  async memberships(userId) {
    const rows = await models.OrganizationMembership.findAll({
      where: { userId, status: 'active' },
      include: [{ model: models.Organization, as: 'organization', attributes: { exclude: ['logoUrl'] }, where: { status: { [Op.in]: ['trial', 'active', 'past_due'] } } }],
      order: [[{ model: models.Organization, as: 'organization' }, 'name', 'ASC']],
      skipOrganizationScope: true,
    });

    const logos = new Map();
    const missingLogoIds = [];
    for (const row of rows) {
      const organizationId = row.organization.id;
      const cached = getCachedOrganizationLogo(organizationId);
      if (cached.hit) logos.set(organizationId, cached.logoUrl);
      else missingLogoIds.push(organizationId);
    }
    if (missingLogoIds.length) {
      const generations = new Map(missingLogoIds.map((id) => [id, organizationLogoCacheGeneration(id)]));
      const organizations = await models.Organization.findAll({
        where: { id: { [Op.in]: missingLogoIds } },
        attributes: ['id', 'logoUrl'],
        skipOrganizationScope: true,
      });
      for (const organization of organizations) {
        const logoUrl = organization.logoUrl || null;
        logos.set(organization.id, logoUrl);
        if (generations.get(organization.id) === organizationLogoCacheGeneration(organization.id)) {
          cacheOrganizationLogo(organization.id, logoUrl);
        }
      }
    }
    return rows.map(row => serializeOrganization(row.organization, row, logos.get(row.organization.id) || null));
  }

  async create(userId, input = {}) {
    if (!this.workspaceCreationEnabled()) {
      throw new ForbiddenError('Workspace creation is not available during the workspace rollout');
    }
    const name = String(input.name || '').trim();
    const slug = this.normalizeSlug(input.slug);
    const timezone = String(input.timezone || 'UTC').trim() || 'UTC';
    try { new Intl.DateTimeFormat('en', { timeZone: timezone }); }
    catch { throw new ValidationError('Choose a valid IANA timezone'); }
    if (name.length < 2 || name.length > 160) throw new ValidationError('Organization name must be between 2 and 160 characters');
    if (!slug) throw new ValidationError('Workspace URL must use lowercase letters, numbers, and single hyphens');
    if (await models.Organization.findOne({ where: { slug }, skipOrganizationScope: true })) {
      throw new ConflictError('That workspace URL is already in use');
    }

    const { sequelize } = require('../db');
    return sequelize.transaction(async (transaction) => {
      const plan = await models.Plan.findOne({ where: { key: 'starter', active: true }, transaction });
      if (!plan) throw new NotFoundError('Starter plan is not configured');
      const organization = await models.Organization.create({ name, slug, timezone, status: 'active', createdBy: userId }, { transaction });
      const membership = await models.OrganizationMembership.create({
        organizationId: organization.id, userId, role: 'owner', status: 'active', joinedAt: new Date(),
      }, { transaction, skipOrganizationScope: true });
      await models.OrganizationSubscription.create({
        organizationId: organization.id, planId: plan.id, status: 'active', billingInterval: 'monthly', currentPeriodStart: new Date(),
      }, { transaction, skipOrganizationScope: true });
      await require('../utils/auditContext').runWithRequestContext({
        organizationId: organization.id, organizationSlug: organization.slug, userId,
      }, async () => {
        await models.AdminProfile.create({ userId }, { transaction });
        await require('./gamificationService').createDefaultBadges({ transaction });
      });
      return serializeOrganization(organization, membership);
    }).catch(error => {
      if (error.name === 'SequelizeUniqueConstraintError' &&
          (error.fields?.slug !== undefined || error.errors?.some(item => item.path === 'slug'))) {
        throw new ConflictError('That workspace URL is already in use');
      }
      throw error;
    });
  }

  async assertMembership(userId, organizationId) {
    const membership = await models.OrganizationMembership.findOne({
      where: { userId, organizationId, status: 'active' },
    });
    if (!membership) throw new ForbiddenError('You do not have access to this organization');
    return membership;
  }

  async currentForUser(userId, organizationId = null) {
    const id = organizationId || await this.currentId();
    const membership = await this.assertMembership(userId, id);
    const cachedLogo = getCachedOrganizationLogo(id);
    const generation = cachedLogo.hit ? null : organizationLogoCacheGeneration(id);
    const organization = await models.Organization.findByPk(id, cachedLogo.hit
      ? { attributes: { exclude: ['logoUrl'] } }
      : undefined);
    if (!organization) throw new NotFoundError('Organization not found');
    const logoUrl = cachedLogo.hit ? cachedLogo.logoUrl : organization.logoUrl || null;
    if (!cachedLogo.hit && generation === organizationLogoCacheGeneration(id)) {
      cacheOrganizationLogo(id, logoUrl);
    }
    return { organization: serializeOrganization(organization, membership, logoUrl), membership };
  }

  async subscription(organizationId, options = {}) {
    const subscription = await models.OrganizationSubscription.findOne({
      where: { organizationId }, include: [
        { model: models.Plan, as: 'plan' },
        { model: models.Plan, as: 'requestedPlan', required: false },
      ],
      transaction: options.transaction,
    });
    if (!subscription) throw new NotFoundError('Organization subscription not found');
    const plan = subscription.plan?.toJSON() || {};
    return {
      ...subscription.toJSON(),
      plan: { ...plan, limits: { ...(plan.limits || {}), ...(subscription.overrides?.limits || {}) },
        features: { ...(plan.features || {}), ...(subscription.overrides?.features || {}) } },
    };
  }

  async overview(userId, organizationId = null) {
    const { organization, membership } = await this.currentForUser(userId, organizationId);
    const [subscription, organizations, usage] = await Promise.all([
      this.subscription(organization.id), this.memberships(userId), this.usage(organization.id),
    ]);
    return { organization, membership: membership.toJSON(), subscription, organizations, usage,
      workspaceCreationEnabled: this.workspaceCreationEnabled() };
  }

  async usage(organizationId, options = {}) {
    const query = { transaction: options.transaction };
    const programs = await models.Program.count({ where: { organizationId }, ...query });
    const members = await models.OrganizationMembership.count({ where: { organizationId, status: 'active' }, ...query });
    const clans = await models.Clan.count({
      include: [{ model: models.Program, as: 'program', attributes: [], where: { organizationId } }],
      ...query,
    });
    return { programs, clans, members };
  }

  async plans() {
    const plans = await models.Plan.findAll({ where: { active: true }, order: [['sortOrder', 'ASC']] });
    // Publish shipped capabilities and enforced quotas only. Seeded future
    // entitlements (SSO/custom domains/storage/AI quota) are not product promises.
    return plans.map(row => {
      const plan = row.toJSON();
      return { ...plan,
        limits: Object.fromEntries(['members', 'programs', 'clans'].map(key => [key, plan.limits[key]])),
        features: Object.fromEntries(['certificates', 'aiEvaluation', 'advancedAnalytics']
          .map(key => [key, Boolean(plan.features[key])])),
      };
    });
  }

  async requestPlan(userId, organizationId, planKey) {
    const membership = await this.assertMembership(userId, organizationId);
    if (!['owner', 'admin'].includes(membership.role)) throw new ForbiddenError('Organization admin access is required');
    const plan = await models.Plan.findOne({ where: { key: String(planKey || ''), active: true } });
    if (!plan) throw new NotFoundError('Plan not found');
    await sequelize.transaction(async transaction => {
      // Use the same row lock as invoice activation. An overlapping request
      // must not silently replace the plan while an operator activates it.
      const subscription = await models.OrganizationSubscription.findOne({
        where: { organizationId }, transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!subscription) throw new NotFoundError('Organization subscription not found');
      if (subscription.planId === plan.id) throw new ValidationError(`${plan.name} is already your active plan`);
      if (subscription.requestedPlanId === plan.id) return;
      subscription.requestedPlanId = plan.id;
      subscription.requestedAt = new Date();
      await subscription.save({ transaction });
    });
    return this.subscription(organizationId);
  }

  async update(userId, organizationId, patch) {
    const membership = await this.assertMembership(userId, organizationId);
    if (!['owner', 'admin'].includes(membership.role)) throw new ForbiddenError('Organization admin access is required');
    const organization = await models.Organization.findByPk(organizationId);
    if (!organization) throw new NotFoundError('Organization not found');
    const changesBranding = patch.logoUrl !== undefined || patch.primaryColor !== undefined;
    if (changesBranding && !(await this.entitlement(organizationId, 'customBranding'))) {
      throw new ForbiddenError('Custom branding is available on the Growth plan and above');
    }
    if (patch.timezone !== undefined) {
      try { new Intl.DateTimeFormat('en', { timeZone: patch.timezone }); }
      catch { throw new ValidationError('Choose a valid IANA timezone'); }
    }
    const allowed = ['name', 'logoUrl', 'primaryColor', 'timezone'];
    for (const key of allowed) if (patch[key] !== undefined) organization[key] = patch[key];
    if (!organization.name?.trim()) throw new ValidationError('Organization name is required');
    await organization.save();
    if (patch.logoUrl !== undefined) invalidateOrganizationLogo(organizationId);
    return serializeOrganization(organization, membership);
  }

  async assertCanManageBranding(userId, organizationId) {
    const membership = await this.assertMembership(userId, organizationId);
    if (!['owner', 'admin'].includes(membership.role)) throw new ForbiddenError('Organization admin access is required');
    if (!(await this.entitlement(organizationId, 'customBranding'))) {
      throw new ForbiddenError('Custom branding is available on the Growth plan and above');
    }
    const organization = await models.Organization.findByPk(organizationId);
    if (!organization) throw new NotFoundError('Organization not found');
    return { membership, organization };
  }

  async setLogo(userId, organizationId, file) {
    const { membership, organization } = await this.assertCanManageBranding(userId, organizationId);
    if (!file || !['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.mimetype) || file.size > 5 * 1024 * 1024) {
      throw new ValidationError('Choose a PNG, JPG or WebP image up to 5 MB');
    }

    const result = await uploadToCloudinary(file.buffer, 'pathment/organization-logos', 'image');
    const logoUrl = result.secure_url || result.url;
    if (!logoUrl) throw new ValidationError('Logo upload did not return an image URL');
    const previous = organization.getDataValue('logoUrl');
    organization.logoUrl = logoUrl;
    try {
      await organization.save();
    } catch (error) {
      if (result.public_id) deleteFromCloudinary(result.public_id, 'image').catch(() => {});
      throw error;
    }
    invalidateOrganizationLogo(organizationId);
    this.deleteOrganizationLogo(previous);
    return serializeOrganization(organization, membership);
  }

  async removeLogo(userId, organizationId) {
    const { membership, organization } = await this.assertCanManageBranding(userId, organizationId);
    const previous = organization.getDataValue('logoUrl');
    organization.logoUrl = null;
    await organization.save();
    invalidateOrganizationLogo(organizationId);
    this.deleteOrganizationLogo(previous);
    return serializeOrganization(organization, membership);
  }

  deleteOrganizationLogo(url) {
    if (!url || !url.includes('res.cloudinary.com') || !url.includes('/pathment/organization-logos/')) return;
    deleteFromCloudinary(extractPublicId(url), 'image').catch(() => {});
  }

  async entitlement(organizationId, feature) {
    const { plan } = await this.subscription(organizationId);
    return Boolean(plan.features?.[feature]);
  }

  async assertLimit(organizationId, resource, currentValue = null, options = {}) {
    // Serialize capacity checks performed as part of a create transaction. Two
    // concurrent invitations can otherwise both observe the last free seat.
    if (options.transaction) {
      await models.Organization.findByPk(organizationId, {
        transaction: options.transaction,
        lock: options.transaction.LOCK.UPDATE,
        skipOrganizationScope: true,
      });
    }
    const { plan } = await this.subscription(organizationId, options);
    const limit = Number(plan.limits?.[resource]);
    if (!Number.isFinite(limit) || limit < 0) return true;
    const usage = currentValue == null ? (await this.usage(organizationId, options))[resource] : currentValue;
    if (usage >= limit) throw new ForbiddenError(`Your ${plan.name} plan allows ${limit} ${resource}. Upgrade to add more.`);
    return true;
  }
}

module.exports = new OrganizationService();
