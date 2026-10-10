const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const authz = require('./authzService');
const organizationService = require('./organizationService');
const workspaceRecipients = require('./workspaceRecipients');
const notificationOrchestrator = require('./notificationOrchestrator');
const { PERMISSIONS } = require('../config/permissions');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { getRequestContext } = require('../utils/auditContext');
const { NotFoundError, ForbiddenError, ValidationError, ConflictError } = require('../utils/errors/errorTypes');

// clanService requires this module at load time — keep lazy to avoid the cycle.
const clans = () => require('./clanService');

class StandingClanService {
  async assertStandingClanPlan(organizationId) {
    await organizationService.requireEntitlement(
      organizationId,
      'programCompletionStanding',
      'Standing clan requests are available on Growth and Scale plans',
    );
  }

  async eligiblePrograms(actor) {
    const clanIds = await authz.mentoredClanIds(actor.id);
    if (!clanIds.length) return [];
    const mentoredClans = await models.Clan.findAll({ where: { id: { [Op.in]: clanIds }, kind: 'cohort' }, attributes: ['programId', 'organizationId'] });
    if (!mentoredClans.length) return [];
    const organizationId = mentoredClans[0].organizationId || getRequestContext()?.organizationId;
    if (organizationId && !(await organizationService.entitlement(organizationId, 'programCompletionStanding'))) {
      return [];
    }
    return models.Program.findAll({ where: { id: { [Op.in]: [...new Set(mentoredClans.map(c => c.programId))] }, status: 'completed', closedAt: { [Op.ne]: null } }, attributes: ['id', 'name', 'endDate'] });
  }

  /**
   * The closed-programme clans this mentor could continue — one entry per clan,
   * not per programme.
   *
   * A mentor often runs several clans in one programme (lead of one, co-mentor
   * of another). Asking "which programmes are eligible" collapsed those into a
   * single answer, which is what let one request speak for both clans.
   */
  async eligibleClans(actor) {
    const clanIds = await authz.mentoredClanIds(actor.id);
    if (!clanIds.length) return [];
    const mentored = await models.Clan.findAll({
      where: { id: { [Op.in]: clanIds }, kind: 'cohort' },
      attributes: ['id', 'name', 'programId', 'organizationId'],
    });
    if (!mentored.length) return [];
    const organizationId = mentored[0].organizationId || getRequestContext()?.organizationId;
    if (organizationId && !(await organizationService.entitlement(organizationId, 'programCompletionStanding'))) {
      return [];
    }
    const programs = await models.Program.findAll({
      where: {
        id: { [Op.in]: [...new Set(mentored.map(c => c.programId).filter(Boolean))] },
        status: 'completed',
        closedAt: { [Op.ne]: null },
      },
      attributes: ['id', 'name', 'endDate'],
    });
    const byId = new Map(programs.map(p => [p.id, p]));
    return mentored
      .filter(c => byId.has(c.programId))
      .map(c => ({
        clanId: c.id,
        clanName: c.name,
        program: byId.get(c.programId),
      }));
  }

