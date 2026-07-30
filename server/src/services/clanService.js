const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError, ConflictError, AuthorizationError } = require('../utils/errors/errorTypes');
const { createAuditLog } = require('../utils/auditContext');
const { ROLES } = require('../config/roles');
const authzService = require('./authzService');
const { PERMISSIONS: P } = require('../config/permissions');

// The permissions a co-mentor holds by default — and therefore the exact set a
// lead mentor / admin may toggle on or off for an individual co-mentor. Derived
// from the co_mentor role bundle so it can never drift from the source of truth.
const CO_MENTOR_PERMISSIONS = ROLES.co_mentor.permissions;

/**
 * Clan service - clans are mentor-led groups inside a Program. A mentee is
 * placed into a clan (clan-based assignment, replacing 1:1 matching) and
 * inherits the clan's mentor(s). Membership roles are clan-scoped.
 */

// Which platform capability a clan role implies.
const CAPABILITY_FOR_CLAN_ROLE = {
  lead_mentor: 'mentor',
  co_mentor: 'mentor',
  core_team: 'mentor',
  mentee: 'mentee'
};

// The mentor-side roles. A person holds AT MOST ONE of these per clan (they
// swap in place), and independently may also be a 'mentee' of the same clan.
const MENTOR_CLAN_ROLES = ['lead_mentor', 'co_mentor', 'core_team'];

// Most → least authority, for collapsing a dual-role member to the single role
// a UI needs to name ("what am I here?").
const ROLE_RANK = { lead_mentor: 3, core_team: 2, co_mentor: 1, mentee: 0 };
const strongestRole = (roles) =>
  [...roles].sort((a, b) => (ROLE_RANK[b] ?? -1) - (ROLE_RANK[a] ?? -1))[0] || null;

class ClanService {
  /**
   * Ensure a user holds a platform capability (adds it if missing). Used when
   * an admin/lead assigns a clan role, so the user can switch into that view.
   */
  async ensureCapability(user, capability, transaction) {
    const caps = Array.isArray(user.capabilities) ? user.capabilities : [];
    if (!caps.includes(capability)) {
      user.capabilities = [...caps, capability];
      await user.save({ transaction });
    }
    return user;
  }

  async listClans({ programId, programIds, status, userId, search, page, limit } = {}) {
    const { Op } = require('sequelize');
    const where = {};
    if (Array.isArray(programIds)) {
      const allowed = programId ? programIds.filter((id) => id === programId) : programIds;
      where.programId = { [Op.in]: allowed };
    } else if (programId) {
      where.programId = programId;
    }
    if (status) where.status = status;

    // Full-text-ish search across name, tags, program name and lead-mentor name.
    const term = (search || '').trim();
    if (term) {
      const like = `%${term}%`;
      where[Op.or] = [
        { name: { [Op.iLike]: like } },
        sequelize.where(sequelize.fn('array_to_string', sequelize.col('Clan.tags'), ' '), { [Op.iLike]: like }),
        sequelize.where(sequelize.col('program.name'), { [Op.iLike]: like }),
        sequelize.where(
          sequelize.fn('concat', sequelize.col('leadMentor.first_name'), ' ', sequelize.col('leadMentor.last_name')),
          { [Op.iLike]: like }
        )
      ];
    }

    const baseInclude = [
      { model: models.Program, as: 'program', attributes: ['id', 'name', 'status'] },
      { model: models.User, as: 'leadMentor', attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'] }
    ];

    // ── Paginated mode (admin list): capped page + grouped member counts ──────
    if (limit != null) {
      const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 20));
      const parsedPage = Math.max(1, Number(page) || 1);
      const { rows, count } = await models.Clan.findAndCountAll({
        where,
        include: baseInclude, // belongsTo only → safe with limit, no row multiplication
        order: [['createdAt', 'DESC']],
        limit: parsedLimit,
        offset: (parsedPage - 1) * parsedLimit,
        distinct: true,
        subQuery: false // so the search can reference joined program/leadMentor columns
      });

      // One grouped query for this page's member counts (avoids hasMany + limit).
      const ids = rows.map((c) => c.id);
      const countsByClan = {};
      if (ids.length) {
        const grouped = await models.ClanMembership.findAll({
          where: { clanId: { [Op.in]: ids }, status: 'active' },
          attributes: ['clanId', 'role', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
          group: ['clanId', 'role'],
          raw: true
        });
        for (const g of grouped) {
          const c = (countsByClan[g.clanId] ||= { menteeCount: 0, mentorCount: 0 });
          if (g.role === 'mentee') c.menteeCount += Number(g.n);
          else if (String(g.role).includes('mentor') || g.role === 'core_team') c.mentorCount += Number(g.n);
        }
      }
      const clans = rows.map((c) => {
        const json = c.toJSON();
        json.menteeCount = countsByClan[c.id]?.menteeCount || 0;
        json.mentorCount = countsByClan[c.id]?.mentorCount || 0;
        return json;
      });
      return { clans, total: count, page: parsedPage, limit: parsedLimit };
    }

    // ── Unpaginated mode (dropdowns/pickers): lean + a hard runaway guard ─────
    const clans = await models.Clan.findAll({
      where,
      include: baseInclude,
      order: [['createdAt', 'DESC']],
      subQuery: false,
      limit: 1000
    });
    return clans;
  }

