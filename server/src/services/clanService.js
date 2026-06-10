const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors/errorTypes');
const { createAuditLog } = require('../utils/auditContext');

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
    const clan = await models.Clan.findByPk(clanId, {
      include: [
        { model: models.Program, as: 'program', attributes: ['id', 'name', 'status'] },
        { model: models.User, as: 'leadMentor', attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'] },
        {
          model: models.ClanMembership,
          as: 'memberships',
          required: false,
          where: { status: 'active' },
          include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl', 'role'] }]
        }
      ]
    });

    if (!clan) throw new NotFoundError('Clan not found');
    return clan;
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
    const clan = await models.Clan.findByPk(clanId);
    if (!clan) throw new NotFoundError('Clan not found');

    const allowed = ['name', 'description', 'leadMentorId', 'tags', 'maxMentees', 'status', 'healthStatus'];
    allowed.forEach((key) => {
      if (updates[key] !== undefined) clan[key] = updates[key];
    });
    await clan.save();
    return clan;
  }

  /**
   * Add (or reactivate) a member in a clan with a clan-scoped role. This is the
   * clan-based assignment entry point: assigning a mentee here is how they're
   * "matched". Ensures the user gains the implied platform capability.
   */
  async addMember(clanId, { userId, role, enrollmentId }) {
    if (!userId || !role) throw new ValidationError('userId and role are required');
    if (!CAPABILITY_FOR_CLAN_ROLE[role]) throw new ValidationError(`Invalid clan role: ${role}`);

    const clan = await models.Clan.findByPk(clanId);
    if (!clan) throw new NotFoundError('Clan not found');

    const user = await models.User.findByPk(userId);
    if (!user) throw new NotFoundError('User not found');

    return sequelize.transaction(async (transaction) => {
      await this.ensureCapability(user, CAPABILITY_FOR_CLAN_ROLE[role], transaction);

      let membership = await models.ClanMembership.findOne({ where: { clanId, userId }, transaction });
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
  }

  async removeMember(clanId, userId) {
    const membership = await models.ClanMembership.findOne({ where: { clanId, userId } });
    if (!membership) throw new NotFoundError('Membership not found');
    membership.status = 'removed';
    membership.leftAt = new Date();
    await membership.save();
    return membership;
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
   * Mentees not currently in ANY active clan ("leftover" people a lead mentor can
   * pull into their clan). Optional `q` filters by name/email.
   */
  async listAvailableMembers({ q } = {}) {
    const { Op } = require('sequelize');
    const assigned = await models.ClanMembership.findAll({ where: { status: 'active' }, attributes: ['userId'] });
    const assignedIds = [...new Set(assigned.map((m) => m.userId).filter(Boolean))];

    const where = { role: 'mentee', status: 'active' };
    if (assignedIds.length) where.id = { [Op.notIn]: assignedIds };
    if (q && q.trim()) {
      const like = { [Op.iLike]: `%${q.trim()}%` };
      where[Op.and] = [{ [Op.or]: [{ firstName: like }, { lastName: like }, { email: like }] }];
    }
    const users = await models.User.findAll({
      where,
      attributes: ['id', 'firstName', 'lastName', 'email'],
      order: [['firstName', 'ASC']],
      limit: 50
    });
    return users.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() || u.email, email: u.email }));
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
      where: { clanId, status: 'active', role: { [Op.in]: ['lead_mentor', 'co_mentor', 'core_team'] } },
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
    return models.ClanMembership.findAll({
      where: { userId, status: 'active' },
      include: [{ model: models.Clan, as: 'clan', attributes: ['id', 'name', 'programId', 'status'] }],
      order: [['joinedAt', 'DESC']]
    });
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