  async request(input, actor) {
    const name = String(input.name || '').trim();
    if (!name || name.length > 150) throw new ValidationError('Choose a clan name of 1–150 characters');

    /**
     * The request belongs to a clan. Without one it would land against the
     * programme again and reappear on every clan the mentor runs in it.
     */
    const sourceClanId = input.sourceClanId || null;
    if (!sourceClanId) throw new ValidationError('Choose which clan this standing clan continues');

    const eligible = await this.eligibleClans(actor);
    const match = eligible.find(c => c.clanId === sourceClanId);
    if (!match) {
      throw new ForbiddenError('You can request a standing clan for a clan you mentor, once its program has been formally closed');
    }
    if (input.programId && input.programId !== match.program.id) {
      throw new ValidationError('That clan is not part of the program given');
    }

    const program = await models.Program.findByPk(match.program.id, { attributes: ['id', 'name', 'organizationId'] });
    if (!program) throw new NotFoundError('Program not found');
    await this.assertStandingClanPlan(program.organizationId);
    const created = await sequelize.transaction(async transaction => {
      // Serialize submissions by this mentor so retries return the pending request.
      await models.User.findByPk(actor.id, { transaction, lock: transaction.LOCK.UPDATE });
      const existing = await models.StandingClanRequest.findOne({ where: { mentorId: actor.id, sourceClanId, status: 'pending' }, transaction });
      if (existing) return { request: existing, isNew: false };
      const request = await models.StandingClanRequest.create({
        mentorId: actor.id,
        programId: program.id,
        sourceClanId,
        name,
        description: String(input.description || '').trim().slice(0, 4000) || null,
      }, { transaction });
      return { request, isNew: true };
    });
    if (created.isNew) {
      await this._notifyAdminsOfRequest(created.request, actor, program);
    }
    return created.request;
  }

