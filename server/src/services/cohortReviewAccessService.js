const { Op } = require('sequelize');
const { models } = require('../db');
const { createAuditLog } = require('../utils/auditContext');
const {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} = require('../utils/errors/errorTypes');
const orgSystemSettingsService = require('./orgSystemSettingsService');
const cohortService = require('./cohortService');

function activeExpiryWhere() {
  return { [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }] };
}

class CohortReviewAccessService {
  async _mentorClanIds(mentorId) {
    const { clanIds } = await cohortService.mentorClanMap(mentorId);
    return clanIds;
  }

  async hasActiveClanGrant(mentorId) {
    const clanIds = await this._mentorClanIds(mentorId);
    if (!clanIds.length) return false;
    const grant = await models.CohortReviewClanGrant.findOne({
      where: { clanId: { [Op.in]: clanIds }, expiresAt: { [Op.gt]: new Date() } },
      order: [['expires_at', 'DESC']],
    });
    return Boolean(grant);
  }

  async _approvedRequest(mentorId, sessionId) {
    return models.CohortReviewEditRequest.findOne({
      where: {
        mentorId,
        sessionId,
        status: 'approved',
        ...activeExpiryWhere(),
      },
    });
  }

  async canDeleteSession(mentorId, sessionId) {
    const locked = await orgSystemSettingsService.isCohortReviewDeleteLocked();
    if (!locked) return true;
    if (await this.hasActiveClanGrant(mentorId)) return true;
    if (await this._approvedRequest(mentorId, sessionId)) return true;
    return false;
  }

  async getMentorPolicies(mentorId) {
    const locked = await orgSystemSettingsService.isCohortReviewDeleteLocked();
    const clanGrantActive = locked ? await this.hasActiveClanGrant(mentorId) : false;
    let pendingSessionIds = [];
    if (locked) {
      const pending = await models.CohortReviewEditRequest.findAll({
        where: { mentorId, status: 'pending' },
        attributes: ['sessionId'],
      });
      pendingSessionIds = pending.map((r) => r.sessionId);
    }
    return { cohortReviewDeleteLocked: locked, clanGrantActive, pendingSessionIds };
  }

  async enrichSessionSummaries(mentorId, sessions) {
    const locked = await orgSystemSettingsService.isCohortReviewDeleteLocked();
    if (!locked) {
      return sessions.map((s) => ({ ...s, access: { canDelete: true, requestStatus: null } }));
    }

    const clanGrant = await this.hasActiveClanGrant(mentorId);
    const sessionIds = sessions.map((s) => s.id);
    const requests = sessionIds.length
      ? await models.CohortReviewEditRequest.findAll({
        where: { mentorId, sessionId: { [Op.in]: sessionIds } },
        order: [['created_at', 'DESC']],
      })
      : [];

    const bySession = new Map();
    requests.forEach((r) => {
      if (!bySession.has(r.sessionId)) bySession.set(r.sessionId, r);
    });

    return sessions.map((s) => {
      const req = bySession.get(s.id);
      let canDelete = clanGrant;
      let requestStatus = null;
      if (req) {
        requestStatus = req.status;
        if (req.status === 'approved') {
          const expired = req.expiresAt && new Date(req.expiresAt) <= new Date();
          if (!expired) canDelete = true;
        }
      }
      return { ...s, access: { canDelete, requestStatus } };
    });
  }

  async requestSessionEdit(mentorId, sessionId, { reason } = {}) {
    const locked = await orgSystemSettingsService.isCohortReviewDeleteLocked();
    if (!locked) throw new ValidationError('Cohort review deletion is not locked');

    const session = await models.CohortReviewSession.findByPk(sessionId);
    if (!session) throw new NotFoundError('Review session not found');
    if (session.mentorId !== mentorId) throw new ForbiddenError('This review session belongs to another mentor');

    if (await this.canDeleteSession(mentorId, sessionId)) {
      throw new ValidationError('You already have permission to delete this session');
    }

    const pending = await models.CohortReviewEditRequest.findOne({
      where: { mentorId, sessionId, status: 'pending' },
    });
    if (pending) throw new ConflictError('A request is already pending for this session');

    const clanIds = await this._mentorClanIds(mentorId);
    const request = await models.CohortReviewEditRequest.create({
      mentorId,
      sessionId,
      clanId: clanIds[0] || null,
      reason: (reason || '').trim().slice(0, 2000) || null,
      status: 'pending',
    });

    await createAuditLog({
      userId: mentorId,
      action: 'COHORT_REVIEW_EDIT_REQUESTED',
      entityType: 'CohortReviewEditRequest',
      entityId: request.id,
      newValues: { sessionId, clanId: request.clanId, reason: request.reason },
    });

    return this._requestJson(request);
  }

