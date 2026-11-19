const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const { runWithRequestContext } = require('../utils/auditContext');
const organizationService = require('./organizationService');
const platformAudit = require('./platformAuditService');
const { orgLogoThumb } = require('../utils/imageUrl');

/**
 * Cross-workspace reads for the platform console.
 *
 * Every query here passes skipOrganizationScope deliberately: the console runs
 * with NO workspace in context (organizationContext skips /api/platform), and
 * with MULTI_TENANT_WORKSPACES_ENABLED a tenant-scoped query without a tenant
 * refuses to run. This service is the one audited place that crosses the
 * boundary on purpose. Anything that only concerns ONE workspace re-enters
 * that workspace's context instead (see inOrganization), so the existing
 * tenant-scoped services can be reused rather than re-implemented.
 */
const SKIP = { skipOrganizationScope: true };

/** Run fn inside a target workspace's context - the deliberate boundary crossing. */
const inOrganization = (organization, fn) => runWithRequestContext(
  { organizationId: organization.id, organizationSlug: organization.slug },
  fn,
);

const overrideKeys = (overrides) => [
  ...Object.keys(overrides?.limits || {}),
  ...Object.keys(overrides?.features || {}),
];

const summarize = (organization) => ({
  id: organization.id,
  name: organization.name,
  slug: organization.slug,
  status: organization.status,
  logoUrl: orgLogoThumb(organization.logoUrl || null) || null,
  primaryColor: organization.primaryColor,
  timezone: organization.timezone,
  createdAt: organization.createdAt,
  onboardingSource: organization.settings?.onboardingSource || 'legacy',
  isDemo: Boolean(organization.settings?.fixture),
});

class PlatformOrganizationService {
  async byId(id) {
    const organization = await models.Organization.findByPk(id, { ...SKIP, paranoid: false });
    if (!organization) throw new NotFoundError('Workspace not found');
    return organization;
  }

  /**
   * The directory: one row per workspace with plan, usage and health at a
   * glance. Usage numbers come from grouped queries over just the page's ids,
   * so the cost stays proportional to the page, not the platform.
   */
  async directory({ search, status, planKey, hasOverrides, sort = 'created', page = 1, limit = 25 } = {}) {
    const where = {};
    if (search) where[Op.or] = [{ name: { [Op.iLike]: `%${search}%` } }, { slug: { [Op.iLike]: `%${search}%` } }];
    if (status) where.status = status;

    const subscriptionWhere = {};
    if (hasOverrides === true || hasOverrides === 'true') {
      subscriptionWhere[Op.or] = [
        sequelize.literal(`("subscription"."overrides" -> 'limits') <> '{}'::jsonb`),
        sequelize.literal(`("subscription"."overrides" -> 'features') <> '{}'::jsonb`),
      ];
    }

    const include = [{
      model: models.OrganizationSubscription,
      as: 'subscription',
      required: Boolean(planKey) || Object.getOwnPropertySymbols(subscriptionWhere).length > 0,
      where: Object.getOwnPropertySymbols(subscriptionWhere).length ? subscriptionWhere : undefined,
      include: [
        { model: models.Plan, as: 'plan', ...(planKey ? { where: { key: planKey } } : {}), required: Boolean(planKey) },
        { model: models.Plan, as: 'requestedPlan', required: false },
      ],
    }];

    const order = {
      created: [['createdAt', 'DESC']],
      name: [['name', 'ASC']],
      members: [[sequelize.literal(`(SELECT COUNT(*) FROM organization_memberships om
        JOIN users u ON u.id = om.user_id
        WHERE om.organization_id = "Organization"."id" AND om.status = 'active' AND u.role = 'mentee')`), 'DESC']],
      activity: [['updatedAt', 'DESC']],
    }[sort] || [['createdAt', 'DESC']];

    const size = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const current = Math.max(1, parseInt(page, 10) || 1);

    const { rows, count } = await models.Organization.findAndCountAll({
      ...SKIP, paranoid: false, where, include, order,
      limit: size, offset: (current - 1) * size, distinct: true,
    });

    const ids = rows.map((row) => row.id);
    const [usageByOrg, ownersByOrg, activityByOrg] = await Promise.all([
      this._usageFor(ids), this._ownersFor(ids), this._lastActivityFor(ids),
    ]);

    const organizations = rows.map((organization) => {
      const subscription = organization.subscription;
      const plan = subscription?.plan;
      const effectiveLimits = { ...(plan?.limits || {}), ...(subscription?.overrides?.limits || {}) };
      return {
        ...summarize(organization),
        plan: plan ? { key: plan.key, name: plan.name } : null,
        requestedPlan: subscription?.requestedPlan
          ? { key: subscription.requestedPlan.key, name: subscription.requestedPlan.name, requestedAt: subscription.requestedAt }
          : null,
        subscriptionStatus: subscription?.status || null,
        billingInterval: subscription?.billingInterval || null,
        currentPeriodEnd: subscription?.currentPeriodEnd || null,
        trialEndsAt: subscription?.trialEndsAt || null,
        overriddenKeys: overrideKeys(subscription?.overrides),
        usage: usageByOrg[organization.id] || { members: 0, programs: 0, clans: 0 },
        limits: { members: effectiveLimits.members ?? null, programs: effectiveLimits.programs ?? null, clans: effectiveLimits.clans ?? null },
        owner: ownersByOrg[organization.id] || null,
        lastActivityAt: activityByOrg[organization.id] || null,
      };
    });

    return { organizations, total: count, page: current, pages: Math.ceil(count / size) || 1 };
  }

