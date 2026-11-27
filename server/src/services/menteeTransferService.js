const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ForbiddenError, ValidationError, ConflictError } = require('../utils/errors/errorTypes');
const authzService = require('./authzService');
const clanService = require('./clanService');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { PERMISSIONS: P } = require('../config/permissions');
const featureGate = require('../config/menteeTransfer');
const { createAuditLog } = require('../utils/auditContext');
const { isProgrammeClan, isNonProgrammeClan, isStandingClan } = require('../config/clanKinds');

const fullName = (u) => (u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Someone' : 'Someone');

/**
 * menteeTransferService — mentor-to-mentor mentee moves.
 *
 * The admin has always been able to reassign a mentee outright. This gives the
 * same outcome to the people closest to the mentee, WITHOUT giving one mentor
 * unilateral power over another's roster: it's a two-sided handshake.
 *
 *   1. A mentor (or permitted co-mentor) of the mentee's CURRENT clan picks a
 *      target clan and says why  →  request().
 *   2. Everyone who can decide for the TARGET clan (its lead mentor, plus
 *      co-mentors who still hold `mentee.transfer`) is notified — in-app always,
 *      email only when they're not currently online.
 *   3. One of them accepts or rejects with a reason  →  respond().
 *   4. On accept the move runs through `clanService.reassignMentee`, the exact
 *      same code path the admin console uses, so the after-effects (enrollment
 *      kept within a program / wiped across programs, tasks, matches) are
 *      identical to an admin move. No second implementation to drift.
 *
 * Rows live in `clan_change_requests` alongside admin-raised ones (origin
 * distinguishes them) so the admin requests page shows one queue for both.
 */
class MenteeTransferService {
  /** Feature availability — the client renders live UI, a teaser, or a "New" badge. */
  config() {
    return featureGate.publicConfig();
  }

  _assertEnabled() {
    if (!featureGate.enabled()) {
      throw new ForbiddenError('Moving a mentee to another clan isn’t available yet.');
    }
  }

  /** The clan the mentee currently learns in (their single active mentee placement). */
  async _currentClanOf(menteeId) {
    const membership = await models.ClanMembership.findOne({
      where: { userId: menteeId, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } },
      include: [{ model: models.Clan, as: 'clan', attributes: ['id', 'name', 'programId', 'kind', 'frozenAt'] }],
    });
    return membership?.clan || null;
  }

  /**
   * May `user` make transfer decisions for this clan? True for its lead mentor,
   * for a co-mentor who still holds the permission (a lead can revoke it per
   * person), and for admins. Delegates to authzService so a co-mentor granted
   * through ANY route — team membership, IAM grant, cross-clan cover — resolves
   * the same way the rest of the app resolves them.
   */
  async _canDecideFor(user, clanId, assignments = null) {
    const resource = await authzService.scopeOfClan(clanId);
    return authzService.can(user, P.MENTEE_TRANSFER, resource, assignments ? { assignments } : {});
  }

  /**
   * Clans this mentor can send the mentee TO, shown with the human context that
   * actually drives the decision: who leads it, who else mentors there, how big
   * it already is, and which program it belongs to (a cross-program move resets
   * the mentee's roadmap, so we say so).
   *
   * Deliberately NOT limited to the requester's own clans — the whole point is
   * handing a mentee to a mentor who fits them better, who is usually someone
   * else entirely. The target side still has to accept.
   */
  async targets(user, menteeId, { q } = {}) {
    const mentee = await models.User.findByPk(menteeId, { attributes: ['id', 'firstName', 'lastName'] });
    if (!mentee) throw new NotFoundError('Mentee not found');
    const current = await this._currentClanOf(menteeId);
    if (!current) throw new ValidationError('This mentee isn’t placed in a clan yet, so there’s nothing to move.');

    // Only a mentor of the mentee's CURRENT clan may hand them on.
    if (!(await this._canDecideFor(user, current.id))) {
      throw new ForbiddenError('You don’t have permission to move this mentee.');
    }

    /*
     * Only clans that take people: a finished programme's cohort clans are a
     * record, its standing clans are where it carries on. Same list, same
     * order and same "are its mentors meeting?" facts the admin decides with,
     * so a mentor's suggestion and an admin's are never two different lists.
     */
    const mine = await models.ClanMembership.findAll({
      where: { userId: menteeId, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } },
      attributes: ['clanId'],
    });
    let destinations = await require('./clanDestinationService').list({
      fromClan: current, excludeClanIds: [current.id, ...mine.map((m) => m.clanId)],
    });
    if (q && q.trim()) {
      const needle = q.trim().toLowerCase();
      destinations = destinations.filter((d) => `${d.name} ${d.programName || ''} ${d.mentor || ''}`.toLowerCase().includes(needle));
    }
    const facts = new Map(destinations.map((d) => [d.id, d]));
    if (!destinations.length) {
      return {
        mentee: { id: mentee.id, name: fullName(mentee) },
        currentClan: { id: current.id, name: current.name, programId: current.programId },
        pendingRequest: null,
        clans: [],
      };
    }

    const clans = await models.Clan.findAll({
      where: { id: { [Op.in]: [...facts.keys()] } },
      attributes: ['id', 'name', 'programId', 'leadMentorId'],
      include: [
        { model: models.Program, as: 'program', attributes: ['id', 'name'], required: false },
        {
          model: models.ClanMembership,
          as: 'memberships',
          required: false,
          where: { status: 'active' },
          attributes: ['id', 'role', 'userId'],
          include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'] }],
        },
      ],
    });
    // The suggested order, not alphabetical.
    clans.sort((a, b) => destinations.indexOf(facts.get(a.id)) - destinations.indexOf(facts.get(b.id)));

    // A pending request already in flight for this mentee blocks a second one —
    // surface it so the UI can say so rather than failing on submit.
    const pending = await models.ClanChangeRequest.findOne({
      where: { menteeId, status: 'pending' },
      attributes: ['id', 'toClanId'],
    });

    return {
      mentee: { id: mentee.id, name: fullName(mentee) },
      currentClan: { id: current.id, name: current.name, programId: current.programId },
      pendingRequest: pending ? { id: pending.id, toClanId: pending.toClanId } : null,
      clans: clans.map((c) => {
        const members = c.memberships || [];
        const lead = members.find((m) => m.role === 'lead_mentor' && m.userId === c.leadMentorId)
          || members.find((m) => m.role === 'lead_mentor');
        const coMentors = members.filter((m) => m.role === 'co_mentor' && m.userId !== lead?.userId);
        const d = facts.get(c.id);
        return {
          id: c.id,
          name: c.name,
          programId: c.programId,
          programName: c.program?.name || null,
          kind: d.kind,
          status: d.status,
          reviewWeeks: d.reviewWeeks,
          lastReviewAt: d.lastReviewAt,
          activity: d.activity,
          suggested: d.suggested,
          effect: d.effect,
          // A different program means a clean transfer (old enrollment + tasks
          // are wiped) — the picker warns before you send. A standing clan is
          // joined instead, which wipes nothing.
          crossProgram: d.effect === 'move_cross',
          menteeCount: members.filter((m) => m.role === 'mentee').length,
          leadMentor: lead?.user
            ? { id: lead.user.id, name: fullName(lead.user), avatarUrl: lead.user.profilePictureUrl || null }
            : null,
          coMentors: coMentors.slice(0, 4).map((m) => ({
            id: m.user?.id, name: fullName(m.user), avatarUrl: m.user?.profilePictureUrl || null,
          })).filter((m) => m.id),
          coMentorCount: coMentors.length,
        };
      }),
    };
  }

  /** Ask another clan to take this mentee. */
  async request(user, { menteeId, toClanId, reason }) {
    this._assertEnabled();
    if (!menteeId || !toClanId) throw new ValidationError('Pick a mentee and a clan to move them to');

    const [mentee, toClan] = await Promise.all([
      models.User.findByPk(menteeId, { attributes: ['id', 'firstName', 'lastName'] }),
      models.Clan.findByPk(toClanId, {
        attributes: ['id', 'name', 'status', 'kind', 'frozenAt'],
        include: [{ model: models.Program, as: 'program', attributes: ['id', 'closedAt'] }],
      }),
    ]);
    if (!mentee) throw new NotFoundError('Mentee not found');
    if (!toClan) throw new NotFoundError('Target clan not found');
    const takesPeople = toClan.status !== 'archived'
      // A selection round is not a transfer destination: candidates are
      // invited into a trial, not moved into one.
      && (isStandingClan(toClan) || (isProgrammeClan(toClan) && !toClan.frozenAt && !toClan.program?.closedAt));
    if (!takesPeople) throw new ValidationError('That clan has closed and isn’t taking people — its standing clan is usually the right place');

    const current = await this._currentClanOf(menteeId);
    if (!current) throw new ValidationError('This mentee isn’t placed in a clan yet, so there’s nothing to move.');
    if (current.id === toClanId) throw new ValidationError('That mentee is already in this clan');

    if (!(await this._canDecideFor(user, current.id))) {
      throw new ForbiddenError('You don’t have permission to move this mentee.');
    }

    // One open ask per mentee: two mentors bidding for the same person, or one
    // mentor firing off several, would make the accept side incoherent.
    const existing = await models.ClanChangeRequest.findOne({ where: { menteeId, status: 'pending' } });
    if (existing) {
      throw new ConflictError(`There’s already a pending move request for ${fullName(mentee)}.`);
    }

    const request = await models.ClanChangeRequest.create({
      menteeId,
      fromClanId: current.id,
      toClanId,
      reason: reason ? String(reason).trim() : null,
      status: 'pending',
      origin: 'mentor',
      createdBy: user.id,
    });

    await this._notifyRequested({ request, mentee, toClan, fromClanName: current.name, requester: user })
      .catch((e) => console.error('[menteeTransfer] request notify failed (non-fatal):', e.message));

    await createAuditLog({
      userId: user.id, action: 'MENTEE_TRANSFER_REQUESTED', entityType: 'ClanChangeRequest', entityId: request.id,
      newValues: { menteeId, fromClanId: current.id, toClanId },
    }).catch(() => {});

    return this._shape(request, { mentee, toClan, fromClanName: current.name, requester: user });
  }

  /** Everyone who may decide for a clan — its deciders get the ask. */
  async _decidersFor(clanId, { excludeUserId } = {}) {
    const memberships = await models.ClanMembership.findAll({
      where: { clanId, status: 'active', role: { [Op.in]: ['lead_mentor', 'co_mentor'] } },
      attributes: ['userId', 'role'],
    });
    const grants = await models.RoleAssignment.findAll({
      where: { scopeType: 'clan', scopeId: clanId, role: { [Op.in]: ['lead_mentor', 'co_mentor'] } },
      attributes: ['userId'],
    });
    const clan = await models.Clan.findByPk(clanId, { attributes: ['leadMentorId'] });

    const ids = new Set();
    memberships.forEach((m) => m.userId && ids.add(m.userId));
    grants.forEach((g) => g.userId && ids.add(g.userId));
    if (clan?.leadMentorId) ids.add(clan.leadMentorId);
    if (excludeUserId) ids.delete(excludeUserId);
    if (!ids.size) return [];

    // Re-check each one: a co-mentor whose lead revoked `mentee.transfer` must
    // not be asked to decide something they can't act on.
    const users = await models.User.findAll({
      where: { id: [...ids], status: 'active' },
      attributes: ['id', 'firstName', 'lastName', 'role', 'capabilities'],
    });
    const allowed = [];
    for (const u of users) {
      if (await this._canDecideFor(u, clanId)) allowed.push(u);
    }
    return allowed;
  }

  async _notifyRequested({ request, mentee, toClan, fromClanName, requester }) {
    const deciders = await this._decidersFor(toClan.id, { excludeUserId: requester.id });
    if (!deciders.length) {
      console.warn('[menteeTransfer] no eligible decider for clan', toClan.id);
      return;
    }
    const who = fullName(mentee);
    const by = fullName(requester);
    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.MENTEE_TRANSFER_REQUESTED,
      recipients: deciders.map((d) => ({ userId: d.id })),
      payload: {
        title: `${by} wants to move a mentee to ${toClan.name}`,
        message: `${by} asked you to take ${who} from ${fromClanName} into ${toClan.name}.${request.reason ? ` Reason: ${request.reason}` : ''} Accept or decline on your Clan Team page.`,
        actionUrl: `/mentor/clan-team?transfer=${request.id}`,
        actionLabel: 'Review request',
        relatedEntityType: 'mentee_transfer',
        relatedEntityId: request.id,
        emailSubject: `Pathment: can ${toClan.name} take ${who}?`,
      },
      // In-app always; the email only reaches someone who isn't already in the app.
      emailOnlyIfOffline: true,
      dedupe: { relatedEntityType: 'mentee_transfer', relatedEntityId: request.id },
    });
  }

  /** Pending asks addressed to clans this user can decide for. */
  async incoming(user) {
    const clanIds = await authzService.mentoredClanIds(user.id);
    if (!clanIds.length) return [];
    const assignments = await authzService.getAssignments(user);
    const decidable = [];
    for (const clanId of clanIds) {
      if (await this._canDecideFor(user, clanId, assignments)) decidable.push(clanId);
    }
    if (!decidable.length) return [];

    const rows = await models.ClanChangeRequest.findAll({
      where: { toClanId: { [Op.in]: decidable }, status: 'pending', origin: 'mentor' },
      order: [['created_at', 'DESC']],
      include: this._includes(),
    });
    return rows.map((r) => this._shape(r));
  }

  /** Asks this user raised — so they can watch the outcome, or withdraw. */
  async outgoing(user, { limit = 20 } = {}) {
    const rows = await models.ClanChangeRequest.findAll({
      where: { createdBy: user.id, origin: 'mentor' },
      order: [['status', 'ASC'], ['created_at', 'DESC']],
      limit,
      include: this._includes(),
    });
    return rows.map((r) => this._shape(r));
  }

  _includes() {
    return [
      { model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl', 'email'] },
      { model: models.User, as: 'requester', attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'] },
      { model: models.User, as: 'resolver', attributes: ['id', 'firstName', 'lastName'] },
      { model: models.Clan, as: 'fromClan', attributes: ['id', 'name'] },
      { model: models.Clan, as: 'toClan', attributes: ['id', 'name'] },
    ];
  }

  _shape(r, extra = {}) {
    const mentee = r.mentee || extra.mentee;
    const requester = r.requester || extra.requester;
    return {
      id: r.id,
      status: r.status,
      reason: r.reason,
      resolutionNote: r.resolutionNote,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
      mentee: mentee ? {
        id: mentee.id, name: fullName(mentee),
        avatarUrl: mentee.profilePictureUrl || null, email: mentee.email || null,
      } : null,
      requester: requester ? {
        id: requester.id, name: fullName(requester), avatarUrl: requester.profilePictureUrl || null,
      } : null,
      resolver: r.resolver ? { id: r.resolver.id, name: fullName(r.resolver) } : null,
      fromClan: r.fromClan ? { id: r.fromClan.id, name: r.fromClan.name } : (extra.fromClanName ? { id: r.fromClanId, name: extra.fromClanName } : null),
      toClan: r.toClan ? { id: r.toClan.id, name: r.toClan.name } : (extra.toClan ? { id: extra.toClan.id, name: extra.toClan.name } : null),
    };
  }

  /**
   * The receiving side decides. Accepting runs the SAME reassignment the admin
   * console runs, so behaviour after the move is identical by construction.
   */
  async respond(user, id, { accept, note }) {
    this._assertEnabled();
    const request = await models.ClanChangeRequest.findByPk(id, { include: this._includes() });
    if (!request) throw new NotFoundError('Request not found');
    if (request.status !== 'pending') throw new ValidationError('This request has already been decided');
    if (!(await this._canDecideFor(user, request.toClanId))) {
      throw new ForbiddenError('You don’t have permission to decide this request.');
    }
    // A rejection has to say why — the requesting mentor is owed a reason, and
    // "declined" with no explanation is how a handoff process dies.
    const trimmedNote = note ? String(note).trim() : '';
    if (!accept && !trimmedNote) throw new ValidationError('Please give a reason so the other mentor knows why.');

    if (accept) {
      // Placement first: if the move fails (mentee already moved elsewhere, clan
      // gone), the request stays pending rather than claiming a move that
      // never happened.
      const target = await models.Clan.findByPk(request.toClanId, { attributes: ['id', 'kind'] });
      if (isNonProgrammeClan(target)) {
        // Joined, not transferred into: their current clan stays as it is.
        await clanService.addMember(request.toClanId, { userId: request.menteeId, role: 'mentee' }, user);
      } else {
        await clanService.reassignMentee(request.menteeId, request.toClanId, user.id);
      }
    }

    request.status = accept ? 'approved' : 'denied';
    request.resolutionNote = trimmedNote || null;
    request.resolvedBy = user.id;
    request.resolvedAt = new Date();
    await request.save();

    await this._notifyDecided({ request, responder: user, accepted: !!accept })
      .catch((e) => console.error('[menteeTransfer] decision notify failed (non-fatal):', e.message));

    await createAuditLog({
      userId: user.id,
      action: accept ? 'MENTEE_TRANSFER_APPROVED' : 'MENTEE_TRANSFER_DENIED',
      entityType: 'ClanChangeRequest', entityId: request.id,
      newValues: { menteeId: request.menteeId, toClanId: request.toClanId, note: trimmedNote || null },
    }).catch(() => {});

    return this._shape(request);
  }

  async _notifyDecided({ request, responder, accepted }) {
    const menteeName = fullName(request.mentee);
    const toClanName = request.toClan?.name || 'the clan';
    const fromClanName = request.fromClan?.name || 'their clan';
    const by = fullName(responder);
    const verb = accepted ? 'accepted' : 'declined';

    // 1) The mentor who asked — they're waiting on this answer.
    if (request.createdBy) {
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.MENTEE_TRANSFER_DECIDED,
        recipients: [{ userId: request.createdBy }],
        payload: {
          title: accepted ? `${menteeName} moved to ${toClanName}` : `Move request declined`,
          message: accepted
            ? `${by} accepted your request — ${menteeName} is now a mentee of ${toClanName}.`
            : `${by} declined your request to move ${menteeName} to ${toClanName}. Reason: ${request.resolutionNote || '—'}`,
          actionUrl: '/mentor/clan-team',
          actionLabel: 'Open Clan Team',
          relatedEntityType: 'mentee_transfer_decision',
          relatedEntityId: request.id,
          emailSubject: `Pathment: your move request was ${verb}`,
        },
        emailOnlyIfOffline: true,
        dedupe: { relatedEntityType: 'mentee_transfer_decision', relatedEntityId: request.id },
      });
    }

    // 2) The mentee — only once they've ACTUALLY moved. A declined request is an
    //    internal mentor conversation; telling the mentee about it would be odd
    //    and a little hurtful.
    if (accepted) {
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.MENTEE_TRANSFER_DECIDED,
        recipients: [{ userId: request.menteeId }],
        payload: {
          title: `You’ve moved to ${toClanName}`,
          message: `You're now part of ${toClanName} (previously ${fromClanName}). Say hello to your new mentor and team.`,
          actionUrl: '/mentee/dashboard',
          actionLabel: 'Open dashboard',
          relatedEntityType: 'mentee_transfer_moved',
          relatedEntityId: request.id,
          emailSubject: `Pathment: you’ve moved to ${toClanName}`,
        },
        dedupe: { relatedEntityType: 'mentee_transfer_moved', relatedEntityId: request.id },
      });
    }

    // 3) Admins, in-app only, for oversight of placement changes they didn't make.
    const admins = await require('./workspaceRecipients').admins();
    if (admins.length) {
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.MENTEE_TRANSFER_DECIDED,
        recipients: admins.map((a) => ({ userId: a.id })),
        payload: {
          title: accepted ? 'Mentee moved between clans' : 'Clan move declined',
          message: `${by} ${verb} the request to move ${menteeName} from ${fromClanName} to ${toClanName}.`,
          actionUrl: '/admin/requests',
          actionLabel: 'View requests',
          relatedEntityType: 'mentee_transfer_admin',
          relatedEntityId: request.id,
        },
        channelOverrides: { email: false },
        dedupe: { relatedEntityType: 'mentee_transfer_admin', relatedEntityId: request.id },
      });
    }
  }

  /** The requester withdraws before anyone decides. */
  async cancel(user, id) {
    const request = await models.ClanChangeRequest.findByPk(id);
    if (!request) throw new NotFoundError('Request not found');
    if (request.createdBy !== user.id) throw new ForbiddenError('Only the mentor who raised this can withdraw it');
    if (request.status !== 'pending') throw new ValidationError('This request has already been decided');
    request.status = 'cancelled';
    request.resolvedAt = new Date();
    await request.save();
    return { id: request.id, status: request.status };
  }
}

module.exports = new MenteeTransferService();