  async getClanById(clanId) {
    const { Op } = require('sequelize');
    const clan = await models.Clan.findByPk(clanId, {
      include: [
        { model: models.Program, as: 'program', attributes: ['id', 'name', 'status'] },
        { model: models.User, as: 'leadMentor', attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'] },
        {
          model: models.ClanMembership,
          as: 'memberships',
          required: false,
          // Include paused mentees too (they stay in the clan) so the admin can
          // see and resume them here. The `status` field tells them apart.
          where: { status: { [Op.in]: ['active', 'paused'] } },
          include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl', 'role'] }]
        }
      ]
    });

    if (!clan) throw new NotFoundError('Clan not found');

    // Co-mentors / core-team can also be granted via the scoped-RBAC RoleAssignment
    // table (Admin → Roles & Access) WITHOUT a clan_memberships row. The permission
    // layer reads both, but the roster here historically only read clan_memberships,
    // so an IAM-granted co-mentor was invisible on the Clan Team page even though
    // their access worked. Merge those grants in so the displayed team matches the
    // people who actually mentor the clan. (Membership rows win on conflict.)
    // Keyed by user AND role: someone can legitimately appear twice (a mentee of
    // this clan who also co-mentors it), so a per-user key would swallow one of
    // the two — which is exactly the roster row a dual-role member was missing.
    const out = clan.toJSON();
    const memberships = out.memberships || [];
    const key = (userId, role) => `${userId}:${role}`;
    const seenRoles = new Set(memberships.map((m) => key(m.userId, m.role)));

    const grants = await models.RoleAssignment.findAll({
      where: { scopeType: 'clan', scopeId: clanId, role: { [Op.in]: MENTOR_CLAN_ROLES } },
      attributes: ['id', 'userId', 'role'],
    });
    const missing = grants.filter((g) => g.userId && !seenRoles.has(key(g.userId, g.role)));
    if (missing.length) {
      const users = await models.User.findAll({
        where: { id: { [Op.in]: [...new Set(missing.map((g) => g.userId))] } },
        attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl', 'role'],
      });
      const userById = new Map(users.map((u) => [u.id, u.toJSON()]));
      for (const g of missing) {
        if (seenRoles.has(key(g.userId, g.role))) continue; // de-dupe across multiple grants
        const u = userById.get(g.userId);
        if (!u) continue;
        seenRoles.add(key(g.userId, g.role));
        memberships.push({
          id: `ra-${g.id}`,        // synthetic — there's no clan_memberships row
          clanId,
          userId: g.userId,
          role: g.role,
          status: 'active',
          source: 'role_assignment', // lets the UI/remove path know it's IAM-granted
          user: u,
        });
      }
    }
    out.memberships = memberships;
    return out;
  }

  async createClan(data, createdBy) {
    const { programId, name } = data;
    if (!programId || !name) {
      throw new ValidationError('programId and name are required');
    }

    const program = await models.Program.findByPk(programId);
    if (!program) throw new NotFoundError('Program not found');

    return sequelize.transaction(async (transaction) => {
      const clan = await models.Clan.create({
        programId,
        name,
        description: data.description || null,
        leadMentorId: data.leadMentorId || null,
        tags: Array.isArray(data.tags) ? data.tags : [],
        levels: Array.isArray(data.levels) ? data.levels : [],
        countries: Array.isArray(data.countries) ? data.countries : [],
        maxMentees: data.maxMentees || 25,
        status: data.status || 'active',
        createdBy
      }, { transaction });

      // If a lead mentor was provided, also create their lead_mentor membership
      // and ensure they hold the mentor capability.
      if (data.leadMentorId) {
        const leadUser = await models.User.findByPk(data.leadMentorId, { transaction });
        if (!leadUser) throw new NotFoundError('Lead mentor user not found');
        await this.ensureCapability(leadUser, 'mentor', transaction);
        await models.ClanMembership.create({
          clanId: clan.id,
          userId: data.leadMentorId,
          role: 'lead_mentor',
          status: 'active'
        }, { transaction });
      }

      return clan;
    });
  }

  async updateClan(clanId, updates) {
    const { Op } = require('sequelize');
    return sequelize.transaction(async (transaction) => {
      const clan = await models.Clan.findByPk(clanId, { transaction });
      if (!clan) throw new NotFoundError('Clan not found');

      const prevLeadId = clan.leadMentorId;
      const allowed = ['name', 'description', 'tags', 'levels', 'countries', 'maxMentees', 'status', 'healthStatus'];
      allowed.forEach((key) => {
        if (updates[key] !== undefined) clan[key] = updates[key];
      });

      // Lead change is more than an FK: the new lead must be a real lead_mentor
      // member (with the mentor capability), and the old lead steps down — so
      // mentored-clan queries and the team view stay correct.
      if (updates.leadMentorId !== undefined && (updates.leadMentorId || null) !== (prevLeadId || null)) {
        const newLeadId = updates.leadMentorId || null;
        clan.leadMentorId = newLeadId;
        if (newLeadId) {
          const leadUser = await models.User.findByPk(newLeadId, { transaction });
          if (!leadUser) throw new NotFoundError('Lead mentor user not found');
          await this.ensureCapability(leadUser, 'mentor', transaction);
          // Reuse a mentor-role row if they already help here; never repurpose a
          // mentee row. Otherwise create their lead_mentor membership.
          const existing = await models.ClanMembership.findOne({
            where: { clanId, userId: newLeadId, role: { [Op.in]: MENTOR_CLAN_ROLES } }, transaction,
          });
          if (existing) { existing.role = 'lead_mentor'; existing.status = 'active'; await existing.save({ transaction }); }
          else { await models.ClanMembership.create({ clanId, userId: newLeadId, role: 'lead_mentor', status: 'active' }, { transaction }); }
        }
        // Previous lead steps down (a clan has one lead).
        if (prevLeadId && prevLeadId !== newLeadId) {
          await models.ClanMembership.update(
            { status: 'removed' },
            { where: { clanId, userId: prevLeadId, role: 'lead_mentor' }, transaction }
          );
        }
      }

      await clan.save({ transaction });
      return clan;
    });
  }

  /**
   * Add (or reactivate) a member in a clan with a clan-scoped role. This is the
   * clan-based assignment entry point: assigning a mentee here is how they're
   * "matched". Ensures the user gains the implied platform capability.
   *
   * Roles are GRANTED, not swapped wholesale: adding someone as a co-mentor
   * leaves an existing mentee membership intact (a mentee promoted to co-mentor
   * of their own clan stays a mentee there — still on the roster, still gets
   * tasks). Only the mentor roles are mutually exclusive with each other, so
   * lead_mentor / co_mentor / core_team reuse the one mentor row.
   */
  async addMember(clanId, { userId, role, enrollmentId }, actor = null) {
    const { Op } = require('sequelize');
    if (!userId || !role) throw new ValidationError('userId and role are required');
    if (!CAPABILITY_FOR_CLAN_ROLE[role]) throw new ValidationError(`Invalid clan role: ${role}`);

    if (actor) {
      const resource = await authzService.scopeOfClan(clanId);
      const canManageTeam = await authzService.can(actor, P.CLAN_MANAGE_MEMBERS, resource);
      const canAddMentee = role === 'mentee' && await authzService.can(actor, P.MENTEE_ADD, resource);
      if (!canManageTeam && !canAddMentee) {
        throw new AuthorizationError('You do not have permission to perform this action');
      }
    }

    const clan = await models.Clan.findByPk(clanId);
    if (!clan) throw new NotFoundError('Clan not found');

    const user = await models.User.findByPk(userId);
    if (!user) throw new NotFoundError('User not found');

    // One mentee placement per person. If they're already an active/paused mentee
    // — of this clan or another — refuse with a message that names where, instead
    // of silently creating a second placement. Re-adding a REMOVED mentee is fine
    // (that row isn't active), and this never touches mentor-role grants.
    if (role === 'mentee') {
      const placed = await models.ClanMembership.findOne({
        where: { userId, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } },
        include: [{ model: models.Clan, as: 'clan', attributes: ['id', 'name'] }],
      });
      if (placed) {
        const who = `${user.firstName} ${user.lastName}`.trim() || user.email;
        throw new ConflictError(
          placed.clanId === clanId
            ? `${who} is already a mentee of this clan.`
            : `${who} is already a mentee of "${placed.clan?.name || 'another clan'}". A person can be a mentee of only one clan at a time — reassign them instead.`
        );
      }
    }

    const membership = await sequelize.transaction(async (transaction) => {
      await this.ensureCapability(user, CAPABILITY_FOR_CLAN_ROLE[role], transaction);

      // The row this grant occupies: the person's mentor row (whatever role it
      // currently names) for a mentor role, or their mentee row for 'mentee'.
      // Never the other one — that's what used to clobber the mentee.
      const slot = role === 'mentee' ? { role: 'mentee' } : { role: { [Op.in]: MENTOR_CLAN_ROLES } };
      let membership = await models.ClanMembership.findOne({
        where: { clanId, userId, ...slot },
        order: [[sequelize.literal(`(status = 'active') DESC`)]], // prefer a live row over a removed one
        transaction
      });
      if (membership) {
        membership.role = role;
        membership.status = 'active';
        membership.leftAt = null;
        if (enrollmentId) membership.enrollmentId = enrollmentId;
        await membership.save({ transaction });
      } else {
        membership = await models.ClanMembership.create({
          clanId,
          userId,
          role,
          status: 'active',
          enrollmentId: enrollmentId || null
        }, { transaction });
      }

      // Keep the clan's lead_mentor pointer in sync when assigning a lead.
      if (role === 'lead_mentor' && clan.leadMentorId !== userId) {
        clan.leadMentorId = userId;
        await clan.save({ transaction });
      }

      // Placing a mentee in a clan IS their placement - make sure they have an
      // active enrollment in the clan's program so the mentee dashboard reflects
      // it and tasks (which require an enrollment) can be assigned to them.
      if (role === 'mentee') {
        let enrollment = await models.Enrollment.findOne({
          where: { menteeId: userId, programId: clan.programId },
          transaction
        });
        if (!enrollment) {
          enrollment = await models.Enrollment.create({
            menteeId: userId,
            programId: clan.programId,
            status: 'active',
            enrolledAt: new Date()
          }, { transaction });
        } else if (['rejected', 'dropped'].includes(enrollment.status)) {
          enrollment.status = 'active';
          await enrollment.save({ transaction });
        }
        if (membership.enrollmentId !== enrollment.id) {
          membership.enrollmentId = enrollment.id;
          await membership.save({ transaction });
        }
      }

      return membership;
    });

    // Audit who added whom — especially a co-mentor using mentee.add — so leads
    // and admins have an accountability trail. Internal/system placements pass
    // no actor and are intentionally not attributed here.
    if (actor) {
      await createAuditLog({
        userId: actor.id, action: 'CLAN_MEMBER_ADDED', entityType: 'Clan', entityId: clanId,
        newValues: { clanId, userId, role }
      }).catch(() => {});
    }

    return membership;
  }