  _requestJson(row, include = []) {
    const base = {
      id: row.id,
      mentorId: row.mentorId,
      sessionId: row.sessionId,
      clanId: row.clanId,
      reason: row.reason,
      status: row.status,
      resolutionNote: row.resolutionNote,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      mentor: row.mentor ? {
        id: row.mentor.id,
        name: `${row.mentor.firstName || ''} ${row.mentor.lastName || ''}`.trim(),
        email: row.mentor.email,
      } : undefined,
      session: row.session ? {
        id: row.session.id,
        sessionDate: row.session.sessionDate,
        title: row.session.title,
      } : undefined,
      clan: row.clan ? { id: row.clan.id, name: row.clan.name } : undefined,
    };
    return base;
  }

  async listEditRequests({ status = 'pending' } = {}) {
    const where = {};
    if (status) where.status = status;
    const rows = await models.CohortReviewEditRequest.findAll({
      where,
      include: [
        { model: models.User, as: 'mentor', attributes: ['id', 'firstName', 'lastName', 'email'] },
        { model: models.CohortReviewSession, as: 'session', attributes: ['id', 'sessionDate', 'title', 'status'] },
        { model: models.Clan, as: 'clan', attributes: ['id', 'name'] },
      ],
      order: [['created_at', 'DESC']],
      limit: 100,
    });
    return rows.map((r) => this._requestJson(r));
  }

  async resolveEditRequest(adminId, requestId, { status, resolutionNote, expiresAt } = {}) {
    if (!['approved', 'denied'].includes(status)) throw new ValidationError('status must be approved or denied');

    const request = await models.CohortReviewEditRequest.findByPk(requestId);
    if (!request) throw new NotFoundError('Edit request not found');
    if (request.status !== 'pending') throw new ValidationError('This request was already resolved');

    let parsedExpires = null;
    if (status === 'approved' && expiresAt) {
      parsedExpires = new Date(expiresAt);
      if (Number.isNaN(parsedExpires.getTime()) || parsedExpires <= new Date()) {
        throw new ValidationError('expiresAt must be a future date');
      }
    }

    const prev = { status: request.status };
    request.status = status;
    request.resolutionNote = (resolutionNote || '').trim().slice(0, 2000) || null;
    request.resolvedBy = adminId;
    request.expiresAt = status === 'approved' ? parsedExpires : null;
    await request.save();

    await createAuditLog({
      userId: adminId,
      action: 'COHORT_REVIEW_EDIT_REQUEST_RESOLVED',
      entityType: 'CohortReviewEditRequest',
      entityId: request.id,
      oldValues: prev,
      newValues: {
        status: request.status,
        resolutionNote: request.resolutionNote,
        expiresAt: request.expiresAt,
        mentorId: request.mentorId,
        sessionId: request.sessionId,
      },
    });

    return this._requestJson(request);
  }

  async createClanGrant(adminId, { clanId, expiresAt, note } = {}) {
    if (!clanId) throw new ValidationError('clanId is required');
    const clan = await models.Clan.findByPk(clanId);
    if (!clan) throw new NotFoundError('Clan not found');

    const parsedExpires = new Date(expiresAt);
    if (!expiresAt || Number.isNaN(parsedExpires.getTime()) || parsedExpires <= new Date()) {
      throw new ValidationError('expiresAt must be a future date');
    }

    const grant = await models.CohortReviewClanGrant.create({
      clanId,
      grantedBy: adminId,
      note: (note || '').trim().slice(0, 2000) || null,
      expiresAt: parsedExpires,
    });

    await createAuditLog({
      userId: adminId,
      action: 'COHORT_REVIEW_CLAN_GRANT_CREATED',
      entityType: 'CohortReviewClanGrant',
      entityId: grant.id,
      newValues: { clanId, expiresAt: grant.expiresAt, note: grant.note },
    });

    return {
      id: grant.id,
      clanId: grant.clanId,
      expiresAt: grant.expiresAt,
      note: grant.note,
      createdAt: grant.createdAt,
    };
  }

  async getSessionAccess(mentorId, sessionId) {
    const locked = await orgSystemSettingsService.isCohortReviewDeleteLocked();
    if (!locked) return { canDelete: true, requestStatus: null };
    const canDelete = await this.canDeleteSession(mentorId, sessionId);
    const latest = await models.CohortReviewEditRequest.findOne({
      where: { mentorId, sessionId },
      order: [['created_at', 'DESC']],
    });
    return { canDelete, requestStatus: latest?.status || null };
  }

  async listActiveClanGrants() {
    const rows = await models.CohortReviewClanGrant.findAll({
      where: { expiresAt: { [Op.gt]: new Date() } },
      include: [{ model: models.Clan, as: 'clan', attributes: ['id', 'name'] }],
      order: [['expires_at', 'ASC']],
      limit: 50,
    });
    return rows.map((g) => ({
      id: g.id,
      clanId: g.clanId,
      clan: g.clan ? { id: g.clan.id, name: g.clan.name } : null,
      expiresAt: g.expiresAt,
      note: g.note,
      createdAt: g.createdAt,
    }));
  }
}

module.exports = new CohortReviewAccessService();
