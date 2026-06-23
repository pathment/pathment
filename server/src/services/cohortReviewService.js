const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ForbiddenError, ValidationError } = require('../utils/errors/errorTypes');
const { todayInZone } = require('../utils/timezone');
const { createAuditLog } = require('../utils/auditContext');
const cohortService = require('./cohortService');
const authzService = require('./authzService');
const lockService = require('./cohortReviewLockService');

/**
 * cohortReviewService - dated, saved, editable cohort-review sessions.
 *
 * A session is one pass a mentor makes over their cohort on a given LOCAL date
 * (their timezone). Each mentee gets an entry carrying attendance
 * (present/absent/excused) and a workflow status (pending/reviewed/deferred).
 * Sessions can be finished, reopened, browsed as history, and edited later.
 *
 * Replaces the old ephemeral flow where only "today's" attendance survived (on
 * meeting_notes) and seen/deferred lived in browser memory.
 */
class CohortReviewService {
  async _mentorTz(mentorId) {
    const s = await models.UserSettings.findOne({ where: { userId: mentorId }, attributes: ['timezone'] });
    return s?.timezone || 'UTC';
  }

  _entryJson(e) {
    return {
      id: e.id,
      menteeId: e.menteeId,
      attendance: e.attendance,
      status: e.status,
      note: e.note,
      mentee: e.mentee ? { id: e.mentee.id, name: `${e.mentee.firstName || ''} ${e.mentee.lastName || ''}`.trim() } : null,
    };
  }