  /**
   * Remove ONE role from a clan member, or (with no `role`) evict them entirely.
   * Removing a mentee-and-co-mentor's co-mentor role must not also unassign them
   * as a mentee — hence the role-scoped delete. Callers that mean "get this
   * person out of the clan" simply omit `role`.
   */
  async removeMember(clanId, userId, role = null) {
    const { Op } = require('sequelize');
    if (role && !CAPABILITY_FOR_CLAN_ROLE[role]) throw new ValidationError(`Invalid clan role: ${role}`);

    const memberships = await models.ClanMembership.findAll({
      where: { clanId, userId, ...(role ? { role } : {}) }
    });

    // A co-mentor / core-team member may instead (or also) be granted via the
    // scoped-RBAC RoleAssignment table. Revoke that here too — otherwise the IAM
    // grant keeps them a co-mentor and they'd reappear on the team after "remove".
    // Dropping only the 'mentee' role leaves any mentor grant alone.
    const grantRoles = role ? [role].filter((r) => r !== 'mentee') : ['co_mentor', 'core_team'];
    const revoked = grantRoles.length
      ? await models.RoleAssignment.destroy({
        where: { userId, scopeType: 'clan', scopeId: clanId, role: { [Op.in]: grantRoles } }
      })
      : 0;

    if (!memberships.length && !revoked) throw new NotFoundError('Membership not found');

    for (const membership of memberships) {
      membership.status = 'removed';
      membership.leftAt = new Date();
      await membership.save();
    }

    return memberships[0] || { clanId, userId, role, status: 'removed', source: 'role_assignment' };
  }

