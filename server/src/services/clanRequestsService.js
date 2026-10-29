const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError, AuthorizationError } = require('../utils/errors/errorTypes');
const clanService = require('./clanService');
const clanLifecycleService = require('./clanLifecycleService');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { VISIBLE_MEMBERSHIP_STATUSES } = require('../config/membership');

const fullName = (u) => (u ? `${u.firstName} ${u.lastName}`.trim() : null);

const CROSS_KIND_LABEL = { cover: 'cover for', specialist: 'specialist help in', co_mentee_access: 'mentee access in' };

/**
 * Why a mentee asks to move: a short code, and the same reason worded for each
 * of the two people who read it.
 *
 * A free-text box alone gets "i want to change" forty times, which tells an
 * admin nothing and makes a queue of four hundred impossible to triage. A
 * category alone loses the detail that actually decides it. So: one of these,
 * AND their own words. The category is what the queue groups on; the words are
 * what the admin judges.
 *
 * Two labels because there are two readers. The mentee is choosing a sentence
 * about themselves and must see it in the first person; the admin is reading
 * about somebody else and must see it in the third. One shared string would
 * have to be wrong for one of them - and the version that got written first
 * ("the pace is wrong for them") was the one the mentee had to pick from.
 */
const MENTEE_REASON_CODES = {
  timezone: { mine: 'The clan\u2019s hours do not work for me', theirs: 'The clan\u2019s hours do not work for them' },
  schedule: { mine: 'I cannot make the review slot', theirs: 'They cannot make the review slot' },
  pace: { mine: 'The pace is wrong for me', theirs: 'The pace is wrong for them' },
  mentor_fit: { mine: 'I would work better with a different mentor', theirs: 'They would work better with a different mentor' },
  peers: { mine: 'I want to be with different peers', theirs: 'They want to be with different peers' },
  other: { mine: 'Something else', theirs: 'Something else' },
};

/** Admin clan operations: change requests, cross-clan assignments, policies. */
class ClanRequestsService {
  /**
   * The queue, bounded by what this admin administers.
   *
   * It took no scope at all, so a programme admin opened it to every move
   * request and cover assignment in the workspace — other programmes' people,
   * clans and mentors, named. The rows already carry the programme (it is how
   * the screen filters), so the bound is the same fact applied earlier.
   *
   * @param {string[]|null} programIds  null = unrestricted (an org-tier admin).
   */
  async overview(programIds = null) {
    const scoped = Array.isArray(programIds);
    // A request names two clans; it belongs to either. Empty scope → no rows.
    const inScope = scoped
      ? { [Op.or]: [
        { '$fromClan.program_id$': { [Op.in]: programIds } },
        { '$toClan.program_id$': { [Op.in]: programIds } },
      ] }
      : {};

    const [requests, crossClan] = await Promise.all([
      models.ClanChangeRequest.findAll({
        where: inScope,
        order: [['status', 'ASC'], ['created_at', 'DESC']],
        include: [
          { model: models.User, as: 'mentee', attributes: ['firstName', 'lastName'] },
          { model: models.User, as: 'requester', attributes: ['firstName', 'lastName'] },
          // The programme each clan belongs to travels with it, so the admin
          // screen can filter this queue by programme — with forty-odd clans
          // in a workspace, "which of these are mine" is the first question.
          { model: models.Clan, as: 'fromClan', attributes: ['name', 'programId'] },
          { model: models.Clan, as: 'toClan', attributes: ['name', 'programId'] }
        ]
      }),
      models.CrossClanAssignment.findAll({
        where: inScope,
        order: [['created_at', 'DESC']],
        include: [
          { model: models.User, as: 'user', attributes: ['firstName', 'lastName'] },
          { model: models.Clan, as: 'fromClan', attributes: ['name', 'programId'] },
          { model: models.Clan, as: 'toClan', attributes: ['name', 'programId'] }
        ]
      })
    ]);

    return {
      requests: requests.map((r) => ({
        id: r.id,
        mentee: fullName(r.mentee),
        fromClan: r.fromClan?.name || null,
        toClan: r.toClan?.name || null,
        fromClanId: r.fromClanId || null,
        toClanId: r.toClanId || null,
        programId: r.toClan?.programId || r.fromClan?.programId || null,
        reason: r.reason,
        status: r.status,
        resolutionNote: r.resolutionNote,
        // 'mentor' rows are waiting on the RECEIVING clan, not on the admin —
        // the admin can still decide, but should know they're stepping in.
        origin: r.origin || 'admin',
        requestedBy: fullName(r.requester),
        at: r.createdAt
      })),
      crossClan: crossClan.map((c) => ({
        id: c.id,
        kind: c.kind,
        user: fullName(c.user),
        fromClan: c.fromClan?.name || null,
        toClan: c.toClan?.name || null,
        fromClanId: c.fromClanId || null,
        toClanId: c.toClanId || null,
        programId: c.toClan?.programId || c.fromClan?.programId || null,
        note: c.note,
        status: c.status,
        at: c.createdAt
      }))
    };
  }