  async _usageFor(ids) {
    if (!ids.length) return {};
    const [members, programs, clans] = await Promise.all([
      // Participants only (mentees), matching how plans count members.
      sequelize.query(
        `SELECT om.organization_id AS "organizationId", COUNT(*)::int AS count
         FROM organization_memberships om JOIN users u ON u.id = om.user_id
         WHERE om.organization_id IN (:ids) AND om.status = 'active' AND u.role = 'mentee'
         GROUP BY om.organization_id`,
        { replacements: { ids }, type: sequelize.QueryTypes.SELECT },
      ),
      models.Program.findAll({
        ...SKIP, raw: true,
        attributes: ['organizationId', [sequelize.fn('COUNT', '*'), 'count']],
        where: { organizationId: ids }, group: ['organization_id'],
      }),
      sequelize.query(
        `SELECT p.organization_id AS "organizationId", COUNT(c.id)::int AS count
         FROM clans c JOIN programs p ON p.id = c.program_id
         WHERE p.organization_id IN (:ids) GROUP BY p.organization_id`,
        { replacements: { ids }, type: sequelize.QueryTypes.SELECT },
      ),
    ]);
    const usage = {};
    const put = (list, key) => list.forEach((row) => {
      usage[row.organizationId] = usage[row.organizationId] || { members: 0, programs: 0, clans: 0 };
      usage[row.organizationId][key] = Number(row.count);
    });
    put(members, 'members'); put(programs, 'programs'); put(clans, 'clans');
    return usage;
  }

  async _ownersFor(ids) {
    if (!ids.length) return {};
    const rows = await models.OrganizationMembership.findAll({
      ...SKIP,
      where: { organizationId: ids, role: 'owner', status: { [Op.in]: ['active', 'invited'] } },
      include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      order: [['createdAt', 'ASC']],
    });
    const owners = {};
    for (const row of rows) {
      if (!owners[row.organizationId] && row.user) {
        owners[row.organizationId] = {
          id: row.user.id, firstName: row.user.firstName, lastName: row.user.lastName,
          email: row.user.email, membershipStatus: row.status,
        };
      }
    }
    return owners;
  }

  /** Latest product-audit write per workspace - a cheap, indexed activity proxy. */
  async _lastActivityFor(ids) {
    if (!ids.length) return {};
    const rows = await sequelize.query(
      `SELECT organization_id AS "organizationId", MAX(created_at) AS last
       FROM audit_logs WHERE organization_id IN (:ids) GROUP BY organization_id`,
      { replacements: { ids }, type: sequelize.QueryTypes.SELECT },
    );
    return Object.fromEntries(rows.map((row) => [row.organizationId, row.last]));
  }