  /** The permission keys a lead/admin may toggle for a co-mentor (the defaults). */
  coMentorPermissionKeys() {
    return [...CO_MENTOR_PERMISSIONS];
  }

  /**
   * What the current user may do in THIS clan — clan-scoped, matches route guards.
   * Drives the mentor clan-team UI (so co-mentor "Add mentees" aligns with the API).
   */
  async getMyClanAccess(clanId, user) {
    const userId = user.id;
    const resource = await authzService.scopeOfClan(clanId);

    // Derive capabilities from authzService so this matches the route guards for
    // a co-mentor from ANY source — a team membership, a cross-clan cover, or an
    // IAM grant — not just a clan_memberships row. (A membership-only check here
    // would 403 a legitimate cover/IAM co-mentor that the API actually allows.)
    const canManageTeam = await authzService.can(user, P.CLAN_MANAGE_MEMBERS, resource);
    const canAddMentees = canManageTeam || await authzService.can(user, P.MENTEE_ADD, resource);
    const canViewMentees = await authzService.can(user, P.MENTEE_VIEW, resource);

    if (!canManageTeam && !canAddMentees && !canViewMentees) {
      throw new AuthorizationError('You are not a mentor of this clan');
    }

    // Prefer the real membership role; fall back to an inferred role for
    // cover/IAM co-mentors who hold capability without a membership row. A
    // dual-role member (mentee + co-mentor here) has several rows — this view is
    // the MENTOR one, so name their strongest role, never 'mentee'.
    const memberships = await models.ClanMembership.findAll({
      where: { clanId, userId, status: 'active' },
      attributes: ['role']
    });
    const role = strongestRole(memberships.map((m) => m.role))
      || (canManageTeam ? 'lead_mentor' : 'co_mentor');

    return { role, canManageTeam, canAddMentees };
  }

