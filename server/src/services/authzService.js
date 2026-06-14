const { Op } = require('sequelize');
const { models } = require('../db');
const { ROLES, roleGrants } = require('../config/roles');
const { ALL_PERMISSIONS, PERMISSIONS: P } = require('../config/permissions');
const { AuthorizationError } = require('../utils/errors/errorTypes');

// Permissions that mean "this person mentors someone" - holding any of these at
// a clan/program scope grants the mentor switch (drives getCapabilities).
const MENTOR_PERMISSIONS = [P.MENTEE_VIEW, P.MENTEE_MANAGE, P.TASK_ASSIGN, P.TASK_REVIEW];

// In-memory cache of admin-defined custom roles (key → { permissions[], scope }).
// Invalidated by accessService whenever a custom role changes.
let _customRoles = null;
async function loadCustomRoles() {
  if (_customRoles) return _customRoles;
  const rows = await models.CustomRole.findAll({ attributes: ['key', 'permissions', 'scopeLevel'] });
  _customRoles = {};
  for (const r of rows) _customRoles[r.key] = { permissions: r.permissions || [], scope: r.scopeLevel };
  return _customRoles;
}
function invalidateCustomRoles() { _customRoles = null; }

// Built-in roles that constitute "admin area" access (org/program tier - NOT
// clan roles like lead_mentor). Used by hasAdminAccess().
const ADMIN_TIER_ROLES = new Set(['super_admin', 'program_admin', 'intake_manager', 'people_admin', 'moderator', 'analyst']);

// Scope hierarchy for "minimum scope" checks (org is broadest).
const SCOPE_RANK = { org: 3, program: 2, clan: 1, self: 0 };

const roleExists = (key, custom) => Boolean(ROLES[key] || (custom && custom[key]));
const grants = (key, perm, custom) => {
  if (ROLES[key]) return roleGrants(key, perm);
  if (custom && custom[key]) return custom[key].permissions.includes(perm);
  return false;
};
// Same as grants(), but honours per-assignment exceptions (a co-mentor whose
// lead un-checked specific permissions). `assignment.deny` is the list of
// permissions revoked for THIS grant only.
const assignmentGrants = (assignment, perm, custom) =>
  grants(assignment.role, perm, custom) && !(assignment.deny && assignment.deny.includes(perm));

/**
 * Scoped RBAC engine. A user holds roles at scopes; a permission check asks:
 * "does any held role grant permission P at a scope that COVERS this resource?"
 *
 * Assignments come from two places, unioned:
 *   1. DERIVED (no setup needed) - capabilities, clan memberships, cross-clan.
 *   2. EXPLICIT - rows in role_assignments (admin-granted scoped roles).
 *
 * A `resource` descriptor names the ids that locate it in the hierarchy:
 *   { orgWide?, programId?, clanId?, userId? }
 * Scope coverage: org covers everything; program covers its programId; clan
 * covers its clanId; self covers the matching userId. Default deny.
 */
