const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { getRequestContext } = require('../utils/auditContext');
const { NotFoundError, ForbiddenError, ValidationError, ConflictError } = require('../utils/errors/errorTypes');
const { orgLogoThumb } = require('../utils/imageUrl');
const authz = require('./authzService');
const { PERMISSIONS } = require('../config/permissions');
const {
  uploadToCloudinary,
  deleteFromCloudinary,
  extractPublicId,
} = require('../utils/cloudinaryUpload');

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const RESERVED_SLUGS = new Set(['pathment', 'www', 'app', 'api', 'links', 'meet', 'staging', 'status', 'support', 'admin', 'mail', 'cdn', 'assets']);
const LOGO_FOLDER = 'pathment/org-logos';
const LOGO_MIME = ['image/png', 'image/jpeg'];
const LOGO_MAX_BYTES = 5 * 1024 * 1024;

const serializeOrganization = (organization, membership = null) => ({
  id: organization.id,
  name: organization.name,
  slug: organization.slug,
  status: organization.status,
  // CDN thumb for UI; DB keeps the original upload URL.
  logoUrl: orgLogoThumb(organization.logoUrl || null) || null,
  primaryColor: organization.primaryColor,
  timezone: organization.timezone,
  settings: organization.settings || {},
  membershipRole: membership?.role || null,
});

class OrganizationService {
  workspaceCreationEnabled() {
    return process.env.MULTI_TENANT_WORKSPACES_ENABLED === 'true';
  }

  organizationSignupEnabled() {
    // First-workspace signup and additional-workspace creation are separate
    // product decisions. The old rollout switch must not dead-end a new company.
    return process.env.PUBLIC_ORGANIZATION_SIGNUP_ENABLED !== 'false';
  }