  /**
   * Is `userId` a co-mentor of `clanId` via ANY path — team membership, an
   * accepted cross-clan cover, or an IAM role grant? This is what makes a
   * permission override legitimate (and is why the override is keyed by
   * clan+user, not by a single membership row).
   */
  async isCoMentorInClan(clanId, userId) {
    const membership = await models.ClanMembership.findOne({
      where: { clanId, userId, role: 'co_mentor', status: 'active' }, attributes: ['id']
    });
    if (membership) return true;

    if (models.CrossClanAssignment) {
      const cover = await models.CrossClanAssignment.findOne({
        where: { userId, toClanId: clanId, status: 'active' }, attributes: ['id']
      });
      if (cover) return true;
    }

    const grant = await models.RoleAssignment.findOne({
      where: { userId, role: 'co_mentor', scopeType: 'clan', scopeId: clanId }, attributes: ['id']
    });
    return Boolean(grant);
  }

  /** The permissions currently revoked for one co-mentor in a clan (the toggle state). */
  async getMemberPermissions(clanId, userId) {
    if (!(await this.isCoMentorInClan(clanId, userId))) {
      throw new ValidationError('That person is not a co-mentor of this clan');
    }
    const row = await models.ClanMemberPermission.findOne({ where: { clanId, userId }, attributes: ['denied'] });
    return { keys: [...CO_MENTOR_PERMISSIONS], denied: (row && row.denied) || [] };
  }