  /**
   * An ADMIN raises a move from the console. Not the mentee's own path - that
   * is `requestOwnMove`, and the difference is authority, not a body field.
   *
   * This used to be reachable by any authenticated user with any `menteeId`
   * and any `toClanId` in the body, which let a mentee queue a move for
   * somebody else entirely; an admin approving it in good faith would then
   * reassign a person nobody had asked about. The route now carries the
   * permission and `origin` is set here rather than trusted from the caller,
   * so the three origins cannot be impersonated through one another.
   */
  async createRequest({ menteeId, toClanId, fromClanId, reason }, createdBy) {
    if (!menteeId || !toClanId) throw new ValidationError('menteeId and toClanId are required');
    return models.ClanChangeRequest.create({
      menteeId, toClanId, fromClanId: fromClanId || null, reason: reason || null,
      origin: 'admin', createdBy,
    });
  }

  // ── the mentee's own ask ───────────────────────────────────────────────────

  /**
   * One of the mentee's clans, with the programme it belongs to, refusing the
   * ones a move makes no sense from.
   *
   * `resolveMenteeClanId` is the shared resolver and it is deliberately strict:
   * it will not pick for somebody who is in several clans, because guessing
   * which clan a mentee wants to LEAVE is the one guess that cannot be
   * recovered from.
   */
  async _menteeClan(userId, clanId) {
    const { resolveMenteeClanId } = require('./menteeClanScope');
    const resolved = await resolveMenteeClanId(userId, clanId || null);
    if (!resolved) throw new ValidationError('You are not in a clan yet, so there is nothing to move from');

    const clan = await models.Clan.findByPk(resolved, {
      attributes: ['id', 'name', 'kind', 'programId', 'frozenAt', 'avatarUrl'],
    });
    if (!clan) throw new NotFoundError('Clan not found');
    /*
     * Not from a standing clan.
     *
     * A standing clan DOES belong to a programme - `clans.program_id` is NOT
     * NULL and it inherits the programme it continues - so the reason is not
     * the one it would be easy to assume. It is that `reassignMentee` builds
     * its list of memberships to close with `where: { kind: 'cohort' }`, so a
     * standing membership is never ended by a move. Approving one would add
     * the mentee to a cohort clan and leave them in the standing clan as
     * well: two placements, not a transfer.
     *
     * Leaving a standing clan is a different act from being moved between
     * parallel clans of a running cohort, and it is not this feature.
     */
    if (clan.kind === 'standing') {
      throw new ValidationError('Standing clans are not moved between. Ask your admin directly if you want to leave this one.');
    }
    await clanLifecycleService.assertClanWritable(clan.id);
    return clan;
  }

  /**
   * What the mentee's own page needs in one read: where they are, where they
   * could ask to go, what they have already asked, and why they might.
   *
   * Siblings are the other live cohort clans of the SAME programme. A mentee
   * cannot ask to be moved into another programme - that is an enrolment
   * decision with a different roadmap behind it, and `reassignMentee` would
   * wipe their work to make it, which is not something a mentee should be able
   * to set in motion from a form.
   */
  async myClanChangeOptions(userId) {
    const memberships = await models.ClanMembership.findAll({
      where: { userId, role: 'mentee', status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES } },
      attributes: ['clanId', 'status'],
      include: [{
        model: models.Clan, as: 'clan', required: true,
        attributes: ['id', 'name', 'kind', 'programId', 'frozenAt', 'avatarUrl'],
        include: [{ model: models.Program, as: 'program', attributes: ['id', 'name'] }],
      }],
    });