class AuthzService {
  /** All (role, scope) a user holds - derived + explicit, de-duplicated. */
  async getAssignments(user) {
    if (!user) return [];
    const custom = await loadCustomRoles();

    // Per-co-mentor permission exceptions, keyed by clan and INDEPENDENT of how
    // the person became a co-mentor (team membership / cross-clan cover / IAM
    // grant). Loaded once, then applied to every co_mentor@clan assignment below.
    const denyByClan = new Map();
    if (models.ClanMemberPermission) {
      const overrideRows = await models.ClanMemberPermission.findAll({
        where: { userId: user.id }, attributes: ['clanId', 'denied']
      });
      for (const r of overrideRows) {
        if (Array.isArray(r.denied) && r.denied.length) denyByClan.set(r.clanId, r.denied);
      }
    }

    const assignments = [];
    const seen = new Set();
    const add = (role, scopeType, scopeId = null) => {
      if (!roleExists(role, custom)) return;
      const key = `${role}:${scopeType}:${scopeId || ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      // A co-mentor's clan-scoped permissions can be individually revoked.
      const deny = (role === 'co_mentor' && scopeType === 'clan') ? (denyByClan.get(scopeId) || null) : null;
      assignments.push({ role, scopeType, scopeId, deny });
    };

    // 1a. Base account type → its home assignment. Elevated / cross-role access
    // comes from explicit RoleAssignments + clan memberships below — NOT the
    // stored `capabilities` array, which is legacy and no longer authoritative
    // (a mentee promoted to admin gets a super_admin RoleAssignment, not a cap).
    if (user.role === 'admin') add('super_admin', 'org');
    if (user.role === 'mentee') add('mentee', 'self', user.id);

    // 1b. Clan memberships → clan-scoped roles (lead_mentor / co_mentor / core_team / mentee).
    const memberships = await models.ClanMembership.findAll({
      where: { userId: user.id, status: 'active' },
      attributes: ['clanId', 'role']
    });
    for (const m of memberships) add(m.role, 'clan', m.clanId);

    // 1c. Cross-clan assignments → co-mentor access to another clan.
    //     Consent-first: only ACCEPTED (active) cover grants access; pending/declined
    //     requests grant nothing until the person accepts.
    if (models.CrossClanAssignment) {
      const cross = await models.CrossClanAssignment.findAll({
        where: { userId: user.id, status: 'active' },
        attributes: ['toClanId']
      });
      for (const c of cross) if (c.toClanId) add('co_mentor', 'clan', c.toClanId);
    }

    // 2. Explicit, admin-granted scoped roles.
    const explicit = await models.RoleAssignment.findAll({
      where: { userId: user.id },
      attributes: ['role', 'scopeType', 'scopeId']
    });
    for (const r of explicit) add(r.role, r.scopeType, r.scopeId);

    return assignments;
  }

  /** Does this assignment's scope cover the given resource descriptor? */
  _covers(assignment, resource) {
    const { scopeType, scopeId } = assignment;
    if (scopeType === 'org') return true;                       // org covers all
    if (!resource) return false;                                // scoped role needs a resource
    if (scopeType === 'program') return resource.programId === scopeId;
    if (scopeType === 'clan') return resource.clanId === scopeId;
    if (scopeType === 'self') return resource.userId === scopeId;
    return false;
  }

  /**
   * Core check. `resource` is optional for org-wide actions (e.g. user.manage),
   * which then require an org-scoped grant. Pass `opts.assignments` to reuse a
   * per-request fetch.
   */
  async can(user, permission, resource = null, opts = {}) {
    if (!user) return false;
    const custom = await loadCustomRoles();
    const assignments = opts.assignments || (await this.getAssignments(user));
    return assignments.some((a) => assignmentGrants(a, permission, custom) && this._covers(a, resource));
  }

  /** The set of permissions the user has for a resource - drives client UI. */
  async getEffectivePermissions(user, resource = null, opts = {}) {
    const custom = await loadCustomRoles();
    const assignments = opts.assignments || (await this.getAssignments(user));
    const granted = new Set();
    for (const perm of ALL_PERMISSIONS) {
      if (assignments.some((a) => assignmentGrants(a, perm, custom) && this._covers(a, resource))) granted.add(perm);
    }
    return [...granted];
  }

  /**
   * The union of permissions a user has at ANY scope - for client UI gating
   * (show/hide nav & buttons) where the exact resource isn't known yet. The
   * server still enforces the precise scoped check on every request.
   */
  async getPermissionUnion(user) {
    if (!user) return [];
    const custom = await loadCustomRoles();
    const assignments = await this.getAssignments(user);
    const granted = [];
    for (const perm of ALL_PERMISSIONS) {
      if (assignments.some((a) => assignmentGrants(a, perm, custom))) granted.push(perm);
    }
    return granted;
  }

  /**
   * Whether the user should be able to enter the admin area at all - i.e. they
   * hold an ORG- or PROGRAM-scoped elevated role (not merely a clan role like a
   * lead mentor). Drives the client's admin entry point + section guard.
   */
  async hasAdminAccess(user, opts = {}) {
    if (!user) return false;
    if (user.role === 'admin') return true;
    const custom = await loadCustomRoles();
    const assignments = opts.assignments || (await this.getAssignments(user));
    return assignments.some((a) =>
      ['org', 'program'].includes(a.scopeType) && (ADMIN_TIER_ROLES.has(a.role) || Boolean(custom[a.role]))
    );
  }

  /**
   * The platform "areas" a user may currently enter — the role-switcher list.
   * DERIVED from real facts on every read (never a stored array), so granting or
   * revoking a clan role / RoleAssignment / enrollment flips the switch
   * immediately and self-heals: there is no capability to leave dangling.
   *   admin  → admin account OR an org/program-tier elevated role
   *   mentor → mentor account OR any clan/program role that grants mentoring
   *            power (view/assign/review) OR cross-clan cover (co_mentor@clan)
   *   mentee → mentee account OR any active (non-dropped) enrollment
   */
  async getCapabilities(user, opts = {}) {
    if (!user) return [];
    const custom = await loadCustomRoles();
    const assignments = opts.assignments || (await this.getAssignments(user));
    const caps = new Set();

    if (await this.hasAdminAccess(user, { assignments })) caps.add('admin');

    const mentorsSomewhere = assignments.some((a) =>
      ['clan', 'program'].includes(a.scopeType) &&
      MENTOR_PERMISSIONS.some((perm) => assignmentGrants(a, perm, custom))
    );
    if (user.role === 'mentor' || mentorsSomewhere) caps.add('mentor');

    if (user.role === 'mentee') {
      caps.add('mentee');
    } else {
      const enrollment = await models.Enrollment.findOne({
        where: { menteeId: user.id, status: { [Op.notIn]: ['rejected', 'dropped'] } },
        attributes: ['id']
      });
      if (enrollment) caps.add('mentee');
    }

    return [...caps];
  }

  /**
   * Does the user hold `permission` at AT LEAST `minLevel` scope (org > program >
   * clan > self)? For org/program-level admin endpoints that a program_admin
   * should run but a clan mentor should not — e.g. mentee.manage is held by both
   * a program_admin (program) and a lead_mentor (clan); minLevel 'program' admits
   * the former and rejects the latter. Doesn't need a specific resource.
   */
  async canAtMinScope(user, permission, minLevel = 'program', opts = {}) {
    if (!user) return false;
    const min = SCOPE_RANK[minLevel] ?? 2;
    const custom = await loadCustomRoles();
    const assignments = opts.assignments || (await this.getAssignments(user));
    return assignments.some((a) => assignmentGrants(a, permission, custom) && (SCOPE_RANK[a.scopeType] ?? 0) >= min);
  }

  /**
   * Which programs does this admin's view/actions limit to?
   *   null  → unrestricted (an ORG-tier admin sees everything)
   *   [ids] → a program_admin: only these program ids
   *   []    → no admin program scope at all
   * Used to data-scope admin list endpoints + validate writes, so a program_admin
   * sees/touches only their program's invites/cohorts/enrollments/clans.
   */
  async adminProgramScope(user, opts = {}) {
    if (!user) return [];
    const custom = await loadCustomRoles();
    const assignments = opts.assignments || (await this.getAssignments(user));
    const isAdminRole = (role) => ADMIN_TIER_ROLES.has(role) || Boolean(custom[role]);
    // Any org-tier admin role → unrestricted.
    if (assignments.some((a) => a.scopeType === 'org' && isAdminRole(a.role))) return null;
    const ids = assignments
      .filter((a) => a.scopeType === 'program' && a.scopeId && isAdminRole(a.role))
      .map((a) => a.scopeId);
    return [...new Set(ids)];
  }

  /** Throw unless `programId` is within the admin's program scope (org = any). */
  async assertProgramInScope(user, programId, opts = {}) {
    const scope = await this.adminProgramScope(user, opts);
    if (scope === null) return true;
    if (!programId || !scope.includes(programId)) {
      throw new AuthorizationError('That program is outside your program scope');
    }
    return true;
  }

  /** Called by accessService when custom roles change. */
  invalidateCustomRoles() { invalidateCustomRoles(); }

  /**
   * Can `user` legitimately view mentee `menteeId`? True when it's themselves, an
   * admin, their directly-matched mentee, or a mentee in a clan where the user
   * holds a mentoring role (MENTEE_VIEW at that clan's scope — covers lead/co
   * mentor and cross-clan cover). This is the ownership check that replaces the
   * old "primary role === mentee" data-scoping, so a co-mentor sees the REAL
   * mentee and can't reach mentees outside their clans.
   */
  async canViewMentee(user, menteeId, opts = {}) {
    if (!user || !menteeId) return false;
    if (user.id === menteeId) return true;

    const assignments = opts.assignments || (await this.getAssignments(user));
    if (await this.hasAdminAccess(user, { assignments })) return true;

    const match = await models.MentorMenteeMatch.findOne({
      where: { mentorId: user.id, menteeId, status: 'active' }, attributes: ['id']
    });
    if (match) return true;

    const menteeClans = await models.ClanMembership.findAll({
      where: { userId: menteeId, status: 'active' }, attributes: ['clanId']
    });
    for (const c of menteeClans) {
      const resource = await this.scopeOfClan(c.clanId);
      if (await this.can(user, P.MENTEE_VIEW, resource, { assignments })) return true;
    }
    return false;
  }

  /**
   * Can `userId` act on `task` with one of `permissions` (any-of)? True for the
   * task's assigning mentor (kept for continuity), an admin, or anyone holding
   * the permission at the task's clan/program scope — a lead mentor, a co-mentor,
   * or accepted cross-clan cover — and it RESPECTS a co-mentor's revoked
   * permissions. This replaces the legacy `task.mentorId === you` ownership the
   * task/submission write paths used, which wrongly blocked every co-mentor (and
   * mis-fired for mentee-based co-mentors, since it keyed off the base role).
   */
  async canActOnTask(userId, task, permissions) {
    if (!userId || !task) return false;
    if (task.mentorId && task.mentorId === userId) return true; // the assigning mentor
    const user = await models.User.findByPk(userId, { attributes: ['id', 'role'] });
    if (!user) return false;
    const resource = await this.scopeOfAssignedTask(task.id);
    const assignments = await this.getAssignments(user);
    const perms = Array.isArray(permissions) ? permissions : [permissions];
    for (const p of perms) {
      if (await this.can(user, p, resource, { assignments })) return true;
    }
    return false;
  }

  // ── Scope resolvers (locate a resource in the hierarchy) ─────────────────────
  /** A clan resource: covers clan + its program. */
  async scopeOfClan(clanId) {
    if (!clanId) return null;
    const clan = await models.Clan.findByPk(clanId, { attributes: ['id', 'programId'] });
    return clan ? { clanId: clan.id, programId: clan.programId } : { clanId };
  }

  /** An assigned task: covers the mentee (self), their clan, and the program. */
  async scopeOfAssignedTask(taskId) {
    const task = await models.AssignedTask.findByPk(taskId, { attributes: ['id', 'menteeId', 'enrollmentId'] });
    if (!task) return null;
    const out = { userId: task.menteeId };
    if (task.enrollmentId) {
      const enr = await models.Enrollment.findByPk(task.enrollmentId, { attributes: ['programId'] });
      if (enr) out.programId = enr.programId;
    }
    const membership = await models.ClanMembership.findOne({
      where: { userId: task.menteeId, status: 'active' }, attributes: ['clanId']
    });
    if (membership) out.clanId = membership.clanId;
    return out;
  }

  /**
   * Every clan a user MENTORS, from ALL sources — clan membership (lead/co/core),
   * an explicit clan-scoped role grant (RoleAssignment), and accepted cross-clan
   * cover. The mentor data views (cohort, My Mentees) use this so a co-mentor
   * added via "Grant role" sees the clan's mentees just like one added via the
   * clan's "Add to team".
   */
  async mentoredClanIds(userId) {
    if (!userId) return [];
    const MENTOR_CLAN_ROLES = ['lead_mentor', 'co_mentor', 'core_team'];
    const set = new Set();

    const memberships = await models.ClanMembership.findAll({
      where: { userId, status: 'active', role: { [Op.in]: MENTOR_CLAN_ROLES } }, attributes: ['clanId'],
    });
    memberships.forEach((m) => m.clanId && set.add(m.clanId));

    const grants = await models.RoleAssignment.findAll({
      where: { userId, scopeType: 'clan', role: { [Op.in]: MENTOR_CLAN_ROLES } }, attributes: ['scopeId'],
    });
    grants.forEach((g) => g.scopeId && set.add(g.scopeId));

    if (models.CrossClanAssignment) {
      const cover = await models.CrossClanAssignment.findAll({
        where: { userId, status: 'active' }, attributes: ['toClanId'],
      });
      cover.forEach((c) => c.toClanId && set.add(c.toClanId));
    }
    return [...set];
  }

  /** A mentee: their self scope + the clan/program they're currently placed in. */
  async scopeOfMentee(menteeId) {
    if (!menteeId) return null;
    const out = { userId: menteeId };
    const membership = await models.ClanMembership.findOne({
      where: { userId: menteeId, status: 'active' }, attributes: ['clanId']
    });
    if (membership) {
      out.clanId = membership.clanId;
      const clan = await models.Clan.findByPk(membership.clanId, { attributes: ['programId'] });
      if (clan) out.programId = clan.programId;
    }
    return out;
  }

  /** An enrollment: its program + the mentee (self) + their clan. */
  async scopeOfEnrollment(enrollmentId) {
    if (!enrollmentId) return null;
    const enr = await models.Enrollment.findByPk(enrollmentId, { attributes: ['menteeId', 'programId'] });
    if (!enr) return null;
    const out = { userId: enr.menteeId, programId: enr.programId };
    const membership = await models.ClanMembership.findOne({
      where: { userId: enr.menteeId, status: 'active' }, attributes: ['clanId']
    });
    if (membership) out.clanId = membership.clanId;
    return out;
  }

  /** A submission resolves to the clan/program/mentee of its assigned task. */
  async scopeOfSubmission(submissionId) {
    if (!submissionId) return null;
    const sub = await models.TaskSubmission.findByPk(submissionId, { attributes: ['assignedTaskId'] });
    if (!sub) return null;
    return this.scopeOfAssignedTask(sub.assignedTaskId);
  }

  /** A delay/blocker event → its task's scope, or the mentee's scope. */
  async scopeOfDelay(delayId) {
    if (!delayId) return null;
    const d = await models.DelayEvent.findByPk(delayId, { attributes: ['menteeId', 'assignedTaskId'] });
    if (!d) return null;
    if (d.assignedTaskId) return this.scopeOfAssignedTask(d.assignedTaskId);
    return this.scopeOfMentee(d.menteeId);
  }

  /** An announcement's scope from its audience: clan/program-scoped, else org. */
  scopeOfAnnouncementAudience(audience, audienceId) {
    if (audience === 'clan' && audienceId) return this.scopeOfClan(audienceId);
    if (audience === 'program' && audienceId) return { programId: audienceId };
    return null; // 'all' / 'mentors' / 'mentees' → org-wide (only org roles cover)
  }

  async scopeOfAnnouncement(announcementId) {
    if (!announcementId) return null;
    const a = await models.Announcement.findByPk(announcementId, { attributes: ['audience', 'audienceId'] });
    if (!a) return null;
    return this.scopeOfAnnouncementAudience(a.audience, a.audienceId);
  }

  /** A track (mentee work lane) → the mentee's scope. */
  async scopeOfTrack(trackId) {
    if (!trackId) return null;
    const t = await models.Track.findByPk(trackId, { attributes: ['menteeId'] });
    if (!t) return null;
    return this.scopeOfMentee(t.menteeId);
  }
}

module.exports = new AuthzService();