  /**
   * Fine-tune ONE co-mentor's permissions within a clan. A co-mentor starts with
   * every default permission; passing `denied` (a subset of the toggleable keys)
   * revokes exactly those for this person, in this clan only — no matter how they
   * became a co-mentor. An empty list restores full parity (the row is removed).
   *
   * Authorization (lead-mentor-of-this-clan OR admin) is enforced by the route's
   * `clan.manage_members @ clan` guard, which co-mentors deliberately don't hold.
   */
  async setMemberPermissions(clanId, userId, denied, actorId = null) {
    if (!(await this.isCoMentorInClan(clanId, userId))) {
      throw new ValidationError('That person is not a co-mentor of this clan');
    }

    // Keep only valid, toggleable keys — silently drop anything unknown so a
    // stale client can never deny a permission outside the co-mentor scope.
    const allowed = new Set(CO_MENTOR_PERMISSIONS);
    const cleaned = [...new Set((Array.isArray(denied) ? denied : []).filter((p) => allowed.has(p)))];

    if (!cleaned.length) {
      await models.ClanMemberPermission.destroy({ where: { clanId, userId } });
    } else {
      const [row, created] = await models.ClanMemberPermission.findOrCreate({
        where: { clanId, userId },
        defaults: { clanId, userId, denied: cleaned, updatedBy: actorId }
      });
      if (!created) {
        row.denied = cleaned;
        row.updatedBy = actorId;
        await row.save();
      }
    }

    await createAuditLog({
      userId: actorId, action: 'CO_MENTOR_PERMISSIONS_UPDATED', entityType: 'Clan', entityId: clanId,
      newValues: { clanId, userId, denied: cleaned }
    }).catch(() => {});

    return { clanId, userId, denied: cleaned };
  }

  /**
   * Reassign a mentee to a different clan (fix an accidental placement). Removes
   * their current mentee membership(s) and places them in `toClanId`.
   *   - Same program → keep the enrollment (and its tasks): just move the group.
   *   - Different program → WIPE the old enrollment, its assigned tasks and
   *     matches (a clean transfer — "remove all prev links"), then create a
   *     fresh enrollment in the new clan's program.
   */
  async reassignMentee(menteeId, toClanId, actorId = null) {
    const toClan = await models.Clan.findByPk(toClanId, { attributes: ['id', 'programId'] });
    if (!toClan) throw new NotFoundError('Target clan not found');
    const mentee = await models.User.findByPk(menteeId, { attributes: ['id'] });
    if (!mentee) throw new NotFoundError('Mentee not found');

    const oldMemberships = await models.ClanMembership.findAll({
      where: { userId: menteeId, role: 'mentee', status: 'active' },
      include: [{ model: models.Clan, as: 'clan', attributes: ['id', 'programId'] }]
    });
    if (oldMemberships.some((m) => m.clanId === toClanId)) {
      throw new ValidationError('That mentee is already in this clan');
    }

    const wiped = [];
    await sequelize.transaction(async (transaction) => {
      for (const m of oldMemberships) {
        m.status = 'removed';
        m.leftAt = new Date();
        await m.save({ transaction });

        const crossProgram = m.clan && m.clan.programId !== toClan.programId;
        if (!crossProgram) continue;

        // Clean transfer: drop the old program's enrollment + everything on it.
        const enrollment = m.enrollmentId
          ? await models.Enrollment.findByPk(m.enrollmentId, { transaction })
          : await models.Enrollment.findOne({ where: { menteeId, programId: m.clan.programId }, transaction });
        if (enrollment) {
          await models.MentorMenteeMatch.update({ status: 'cancelled' }, { where: { enrollmentId: enrollment.id, status: 'active' }, transaction });
          await models.AssignedTask.destroy({ where: { enrollmentId: enrollment.id }, transaction });
          await enrollment.destroy({ transaction });
          wiped.push(enrollment.id);
        }
      }
    });

    // Place them in the new clan (creates/activates the enrollment in its program).
    await this.addMember(toClanId, { userId: menteeId, role: 'mentee' });

    await createAuditLog({
      userId: actorId, action: 'MENTEE_REASSIGNED', entityType: 'ClanMembership', entityId: toClanId,
      newValues: { menteeId, toClanId, fromClanIds: oldMemberships.map((m) => m.clanId), wipedEnrollments: wiped }
    }).catch(() => {});

    return { reassigned: true, toClanId, movedFrom: oldMemberships.map((m) => m.clanId), wipedEnrollments: wiped };
  }