  assertWorkspaceAvailable(organization) {
    if (!organization) throw new NotFoundError('Organization not found');
    if (['suspended', 'archived'].includes(organization.status)) {
      throw new ForbiddenError('This workspace is unavailable');
    }
    const isPublicSignup = organization.settings?.onboardingSource === 'public_signup';
    if (!this.workspaceCreationEnabled() && !isPublicSignup && organization.slug !== this.defaultSlug() &&
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
      include: [{ model: models.Organization, as: 'organization', where: { status: { [Op.in]: ['trial', 'active', 'past_due'] } } }],
      order: [[{ model: models.Organization, as: 'organization' }, 'name', 'ASC']],
      skipOrganizationScope: true,
    });
    return rows.map(row => serializeOrganization(row.organization, row));
  }

  async create(userId, input = {}, options = {}) {
    if (!this.workspaceCreationEnabled() && !options.allowInitialWorkspace) {
      throw new ForbiddenError('Workspace creation is not available during the workspace rollout');
    }
    const name = String(input.name || '').trim();
    const slug = this.normalizeSlug(input.slug);
    const timezone = String(input.timezone || 'UTC').trim() || 'UTC';
    try { new Intl.DateTimeFormat('en', { timeZone: timezone }); }
    catch { throw new ValidationError('Choose a valid IANA timezone'); }
    if (name.length < 2 || name.length > 160) throw new ValidationError('Organization name must be between 2 and 160 characters');
    if (!slug) throw new ValidationError('Workspace URL must use lowercase letters, numbers, and single hyphens');
    if (await models.Organization.findOne({ where: { slug }, skipOrganizationScope: true, transaction: options.transaction })) {
      throw new ConflictError('That workspace URL is already in use');
    }

    const createInTransaction = async (transaction) => {
      const plan = await models.Plan.findOne({ where: { key: 'starter', active: true }, transaction });
      if (!plan) throw new NotFoundError('Starter plan is not configured');
      const organization = await models.Organization.create({
        name, slug, timezone, status: 'active', createdBy: userId,
        ...(options.allowInitialWorkspace ? { settings: { onboardingSource: 'public_signup' } } : {}),
      }, { transaction });
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
    };

    const operation = options.transaction
      ? createInTransaction(options.transaction)
      : sequelize.transaction(createInTransaction);
    return operation.catch(error => {
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
    const organization = await models.Organization.findByPk(id);
    if (!organization) throw new NotFoundError('Organization not found');
    return { organization: serializeOrganization(organization, membership), membership };
  }

  async assertCanManage(user, organizationId) {
    if (!user?.id) throw new ForbiddenError('Organization admin access is required');
    const membership = await this.assertMembership(user.id, organizationId);
    if (!(await authz.can(user, PERMISSIONS.SYSTEM_SETTINGS))) {
      throw new ForbiddenError('Organization admin access is required');
    }
    return membership;
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

  async overview(user, organizationId = null) {
    const { organization, membership } = await this.currentForUser(user.id, organizationId);
    const [subscription, organizations, usage, canManageOrganization] = await Promise.all([
      this.subscription(organization.id), this.memberships(user.id), this.usage(organization.id),
      authz.can(user, PERMISSIONS.SYSTEM_SETTINGS),
    ]);
    return { organization, membership: membership.toJSON(), subscription, organizations, usage,
      canManageOrganization, workspaceCreationEnabled: this.workspaceCreationEnabled() };
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
        features: Object.fromEntries(['certificates', 'aiEvaluation', 'advancedAnalytics', 'programCompletionStanding']
          .map(key => [key, Boolean(plan.features[key])])),
      };
    });
  }

  async requestPlan(user, organizationId, planKey) {
    await this.assertCanManage(user, organizationId);
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

  async update(user, organizationId, patch) {
    const membership = await this.assertCanManage(user, organizationId);
    const organization = await models.Organization.findByPk(organizationId);
    if (!organization) throw new NotFoundError('Organization not found');
    if (patch.logoUrl !== undefined) {
      throw new ValidationError('Upload a workspace logo instead of setting a URL');
    }
    if (patch.primaryColor !== undefined && !(await this.entitlement(organizationId, 'customBranding'))) {
      throw new ForbiddenError('Custom branding is available on the Growth plan and above');
    }
    if (patch.timezone !== undefined) {
      try { new Intl.DateTimeFormat('en', { timeZone: patch.timezone }); }
      catch { throw new ValidationError('Choose a valid IANA timezone'); }
    }
    const allowed = ['name', 'primaryColor', 'timezone'];
    for (const key of allowed) if (patch[key] !== undefined) organization[key] = patch[key];
    if (!organization.name?.trim()) throw new ValidationError('Organization name is required');
    await organization.save();
    return serializeOrganization(organization, membership);
  }

  async assertCanEditLogo(user, organizationId) {
    const membership = await this.assertCanManage(user, organizationId);
    if (!(await this.entitlement(organizationId, 'customBranding'))) {
      throw new ForbiddenError('Custom branding is available on the Growth plan and above');
    }
    const organization = await models.Organization.findByPk(organizationId);
    if (!organization) throw new NotFoundError('Organization not found');
    return { organization, membership };
  }

  async setLogo(user, organizationId, file) {
    const { organization, membership } = await this.assertCanEditLogo(user, organizationId);
    if (!file || !LOGO_MIME.includes(file.mimetype) || file.size > LOGO_MAX_BYTES) {
      throw new ValidationError('Choose a PNG or JPG image up to 5 MB');
    }
    const previous = organization.logoUrl;
    const result = await uploadToCloudinary(file.buffer, LOGO_FOLDER, 'image');
    const url = result.secure_url || result.url;
    if (!url) throw new ValidationError('Could not upload the file');
    organization.logoUrl = url;
    await organization.save();
    if (previous && previous.includes('res.cloudinary.com') && previous.includes(LOGO_FOLDER)) {
      deleteFromCloudinary(extractPublicId(previous), 'image').catch(() => {});
    }
    return serializeOrganization(organization, membership);
  }

  async removeLogo(user, organizationId) {
    const { organization, membership } = await this.assertCanEditLogo(user, organizationId);
    const previous = organization.logoUrl;
    organization.logoUrl = null;
    await organization.save();
    if (previous && previous.includes('res.cloudinary.com') && previous.includes(LOGO_FOLDER)) {
      deleteFromCloudinary(extractPublicId(previous), 'image').catch(() => {});
    }
    return serializeOrganization(organization, membership);
  }

  async entitlement(organizationId, feature) {
    const { plan } = await this.subscription(organizationId);
    if (feature === 'programCompletionStanding') {
      // Standing-clan requests only. Program closeout is not plan-gated.
      if (typeof plan.features?.programCompletionStanding === 'boolean') {
        return plan.features.programCompletionStanding;
      }
      // Until features JSON is migrated: paid price → enabled, free/Starter → not.
      return Number(plan.monthlyPriceCents || 0) > 0 || Number(plan.annualPriceCents || 0) > 0;
    }
    return Boolean(plan.features?.[feature]);
  }

  async requireEntitlement(organizationId, feature, message) {
    if (!await this.entitlement(organizationId, feature)) {
      throw new ForbiddenError(message || 'This feature is not included in your current plan');
    }
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
