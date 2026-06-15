const { Op } = require('sequelize');
const { models } = require('../db');
const { createAuditLog } = require('../utils/auditContext');
const { ROLES } = require('../config/roles');
const { ALL_PERMISSIONS } = require('../config/permissions');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors/errorTypes');
const { generateRandomToken, hashToken } = require('../utils/jwt');
const authzService = require('./authzService');
const notificationOrchestrator = require('./notificationOrchestrator');

const SCOPE_LEVELS = ['org', 'program', 'clan', 'self'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * IAM administration: grant/revoke explicit scoped roles and inspect a user's
 * effective access. Derived assignments (from clan membership / capabilities)
 * are shown read-only; only explicit role_assignments rows are revocable here.
 */
class AccessService {
  /** The role catalog for the admin UI - built-in + custom roles. */
  async listRoleCatalog() {
    const builtIn = Object.entries(ROLES).map(([key, r]) => ({
      key, label: r.label, scope: r.scope, description: r.description,
      permissions: r.permissions === '*' ? '*' : r.permissions, custom: false
    }));
    const custom = await models.CustomRole.findAll({ order: [['label', 'ASC']] });
    const customMapped = custom.map((r) => ({
      key: r.key, label: r.label, scope: r.scopeLevel, description: r.description || '',
      permissions: r.permissions || [], custom: true, id: r.id
    }));
    return [...builtIn, ...customMapped];
  }

  // ── Custom roles ─────────────────────────────────────────────────────────────
  _slugKey(label) {
    const base = 'custom_' + String(label || 'role').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    return base === 'custom_' ? 'custom_role' : base;
  }

  _validatePermissions(perms) {
    if (!Array.isArray(perms)) throw new ValidationError('permissions must be an array');
    const unknown = perms.filter((p) => !ALL_PERMISSIONS.includes(p));
    if (unknown.length) throw new ValidationError(`Unknown permissions: ${unknown.join(', ')}`);
  }

  async listCustomRoles() {
    const rows = await models.CustomRole.findAll({ order: [['label', 'ASC']] });
    return rows.map((r) => r.toJSON());
  }

  async createCustomRole(data, createdBy) {
    if (!data.label || !data.label.trim()) throw new ValidationError('A name is required');
    if (data.scopeLevel && !SCOPE_LEVELS.includes(data.scopeLevel)) throw new ValidationError('Invalid scope level');
    this._validatePermissions(data.permissions || []);

    let key = this._slugKey(data.label);
    // Keep keys unique (and never collide with a built-in role key).
    let i = 2;
    while (ROLES[key] || (await models.CustomRole.findOne({ where: { key } }))) { key = `${this._slugKey(data.label)}_${i++}`; }

    const role = await models.CustomRole.create({
      key, label: data.label.trim(), description: data.description || null,
      scopeLevel: data.scopeLevel || 'org', permissions: data.permissions || [], createdBy
    });
    authzService.invalidateCustomRoles();
    return role;
  }

  async updateCustomRole(id, data) {
    const role = await models.CustomRole.findByPk(id);
    if (!role) throw new NotFoundError('Custom role not found');
    const patch = {};
    if (data.label !== undefined) patch.label = data.label.trim();
    if (data.description !== undefined) patch.description = data.description;
    if (data.scopeLevel !== undefined) {
      if (!SCOPE_LEVELS.includes(data.scopeLevel)) throw new ValidationError('Invalid scope level');
      patch.scopeLevel = data.scopeLevel;
    }
    if (data.permissions !== undefined) { this._validatePermissions(data.permissions); patch.permissions = data.permissions; }
    await role.update(patch);
    authzService.invalidateCustomRoles();
    return role;
  }

  async deleteCustomRole(id) {
    const role = await models.CustomRole.findByPk(id);
    if (!role) throw new NotFoundError('Custom role not found');
    const inUse = await models.RoleAssignment.count({ where: { role: role.key } });
    if (inUse > 0) throw new ValidationError('This role is assigned to users - revoke those grants first');
    await role.destroy();
    authzService.invalidateCustomRoles();
    return { deleted: true };
  }

  async _scopeLabel(scopeType, scopeId) {
    if (scopeType === 'org' || !scopeId) return 'Organization';
    if (scopeType === 'program') {
      const p = await models.Program.findByPk(scopeId, { attributes: ['name'] });
      return p ? `Program: ${p.name}` : 'Program (deleted)';
    }
    if (scopeType === 'clan') {
      const c = await models.Clan.findByPk(scopeId, { attributes: ['name'] });
      return c ? `Clan: ${c.name}` : 'Clan (deleted)';
    }
    if (scopeType === 'self') return 'Self';
    return scopeType;
  }

  /**
   * Paginated user directory for the IAM "People" tab — ALL roles, searchable,
   * not recipient-scoped (unlike the messaging search), so an admin can browse
   * the whole org. Includes the user themselves.
   */
  async listDirectory({ search, role, page = 1, limit = 25 } = {}) {
    const { Op } = require('sequelize');
    const parsedLimit = Math.min(50, Math.max(1, Number(limit) || 25));
    const parsedPage = Math.max(1, Number(page) || 1);

    const where = { status: { [Op.in]: ['active', 'suspended'] } };
    if (role && ['admin', 'mentor', 'mentee'].includes(role)) where.role = role;
    const term = (search || '').trim();
    if (term) {
      const like = `%${term}%`;
      where[Op.or] = [
        { firstName: { [Op.iLike]: like } },
        { lastName: { [Op.iLike]: like } },
        { email: { [Op.iLike]: like } },
      ];
    }

    const { rows, count } = await models.User.findAndCountAll({
      where,
      attributes: ['id', 'firstName', 'lastName', 'email', 'role', 'status', 'profilePictureUrl'],
      order: [['firstName', 'ASC'], ['lastName', 'ASC']],
      limit: parsedLimit,
      offset: (parsedPage - 1) * parsedLimit,
    });
    return { users: rows.map((u) => u.toJSON()), total: count, page: parsedPage, limit: parsedLimit };
  }

  /** A user's explicit (revocable) + derived (read-only) assignments. */
  async listUserAccess(userId) {
    const user = await models.User.findByPk(userId, {
      attributes: ['id', 'firstName', 'lastName', 'email', 'role', 'capabilities']
    });
    if (!user) throw new NotFoundError('User not found');

    const explicitRows = await models.RoleAssignment.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']]
    });
    const explicit = await Promise.all(explicitRows.map(async (r) => ({
      id: r.id, role: r.role, roleLabel: ROLES[r.role]?.label || r.role,
      scopeType: r.scopeType, scopeId: r.scopeId,
      scopeLabel: await this._scopeLabel(r.scopeType, r.scopeId),
      grantedBy: r.grantedBy, createdAt: r.createdAt
    })));

    // Derived assignments (clan membership / capabilities), minus explicit dupes.
    const all = await authzService.getAssignments(user);
    const explicitKeys = new Set(explicit.map((e) => `${e.role}:${e.scopeType}:${e.scopeId || ''}`));
    const derived = await Promise.all(
      all
        .filter((a) => !explicitKeys.has(`${a.role}:${a.scopeType}:${a.scopeId || ''}`))
        .map(async (a) => ({
          role: a.role, roleLabel: ROLES[a.role]?.label || a.role,
          scopeType: a.scopeType, scopeId: a.scopeId,
          scopeLabel: await this._scopeLabel(a.scopeType, a.scopeId)
        }))
    );

    // Always surface the base ACCOUNT role first, so the panel is never empty
    // (a mentor with no clan would otherwise show nothing) and the account type
    // is obvious. Drop the redundant mentee@self derived entry it covers.
    const baseLabels = { admin: 'Admin', mentor: 'Mentor', mentee: 'Mentee' };
    const baseEntry = {
      role: user.role, roleLabel: baseLabels[user.role] || user.role,
      scopeType: 'account', scopeId: null, scopeLabel: 'Account type',
    };
    const derivedWithBase = [
      baseEntry,
      ...derived.filter((d) => !(d.role === user.role && d.scopeType === 'self')),
    ];

    return {
      user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role },
      explicit,
      derived: derivedWithBase
    };
  }

  /**
   * Org-wide audit feed for admins: who did what, to which entity, when - with
   * the actor resolved to a name. Supports filtering by actor, action substring,
   * entity type, and a date window.
   */
  async listAuditLogs({ actorUserId, action, entityType, from, to, limit = 50, offset = 0 } = {}) {
    const where = {};
    if (actorUserId) where.userId = actorUserId;
    if (entityType) where.entityType = entityType;
    if (action) where.action = { [Op.iLike]: `%${action}%` };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt[Op.gte] = new Date(from);
      if (to) where.createdAt[Op.lte] = new Date(to);
    }

    const result = await models.AuditLog.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Math.min(Number(limit) || 50, 200),
      offset: Number(offset) || 0,
      include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'role'], required: false }]
    });

    return {
      total: result.count,
      logs: result.rows.map((l) => ({
        id: l.id,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        actor: l.user
          ? { id: l.user.id, name: `${l.user.firstName} ${l.user.lastName}`.trim(), email: l.user.email, role: l.user.role }
          : null,
        status: l.newValues?.status ?? null,
        details: l.newValues || null,
        ipAddress: l.ipAddress,
        createdAt: l.createdAt
      }))
    };
  }

  async grantRole({ userId, role, scopeType = 'org', scopeId = null }, grantedBy) {
    const isCustom = !ROLES[role] && (await models.CustomRole.findOne({ where: { key: role } }));
    if (!ROLES[role] && !isCustom) throw new ValidationError(`Unknown role: ${role}`);
    if (!SCOPE_LEVELS.includes(scopeType)) throw new ValidationError('Invalid scope type');
    if (scopeType !== 'org' && !scopeId) throw new ValidationError(`A ${scopeType} must be selected for this scope`);

    const user = await models.User.findByPk(userId);
    if (!user) throw new NotFoundError('User not found');

    // Validate the scope target exists.
    if (scopeType === 'program' && !(await models.Program.findByPk(scopeId))) throw new ValidationError('Program not found');
    if (scopeType === 'clan' && !(await models.Clan.findByPk(scopeId))) throw new ValidationError('Clan not found');

    const existing = await models.RoleAssignment.findOne({ where: { userId, role, scopeType, scopeId: scopeId || null } });
    if (existing) throw new ConflictError('This role is already assigned at this scope');

    const assignment = await models.RoleAssignment.create({ userId, role, scopeType, scopeId: scopeId || null, grantedBy });

    await createAuditLog({
      userId: grantedBy, action: 'ROLE_GRANTED', entityType: 'RoleAssignment', entityId: assignment.id,
      newValues: { targetUserId: userId, role, scopeType, scopeId }
    }).catch(() => {});

    return assignment;
  }

  /** The permission list a role confers (built-in or custom). '*' = all. */
  async _permissionsOfRole(role) {
    if (ROLES[role]) {
      const perms = ROLES[role].permissions || [];
      return perms.includes('*') ? [...ALL_PERMISSIONS] : perms;
    }
    const custom = await models.CustomRole.findOne({ where: { key: role }, attributes: ['permissions'] });
    return custom ? (custom.permissions || []) : null; // null = unknown role
  }

  /**
   * Grant a role on behalf of a non-super-admin DELEGATE (e.g. a lead mentor
   * assigning permissions inside their own clan). Two guardrails on top of the
   * normal grant:
   *   1. The role's scope must match `scopeType` (a clan delegate can only hand
   *      out clan-scoped roles — never an org/admin role).
   *   2. No privilege escalation: the granter must ALREADY hold every permission
   *      the role confers AT THAT SCOPE. So a lead mentor can only delegate a
   *      subset of what they themselves can do in that clan.
   * The route still gates that the granter manages the scope (CLAN_MANAGE_MEMBERS).
   */
  async grantScopedRoleAsDelegate({ userId, role, scopeType, scopeId }, granter) {
    if (!SCOPE_LEVELS.includes(scopeType)) throw new ValidationError('Invalid scope type');

    const builtIn = ROLES[role];
    const customRole = builtIn ? null : await models.CustomRole.findOne({ where: { key: role } });
    if (!builtIn && !customRole) throw new ValidationError(`Unknown role: ${role}`);
    const roleScope = builtIn ? builtIn.scope : customRole.scopeLevel;
    if (roleScope !== scopeType) {
      throw new ValidationError(`A ${role} role is ${roleScope}-scoped and cannot be granted at ${scopeType} scope`);
    }

    const perms = await this._permissionsOfRole(role);
    const resource = scopeType === 'clan'
      ? await authzService.scopeOfClan(scopeId)
      : scopeType === 'program' ? { programId: scopeId } : null;
    for (const perm of perms) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await authzService.can(granter, perm, resource))) {
        throw new ValidationError("You can't grant a role with more permissions than you hold here");
      }
    }

    return this.grantRole({ userId, role, scopeType, scopeId }, granter.id);
  }

  /**
   * Revoke a clan-scoped grant on behalf of a clan delegate — refuses to touch
   * anything that isn't a clan-scoped assignment ON THIS clan.
   */
  async revokeClanGrant(assignmentId, clanId, revokedBy) {
    const assignment = await models.RoleAssignment.findByPk(assignmentId);
    if (!assignment) throw new NotFoundError('Assignment not found');
    if (assignment.scopeType !== 'clan' || assignment.scopeId !== clanId) {
      throw new ValidationError('That grant does not belong to this clan');
    }
    return this.revokeRole(assignmentId, revokedBy);
  }

  async revokeRole(assignmentId, revokedBy) {
    const assignment = await models.RoleAssignment.findByPk(assignmentId);
    if (!assignment) throw new NotFoundError('Assignment not found');
    const snapshot = { targetUserId: assignment.userId, role: assignment.role, scopeType: assignment.scopeType, scopeId: assignment.scopeId };
    await assignment.destroy();
    await createAuditLog({
      userId: revokedBy, action: 'ROLE_REVOKED', entityType: 'RoleAssignment', entityId: assignmentId, oldValues: snapshot
    }).catch(() => {});
    return { revoked: true };
  }

  /**
   * Invite a not-yet-registered person and pre-assign them a role that's applied
   * automatically when they register. Unlike a placement invite, this carries no
   * program/clan placement - just an account (mentor/mentee base) plus the role
   * grant, stashed in the invite's metadata for authService.register to apply.
   */
  async inviteWithRole({ email, baseRole = 'mentor', role, scopeType = 'org', scopeId = null }, invitedBy) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(normalizedEmail)) throw new ValidationError('A valid email is required');
    if (!['mentor', 'mentee'].includes(baseRole)) throw new ValidationError('Invalid account type');

    const isCustom = !ROLES[role] && (await models.CustomRole.findOne({ where: { key: role } }));
    if (!ROLES[role] && !isCustom) throw new ValidationError(`Unknown role: ${role}`);
    if (!SCOPE_LEVELS.includes(scopeType)) throw new ValidationError('Invalid scope type');
    if ((scopeType === 'program' || scopeType === 'clan') && !scopeId) throw new ValidationError(`A ${scopeType} must be selected`);
    if (scopeType === 'program' && !(await models.Program.findByPk(scopeId))) throw new ValidationError('Program not found');
    if (scopeType === 'clan' && !(await models.Clan.findByPk(scopeId))) throw new ValidationError('Clan not found');

    const existingUser = await models.User.findOne({ where: { email: normalizedEmail } });
    if (existingUser) throw new ConflictError('A user already exists for this email - grant the role to them directly instead');
    const activeInvite = await models.RegistrationInvite.findOne({
      where: { email: normalizedEmail, usedAt: null, revokedAt: null, expiresAt: { [Op.gt]: new Date() } }
    });
    if (activeInvite) throw new ConflictError('An active invite already exists for this email');

    const rawToken = generateRandomToken();
    const invite = await models.RegistrationInvite.create({
      tokenHash: hashToken(rawToken),
      email: normalizedEmail,
      role: baseRole,
      invitedBy,
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      // Applied by authService.register once they sign up.
      metadata: { pendingGrants: [{ role, scopeType, scopeId: scopeId || null }] }
    });

    await createAuditLog({
      userId: invitedBy, action: 'ACCESS_INVITE_CREATED', entityType: 'RegistrationInvite', entityId: invite.id,
      newValues: { email: normalizedEmail, baseRole, role, scopeType, scopeId }
    }).catch(() => {});

    const base = (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].replace(/\/$/, '');
    const inviteUrl = `${base}/register?invite=${encodeURIComponent(rawToken)}`;
    const emailDelivery = await notificationOrchestrator
      .sendRegistrationInviteEmail({ email: normalizedEmail, role: baseRole, inviteUrl })
      .catch(() => ({ sent: false }));

    return { invite: { id: invite.id, email: normalizedEmail, role: baseRole, expiresAt: invite.expiresAt }, inviteUrl, emailDelivery };
  }
}

module.exports = new AccessService();