  /** Everything the org detail page shows, in one round trip. */
  async detail(id) {
    const organization = await this.byId(id);
    const [subscription, usage, memberBreakdown, counts, domains, apps, aiConnections, invite, creator, lastActivity] =
      await Promise.all([
        inOrganization(organization, () => organizationService.subscription(organization.id)).catch(() => null),
        inOrganization(organization, () => organizationService.usage(organization.id)),
        this._memberBreakdown(organization.id),
        this._entityCounts(organization.id),
        models.OrganizationDomain.findAll({ ...SKIP, where: { organizationId: organization.id }, order: [['createdAt', 'ASC']] }),
        models.OrganizationApp.findAll({
          ...SKIP, where: { organizationId: organization.id },
          include: [{ model: models.ExternalApp, as: 'app', attributes: ['id', 'name', 'type', 'integrationKey'] }],
        }),
        models.AIConnection.findAll({
          ...SKIP, where: { organizationId: organization.id },
          attributes: ['id', 'provider', 'label', 'model', 'status', 'keyMasked', 'ownerId', 'createdAt'],
        }),
        models.WorkspaceOwnerInvite.findOne({
          ...SKIP, where: { organizationId: organization.id }, order: [['createdAt', 'DESC']],
          attributes: ['id', 'expiresAt', 'usedAt', 'revokedAt', 'createdAt', 'userId'],
        }),
        organization.createdBy ? models.User.findByPk(organization.createdBy, { attributes: ['id', 'firstName', 'lastName', 'email'] }) : null,
        this._lastActivityFor([organization.id]),
      ]);

    return {
      organization: {
        ...summarize(organization),
        settings: organization.settings || {},
        updatedAt: organization.updatedAt,
        deletedAt: organization.deletedAt || null,
        creator: creator ? { id: creator.id, firstName: creator.firstName, lastName: creator.lastName, email: creator.email } : null,
      },
      subscription,
      usage,
      memberBreakdown,
      counts,
      domains,
      apps: apps.map((row) => ({
        id: row.id, status: row.status, credentialsMasked: row.credentialsMasked,
        lastVerifiedAt: row.lastVerifiedAt, app: row.app,
      })),
      aiConnections,
      ownerInvite: invite ? {
        id: invite.id,
        status: invite.usedAt ? 'used' : invite.revokedAt ? 'revoked'
          : invite.expiresAt < new Date() ? 'expired' : 'pending',
        expiresAt: invite.expiresAt, usedAt: invite.usedAt, createdAt: invite.createdAt,
      } : null,
      lastActivityAt: lastActivity[organization.id] || null,
    };
  }

  async _memberBreakdown(organizationId) {
    const rows = await models.OrganizationMembership.findAll({
      ...SKIP, raw: true,
      attributes: ['status', [sequelize.fn('COUNT', '*'), 'count']],
      where: { organizationId }, group: ['status'],
    });
    const breakdown = { active: 0, invited: 0, suspended: 0, left: 0 };
    rows.forEach((row) => { breakdown[row.status] = Number(row.count); });
    return breakdown;
  }

  async _entityCounts(organizationId) {
    const [programs, enrollments] = await Promise.all([
      models.Program.findAll({
        ...SKIP, raw: true, attributes: ['status', [sequelize.fn('COUNT', '*'), 'count']],
        where: { organizationId }, group: ['status'],
      }),
      models.Enrollment.count({ ...SKIP, where: { organizationId } }).catch(() => null),
    ]);
    return {
      programsByStatus: Object.fromEntries(programs.map((row) => [row.status, Number(row.count)])),
      enrollments,
    };
  }

  async members(id, { search, page = 1, limit = 25 } = {}) {
    await this.byId(id);
    const size = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const current = Math.max(1, parseInt(page, 10) || 1);
    const userWhere = search ? {
      [Op.or]: [
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ],
    } : undefined;
    const { rows, count } = await models.OrganizationMembership.findAndCountAll({
      ...SKIP,
      where: { organizationId: id },
      include: [{
        // paranoid:false keeps memberships of soft-deleted users visible to operators.
        model: models.User, as: 'user', where: userWhere, paranoid: false,
        attributes: ['id', 'firstName', 'lastName', 'email', 'role', 'status', 'lastLoginAt', 'createdAt', 'deletedAt'],
      }],
      order: [[sequelize.literal(`CASE "OrganizationMembership"."role" WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`), 'ASC'], ['createdAt', 'ASC']],
      limit: size, offset: (current - 1) * size,
    });
    return {
      members: rows.map((row) => ({
        membershipId: row.id, role: row.role, status: row.status, joinedAt: row.joinedAt,
        user: row.user,
      })),
      total: count, page: current, pages: Math.ceil(count / size) || 1,
    };
  }

  /** The product audit feed for one workspace, read deliberately across the boundary. */
  async organizationAudit(id, { page = 1, limit = 50 } = {}) {
    await this.byId(id);
    const size = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const current = Math.max(1, parseInt(page, 10) || 1);
    const { rows, count } = await models.AuditLog.findAndCountAll({
      ...SKIP,
      where: { organizationId: id },
      include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'], required: false }],
      order: [['createdAt', 'DESC']],
      limit: size, offset: (current - 1) * size,
    });
    return { entries: rows, total: count, page: current, pages: Math.ceil(count / size) || 1 };
  }