  async _withEntries(session) {
    const entries = await models.CohortReviewEntry.findAll({
      where: { sessionId: session.id },
      include: [{ model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName'] }],
      order: [['created_at', 'ASC']],
    });
    return { ...session.toJSON(), entries: entries.map((e) => this._entryJson(e)) };
  }

  /**
   * Ensure an entry exists for every current cohort mentee who had ALREADY JOINED
   * by this session's date (the cohort may have grown). A mentee who joined the
   * clan/system after a meeting was held is intentionally left off that older
   * session — they couldn't have attended it, so they shouldn't show as absent.
   * Also clears any stale "phantom" entries for a late-joiner that a previous
   * (pre-fix) reconcile created — but only ones the mentor never touched.
   */
  async _reconcileEntries(session) {
    // Clan-scoped: the cohort is everyone in THIS session's clan, so a lead and
    // a co-mentor of the clan reconcile to the exact same mentee set.
    const [menteeIds, joinDates] = await Promise.all([
      cohortService.resolveMenteeIdsForClan(session.clanId),
      cohortService.menteeJoinDatesForClan(session.clanId),
    ]);
    const sessionDate = String(session.sessionDate); // 'YYYY-MM-DD'
    const joinedBySession = (id) => {
      const d = joinDates.get(id);
      if (!d) return true; // unknown join date → don't hide them
      return new Date(d).toISOString().slice(0, 10) <= sessionDate;
    };
    const eligible = menteeIds.filter(joinedBySession);
    const eligibleSet = new Set(eligible);

    const existing = await models.CohortReviewEntry.findAll({
      where: { sessionId: session.id },
      attributes: ['id', 'menteeId', 'attendance', 'status', 'note'],
    });
    const have = new Set(existing.map((e) => e.menteeId));

    const missing = eligible.filter((id) => !have.has(id));
    if (missing.length) {
      await models.CohortReviewEntry.bulkCreate(missing.map((menteeId) => ({ sessionId: session.id, menteeId, status: 'pending' })));
    }

    // Remove untouched entries for mentees who hadn't joined by this date (safe:
    // never deletes one the mentor actually marked — attendance/note/non-pending).
    const phantomIds = existing
      .filter((e) => !eligibleSet.has(e.menteeId) && !e.attendance && e.status === 'pending' && !e.note)
      .map((e) => e.id);
    if (phantomIds.length) {
      await models.CohortReviewEntry.destroy({ where: { id: { [Op.in]: phantomIds } } });
    }
  }

  /**
   * Resolve which clan a request operates on. A mentor mentors one or more
   * clans (lead / co / cross-clan cover). If `clanId` is given it must be one of
   * them; otherwise we default to their (first) mentored clan. Cohort review is
   * per-clan, so there is always exactly one target clan.
   */
  async _resolveClanId(mentorId, clanId) {
    const clanIds = await authzService.mentoredClanIds(mentorId);
    if (!clanIds.length) throw new ForbiddenError('You do not mentor any clan');
    if (clanId) {
      if (!clanIds.includes(clanId)) throw new ForbiddenError('You do not mentor this clan');
      return clanId;
    }
    return clanIds[0];
  }

  /** Today's session for this clan (in the mentor's timezone), creating one if needed. */
  async getOrCreateToday(mentorId, clanId) {
    const resolvedClanId = await this._resolveClanId(mentorId, clanId);
    const tz = await this._mentorTz(mentorId);
    const today = todayInZone(tz);
    let session = await models.CohortReviewSession.findOne({
      where: { clanId: resolvedClanId, sessionDate: today },
      order: [['created_at', 'DESC']],
    });
    if (!session) {
      session = await models.CohortReviewSession.create({ mentorId, clanId: resolvedClanId, sessionDate: today, status: 'in_progress' });
    }
    await this._reconcileEntries(session);
    return this._withEntries(session);
  }

  /**
   * Today's session WITHOUT creating one. Returns { session, today, clanId } —
   * session is null until someone takes a real action (then the client POSTs to
   * create). This is what stops "just opening the page" from leaving a phantom
   * session. The session is shared by everyone who mentors the clan.
   */
  async getTodayOrNull(mentorId, clanId) {
    const resolvedClanId = await this._resolveClanId(mentorId, clanId);
    const tz = await this._mentorTz(mentorId);
    const today = todayInZone(tz);
    const session = await models.CohortReviewSession.findOne({
      where: { clanId: resolvedClanId, sessionDate: today },
      order: [['created_at', 'DESC']],
    });
    if (!session) return { session: null, today, clanId: resolvedClanId };
    await this._reconcileEntries(session);
    return { session: await this._withEntries(session), today, clanId: resolvedClanId };
  }

  /** Full history (newest first) for a clan, with attendance/progress counts. */
  async listSessions(mentorId, clanId) {
    const resolvedClanId = await this._resolveClanId(mentorId, clanId);
    const sessions = await models.CohortReviewSession.findAll({
      where: { clanId: resolvedClanId },
      order: [['session_date', 'DESC'], ['created_at', 'DESC']],
    });
    const ids = sessions.map((s) => s.id);
    const entries = ids.length
      ? await models.CohortReviewEntry.findAll({ where: { sessionId: { [Op.in]: ids } }, attributes: ['sessionId', 'attendance', 'status'] })
      : [];
    const bySession = {};
    const blank = () => ({ total: 0, present: 0, absent: 0, excused: 0, reviewed: 0, deferred: 0 });
    entries.forEach((e) => {
      const b = (bySession[e.sessionId] = bySession[e.sessionId] || blank());
      b.total++;
      if (e.attendance) b[e.attendance] = (b[e.attendance] || 0) + 1;
      if (e.status === 'reviewed') b.reviewed++;
      if (e.status === 'deferred') b.deferred++;
    });
    return sessions.map((s) => ({ ...s.toJSON(), counts: bySession[s.id] || blank() }));
  }

  /**
   * Anyone who mentors the session's clan (lead / co-mentor / cover) may view and
   * edit it — that's the whole point of clan-scoping. Replaces the old
   * "only the creating mentor" ownership check.
   */
  async _canAccess(mentorId, sessionId) {
    const session = await models.CohortReviewSession.findByPk(sessionId);
    if (!session) throw new NotFoundError('Review session not found');
    const clanIds = await authzService.mentoredClanIds(mentorId);
    // Legacy sessions with no clan fall back to creator-only access.
    if (!session.clanId) {
      if (session.mentorId !== mentorId) throw new ForbiddenError('This review session belongs to another mentor');
      return session;
    }
    if (!clanIds.includes(session.clanId)) throw new ForbiddenError('You do not mentor this clan');
    return session;
  }

  async getSession(mentorId, sessionId) {
    const session = await this._canAccess(mentorId, sessionId);
    await this._reconcileEntries(session);
    return this._withEntries(session);
  }

  async createSession(mentorId, { date, title, clanId } = {}) {
    const resolvedClanId = await this._resolveClanId(mentorId, clanId);
    const tz = await this._mentorTz(mentorId);
    const sessionDate = date && /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? String(date) : todayInZone(tz);
    // One session per clan per day: reuse an existing one rather than duplicating.
    let session = await models.CohortReviewSession.findOne({
      where: { clanId: resolvedClanId, sessionDate },
      order: [['created_at', 'DESC']],
    });
    if (!session) {
      session = await models.CohortReviewSession.create({
        mentorId, clanId: resolvedClanId, sessionDate, title: (title || '').trim().slice(0, 150) || null, status: 'in_progress',
      });
    }
    await this._reconcileEntries(session);
    return this._withEntries(session);
  }

  async updateSession(mentorId, sessionId, updates = {}) {
    const session = await this._canAccess(mentorId, sessionId);
    if (updates.title !== undefined) session.title = String(updates.title || '').trim().slice(0, 150) || null;
    if (updates.note !== undefined) session.note = updates.note || null;
    if (updates.sessionDate !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(String(updates.sessionDate))) session.sessionDate = updates.sessionDate;
    await session.save();
    return this._withEntries(session);
  }

  /** Upsert a mentee's attendance / status / note within a session. */
  async setEntry(mentorId, sessionId, menteeId, patch = {}) {
    const session = await this._canAccess(mentorId, sessionId);
    let entry = await models.CohortReviewEntry.findOne({ where: { sessionId: session.id, menteeId } });
    if (!entry) entry = await models.CohortReviewEntry.create({ sessionId: session.id, menteeId, status: 'pending' });

    if (patch.attendance !== undefined) {
      if (patch.attendance !== null && !['present', 'absent', 'excused'].includes(patch.attendance)) {
        throw new ValidationError('invalid attendance status');
      }
      entry.attendance = patch.attendance;
    }
    if (patch.status !== undefined) {
      if (!['pending', 'reviewed', 'deferred'].includes(patch.status)) throw new ValidationError('invalid entry status');
      entry.status = patch.status;
    }
    if (patch.note !== undefined) entry.note = patch.note || null;
    await entry.save();

    // Re-engagement: marking a paused mentee present means they came back.
    if (patch.attendance === 'present') {
      require('./mentorshipPauseService').autoResumeIfPaused(menteeId, 'attended a review').catch(() => {});
    }

    const fresh = await models.CohortReviewEntry.findByPk(entry.id, {
      include: [{ model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName'] }],
    });
    return this._entryJson(fresh);
  }

  async finishSession(mentorId, sessionId) {
    const session = await this._canAccess(mentorId, sessionId);
    session.status = 'finished';
    session.finishedAt = new Date();
    await session.save();
    return this._withEntries(session);
  }

  async reopenSession(mentorId, sessionId) {
    await lockService.assertCanDelete(mentorId);
    const session = await this._canAccess(mentorId, sessionId);
    session.status = 'in_progress';
    session.finishedAt = null;
    await session.save();
    return this._withEntries(session);
  }

  async deleteSession(mentorId, sessionId) {
    await lockService.assertCanDelete(mentorId);
    const session = await this._canAccess(mentorId, sessionId);
    await models.CohortReviewEntry.destroy({ where: { sessionId: session.id } });
    await session.destroy();
    createAuditLog({
      userId: mentorId,
      action: 'REVIEW_SESSION_DELETED',
      entityType: 'cohort_review_session',
      entityId: sessionId,
      newValues: { mentorId, sessionId, deletedAt: new Date() },
    }).catch(() => {});
    return { deleted: true };
  }
}

module.exports = new CohortReviewService();