    /*
     * Every clan they are in, standing ones included.
     *
     * Filtering these out was a small lie with a loud symptom: a mentee whose
     * only membership is a standing clan got an empty list, and the page told
     * them "you are not in a clan yet" while they were sitting in one. They
     * cannot ask to be moved out of it (see `_menteeClan`), so it carries
     * `canRequest: false` and is shown without the button rather than hidden.
     */
    const mine = memberships.filter((m) => m.clan);
    const programIds = [...new Set(
      mine.filter((m) => m.clan.kind === 'cohort').map((m) => m.clan.programId).filter(Boolean),
    )];

    // Every live cohort clan of those programmes, with the lead mentor's name
    // and how many mentees are in it. No capacity figure: `Clan` has no such
    // column, and inventing one from member counts would read as a promise.
    const siblings = programIds.length
      ? await models.Clan.findAll({
        where: { programId: { [Op.in]: programIds }, kind: 'cohort', frozenAt: null },
        attributes: ['id', 'name', 'programId', 'avatarUrl'],
        include: [{
          model: models.User, as: 'leadMentor', attributes: ['id', 'firstName', 'lastName'], required: false,
        }],
        order: [['name', 'ASC']],
      })
      : [];

    const counts = siblings.length
      ? await models.ClanMembership.findAll({
        where: {
          clanId: { [Op.in]: siblings.map((c) => c.id) },
          role: 'mentee',
          status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES },
        },
        attributes: ['clanId', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
        group: ['clanId'],
        raw: true,
      })
      : [];
    const countOf = Object.fromEntries(counts.map((r) => [r.clanId, Number(r.n)]));

    const requests = await this.myClanChangeRequests(userId);