  /** Workspace lifecycle: suspend / reactivate / archive / restore, with evidence. */
  async setStatus(actor, id, { status, reason }) {
    const organization = await this.byId(id);
    const allowed = ['trial', 'active', 'suspended', 'archived'];
    if (!allowed.includes(status)) throw new ValidationError('Choose a valid workspace status');
    if (organization.status === status) throw new ValidationError(`This workspace is already ${status}`);
    const previous = organization.status;

    await sequelize.transaction(async (transaction) => {
      await organization.update({ status }, { transaction, ...SKIP });
      await platformAudit.record({
        action: 'PLATFORM_WORKSPACE_STATUS_CHANGED',
        targetType: 'Organization', targetId: organization.slug, organizationId: organization.id,
        oldValues: { status: previous }, newValues: { status }, reason, actor, transaction,
      });
    });

    // Taking a workspace offline must also end its live sessions. Socket
    // disconnect is per (user, workspace); walk the memberships.
    if (['suspended', 'archived'].includes(status)) {
      try {
        const { disconnectWorkspaceUser } = require('../socket');
        const memberships = await models.OrganizationMembership.findAll({
          ...SKIP, where: { organizationId: organization.id, status: 'active' }, attributes: ['userId'],
        });
        memberships.forEach((row) => disconnectWorkspaceUser(row.userId, organization.id));
      } catch (error) {
        console.warn('workspace socket disconnect failed:', error.message);
      }
    }

    return { id: organization.id, slug: organization.slug, status };
  }

  /** Platform-wide headline numbers for the console overview. */
  async metrics() {
    const [byStatus, totalUsers, activeMemberships, newOrgs30d, newUsers30d, planDistribution,
      pendingRequests, trialsExpiring, newLeads, subscriptions] = await Promise.all([
      models.Organization.findAll({
        ...SKIP, raw: true, paranoid: false,
        attributes: ['status', [sequelize.fn('COUNT', '*'), 'count']], group: ['status'],
      }),
      models.User.count(SKIP),
      models.OrganizationMembership.count({ ...SKIP, where: { status: 'active' } }),
      models.Organization.count({ ...SKIP, where: { createdAt: { [Op.gte]: new Date(Date.now() - 30 * 86400000) } } }),
      models.User.count({ ...SKIP, where: { createdAt: { [Op.gte]: new Date(Date.now() - 30 * 86400000) } } }),
      sequelize.query(
        `SELECT p.key, p.name, COUNT(os.id)::int AS count
         FROM organization_subscriptions os JOIN plans p ON p.id = os.plan_id
         GROUP BY p.key, p.name, p.sort_order ORDER BY p.sort_order`,
        { type: sequelize.QueryTypes.SELECT },
      ),
      models.OrganizationSubscription.count({ ...SKIP, where: { requestedPlanId: { [Op.ne]: null } } }),
      models.OrganizationSubscription.count({
        ...SKIP,
        where: { status: 'trialing', trialEndsAt: { [Op.between]: [new Date(), new Date(Date.now() + 14 * 86400000)] } },
      }),
      models.BuyerLead.count({ where: { status: 'new' } }),
      models.OrganizationSubscription.findAll({
        ...SKIP, where: { status: { [Op.in]: ['active', 'past_due'] } },
        include: [{ model: models.Plan, as: 'plan', attributes: ['monthlyPriceCents', 'annualPriceCents'] }],
        attributes: ['billingInterval'],
      }),
    ]);

    // Monthly-recurring estimate: list price by interval; overrides and manual
    // arrangements are not priced, so this is an indicator, not an invoice.
    const mrrCents = subscriptions.reduce((sum, row) => sum + (row.billingInterval === 'annual'
      ? Math.round((row.plan?.annualPriceCents || 0) / 12)
      : (row.plan?.monthlyPriceCents || 0)), 0);

    return {
      organizations: {
        total: byStatus.reduce((sum, row) => sum + Number(row.count), 0),
        byStatus: Object.fromEntries(byStatus.map((row) => [row.status, Number(row.count)])),
        newLast30Days: newOrgs30d,
      },
      users: { total: totalUsers, activeMemberships, newLast30Days: newUsers30d },
      billing: { planDistribution, pendingPlanRequests: pendingRequests, trialsExpiringIn14Days: trialsExpiring, mrrCents },
      leads: { new: newLeads },
    };
  }
}

module.exports = new PlatformOrganizationService();
