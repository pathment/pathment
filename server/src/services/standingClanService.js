const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const authz = require('./authzService');
const menteeRecordService = require('./menteeRecordService');
const organizationService = require('./organizationService');
const workspaceRecipients = require('./workspaceRecipients');
const notificationOrchestrator = require('./notificationOrchestrator');
const { PERMISSIONS } = require('../config/permissions');
const { HISTORICAL_MEMBERSHIP_STATUSES } = require('../config/membership');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { getRequestContext } = require('../utils/auditContext');
const logger = require('../utils/logger');
const { mirrorPriorWork } = require('./standingWorkMirror');
const clanGroupChat = require('./clanGroupChat');
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

    const eligible = await this.eligibleClans(actor);

    /**
     * The request belongs to a clan — without one it lands against the
     * programme and reappears on every clan the mentor runs in it.
     *
     * But refusing outright when it is absent is wrong twice over. A mentor who
     * runs ONE eligible clan has nothing to choose, and the client and the API
     * deploy separately, so a frontend that predates this field would be told
     * to pick something its UI never offered. Infer when there is only one
     * answer; ask only when there is genuinely more than one.
     */
    const candidates = input.programId
      ? eligible.filter(c => c.program.id === input.programId)
      : eligible;

    /**
     * In order: what the form said, then the clan the mentor has SELECTED in
     * the sidebar, then the only possibility.
     *
     * The sidebar clan is the strongest signal after an explicit choice — the
     * banner this is opened from names that clan ("continue Viral Loop Clan
     * 2026"), so asking again which clan they mean is asking about something
     * already on screen. It is only honoured when it is genuinely one of their
     * eligible clans, so it can never widen anything.
     */
    const fromSidebar = candidates.some(c => c.clanId === input.activeClanId)
      ? input.activeClanId
      : null;
    const sourceClanId = input.sourceClanId
      || fromSidebar
      || (candidates.length === 1 ? candidates[0].clanId : null);

    if (!sourceClanId) {
      if (!candidates.length) {
        throw new ForbiddenError('You can request a standing clan for a clan you mentor, once its program has been formally closed');
      }
      throw new ValidationError(
        `Choose which clan this standing clan continues: ${candidates.map(c => c.clanName).join(', ')}`,
      );
    }

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
        // A mentor who is also a workspace admin still gets the request in their
        // bell — they may be the one who approves it — but not a second snackbar
        // on top of their own "Request sent" confirmation.
        silentFor: [mentor.id],
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
        /**
         * The standing clan keeps the source clan's mentor team.
         *
         * This hardcoded `leadMentorId: request.mentorId`, so whoever pressed
         * the button became lead — a co-mentor who requested a continuation
         * was promoted over the lead mentor who had actually run the clan, and
         * the lead was left out of their own group entirely. Requesting is not
         * a promotion. Everyone carries the role they already held.
         *
         * With no source clan (rows predating it) there is nothing to inherit,
         * so the requester leads, as before.
         */
        const team = await this._mentorTeamOf(request.sourceClanId, transaction);
        const leadMentorId = team.leadId || request.mentorId;
        clan = await clans().createClan({ programId: request.programId, name: request.name, description: request.description,
          kind: 'standing', leadMentorId }, actor.id, { transaction, standingApproval: true });

        /**
         * The lead's membership is created with the clan; everyone else joins
         * as a co-mentor, the requester included when that is what they were.
         *
         * `actor` is deliberately null. Passing it makes `addMember` re-check
         * permissions via `scopeOfClan`, which reads the clan OUTSIDE this
         * transaction — and the clan was inserted inside it, so the read blocks
         * on the uncommitted row until the statement times out. The admin's
         * authority was already established above, before this branch ran.
         */
        const joinAsCoMentor = async (userId) => {
          await clans().addMember(clan.id, { userId, role: 'co_mentor' }, null, { transaction });
        };
        for (const userId of team.coMentorIds) {
          if (userId === leadMentorId) continue;
          await joinAsCoMentor(userId);
        }
        if (request.mentorId !== leadMentorId && !team.coMentorIds.includes(request.mentorId)) {
          // They asked for this clan, so they are in it even if their
          // membership of the source clan has since changed.
          await joinAsCoMentor(request.mentorId);
        }
      }
      await request.update({ status: decision, reviewedBy: actor.id, reviewedAt: new Date(), decisionNote: String(note || '').trim() || null, createdClanId: clan?.id || null }, { transaction });
      return request;
    });

    /**
     * The clan opens with the people who were in it.
     *
     * Approval used to produce a standing clan containing the mentor team and
     * nobody else, so the first thing a mentor had to do with their
     * continuation was retype a roster the system already knew — every active
     * mentee of the clan they had just asked to continue. Carrying them over
     * is the default now; removing somebody afterwards is one click, and
     * choosing twenty people by hand is not.
     *
     * AFTER the transaction, for the reason `addMenteesToStandingClan`
     * already documents: it opens its own transaction and re-reads
     * authorization, which would block on the clan row this one has not
     * committed. And it must never fail the approval — the decision is
     * recorded, the clan exists, and a roster that could not be copied is a
     * smaller problem than an approval that half-happened.
     */
    const adoption = saved.status === 'approved' && saved.createdClanId
      ? await this._adoptSourceRoster(saved.createdClanId, saved.sourceClanId, actor)
      : null;

    await this._notifyMentorDecision(saved, adoption);
    // Not persisted — a report of what just happened, for the admin's screen.
    if (adoption) saved.setDataValue('roster', adoption);
    return saved;
  }

  /**
   * Move the source clan's active mentees into its continuation.
   *
   * Active only. A paused mentee stopped turning up during the programme, and
   * deciding whether a continuation is the way to bring them back is a
   * judgement for their mentor, who can add them by name. A removed one left.
   *
   * What happens to their work. The source rows are NOT re-pointed —
   * `priorRecord` explains why that would empty the finished programme's
   * record and break the certificate read off it. Instead the UNFINISHED work
   * is continued into the new clan as live assignments the mentee can submit
   * and the mentor can see without pressing anything: completed work stays
   * where it was earned, work in progress comes with the person.
   *
   * Unlike an ordinary join, an approval carries work whose mentor did not
   * come across as well, re-pointed at this clan's lead. The whole clan is
   * continuing; leaving somebody's half-finished roadmap behind would hand
   * them an empty plan on their first day in it.
   *
   * One mentee at a time and never throwing: the batch method is all-or-
   * nothing by design, which is right when a mentor picked the names and wrong
   * here, where a single suspended account would otherwise cost the other
   * nineteen their place.
   */
  async _adoptSourceRoster(clanId, sourceClanId, actor) {
    if (!sourceClanId) return { moved: 0, skipped: [], sourceClanId: null };
    const result = { moved: 0, skipped: [], sourceClanId };
    try {
      const members = await models.ClanMembership.findAll({
        where: { clanId: sourceClanId, role: 'mentee', status: 'active' },
        attributes: ['userId'],
        raw: true,
      });
      for (const { userId } of members) {
        try {
          // An approval carries the work too, including the work whose mentor
          // stayed behind — see `_autoContinueFor`. This is the difference
          // between a whole clan continuing and one mentee being added to it.
          await this.addMenteesToStandingClan(clanId, [userId], actor, { carryAll: true });
          result.moved += 1;
        } catch (error) {
          result.skipped.push({ menteeId: userId, reason: error.message });
        }
      }
      logger.info('[standingClan] carried the roster into the continuation', {
        clanId, sourceClanId, moved: result.moved, skipped: result.skipped.length,
      });
    } catch (error) {
      result.error = error.message;
      logger.warn(`[standingClan] could not carry the roster into ${clanId}: ${error.message}`);
    }
    return result;
  }

  /**
   * What each mentee did BEFORE this standing clan — read-only context.
   *
   * Their history is deliberately not moved or copied here. Re-pointing the
   * task rows would empty the completed programme's record and break the
   * certificate awarded on it, which reads those rows live; copying them would
   * inflate this clan's activity with work done somewhere else, and activity is
   * the one thing a standing clan measures. So the work stays where it
   * happened, and this says what it was.
   *
   * Batched: three queries for the whole roster rather than three per mentee.
   */
  async priorRecord(clanId, actor) {
    const clan = await models.Clan.findByPk(clanId, { attributes: ['id', 'kind', 'programId'] });
    if (!clan || clan.kind !== 'standing') throw new NotFoundError('Standing clan not found');
    const canView = await authz.can(actor, PERMISSIONS.MENTEE_VIEW, await authz.scopeOfClan(clanId));
    if (!canView && !(await authz.hasAdminAccess(actor))) {
      throw new ForbiddenError('You do not have access to this clan');
    }

    const members = await models.ClanMembership.findAll({
      where: { clanId, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } },
      attributes: ['userId'], raw: true,
    });
    const menteeIds = [...new Set(members.map(m => m.userId))];
    if (!menteeIds.length) return [];

    // The cohort clans these people came from, in this clan's programme.
    const priorMemberships = await models.ClanMembership.findAll({
      // HISTORICAL, deliberately: a mentee who left a cohort has a 'removed'
      // row there, and that row is the record. This read already included them
      // by having no status filter at all; saying so stops the next person
      // "tidying" it to VISIBLE_MEMBERSHIP_STATUSES and emptying the panel.
      where: { userId: { [Op.in]: menteeIds }, role: 'mentee', status: { [Op.in]: HISTORICAL_MEMBERSHIP_STATUSES } },
      attributes: ['userId', 'clanId', 'status'],
      include: [{
        model: models.Clan, as: 'clan', required: true,
        where: { kind: 'cohort', ...(clan.programId ? { programId: clan.programId } : {}) },
        attributes: ['id', 'name'],
      }],
    });
    if (!priorMemberships.length) return menteeIds.map(id => ({ menteeId: id, priorClans: [] }));

    const priorClanIds = [...new Set(priorMemberships.map(m => m.clanId))];
    // Shared with the cross-clan mentee record so both count the same way —
    // above all "unfinished" meaning not completed AND not cancelled.
    const { taskTally, openBlockers, latestCertByMentee: certByMentee } =
      await menteeRecordService.tallyByMenteeClan(menteeIds, priorClanIds);
    const key = (menteeId, cId) => `${menteeId}:${cId}`;

    const byMentee = new Map(menteeIds.map(id => [id, []]));
    for (const m of priorMemberships) {
      const k = key(m.userId, m.clanId);
      const tally = taskTally.get(k) || { assigned: 0, completed: 0, unfinished: 0 };
      byMentee.get(m.userId)?.push({
        clanId: m.clanId,
        clanName: m.clan?.name || null,
        membershipStatus: m.status,
        tasksAssigned: tally.assigned,
        tasksCompleted: tally.completed,
        tasksUnfinished: tally.unfinished,
        openBlockers: openBlockers.get(k) || 0,
      });
    }

    return menteeIds.map(menteeId => {
      const cert = certByMentee.get(menteeId) || null;
      return {
        menteeId,
        priorClans: byMentee.get(menteeId) || [],
        certificate: cert ? { tier: cert.tier, certificateNumber: cert.certificateNumber } : null,
      };
    });
  }

  /**
   * The work a mentee left unfinished, offered for carrying forward.
   *
   * Read-only listing. Nothing here is moved; `carryForward` copies the
   * *intent* into new assignments.
   */
  async unfinishedPriorWork(clanId, menteeId, actor) {
    const clan = await models.Clan.findByPk(clanId, { attributes: ['id', 'kind', 'programId'] });
    if (!clan || clan.kind !== 'standing') throw new NotFoundError('Standing clan not found');
    if (!await authz.can(actor, PERMISSIONS.MENTEE_VIEW, await authz.scopeOfClan(clanId))) {
      throw new ForbiddenError('You do not have access to this clan');
    }
    const priorClans = await models.Clan.findAll({
      where: { kind: 'cohort', ...(clan.programId ? { programId: clan.programId } : {}) },
      attributes: ['id'], raw: true,
    });
    if (!priorClans.length) return [];
    return models.AssignedTask.findAll({
      where: {
        clanId: { [Op.in]: priorClans.map(c => c.id) },
        menteeId,
        status: { [Op.notIn]: ['completed', 'cancelled'] },
      },
      attributes: ['id', 'roadmapTaskId', 'titleOverride', 'status', 'dueDate', 'isCustomTask', 'pointsBase'],
      order: [['assignedAt', 'DESC']],
      limit: 200,
    });
  }

  /**
   * Carry unfinished work into the standing clan as NEW assignments.
   *
   * Deliberately a copy of the intent, never a move of the row. The original
   * stays in the completed programme, where it was set and where the final
   * report and the certificate still account for it; what lands here is fresh
   * work, assigned now, that counts toward this clan's activity because it IS
   * this clan's activity.
   */
  async carryForward(clanId, menteeId, taskIds, actor) {
    const clan = await models.Clan.findByPk(clanId);
    if (!clan || clan.kind !== 'standing') throw new ValidationError('This operation is only for standing clans');
    const resource = await authz.scopeOfClan(clanId);
    if (!(await authz.can(actor, PERMISSIONS.TASK_ASSIGN, resource))
      && !(await authz.can(actor, PERMISSIONS.CLAN_MANAGE_MEMBERS, resource))) {
      throw new ForbiddenError('You cannot assign work in this clan');
    }
    if (!Array.isArray(taskIds) || !taskIds.length || taskIds.length > 50) {
      throw new ValidationError('Select between 1 and 50 tasks to carry forward');
    }
    const member = await models.ClanMembership.count({
      where: { clanId, userId: menteeId, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } },
    });
    if (!member) throw new ValidationError('That mentee is not in this clan');

    const available = await this.unfinishedPriorWork(clanId, menteeId, actor);
    const byId = new Map(available.map(t => [t.id, t]));
    const chosen = [...new Set(taskIds)].map(id => byId.get(id)).filter(Boolean);
    if (!chosen.length) throw new ValidationError('None of those tasks are unfinished work from this program');

    return sequelize.transaction(async transaction => {
      const created = [];
      for (const source of chosen) {
        // Already carried forward? Assigning the same thing twice is a mistake
        // somebody makes once per roster, not an error worth failing on.
        const existing = await models.AssignedTask.findOne({
          where: {
            clanId, menteeId,
            roadmapTaskId: source.roadmapTaskId,
            status: { [Op.ne]: 'cancelled' },
          },
          transaction,
        });
        if (existing) { created.push(existing); continue; }
        created.push(await models.AssignedTask.create({
          organizationId: clan.organizationId,
          clanId,
          menteeId,
          mentorId: actor.id,
          // Required, and the same underlying task: what changes is the clan it
          // is assigned in, not what the work IS. A custom task carries its
          // title override across with it.
          roadmapTaskId: source.roadmapTaskId,
          titleOverride: source.titleOverride || null,
          isCustomTask: source.isCustomTask,
          pointsBase: source.pointsBase,
          status: 'assigned',
          assignedAt: new Date(),
          // The old due date has passed and is not this clan's deadline. The
          // mentor sets a new one if they want one.
          dueDate: null,
        }, { transaction }));
      }
      return created;
    });
  }

  /**
   * Resolve the completed clan this standing clan continues. Newer standing
   * clans have an exact source on their approved request; older rows fall back
   * to completed cohort clans in the same program so the feature remains
   * usable after an upgrade.
   */
  async _continuationSourceClanIds(clan) {
    const request = await models.StandingClanRequest.findOne({
      where: { createdClanId: clan.id, status: 'approved', sourceClanId: { [Op.ne]: null } },
      attributes: ['sourceClanId'],
      order: [['reviewedAt', 'DESC'], ['createdAt', 'DESC']],
    });
    if (request?.sourceClanId) return [request.sourceClanId];
    const fallback = await models.Clan.findAll({
      where: { programId: clan.programId, kind: 'cohort', id: { [Op.ne]: clan.id } },
      attributes: ['id'],
    });
    return fallback.map((row) => row.id);
  }

  async _assertContinuationAccess(clanId, menteeId, actor) {
    const clan = await models.Clan.findByPk(clanId);
    if (!clan || clan.kind !== 'standing') throw new ValidationError('Work can only be continued into a standing clan');
    const resource = await authz.scopeOfClan(clanId);
    if (!(await authz.can(actor, PERMISSIONS.TASK_ASSIGN, resource))
      && !(await authz.can(actor, PERMISSIONS.CLAN_MANAGE_MEMBERS, resource))) {
      throw new ForbiddenError('You cannot assign work in this clan');
    }
    const membership = await models.ClanMembership.findOne({
      where: { clanId, userId: menteeId, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } },
    });
    if (!membership) throw new ValidationError('That mentee is not in this standing clan');
    return clan;
  }

  /**
   * A review model for the shared "Continue work" drawer.
   *
   * Roadmaps are grouped and offered at their FIRST unfinished step. Completed
   * steps stay exclusively in history. One-off custom work is offered
   * individually. Structured quiz/interview assignments are shown but disabled
   * because their per-attempt kit snapshot cannot safely be cloned as a plain
   * task.
   */
  async continuationPreview(clanId, menteeId, actor) {
    const clan = await this._assertContinuationAccess(clanId, menteeId, actor);
    const sourceClanIds = await this._continuationSourceClanIds(clan);
    if (!sourceClanIds.length) return { roadmaps: [], customTasks: [], sourceClans: [] };

    const sourceClans = await models.Clan.findAll({
      where: { id: { [Op.in]: sourceClanIds } }, attributes: ['id', 'name'], raw: true,
    });
    const sourceNameById = new Map(sourceClans.map((row) => [row.id, row.name]));
    const assignments = await models.AssignedTask.findAll({
      where: {
        clanId: { [Op.in]: sourceClanIds }, menteeId,
        status: { [Op.ne]: 'cancelled' },
      },
      attributes: [
        'id', 'clanId', 'mentorId', 'roadmapTaskId', 'status', 'assignedAt', 'isCustomTask', 'pointsBase',
        'typeOverride', 'titleOverride', 'descriptionOverride', 'deliverableOverride',
        'acceptanceCriteriaOverride', 'resourcesOverride', 'openSourceOrgIds',
      ],
      include: [{
        model: models.RoadmapTask, as: 'roadmapTask', required: true,
        attributes: [
          'id', 'roadmapId', 'title', 'description', 'type', 'difficulty', 'taskOrder',
          'deliverable', 'acceptanceCriteria', 'estimatedHours', 'effort', 'dueOffsetDays',
          'isMandatory', 'isCustomTask', 'pointsBase', 'openSourceOrgIds',
        ],
        include: [{ model: models.Roadmap, as: 'roadmap', attributes: ['id', 'name'], required: false }],
      }],
      order: [['assignedAt', 'DESC']],
    });

    // Newest source assignment wins if a historical step was assigned twice.
    const byStepId = new Map();
    // Who last set work on each roadmap over there. The resume step itself is
    // often unassigned in the source clan (it is the step they had not reached),
    // so the roadmap's previous mentor has to come from the steps that WERE
    // assigned, newest first — `assignments` is already ordered assignedAt DESC.
    const roadmapMentorId = new Map();
    for (const assignment of assignments) {
      if (!byStepId.has(assignment.roadmapTaskId)) byStepId.set(assignment.roadmapTaskId, assignment);
      const roadmapId = assignment.roadmapTask?.roadmapId;
      if (roadmapId && assignment.mentorId && !roadmapMentorId.has(roadmapId)) {
        roadmapMentorId.set(roadmapId, assignment.mentorId);
      }
    }

    const roadmapIds = [...new Set(assignments
      .map((row) => row.roadmapTask?.roadmapId)
      .filter(Boolean))];
    const steps = roadmapIds.length ? await models.RoadmapTask.findAll({
      where: { roadmapId: { [Op.in]: roadmapIds } },
      attributes: ['id', 'roadmapId', 'title', 'taskOrder', 'dueOffsetDays'],
      include: [{ model: models.Roadmap, as: 'roadmap', attributes: ['id', 'name'], required: true }],
      order: [['roadmapId', 'ASC'], ['taskOrder', 'ASC']],
    }) : [];
    const stepsByRoadmap = new Map();
    for (const step of steps) {
      const rows = stepsByRoadmap.get(step.roadmapId) || [];
      rows.push(step);
      stepsByRoadmap.set(step.roadmapId, rows);
    }

    const [targetProgress, targetAssignments] = await Promise.all([
      roadmapIds.length ? models.RoadmapProgress.findAll({
        where: { clanId, menteeId, roadmapId: { [Op.in]: roadmapIds } }, attributes: ['roadmapId'], raw: true,
      }) : [],
      models.AssignedTask.findAll({
        where: { clanId, menteeId, status: { [Op.ne]: 'cancelled' } },
        attributes: ['roadmapTaskId', 'continuedFromTaskId'], raw: true,
      }),
    ]);
    const startedRoadmaps = new Set(targetProgress.map((row) => row.roadmapId));
    const targetStepIds = new Set(targetAssignments.map((row) => row.roadmapTaskId));
    const continuedSourceIds = new Set(targetAssignments.map((row) => row.continuedFromTaskId).filter(Boolean));

    const roadmaps = [];
    for (const roadmapId of roadmapIds) {
      if (startedRoadmaps.has(roadmapId)) continue;
      const roadmapSteps = stepsByRoadmap.get(roadmapId) || [];
      const resumeIndex = roadmapSteps.findIndex((step) => byStepId.get(step.id)?.status !== 'completed');
      if (resumeIndex < 0) continue;
      const resumeStep = roadmapSteps[resumeIndex];
      if (targetStepIds.has(resumeStep.id)) continue;
      const source = byStepId.get(resumeStep.id) || null;
      roadmaps.push({
        roadmapId,
        name: resumeStep.roadmap?.name || 'Roadmap',
        totalSteps: roadmapSteps.length,
        completedSteps: roadmapSteps.filter((step) => byStepId.get(step.id)?.status === 'completed').length,
        resumeIndex,
        resumeStep: {
          stepId: resumeStep.id,
          title: resumeStep.title,
          previousStatus: source?.status || null,
          sourceTaskId: source?.id || null,
        },
        sourceClanName: source ? (sourceNameById.get(source.clanId) || null) : null,
        // The mentor this work came from. Drives the automatic carry on join:
        // work follows the mentee by itself only when the mentor who set it is
        // also on this standing clan's team. See `_autoContinueFor`.
        sourceMentorId: source?.mentorId || roadmapMentorId.get(roadmapId) || null,
      });
    }

    const customTasks = assignments
      .filter((row) => row.isCustomTask || !row.roadmapTask?.roadmapId)
      .filter((row) => !continuedSourceIds.has(row.id) && !targetStepIds.has(row.roadmapTaskId))
      .map((row) => {
        const type = row.typeOverride || row.roadmapTask.type;
        const supported = !['quiz', 'interview', 'course'].includes(type);
        return {
          sourceTaskId: row.id,
          title: row.titleOverride || row.roadmapTask.title,
          type,
          status: row.status,
          sourceClanName: sourceNameById.get(row.clanId) || null,
          sourceMentorId: row.mentorId || null,
          supported,
          unavailableReason: supported ? null : `Create a new ${type} assignment so its kit and attempt settings are current.`,
        };
      });

    return { roadmaps, customTasks, sourceClans };
  }

  async _continuationDueDate(menteeId, requestedDate, offsetDays = 7) {
    if (requestedDate) return require('./taskService')._resolveDueDate(menteeId, requestedDate);
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + (Number.isFinite(Number(offsetDays)) ? Number(offsetDays) : 7));
    return require('./taskService')._resolveDueDate(menteeId, date.toISOString().slice(0, 10));
  }

  /**
   * Continue selected historical work as fresh standing-clan work.
   *
   * The target membership row is locked for the transaction, serialising
   * double-clicks/retries. The provenance unique index is the final guard.
   */
  /**
   * `preserveSourceMentor` keeps the mentor who ORIGINALLY set each task as its
   * mentor here, instead of whoever triggered the continuation. Used by the
   * automatic carry on join: nobody chose to assign that work just now, it is
   * the same work following the mentee, and "work you assigned follows you" is
   * already how `authzService.canActOnTask` reads a task's owner. The manual
   * button leaves it off, because there a mentor really is assigning it.
   *
   * `mentorIdOverride` names the mentor instead. It exists for the one case
   * where neither of the above is right: an approval carrying work whose
   * original mentor did not come across. Keeping them would leave the task
   * owned by somebody outside the clan, so the mentee could submit it and
   * nobody here could review it; using the actor would stamp the admin who
   * clicked Approve. It goes to this clan's lead, who is the person now
   * responsible for the mentee.
   */
  async continueWork(clanId, menteeId, input, actor, { preserveSourceMentor = false, mentorIdOverride = null } = {}) {
    const clan = await this._assertContinuationAccess(clanId, menteeId, actor);
    const preview = await this.continuationPreview(clanId, menteeId, actor);
    const requestedRoadmapIds = [...new Set(Array.isArray(input.roadmapIds) ? input.roadmapIds : [])];
    const requestedTaskIds = [...new Set(Array.isArray(input.taskIds) ? input.taskIds : [])];
    const roadmapById = new Map(preview.roadmaps.map((row) => [row.roadmapId, row]));
    const customById = new Map(preview.customTasks.filter((row) => row.supported).map((row) => [row.sourceTaskId, row]));
    const selectedRoadmaps = requestedRoadmapIds.map((id) => roadmapById.get(id)).filter(Boolean);
    const selectedCustom = requestedTaskIds.map((id) => customById.get(id)).filter(Boolean);

    // A browser or proxy can retry after the first request committed but before
    // its response arrived. Preview intentionally hides already-continued work,
    // so recover those rows here and return them as reused instead of turning a
    // successful first request into a confusing validation error.
    const [existingCustomRows, existingRoadmapRows] = await Promise.all([
      requestedTaskIds.length ? models.AssignedTask.findAll({
        where: {
          clanId,
          menteeId,
          continuedFromTaskId: { [Op.in]: requestedTaskIds },
          status: { [Op.ne]: 'cancelled' },
        },
        attributes: ['id', 'continuedFromTaskId', 'titleOverride'],
        include: [{ model: models.RoadmapTask, as: 'roadmapTask', attributes: ['title'] }],
      }) : [],
      requestedRoadmapIds.length ? models.AssignedTask.findAll({
        where: { clanId, menteeId, status: { [Op.ne]: 'cancelled' } },
        attributes: ['id', 'assignedAt', 'titleOverride'],
        include: [{
          model: models.RoadmapTask,
          as: 'roadmapTask',
          required: true,
          attributes: ['title', 'roadmapId'],
          where: { roadmapId: { [Op.in]: requestedRoadmapIds } },
        }],
        order: [['assignedAt', 'DESC']],
      }) : [],
    ]);
    const existingCustomBySource = new Map(existingCustomRows.map((row) => [row.continuedFromTaskId, row]));
    const existingRoadmapById = new Map();
    for (const row of existingRoadmapRows) {
      if (!existingRoadmapById.has(row.roadmapTask.roadmapId)) {
        existingRoadmapById.set(row.roadmapTask.roadmapId, row);
      }
    }
    const unresolvedRoadmapIds = requestedRoadmapIds.filter((id) => !roadmapById.has(id) && !existingRoadmapById.has(id));
    const unresolvedTaskIds = requestedTaskIds.filter((id) => !customById.has(id) && !existingCustomBySource.has(id));
    if (unresolvedRoadmapIds.length || unresolvedTaskIds.length) {
      throw new ValidationError('Some selected work is no longer available to continue');
    }
    if (!requestedRoadmapIds.length && !requestedTaskIds.length) throw new ValidationError('Select at least one roadmap or custom task');

    const sourceTaskIds = [
      ...selectedRoadmaps.map((row) => row.resumeStep.sourceTaskId).filter(Boolean),
      ...selectedCustom.map((row) => row.sourceTaskId),
    ];
    const sources = sourceTaskIds.length ? await models.AssignedTask.findAll({
      where: { id: { [Op.in]: sourceTaskIds } },
      include: [{
        model: models.RoadmapTask, as: 'roadmapTask', required: true,
        include: [{ model: models.TaskResource, as: 'resources', required: false }],
      }],
    }) : [];
    const sourceById = new Map(sources.map((row) => [row.id, row]));

    const roadmapDueDates = new Map();
    for (const row of selectedRoadmaps) {
      const step = await models.RoadmapTask.findByPk(row.resumeStep.stepId, { attributes: ['dueOffsetDays'] });
      roadmapDueDates.set(row.roadmapId, await this._continuationDueDate(menteeId, input.dueDate, step?.dueOffsetDays));
    }
    const customDueDate = selectedCustom.length
      ? await this._continuationDueDate(menteeId, input.dueDate, 7)
      : null;

    const saved = await sequelize.transaction(async (transaction) => {
      const membership = await models.ClanMembership.findOne({
        where: { clanId, userId: menteeId, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!membership) throw new ValidationError('That mentee is no longer in this standing clan');

      const continued = [
        ...requestedRoadmapIds.filter((id) => !roadmapById.has(id)).map((id) => {
          const assignment = existingRoadmapById.get(id);
          return {
            kind: 'roadmap', id: assignment.id,
            title: assignment.titleOverride || assignment.roadmapTask.title,
            roadmapId: id, created: false,
          };
        }),
        ...requestedTaskIds.filter((id) => !customById.has(id)).map((id) => {
          const assignment = existingCustomBySource.get(id);
          return {
            kind: 'custom', id: assignment.id,
            title: assignment.titleOverride || assignment.roadmapTask.title,
            sourceTaskId: id, created: false,
          };
        }),
      ];
      let createdCount = 0;
      for (const row of selectedRoadmaps) {
        const source = row.resumeStep.sourceTaskId ? sourceById.get(row.resumeStep.sourceTaskId) : null;
        let progress = await models.RoadmapProgress.findOne({
          where: { roadmapId: row.roadmapId, menteeId, clanId }, transaction,
        });
        if (!progress) {
          progress = await models.RoadmapProgress.create({
            roadmapId: row.roadmapId, menteeId, clanId, enrollmentId: null,
            currentStep: row.resumeIndex, completed: false,
          }, { transaction });
        }

        let assignment = await models.AssignedTask.findOne({
          where: { clanId, menteeId, roadmapTaskId: row.resumeStep.stepId }, transaction,
        });
        let wasCreated = false;
        if (!assignment) {
          assignment = await models.AssignedTask.create({
            organizationId: clan.organizationId,
            clanId,
            menteeId,
            /**
             * `source` is null when the resume step was never assigned over
             * there — it is the step they had not reached yet. The roadmap
             * still has a previous mentor, the one who set the steps before
             * it, and `row.sourceMentorId` is them. Without this fallback the
             * carried step was stamped with whoever did the adding, which is
             * the one thing the automatic carry is meant not to do.
             */
            mentorId: mentorIdOverride || (preserveSourceMentor && (source?.mentorId || row.sourceMentorId)) || actor.id,
            enrollmentId: null,
            roadmapTaskId: row.resumeStep.stepId,
            continuedFromTaskId: source?.id || null,
            status: 'assigned',
            assignedAt: new Date(),
            dueDate: roadmapDueDates.get(row.roadmapId),
            pointsBase: source?.pointsBase ?? source?.roadmapTask?.pointsBase ?? null,
            isCustomTask: false,
            typeOverride: source?.typeOverride || null,
            titleOverride: source?.titleOverride || null,
            descriptionOverride: source?.descriptionOverride || null,
            deliverableOverride: source?.deliverableOverride || null,
            acceptanceCriteriaOverride: source?.acceptanceCriteriaOverride || null,
            resourcesOverride: source?.resourcesOverride || null,
            openSourceOrgIds: source?.openSourceOrgIds || source?.roadmapTask?.openSourceOrgIds || [],
          }, { transaction });
          createdCount += 1;
          wasCreated = true;
        }
        continued.push({
          kind: 'roadmap', id: assignment.id, title: row.resumeStep.title,
          roadmapId: row.roadmapId, created: wasCreated,
        });
      }

      for (const row of selectedCustom) {
        const source = sourceById.get(row.sourceTaskId);
        if (!source) throw new ValidationError('A selected custom task no longer exists');
        let assignment = await models.AssignedTask.findOne({
          where: { clanId, menteeId, continuedFromTaskId: source.id }, transaction,
        });
        let wasCreated = false;
        if (!assignment) {
          const template = source.roadmapTask;
          const copiedTask = await models.RoadmapTask.create({
            title: source.titleOverride || template.title,
            description: source.descriptionOverride || template.description,
            type: source.typeOverride || template.type,
            difficulty: template.difficulty,
            taskOrder: 0,
            deliverable: source.deliverableOverride || template.deliverable,
            acceptanceCriteria: source.acceptanceCriteriaOverride || template.acceptanceCriteria || [],
            estimatedHours: template.estimatedHours,
            effort: template.effort,
            dueOffsetDays: template.dueOffsetDays,
            isMandatory: false,
            isCustomTask: true,
            pointsBase: source.pointsBase ?? template.pointsBase,
            openSourceOrgIds: source.openSourceOrgIds || template.openSourceOrgIds || [],
          }, { transaction });

          const overrideResources = Array.isArray(source.resourcesOverride) ? source.resourcesOverride : null;
          const resources = overrideResources || (template.resources || []).map((resource) => ({
            title: resource.title, url: resource.url, resourceType: resource.resourceType,
            description: resource.description, displayOrder: resource.displayOrder,
          }));
          if (resources.length) {
            await models.TaskResource.bulkCreate(resources
              .filter((resource) => resource?.url)
              .map((resource, index) => ({
                roadmapTaskId: copiedTask.id,
                title: resource.title || resource.label || resource.url,
                url: resource.url,
                resourceType: resource.resourceType || 'link',
                description: resource.description || null,
                displayOrder: resource.displayOrder ?? index,
              })), { transaction });
          }
          assignment = await models.AssignedTask.create({
            organizationId: clan.organizationId,
            clanId,
            menteeId,
            mentorId: mentorIdOverride || (preserveSourceMentor && source.mentorId) || actor.id,
            enrollmentId: null,
            roadmapTaskId: copiedTask.id,
            continuedFromTaskId: source.id,
            status: 'assigned',
            assignedAt: new Date(),
            dueDate: customDueDate,
            pointsBase: source.pointsBase ?? copiedTask.pointsBase,
            isCustomTask: true,
            openSourceOrgIds: source.openSourceOrgIds || copiedTask.openSourceOrgIds || [],
          }, { transaction });
          createdCount += 1;
          wasCreated = true;
        }
        continued.push({
          kind: 'custom', id: assignment.id, title: row.title,
          sourceTaskId: source.id, created: wasCreated,
        });
      }
      return { continued, createdCount, reusedCount: continued.length - createdCount };
    });

    const firstCreated = saved.continued.find((item) => item.created);
    if (saved.createdCount > 0 && firstCreated) {
      const mentor = await models.User.findByPk(actor.id, { attributes: ['firstName'] });
      notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.TASK_ASSIGNED,
        recipients: [{ userId: menteeId }],
        payload: {
          title: `${mentor?.firstName || 'Your mentor'} continued your learning plan`,
          message: `${saved.createdCount} item${saved.createdCount === 1 ? '' : 's'} from your previous plan ${saved.createdCount === 1 ? 'is' : 'are'} ready here as new work.`,
          actionUrl: `/mentee/tasks/${firstCreated.id}`,
          actionLabel: 'Open work',
          relatedEntityType: 'continued_work',
          relatedEntityId: firstCreated.id,
          clanId,
        },
        dedupe: { relatedEntityType: 'continued_work', relatedEntityId: firstCreated.id },
      }).catch((error) => console.warn('standingClanService: continuation notification failed', error?.message || error));
    }
    return saved;
  }

  /**
   * Who mentors the source clan right now: the lead, and the co-mentors.
   *
   * The lead is taken from a live membership rather than `clan.leadMentorId`
   * alone — a lead who has since left should not be made lead of a brand new
   * clan they are not part of.
   */
  async _mentorTeamOf(sourceClanId, transaction) {
    const empty = { leadId: null, coMentorIds: [] };
    if (!sourceClanId) return empty;
    const memberships = await models.ClanMembership.findAll({
      where: { clanId: sourceClanId, role: { [Op.in]: ['lead_mentor', 'co_mentor'] }, status: 'active' },
      attributes: ['userId', 'role'],
      raw: true,
      transaction,
    });
    if (!memberships.length) return empty;

    const ids = [...new Set(memberships.map(m => m.userId))];
    const usable = new Set((await models.User.findAll({
      where: { id: { [Op.in]: ids }, status: { [Op.ne]: 'suspended' } },
      attributes: ['id'], raw: true, transaction,
    })).map(u => u.id));

    const lead = memberships.find(m => m.role === 'lead_mentor' && usable.has(m.userId));
    return {
      leadId: lead ? lead.userId : null,
      coMentorIds: [...new Set(memberships
        .filter(m => m.role === 'co_mentor' && usable.has(m.userId))
        .map(m => m.userId))],
    };
  }

  async _notifyMentorDecision(request, adoption = null) {
    const approved = request.status === 'approved';
    const reason = request.decisionNote ? ` Reason: ${request.decisionNote}` : '';
    // Tell them who is already in it, so "open clan team to choose mentees"
    // does not send them to pick people who are standing there.
    const moved = adoption?.moved || 0;
    const roster = moved
      ? ` ${moved} mentee${moved === 1 ? '' : 's'} came across with it.`
      : '';
    try {
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.STANDING_CLAN_REQUEST_DECIDED,
        recipients: [{ userId: request.mentorId }],
        payload: {
          title: approved ? 'Standing clan approved' : 'Standing clan request rejected',
          message: approved
            ? `Your standing clan "${request.name}" was approved.${roster || ' Open Clan team to choose mentees.'}`
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

  async addMenteesToStandingClan(clanId, menteeIds, actor, { carryAll = false } = {}) {
    const clan = await models.Clan.findByPk(clanId);
    if (!clan) throw new NotFoundError('Clan not found');
    if (clan.kind !== 'standing') throw new ValidationError('This operation is only for standing clans');
    const resource = await authz.scopeOfClan(clanId);
    // Match cohort addMember: lead (manage members) or co-mentor with mentee.add.
    const canManage = await authz.can(actor, PERMISSIONS.CLAN_MANAGE_MEMBERS, resource);
    const canAdd = await authz.can(actor, PERMISSIONS.MENTEE_ADD, resource);
    if (!canManage && !canAdd) throw new ForbiddenError('You cannot manage this clan');

    if (!Array.isArray(menteeIds) || !menteeIds.length || menteeIds.length > 100) throw new ValidationError('Select between 1 and 100 mentees');
    const joined = [];
    const rows = await sequelize.transaction(async transaction => {
      const clan = await models.Clan.findByPk(clanId, { transaction, lock: transaction.LOCK.UPDATE });
      const rows = [];
      for (const userId of [...new Set(menteeIds)]) {
        const user = await models.User.findByPk(userId, { transaction });
        const workspace = await models.OrganizationMembership.findOne({ where: { organizationId: clan.organizationId, userId }, transaction });
        if (!workspace || !user) {
          throw new ValidationError('Select people who belong to your organization');
        }
        /**
         * A mentee profile is NOT required up front — `addMember` calls
         * `ensureMenteeProfile` and creates one.
         *
         * Demanding it here refused anyone whose account is a mentor but who
         * learns as a mentee in a clan, because only `role = 'mentee'` accounts
         * are given a profile at signup. A core-team clan is made of exactly
         * those people, so the whole roster was unaddable to its own
         * continuation — while the ordinary cohort path, which ensures the
         * profile, had taken them happily all along.
         */
        /**
         * A dormant account is not a reason to refuse.
         *
         * This required `user.status === 'active'` and an active workspace
         * membership, so a lead mentor could not carry forward somebody who had
         * gone quiet during the programme — which is often exactly who a
         * continuation is for. Whether to bring somebody along is the mentor's
         * call, and they have picked this person by name.
         *
         * `suspended` is different in kind: it is a moderation decision, and
         * re-adding them to a clan would quietly undo an admin's action.
         */
        if (user.status === 'suspended') {
          throw new ValidationError(`${user.firstName || 'That account'} is suspended and cannot be added. An admin can lift it first.`);
        }
        const existing = await models.ClanMembership.findOne({ where: { clanId, userId, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } }, transaction });
        if (existing) { rows.push(existing); continue; }
        const count = await models.ClanMembership.count({ where: { clanId, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } }, transaction });
        if (clan.maxMentees && count >= clan.maxMentees) {
          // Say what the limit actually is and how many got in. "This clan is
          // full" alone, from a screen with no capacity control, is a dead end.
          throw new ConflictError(
            `This clan holds ${clan.maxMentees} mentees and already has ${count}. Raise its capacity in clan settings, or select fewer people.`,
          );
        }
        joined.push(userId);
        rows.push(await clans().addMember(clanId, { userId, role: 'mentee' }, actor, { transaction }));
      }
      return rows;
    });

    /**
     * Bring their work with them.
     *
     * Deliberately AFTER the transaction commits, for two reasons. The carry
     * must never cost somebody their place in the clan — a mentee who is added
     * stays added even if nothing could be continued. And `continueWork` opens
     * its own transaction and re-reads authorization, so running it inside the
     * add would block on the membership row this transaction has not committed
     * yet; that deadlock has already been paid for once on `addMember`.
     *
     * Only for clans that opted in. Migration 126 opted every pre-existing clan
     * out, so a standing clan approved before this shipped behaves exactly as it
     * did and keeps the manual button.
     *
     * And only the work whose mentor is on this clan's team — `_autoContinueFor`
     * explains why the rest waits for a person.
     */
    /**
     * And bring the rest of their record with them.
     *
     * This REPLACES the old `carryWorkOnJoin` on this path, and the two must
     * never both run: that one resumes a roadmap by assigning the step the
     * mentee had reached, while this copies that same task across, so a
     * mentee would get the step twice.
     *
     * Unconditional, where the old one was opt-in per clan. Every clan-scoped
     * read filters on `clan_id`, so a mentee who joins without this lands in
     * an empty clan however the clan is configured — which is the state
     * production was found in. `continueWork` stays as the mentor's manual
     * "pick up where we left off" button.
     *
     * Idempotent: `mirrorPriorWork` skips anything already mirrored, so a
     * second add is a no-op rather than a second copy.
     *
     * Deliberately not fatal: somebody added to a clan stays added even if
     * their history could not be copied. The copy is re-runnable; the
     * membership decision is not something to undo over it.
     */
    for (const menteeId of joined) {
      try {
        const moved = await mirrorPriorWork(sequelize, { clanId, menteeId });
        if (moved.tasks) {
          logger.info('[standingClan] carried prior work into the continuation', { clanId, menteeId, ...moved });
        }
      } catch (error) {
        logger.warn(`[standingClan] could not carry prior work for ${menteeId} into ${clanId}: ${error.message}`);
      }
      /*
       * And the way into the clan's group chat. A standing clan reaches this
       * path instead of the tail of `clanService.addMember`, so without this
       * the one kind of clan most likely to outlive a programme — and to be
       * the only place its people still talk — would be the one that never
       * sent the link.
       */
      await clanGroupChat.notifyMenteeJoinedClan({
        clanId,
        userId: menteeId,
        membershipId: rows.find((r) => r.userId === menteeId && r.role === 'mentee')?.id || null,
      });
    }
    return rows;
  }

  /**
   * Bring one mentee's work with them, if this clan carries work at all.
   *
   * The public door, because there are two ways into a standing clan: the
   * mentor's own "add mentees" flow, and the generic `POST /clans/:id/members`
   * an admin uses from the clans screen. A mentee added by an admin is still a
   * mentee joining a continuation clan, and it would be a strange product where
   * their work followed them only when a mentor did the clicking.
   *
   * Returns rather than throws, always: the caller has already committed the
   * membership and must not fail because of what happens here.
   */
  async carryWorkOnJoin(clanId, menteeId, actor, { carryAll = false } = {}) {
    try {
      const clan = await models.Clan.findByPk(clanId);
      if (!clan || clan.kind !== 'standing' || !clan.autoContinueOnJoin) {
        return { menteeId, continued: 0, skipped: true };
      }
      return this._autoContinueFor(clanId, menteeId, actor, { carryAll });
    } catch (error) {
      logger.warn(`[standingClan] could not carry work for ${menteeId} into ${clanId}: ${error.message}`);
      return { menteeId, error: error.message };
    }
  }

  /**
   * Continue work for one mentee who has just joined — but only the work whose
   * mentor came with them.
   *
   * The automatic carry is deliberately NOT "take everything". It fires per item
   * and only when the mentor who set that work is on THIS clan's mentor team
   * (lead or co-mentor). Those are the cases where nothing is really changing
   * hands: the same mentor is continuing with the same mentee, so re-picking the
   * same roadmaps by hand is pure ceremony.
   *
   * Work set by somebody who is not here is left for the manual button. Handing
   * a mentee's half-finished roadmap to a new mentor is a judgement — they have
   * not seen the submissions or the feedback behind it — and it should be made
   * by a person. `ContinueWorkLauncher` hides itself when nothing is left to
   * continue, so the button appears in exactly the cases this skips.
   *
   * Never throws. A mentee who is in the clan but whose work could not be
   * carried is a smaller problem than an add that half-failed, and the mentor
   * can still press the button.
   */
  async _autoContinueFor(clanId, menteeId, actor, { carryAll = false } = {}) {
    try {
      const [preview, team] = await Promise.all([
        this.continuationPreview(clanId, menteeId, actor),
        this._mentorTeamOf(clanId),
      ]);
      // Lead and co-mentors both count. A co-mentor who set the work and moved
      // across with the mentee is the same continuity as a lead who did; the
      // product has treated co-mentors as full peers since co-mentor parity.
      const carriesOwnWork = new Set([team.leadId, ...team.coMentorIds].filter(Boolean));
      const sameMentor = (sourceMentorId) => !!sourceMentorId && carriesOwnWork.has(sourceMentorId);

      const roadmaps = (preview.roadmaps || []).filter((row) => sameMentor(row.sourceMentorId));
      const customTasks = (preview.customTasks || [])
        .filter((row) => row.supported && sameMentor(row.sourceMentorId));
      const roadmapIds = roadmaps.map((row) => row.roadmapId).filter(Boolean);
      const taskIds = customTasks.map((row) => row.sourceTaskId).filter(Boolean);

      /**
       * On an approval, the work whose mentor stayed behind comes too.
       *
       * Holding it back is the right rule for somebody added one at a time:
       * handing a half-finished roadmap to a mentor who has not read the
       * submissions behind it is a judgement, and a person should make it.
       * An approval is not that case. The whole clan is continuing, the
       * mentor team moves across with it, and nothing is changing hands —
       * so withholding leaves the mentee standing in their new clan with an
       * empty plan and no way to finish what they had already started.
       *
       * It is re-pointed at this clan's lead rather than kept on a mentor who
       * is not here, because otherwise the mentee can submit it and nobody in
       * the clan can review it.
       */
      const strandedRoadmaps = carryAll
        ? (preview.roadmaps || []).filter((row) => !sameMentor(row.sourceMentorId))
        : [];
      const strandedTasks = carryAll
        ? (preview.customTasks || []).filter((row) => row.supported && !sameMentor(row.sourceMentorId))
        : [];

      const held = (preview.roadmaps || []).length - roadmaps.length - strandedRoadmaps.length
        + (preview.customTasks || []).filter((row) => row.supported).length
        - customTasks.length - strandedTasks.length;

      if (!roadmapIds.length && !taskIds.length && !strandedRoadmaps.length && !strandedTasks.length) {
        if (held) {
          logger.info('[standingClan] left work for the manual button (different mentor)', {
            clanId, menteeId, held,
          });
        }
        return { menteeId, continued: 0, held };
      }

      let result = null;
      if (roadmapIds.length || taskIds.length) {
        result = await this.continueWork(
          clanId, menteeId, { roadmapIds, taskIds }, actor, { preserveSourceMentor: true },
        );
      }
      let adopted = null;
      if (strandedRoadmaps.length || strandedTasks.length) {
        adopted = await this.continueWork(
          clanId, menteeId,
          {
            roadmapIds: strandedRoadmaps.map((row) => row.roadmapId).filter(Boolean),
            taskIds: strandedTasks.map((row) => row.sourceTaskId).filter(Boolean),
          },
          actor,
          { preserveSourceMentor: true, mentorIdOverride: team.leadId || actor.id },
        );
      }
      logger.info('[standingClan] carried work on join', {
        clanId, menteeId,
        roadmaps: roadmapIds.length, customTasks: taskIds.length,
        adoptedRoadmaps: strandedRoadmaps.length, adoptedTasks: strandedTasks.length,
        held,
      });
      return { menteeId, result, adopted, held };
    } catch (error) {
      logger.warn(`[standingClan] could not carry work for ${menteeId} into ${clanId}: ${error.message}`);
      return { menteeId, error: error.message };
    }
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