    return {
      clans: mine.map((m) => ({
        id: m.clan.id,
        name: m.clan.name,
        avatarUrl: m.clan.avatarUrl || null,
        paused: m.status === 'paused',
        // A closed cohort is read-only, so `requestOwnMove` will refuse it.
        // Said here too, or the page offers a button that can only ever fail.
        closed: Boolean(m.clan.frozenAt),
        standing: m.clan.kind === 'standing',
        // The single answer to "may they ask about this clan", so the page
        // never has to re-derive it and disagree with the server.
        canRequest: m.clan.kind === 'cohort' && !m.clan.frozenAt,
        programId: m.clan.programId,
        programName: m.clan.program?.name || null,
        // Their own clan is never offered as a destination.
        options: (m.clan.kind === 'cohort' ? siblings : [])
          .filter((c) => c.programId === m.clan.programId && c.id !== m.clan.id)
          .map((c) => ({
            id: c.id,
            name: c.name,
            avatarUrl: c.avatarUrl || null,
            mentor: c.leadMentor ? fullName(c.leadMentor) : null,
            mentees: countOf[c.id] || 0,
          })),
      })),
      reasons: Object.entries(MENTEE_REASON_CODES).map(([code, label]) => ({ code, label: label.mine })),
      requests,
    };
  }

  /** The mentee's own requests, newest first, with the answer when there is one. */
  async myClanChangeRequests(userId) {
    const rows = await models.ClanChangeRequest.findAll({
      where: { menteeId: userId, origin: 'mentee' },
      order: [['created_at', 'DESC']],
      limit: 20,
      include: [
        { model: models.Clan, as: 'fromClan', attributes: ['id', 'name', 'avatarUrl'] },
        { model: models.Clan, as: 'toClan', attributes: ['id', 'name', 'avatarUrl'] },
        { model: models.User, as: 'resolver', attributes: ['firstName', 'lastName'] },
      ],
    });
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      reason: r.reason,
      fromClan: r.fromClan?.name || null,
      fromClanId: r.fromClanId || null,
      // Null while it is open and they named no preference - the admin has not
      // chosen yet, and the page says exactly that rather than showing a blank.
      toClan: r.toClan?.name || null,
      toClanId: r.toClanId || null,
      resolutionNote: r.resolutionNote,
      resolvedBy: r.resolver ? fullName(r.resolver) : null,
      resolvedAt: r.resolvedAt,
      at: r.createdAt,
    }));
  }

  /**
   * The mentee asks to be moved.
   *
   * `toClanId` is optional on purpose: see the migration. Naming a clan makes
   * it a preference, not a decision - the admin can approve into a different
   * one, and the mentee's page says which they were actually moved to.
   */
  async requestOwnMove({ fromClanId, toClanId, reasonCode, note }, user) {
    const code = String(reasonCode || '').trim();
    if (!MENTEE_REASON_CODES[code]) throw new ValidationError('Choose a reason for the move');
    const words = String(note || '').trim();
    if (words.length < 10) {
      throw new ValidationError('Tell the admin a little more - at least a sentence about why');
    }
    if (words.length > 2000) throw new ValidationError('Please keep this under 2000 characters');

    const from = await this._menteeClan(user.id, fromClanId);

    // One open ask per clan, not per person: a mentee in two clans may well
    // need to move out of one and be perfectly happy in the other.
    const open = await models.ClanChangeRequest.findOne({
      where: { menteeId: user.id, fromClanId: from.id, status: 'pending' },
    });
    if (open) {
      throw new ValidationError('You already have a request waiting on an admin for this clan');
    }

    let target = null;
    if (toClanId) {
      target = await models.Clan.findByPk(toClanId, {
        attributes: ['id', 'name', 'kind', 'programId', 'frozenAt'],
      });
      if (!target) throw new NotFoundError('That clan no longer exists');
      if (target.id === from.id) throw new ValidationError('That is the clan you are already in');
      if (target.kind !== 'cohort' || target.frozenAt) {
        throw new ValidationError('That clan is not taking people');
      }
      // The cross-programme bar, enforced here rather than trusted from the
      // form: a different programme means a different roadmap, and the move
      // would discard this mentee's work to make room for it.
      if (target.programId !== from.programId) {
        throw new ValidationError('You can only ask to move within your own program');
      }
    }

    const request = await models.ClanChangeRequest.create({
      menteeId: user.id,
      fromClanId: from.id,
      toClanId: target ? target.id : null,
      // Both halves in one column, because that is what the admin reads. The
      // code leads so the queue can group on it without a second column.
      reason: `${MENTEE_REASON_CODES[code].theirs}: ${words}`,
      origin: 'mentee',
      createdBy: user.id,
    });

    await this._notifyMenteeRequest({ request, mentee: user, from, target }).catch((e) =>
      console.error('[clanRequests] mentee request notify failed (non-fatal):', e.message));

    return (await this.myClanChangeRequests(user.id)).find((r) => r.id === request.id) || null;
  }

  /** The mentee changes their mind before anyone has decided. */
  async cancelOwnMove(id, userId) {
    const request = await models.ClanChangeRequest.findByPk(id);
    if (!request) throw new NotFoundError('Request not found');
    if (request.menteeId !== userId || request.origin !== 'mentee') {
      throw new AuthorizationError('That is not your request');
    }
    if (request.status !== 'pending') {
      throw new ValidationError('That request has already been decided');
    }
    request.status = 'cancelled';
    request.resolvedAt = new Date();
    await request.save();
    return { id: request.id, status: request.status };
  }

  /**
   * Tell the programme's admins, and nobody else's.
   *
   * `workspaceRecipients.programAdmins` is the whole point: an org-tier admin
   * sees everything, and the admin who actually runs this programme - the one
   * who will decide it - holds a programme-scoped role that the plain
   * `admins()` list leaves out entirely.
   */
  async _notifyMenteeRequest({ request, mentee, from, target }) {
    const recipients = await require('./workspaceRecipients').programAdmins(from.programId);
    if (!recipients.length) return;

    const who = fullName(mentee) || 'A mentee';
    const where = target
      ? `They would like to move to ${target.name}.`
      : 'They have not named a clan, so the choice is yours.';

    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.CLAN_CHANGE_REQUESTED,
      recipients: recipients.map((a) => ({ userId: a.id })),
      payload: {
        title: 'A mentee asked to change clan',
        message: `${who} asked to move out of ${from.name}. ${where} Reason: ${request.reason}`,
        actionUrl: '/admin/requests?tab=requests',
        actionLabel: 'Review the request',
        relatedEntityType: 'clan_change_request',
        relatedEntityId: request.id,
        emailSubject: `Pathment: ${who} asked to change clan`,
      },
      dedupe: { relatedEntityType: 'clan_change_request', relatedEntityId: request.id },
    });
  }

  /** A mentee has landed in this clan by someone else's decision. */
  async _notifyReceivingMentors({ request, clanId }) {
    const [mentors, clan, mentee] = await Promise.all([
      models.ClanMembership.findAll({
        where: { clanId, role: ['lead_mentor', 'co_mentor'], status: 'active' },
        attributes: ['userId'],
      }),
      models.Clan.findByPk(clanId, { attributes: ['name'] }),
      models.User.findByPk(request.menteeId, { attributes: ['firstName', 'lastName'] }),
    ]);
    const recipientIds = [...new Set(mentors.map((m) => m.userId).filter(Boolean))];
    if (!recipientIds.length) return;

    const who = fullName(mentee) || 'A mentee';
    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.NEW_MENTEE_IN_CLAN,
      recipients: recipientIds.map((userId) => ({ userId })),
      payload: {
        title: 'A mentee has moved into your clan',
        message: `${who} has been moved into ${clan?.name || 'your clan'} by an admin. Their tasks, submissions and feedback have come with them.`,
        actionUrl: '/mentor/mentees',
        actionLabel: 'See your mentees',
        relatedEntityType: 'clan_change_arrival',
        relatedEntityId: request.id,
        emailSubject: `Pathment: ${who} has joined your clan`,
      },
      dedupe: { relatedEntityType: 'clan_change_arrival', relatedEntityId: request.id },
    });
  }

  /** The answer, to the mentee who asked. */
  async _notifyMenteeDecision({ request, approved, movedTo, note }) {
    const landed = approved && movedTo ? ` You are now in ${movedTo.name}.` : '';
    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.CLAN_CHANGE_DECIDED,
      recipients: [{ userId: request.menteeId }],
      payload: {
        title: approved ? 'Your clan change was approved' : 'Your clan change was not approved',
        message: approved
          ? `Your request to move clan has been approved.${landed}${note ? ` Note: ${note}` : ''}`
          : `Your request to move clan was not approved.${note ? ` ${note}` : ''}`,
        actionUrl: '/mentee/clan',
        actionLabel: approved ? 'See your clan' : 'See the answer',
        relatedEntityType: 'clan_change_decided',
        relatedEntityId: request.id,
        emailSubject: approved ? 'Pathment: your clan change was approved' : 'Pathment: about your clan change request',
      },
      dedupe: { relatedEntityType: 'clan_change_decided', relatedEntityId: request.id },
    });
  }

  /**
   * Admin decision on a change request — including the ones mentors now raise
   * themselves (origin='mentor'), which land in this same queue.
   *
   * Approving delegates to `clanService.reassignMentee`, the one placement
   * routine: it closes the old membership AND handles the enrollment properly
   * (kept within a program, wiped with its tasks/matches across programs). The
   * previous hand-rolled "remove row then addMember" skipped that, so an admin
   * approving a request produced a different result from a mentor accepting the
   * same one. One path, one outcome.
   */
  async resolveRequest(id, { status, note, toClanId }, actorId = null) {
    if (!['approved', 'denied'].includes(status)) throw new ValidationError('status must be approved or denied');
    const req = await models.ClanChangeRequest.findByPk(id);
    if (!req) throw new NotFoundError('Request not found');
    if (req.status !== 'pending') throw new ValidationError('This request has already been decided');

    const fromMentee = req.origin === 'mentee';

    /*
     * Where they are actually going.
     *
     * A mentee's request may name no clan at all, and may name one only as a
     * preference, so the admin's choice wins when they make one. For the other
     * two origins the destination was the request - overriding it silently
     * would answer a different question from the one that was asked - so it is
     * taken as given and an override is refused rather than ignored.
     */
    let destination = req.toClanId;
    if (status === 'approved' && toClanId && toClanId !== req.toClanId) {
      if (!fromMentee) {
        throw new ValidationError('This request names its own target clan. Deny it and raise a new one to send them elsewhere.');
      }
      destination = toClanId;
    }

    if (status === 'approved' && !destination) {
      throw new ValidationError('Choose the clan to move them into');
    }

    // A mentee who is told "no" and nothing else has no idea what to do next,
    // and will simply ask again. Mentor- and admin-raised rows keep their old
    // behaviour, where the note is genuinely optional.
    if (status === 'denied' && fromMentee && !String(note || '').trim()) {
      throw new ValidationError('Explain the decision so the mentee knows where they stand');
    }

    // Move first: if placement fails the request stays pending rather than
    // claiming a move that never happened.
    if (status === 'approved') {
      await clanService.reassignMentee(req.menteeId, destination, actorId);
      // Record the clan they were actually moved into, which for a mentee's
      // open-ended ask is the only place that answer is ever written down.
      req.toClanId = destination;
    }

    req.status = status;
    req.resolutionNote = note || null;
    req.resolvedBy = actorId || null;
    req.resolvedAt = new Date();
    await req.save();

    /*
     * Tell the mentors who have just acquired a mentee.
     *
     * `reassignMentee` places the person and mirrors their work across, but it
     * notifies nobody - the two paths that reached it before this one were an
     * admin doing it deliberately and a mentor claiming from the pool, and in
     * both the person who would be told is the person who did it. An approved
     * clan change is the first case where the receiving mentors took no action
     * at all: without this a new mentee, with a migrated history of tasks and
     * submissions, simply appears in their clan overnight.
     *
     * Deliberately not sent to the mentor they are LEAVING. A mentee citing
     * mentor fit has to be able to say so to an admin without it being
     * forwarded to the person they are talking about, or the honest version of
     * this form stops being filled in. The departure shows on their roster,
     * and an admin can explain it in the words they choose.
     */
    if (status === 'approved' && destination) {
      try {
        await this._notifyReceivingMentors({ request: req, clanId: destination });
      } catch (e) {
        console.error('[clanRequests] receiving-mentor notify failed (non-fatal):', e.message);
      }
    }

    // The mentee asked for this one — tell them the answer either way.
    if (fromMentee) {
      try {
        const movedTo = req.toClanId
          ? await models.Clan.findByPk(req.toClanId, { attributes: ['id', 'name'] })
          : null;
        await this._notifyMenteeDecision({
          request: req, approved: status === 'approved', movedTo, note: String(note || '').trim(),
        });
      } catch (e) {
        console.error('[clanRequests] mentee decision notify failed (non-fatal):', e.message);
      }
    }

    // A mentor asked for this one — tell them the answer, same as when a peer
    // mentor decides it. Best-effort; the decision itself is already saved.
    if (req.origin === 'mentor' && actorId) {
      try {
        const full = await models.ClanChangeRequest.findByPk(req.id, {
          include: [
            { model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName'] },
            { model: models.Clan, as: 'fromClan', attributes: ['id', 'name'] },
            { model: models.Clan, as: 'toClan', attributes: ['id', 'name'] },
          ],
        });
        const responder = await models.User.findByPk(actorId, { attributes: ['id', 'firstName', 'lastName'] });
        await require('./menteeTransferService')._notifyDecided({
          request: full, responder, accepted: status === 'approved',
        });
      } catch (e) {
        console.error('[clanRequests] admin decision notify failed (non-fatal):', e.message);
      }
    }

    return req;
  }

  async createCrossClan(data, createdBy) {
    if (!data.kind) throw new ValidationError('kind is required');
    // A cross-clan assignment must name WHO is helping and WHICH clan - otherwise
    // it grants nothing (the authz engine derives co-mentor access from these).
    if (!data.userId) throw new ValidationError('Select the person who will help');
    if (!data.toClanId) throw new ValidationError('Select the clan they will help');

    const [user, toClan, creator] = await Promise.all([
      models.User.findByPk(data.userId),
      models.Clan.findByPk(data.toClanId),
      createdBy ? models.User.findByPk(createdBy, { attributes: ['id', 'firstName', 'lastName', 'role'] }) : null
    ]);
    if (!user) throw new NotFoundError('User not found');
    if (!toClan) throw new NotFoundError('Target clan not found');
    if (data.fromClanId && !(await models.Clan.findByPk(data.fromClanId))) {
      throw new ValidationError('From-clan not found');
    }

    // Consent-first: an admin assigning cover is active immediately (they have
    // authority); anyone else (a lead mentor) creates a request the person must accept.
    const status = creator && await require('./authzService').can(creator, require('../config/permissions').PERMISSIONS.MENTEE_MANAGE, { orgWide: true }) ? 'active' : 'pending';

    const assignment = await models.CrossClanAssignment.create({
      kind: data.kind,
      userId: data.userId,
      fromClanId: data.fromClanId || null,
      toClanId: data.toClanId,
      note: data.note || null,
      status,
      createdBy
    });

    // Ask / inform the person, and give admins oversight when a non-admin arranged it.
    await this._notifyCrossClan({ assignment, helper: user, toClan, creator }).catch((e) =>
      console.error('[clanRequests] cross-clan notify failed:', e.message)
    );

    return assignment;
  }

  async _notifyCrossClan({ assignment, helper, toClan, creator }) {
    const what = `${CROSS_KIND_LABEL[assignment.kind] || 'help in'} ${toClan.name}`;
    const byLine = creator ? ` by ${fullName(creator)}` : '';
    const pending = assignment.status === 'pending';

    // 1) The helper - a request to accept (pending) or a heads-up (admin-assigned, active).
    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.CROSS_CLAN_ASSIGNED,
      recipients: [{ userId: helper.id }],
      payload: {
        title: pending ? 'You’ve been asked to cover another clan' : 'You’ve been added to help another clan',
        message: pending
          ? `You've been asked to provide ${what}${byLine}. Accept or decline on your Clan Team page.${assignment.note ? ` Note: ${assignment.note}` : ''}`
          : `You’re now providing ${what}${byLine}.${assignment.note ? ` Note: ${assignment.note}` : ''}`,
        actionUrl: '/mentor/clan-team',
        actionLabel: pending ? 'Respond' : 'Open Clan Team',
        relatedEntityType: 'cross_clan_assignment',
        relatedEntityId: assignment.id,
        emailSubject: pending ? `Pathment: can you cover ${toClan.name}?` : `Pathment: you're covering ${toClan.name}`
      },
      dedupe: { relatedEntityType: 'cross_clan_assignment', relatedEntityId: assignment.id }
    });

    // 2) Admins, for oversight - only when a non-admin set it up. In-app only.
    if (!creator || !(await require('./authzService').can(creator, require('../config/permissions').PERMISSIONS.MENTEE_MANAGE, { orgWide: true }))) {
      const admins = await require('./workspaceRecipients').admins();
      if (admins.length) {
        await notificationOrchestrator.dispatch({
          eventKey: NOTIFICATION_EVENTS.CROSS_CLAN_ASSIGNED,
          recipients: admins.map((a) => ({ userId: a.id })),
          payload: {
            title: 'Cross-clan cover requested',
            message: `${fullName(helper)} was asked to provide ${what}${byLine} (awaiting their acceptance).`,
            actionUrl: '/admin/requests?tab=cross',
            actionLabel: 'Review',
            relatedEntityType: 'cross_clan_assignment',
            relatedEntityId: assignment.id
          },
          channelOverrides: { email: false },
          dedupe: { relatedEntityType: 'cross_clan_assignment_admin', relatedEntityId: assignment.id }
        });
      }
    }
  }

  /** Cross-clan assignments touching a specific clan (for the lead mentor's view). */
  async listCrossClanForClan(clanId) {
    if (!clanId) return [];
    const rows = await models.CrossClanAssignment.findAll({
      where: { [Op.or]: [{ toClanId: clanId }, { fromClanId: clanId }] },
      order: [['created_at', 'DESC']],
      include: [
        { model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName'] },
        { model: models.Clan, as: 'fromClan', attributes: ['name'] },
        { model: models.Clan, as: 'toClan', attributes: ['name'] }
      ]
    });
    return rows.map((c) => ({
      id: c.id, kind: c.kind, user: fullName(c.user), userId: c.userId, toClanId: c.toClanId,
      fromClan: c.fromClan?.name || null, toClan: c.toClan?.name || null,
      note: c.note, status: c.status, at: c.createdAt
    }));
  }

  /** Cover requests/assignments addressed to a specific person (their accept surface). */
  async listMyCrossClan(userId) {
    if (!userId) return [];
    const rows = await models.CrossClanAssignment.findAll({
      where: { userId, status: { [Op.in]: ['pending', 'active'] } },
      order: [['created_at', 'DESC']],
      include: [
        { model: models.Clan, as: 'toClan', attributes: ['name'] },
        { model: models.Clan, as: 'fromClan', attributes: ['name'] }
      ]
    });
    return rows.map((c) => ({
      id: c.id, kind: c.kind, status: c.status,
      toClan: c.toClan?.name || null, fromClan: c.fromClan?.name || null,
      note: c.note, at: c.createdAt
    }));
  }

  /** The covering person accepts or declines a pending cover request. */
  async respondToCrossClan(id, userId, accept) {
    const a = await models.CrossClanAssignment.findByPk(id, {
      include: [{ model: models.Clan, as: 'toClan', attributes: ['name'] }]
    });
    if (!a) throw new NotFoundError('Request not found');
    if (a.userId !== userId) throw new ValidationError('This request is not addressed to you');
    if (a.status !== 'pending') throw new ValidationError('This request has already been responded to');

    a.status = accept ? 'active' : 'declined';
    a.respondedAt = new Date();
    await a.save();

    await this._notifyCrossClanResponse({ assignment: a, responder: userId, accepted: accept }).catch((e) =>
      console.error('[clanRequests] cross-clan response notify failed:', e.message)
    );
    return { id: a.id, status: a.status };
  }

  async _notifyCrossClanResponse({ assignment, responder, accepted }) {
    const person = await models.User.findByPk(responder, { attributes: ['firstName', 'lastName'] });
    const toClanName = assignment.toClan?.name || 'a clan';
    const verb = accepted ? 'accepted' : 'declined';
    const recipients = new Set();
    if (assignment.createdBy) recipients.add(assignment.createdBy);
    const admins = await require('./workspaceRecipients').admins();
    admins.forEach((adm) => recipients.add(adm.id));
    if (recipients.size === 0) return;

    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.CROSS_CLAN_ASSIGNED,
      recipients: [...recipients].map((uid) => ({ userId: uid })),
      payload: {
        title: accepted ? 'Cover request accepted' : 'Cover request declined',
        message: `${fullName(person)} ${verb} the request to cover ${toClanName}.`,
        actionUrl: '/admin/requests?tab=cross',
        actionLabel: 'View',
        relatedEntityType: 'cross_clan_response',
        relatedEntityId: assignment.id
      },
      channelOverrides: { email: false },
      dedupe: { relatedEntityType: 'cross_clan_response', relatedEntityId: assignment.id }
    });
  }

  async removeCrossClan(id, removedBy = null) {
    const a = await models.CrossClanAssignment.findByPk(id, {
      include: [
        { model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName'] },
        { model: models.Clan, as: 'toClan', attributes: ['name'] }
      ]
    });
    if (!a) throw new NotFoundError('Assignment not found');

    // Capture details before destroying so we can tell the helper their access ended.
    const helper = a.user;
    const toClanName = a.toClan?.name || 'a clan';
    const kind = a.kind;
    await a.destroy();

    if (helper) {
      await this._notifyCrossClanRemoved({ helperId: helper.id, toClanName, kind, assignmentId: id, removedBy }).catch((e) =>
        console.error('[clanRequests] cross-clan removal notify failed:', e.message)
      );
    }
    return { removed: true };
  }

  async _notifyCrossClanRemoved({ helperId, toClanName, kind, assignmentId, removedBy }) {
    const verb = kind === 'cover' ? 'cover for' : (CROSS_KIND_LABEL[kind] || 'help in');
    const remover = removedBy ? await models.User.findByPk(removedBy, { attributes: ['firstName', 'lastName'] }) : null;
    const byLine = remover ? ` by ${fullName(remover)}` : '';
    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.CROSS_CLAN_ASSIGNED,
      recipients: [{ userId: helperId }],
      payload: {
        title: 'Your cross-clan access ended',
        message: `Your ${verb} ${toClanName} has been removed${byLine}. You no longer have access to that clan.`,
        actionUrl: '/mentor/clan-team',
        actionLabel: 'Open Clan Team',
        relatedEntityType: 'cross_clan_removed',
        relatedEntityId: assignmentId,
        emailSubject: `Pathment: your access to ${toClanName} ended`
      },
      dedupe: { relatedEntityType: 'cross_clan_removed', relatedEntityId: assignmentId }
    });
  }
}

module.exports = new ClanRequestsService();