  /**
   * People a lead mentor can pull into their clan AS A MENTEE. Anyone active who
   * isn't already placed as a mentee somewhere — INCLUDING mentors, who can learn
   * in one clan while mentoring another (a mentor and a mentee are the same kind
   * of account; the difference is the clan role, not the base role). Optional `q`
   * filters by name/email.
   *
   * Two deliberate exclusions:
   *   - already an active mentee in ANY clan → one mentee placement at a time, so
   *     a person is never a mentee of two clans at once (mentoring is unlimited).
   *   - platform admins → a super-admin as someone's mentee is never intended.
   *
   * A co-mentor with no mentee placement DOES appear here (that's the point), and
   * so does a co-mentor of THIS clan — adding them makes them a mentee here too,
   * the supported mentee-and-co-mentor dual role.
   */
  async listAvailableMembers({ q } = {}) {
    const { Op } = require('sequelize');
    const assigned = await models.ClanMembership.findAll({
      where: { status: { [Op.in]: ['active', 'paused'] }, role: 'mentee' }, attributes: ['userId']
    });
    const assignedIds = [...new Set(assigned.map((m) => m.userId).filter(Boolean))];

    const where = { role: { [Op.ne]: 'admin' }, status: 'active' };
    if (assignedIds.length) where.id = { [Op.notIn]: assignedIds };
    if (q && q.trim()) {
      const like = { [Op.iLike]: `%${q.trim()}%` };
      where[Op.and] = [{ [Op.or]: [{ firstName: like }, { lastName: like }, { email: like }] }];
    }
    const users = await models.User.findAll({
      where,
      attributes: ['id', 'firstName', 'lastName', 'email', 'role'],
      order: [['firstName', 'ASC']],
      limit: 50
    });
    return users.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() || u.email, email: u.email, role: u.role }));
  }

  /**
   * Candidates a lead/admin can add to THIS clan as a co-mentor / core-team
   * member: ANY active user (mentor OR mentee — anyone can co-mentor) who isn't
   * already an active member here. This is the single, consistent picker source
   * for both the admin and the mentor "add to team" UIs.
   */
  async listCandidates(clanId, { q } = {}) {
    const { Op } = require('sequelize');
    // Exclude only people who ALREADY hold a mentor role in this clan (lead/co/
    // core) — keep this clan's MENTEES in the list so they can be promoted to
    // co-mentor, and of course include everyone outside the clan.
    const mentors = await models.ClanMembership.findAll({
      where: { clanId, status: 'active', role: { [Op.in]: MENTOR_CLAN_ROLES } },
      attributes: ['userId']
    });
    const excludeIds = [...new Set(mentors.map((m) => m.userId).filter(Boolean))];

    const where = { status: 'active' };
    if (excludeIds.length) where.id = { [Op.notIn]: excludeIds };
    if (q && q.trim()) {
      const like = { [Op.iLike]: `%${q.trim()}%` };
      where[Op.and] = [{ [Op.or]: [{ firstName: like }, { lastName: like }, { email: like }] }];
    }
    const users = await models.User.findAll({
      where,
      attributes: ['id', 'firstName', 'lastName', 'email', 'role', 'profilePictureUrl'],
      order: [['firstName', 'ASC']],
      limit: 25
    });
    return users.map((u) => ({
      id: u.id, firstName: u.firstName, lastName: u.lastName,
      name: `${u.firstName} ${u.lastName}`.trim() || u.email,
      email: u.email, role: u.role, profilePictureUrl: u.profilePictureUrl || null
    }));
  }

  /**
   * Lead mentor invites a new person straight into their clan as a mentee.
   * Reuses the registration-invite flow, pre-scoped to the clan + its program.
   */
  async inviteToClan(clanId, email, invitedBy) {
    if (!email || !email.trim()) throw new ValidationError('Email is required');
    const clan = await models.Clan.findByPk(clanId);
    if (!clan) throw new NotFoundError('Clan not found');
    const adminService = require('./adminService');
    return adminService.createRegistrationInvite(
      { email: email.trim(), role: 'mentee', clanId, programId: clan.programId },
      invitedBy
    );
  }

  async getMembershipsForUser(userId) {
    const { Op } = require('sequelize');
    const direct = await models.ClanMembership.findAll({
      where: { userId, status: 'active' },
      include: [{ model: models.Clan, as: 'clan', attributes: ['id', 'name', 'programId', 'status'] }],
      order: [['joinedAt', 'DESC']]
    });
    const out = direct.map((m) => m.toJSON());
    const seen = new Set(out.map((m) => m.clanId));

    // Clans the user mentors via a scoped-RBAC grant (Roles & Access) but has no
    // clan_memberships row for — so an IAM-granted co-mentor still sees their clan
    // on the Clan Team page, matching the permissions they actually hold.
    const grants = await models.RoleAssignment.findAll({
      where: { userId, scopeType: 'clan', role: { [Op.in]: ['lead_mentor', 'co_mentor', 'core_team'] } },
      attributes: ['id', 'role', 'scopeId'],
    });
    const missingClanIds = [...new Set(grants.filter((g) => g.scopeId && !seen.has(g.scopeId)).map((g) => g.scopeId))];
    if (missingClanIds.length) {
      const clans = await models.Clan.findAll({
        where: { id: { [Op.in]: missingClanIds } },
        attributes: ['id', 'name', 'programId', 'status'],
      });
      const clanById = new Map(clans.map((c) => [c.id, c.toJSON()]));
      for (const g of grants) {
        if (!g.scopeId || seen.has(g.scopeId)) continue;
        const clan = clanById.get(g.scopeId);
        if (!clan) continue;
        seen.add(g.scopeId);
        out.push({ id: `ra-${g.id}`, userId, clanId: g.scopeId, role: g.role, status: 'active', source: 'role_assignment', clan });
      }
    }
    return out;
  }

  /**
   * Programs a mentor is responsible for (leads or co-mentors), each with the
   * clans they run inside it and roster counts. Powers the mentor "My Programs"
   * view - mentors only ever see programs/clans they're actually assigned to.
   */
  async getMentorPrograms(userId) {
    const memberships = await models.ClanMembership.findAll({
      where: { userId, role: ['lead_mentor', 'co_mentor'], status: 'active' },
      include: [{
        model: models.Clan,
        as: 'clan',
        attributes: ['id', 'name', 'programId', 'status'],
        include: [
          { model: models.Program, as: 'program', attributes: ['id', 'name', 'status', 'visibility', 'description'] },
          { model: models.ClanMembership, as: 'memberships', required: false, where: { status: 'active' }, attributes: ['id', 'role'] }
        ]
      }]
    });

    const programs = new Map();
    for (const m of memberships) {
      const clan = m.clan;
      if (!clan) continue;
      const program = clan.program;
      const pid = program?.id || 'unassigned';
      if (!programs.has(pid)) {
        programs.set(pid, {
          id: pid,
          name: program?.name || 'Unassigned',
          status: program?.status || null,
          visibility: program?.visibility || null,
          description: program?.description || null,
          clans: []
        });
      }
      const ms = clan.memberships || [];
      programs.get(pid).clans.push({
        id: clan.id,
        name: clan.name,
        myRole: m.role,
        menteeCount: ms.filter((x) => x.role === 'mentee').length,
        mentorCount: ms.filter((x) => ['lead_mentor', 'co_mentor'].includes(x.role)).length
      });
    }

    return [...programs.values()].map((p) => ({
      ...p,
      clanCount: p.clans.length,
      menteeCount: p.clans.reduce((s, c) => s + c.menteeCount, 0)
    }));
  }
}

module.exports = new ClanService();