  async _notifyAdminsOfRequest(request, mentor, program) {
    try {
      const admins = await workspaceRecipients.admins();
      if (!admins.length) return;
      const mentorName = [mentor.firstName, mentor.lastName].filter(Boolean).join(' ').trim() || 'A mentor';
      const programName = program?.name || 'a completed program';
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.STANDING_CLAN_REQUEST_CREATED,
        recipients: admins.map(a => ({ userId: a.id })),
        payload: {
          title: 'Standing clan request',
          message: `${mentorName} requested "${request.name}" for ${programName}. Approve or reject in notifications.`,
          actionUrl: '/admin/requests?tab=standing',
          actionLabel: 'Review request',
          relatedEntityType: 'standing_clan_request',
          relatedEntityId: request.id,
        },
        dedupe: { relatedEntityType: 'standing_clan_request', relatedEntityId: request.id },
      });
    } catch (err) {
      console.warn('standingClanService: request notification failed', err?.message || err);
    }
  }

  async list(actor) {
    const admin = await authz.hasAdminAccess(actor);
    const programScope = admin ? await authz.adminProgramScope(actor, { permission: PERMISSIONS.CLAN_CREATE }) : null;
    return models.StandingClanRequest.findAll({ where: admin ? (Array.isArray(programScope) ? { programId: { [Op.in]: programScope } } : {}) : { mentorId: actor.id },
      include: [{ model: models.Program, as: 'program', attributes: ['id', 'name'] },
        // The client scopes the "requested" banner by this: without it, a
        // request raised from one clan showed as pending on every clan the
        // mentor runs in the same programme.
        { model: models.Clan, as: 'sourceClan', attributes: ['id', 'name'], required: false },
        { model: models.User, as: 'mentor', attributes: ['id', 'firstName', 'lastName'] },
        { model: models.User, as: 'reviewer', attributes: ['id', 'firstName', 'lastName'] }],
      order: [['createdAt', 'DESC']] });
  }

  async decide(requestId, decision, note, actor) {
    if (!await authz.hasAdminAccess(actor)) throw new ForbiddenError('Only an admin can decide standing clan requests');
    if (!['approved', 'rejected'].includes(decision)) throw new ValidationError('Choose approve or reject');
    // Reject note is optional; when present it is included in the mentor notification.
    const saved = await sequelize.transaction(async transaction => {
      const request = await models.StandingClanRequest.findByPk(requestId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!request) throw new NotFoundError('Request not found');
      if (!await authz.can(actor, PERMISSIONS.CLAN_CREATE, { programId: request.programId })) throw new ForbiddenError('You cannot approve clans for this program');
      if (request.status === decision) return request;
      if (request.status !== 'pending') throw new ConflictError('This request has already been decided');
      let clan = null;
      if (decision === 'approved') {
        const program = await models.Program.findByPk(request.programId, { transaction, lock: transaction.LOCK.SHARE });
        if (!program?.closedAt || program.status !== 'completed') throw new ValidationError('Close the program before approving this request');
        await this.assertStandingClanPlan(program.organizationId);
        clan = await clans().createClan({ programId: request.programId, name: request.name, description: request.description,
          kind: 'standing', leadMentorId: request.mentorId }, actor.id, { transaction, standingApproval: true });
      }
      await request.update({ status: decision, reviewedBy: actor.id, reviewedAt: new Date(), decisionNote: String(note || '').trim() || null, createdClanId: clan?.id || null }, { transaction });
      return request;
    });
    await this._notifyMentorDecision(saved);
    return saved;
  }

  async _notifyMentorDecision(request) {
    const approved = request.status === 'approved';
    const reason = request.decisionNote ? ` Reason: ${request.decisionNote}` : '';
    try {
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.STANDING_CLAN_REQUEST_DECIDED,
        recipients: [{ userId: request.mentorId }],
        payload: {
          title: approved ? 'Standing clan approved' : 'Standing clan request rejected',
          message: approved
            ? `Your standing clan "${request.name}" was approved. Open Clan team to choose mentees.`
            : `Your standing clan request "${request.name}" was not approved.${reason}`,
          actionUrl: approved && request.createdClanId ? '/mentor/clan-team' : '/mentor/dashboard',
          actionLabel: approved ? 'Open clan team' : 'View cockpit',
          relatedEntityType: approved ? 'clan' : 'standing_clan_request',
          relatedEntityId: approved ? request.createdClanId : request.id,
        },
      });
    } catch (err) {
      // Decision already saved — never fail the admin action on notification delivery.
      console.warn('standingClanService: decision notification failed', err?.message || err);
    }
  }

  async assertCanManage(clanId, actor) {
    const clan = await models.Clan.findByPk(clanId);
    if (!clan) throw new NotFoundError('Clan not found');
    if (clan.kind !== 'standing') throw new ValidationError('This operation is only for standing clans');
    if (!await authz.can(actor, PERMISSIONS.CLAN_MANAGE_MEMBERS, await authz.scopeOfClan(clanId))) throw new ForbiddenError('You cannot manage this clan');
    return clan;
  }

  async addMenteesToStandingClan(clanId, menteeIds, actor) {
    const clan = await models.Clan.findByPk(clanId);
    if (!clan) throw new NotFoundError('Clan not found');
    if (clan.kind !== 'standing') throw new ValidationError('This operation is only for standing clans');
    const resource = await authz.scopeOfClan(clanId);
    // Match cohort addMember: lead (manage members) or co-mentor with mentee.add.
    const canManage = await authz.can(actor, PERMISSIONS.CLAN_MANAGE_MEMBERS, resource);
    const canAdd = await authz.can(actor, PERMISSIONS.MENTEE_ADD, resource);
    if (!canManage && !canAdd) throw new ForbiddenError('You cannot manage this clan');

    if (!Array.isArray(menteeIds) || !menteeIds.length || menteeIds.length > 100) throw new ValidationError('Select between 1 and 100 mentees');
    return sequelize.transaction(async transaction => {
      const clan = await models.Clan.findByPk(clanId, { transaction, lock: transaction.LOCK.UPDATE });
      const rows = [];
      for (const userId of [...new Set(menteeIds)]) {
        const user = await models.User.findByPk(userId, { transaction });
        const workspace = await models.OrganizationMembership.findOne({ where: { organizationId: clan.organizationId, userId, status: 'active' }, transaction });
        const profile = await models.MenteeProfile.findOne({ where: { userId }, transaction });
        if (!workspace || !user || user.status !== 'active' || !profile) throw new ValidationError('Select active mentees in your organization');
        const existing = await models.ClanMembership.findOne({ where: { clanId, userId, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } }, transaction });
        if (existing) { rows.push(existing); continue; }
        const count = await models.ClanMembership.count({ where: { clanId, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } }, transaction });
        if (clan.maxMentees && count >= clan.maxMentees) throw new ConflictError('This clan is full. Increase its capacity before adding more mentees.');
        rows.push(await clans().addMember(clanId, { userId, role: 'mentee' }, actor, { transaction }));
      }
      return rows;
    });
  }

  async activity(clanId, { period = '30d' } = {}, actor) {
    const clan = await models.Clan.findByPk(clanId);
    if (!clan || clan.kind !== 'standing') throw new NotFoundError('Standing clan not found');
    if (!await authz.hasAdminAccess(actor) && !(await authz.mentoredClanIds(actor.id)).includes(clanId) && !await models.ClanMembership.count({ where: { clanId, userId: actor.id, status: 'active' } })) throw new ForbiddenError('You do not have access to this clan');
    if (!['30d', 'quarter', 'joined'].includes(period)) throw new ValidationError('Choose last 30 days, this quarter, or since joining');
    const now = new Date();
    const since = period === 'quarter' ? new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1)) : new Date(now.getTime() - 30 * 86400000);
    const canViewRoster = await authz.can(actor, PERMISSIONS.MENTEE_VIEW, await authz.scopeOfClan(clanId));
    const memberships = await models.ClanMembership.findAll({ where: { clanId, role: 'mentee', status: { [Op.in]: ['active', 'paused'] }, ...(!canViewRoster ? { userId: actor.id } : {}) }, include: [{ model: models.User, as: 'user', attributes: ['firstName', 'lastName'] }] });
    const mentees = [];
    for (const member of memberships) {
      const from = period === 'joined' ? new Date(member.joinedAt) : new Date(Math.max(since.getTime(), new Date(member.joinedAt).getTime()));
      const range = { [Op.between]: [from, now] };
      const menteeId = member.userId;
      const [assigned, completed, raised, resolved, logs, attendance, kudos] = await Promise.all([
        models.AssignedTask.count({ where: { clanId, menteeId, assignedAt: range } }),
        models.AssignedTask.count({ where: { clanId, menteeId, status: 'completed', completedAt: range } }),
        models.Blocker.count({ where: { clanId, menteeId, createdAt: range } }),
        models.Blocker.count({ where: { clanId, menteeId, status: 'resolved', resolvedAt: range } }),
        models.DailyLogEntry.findAll({ where: { clanId, menteeId, dateKey: { [Op.between]: [from.toISOString().slice(0, 10), now.toISOString().slice(0, 10)] } }, attributes: ['dateKey'], order: [['dateKey', 'DESC']] }),
        models.CohortReviewEntry.findAll({ where: { menteeId }, attributes: ['attendance'], include: [{ model: models.CohortReviewSession, as: 'session', attributes: [], required: true, where: { clanId, sessionDate: { [Op.between]: [from.toISOString().slice(0, 10), now.toISOString().slice(0, 10)] } } }] }),
        models.CommunityPost.count({ where: { scopeType: 'clan', scopeId: clanId, type: 'kudos', toId: menteeId, createdAt: range } }),
      ]);
      const days = [...new Set(logs.map(l => l.dateKey))];
      let streak = 0;
      let day = new Date(now.toISOString().slice(0, 10));
      if (!days.includes(day.toISOString().slice(0, 10))) day.setUTCDate(day.getUTCDate() - 1);
      while (days.includes(day.toISOString().slice(0, 10))) { streak++; day.setUTCDate(day.getUTCDate() - 1); }
      mentees.push({ id: menteeId, name: `${member.user.firstName} ${member.user.lastName}`, joinedAt: member.joinedAt, from,
        tasksAssigned: assigned, tasksCompleted: completed, blockersRaised: raised, blockersResolved: resolved, dailyLogs: logs.length, streak, kudos,
        attendance: { present: attendance.filter(a => a.attendance === 'present').length, absent: attendance.filter(a => a.attendance === 'absent').length, excused: attendance.filter(a => a.attendance === 'excused').length } });
    }
    return { clanId, period, until: now, mentees };
  }
}
module.exports = new StandingClanService();
