const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const clanService = require('./clanService');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');

const fullName = (u) => (u ? `${u.firstName} ${u.lastName}`.trim() : null);

const CROSS_KIND_LABEL = { cover: 'cover for', specialist: 'specialist help in', co_mentee_access: 'mentee access in' };

/** Admin clan operations: change requests, cross-clan assignments, policies. */
class ClanRequestsService {
  async overview() {
    const [requests, crossClan] = await Promise.all([
      models.ClanChangeRequest.findAll({
        order: [['status', 'ASC'], ['created_at', 'DESC']],
        include: [
          { model: models.User, as: 'mentee', attributes: ['firstName', 'lastName'] },
          { model: models.Clan, as: 'fromClan', attributes: ['name'] },
          { model: models.Clan, as: 'toClan', attributes: ['name'] }
        ]
      }),
      models.CrossClanAssignment.findAll({
        order: [['created_at', 'DESC']],
        include: [
          { model: models.User, as: 'user', attributes: ['firstName', 'lastName'] },
          { model: models.Clan, as: 'fromClan', attributes: ['name'] },
          { model: models.Clan, as: 'toClan', attributes: ['name'] }
        ]
      })
    ]);

    return {
      requests: requests.map((r) => ({
        id: r.id,
        mentee: fullName(r.mentee),
        fromClan: r.fromClan?.name || null,
        toClan: r.toClan?.name || null,
        reason: r.reason,
        status: r.status,
        resolutionNote: r.resolutionNote,
        at: r.createdAt
      })),
      crossClan: crossClan.map((c) => ({
        id: c.id,
        kind: c.kind,
        user: fullName(c.user),
        fromClan: c.fromClan?.name || null,
        toClan: c.toClan?.name || null,
        note: c.note,
        status: c.status,
        at: c.createdAt
      }))
    };
  }

  async createRequest({ menteeId, toClanId, fromClanId, reason }, createdBy) {
    if (!menteeId || !toClanId) throw new ValidationError('menteeId and toClanId are required');
    return models.ClanChangeRequest.create({ menteeId, toClanId, fromClanId: fromClanId || null, reason: reason || null, createdBy });
  }

  async resolveRequest(id, { status, note }) {
    if (!['approved', 'denied'].includes(status)) throw new ValidationError('status must be approved or denied');
    const req = await models.ClanChangeRequest.findByPk(id);
    if (!req) throw new NotFoundError('Request not found');

    return sequelize.transaction(async (transaction) => {
      req.status = status;
      req.resolutionNote = note || null;
      await req.save({ transaction });

      if (status === 'approved') {
        // Move the mentee: remove old membership, add to the target clan.
        if (req.fromClanId) {
          const old = await models.ClanMembership.findOne({ where: { clanId: req.fromClanId, userId: req.menteeId }, transaction });
          if (old) { old.status = 'removed'; old.leftAt = new Date(); await old.save({ transaction }); }
        }
      }
      return req;
    }).then(async (req) => {
      if (status === 'approved') {
        await clanService.addMember(req.toClanId, { userId: req.menteeId, role: 'mentee' });
      }
      return req;
    });
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
    const status = creator && creator.role === 'admin' ? 'active' : 'pending';

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
    if (!creator || creator.role !== 'admin') {
      const admins = await models.User.findAll({ where: { role: 'admin', status: 'active' }, attributes: ['id'] });
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
    const admins = await models.User.findAll({ where: { role: 'admin', status: 'active' }, attributes: ['id'] });
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
