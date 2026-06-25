const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ForbiddenError } = require('../utils/errors/errorTypes');
const authzService = require('./authzService');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { INACTIVITY, REENGAGE_CADENCE_DAYS } = require('../config/engagement');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * mentorshipPauseService — "paused" mentees + win-back re-engagement.
 *
 * A mentee who stopped attending (or never started) is moved to
 * clan_membership.status = 'paused' instead of being removed. Paused mentees are
 * excluded from clan health/risk/leaderboard reports (those queries already
 * filter status='active'), stay in the clan, and receive a bounded cadence of
 * encouraging "come back" reminders. They auto-resume the moment they re-engage.
 */
class MentorshipPauseService {
  // ── helpers ───────────────────────────────────────────────────────────────
  _name(u) { return u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Mentee' : 'Mentee'; }

  _isAdmin(user) { return !!user && (user.role === 'admin' || user.isAdmin === true); }

  /**
   * The clans this requester acts within: an ADMIN sees every clan (org-wide
   * oversight); a mentor sees only the clans they run. Accepts a user object
   * (preferred) or a bare mentorId string. Returns { clanIds, clanNameById }.
   */
  async _scopeClans(user) {
    if (this._isAdmin(user)) {
      const clans = await models.Clan.findAll({ attributes: ['id', 'name'] });
      return { clanIds: clans.map((c) => c.id), clanNameById: new Map(clans.map((c) => [c.id, c.name || 'Clan'])) };
    }
    const userId = (user && user.id) ? user.id : user;
    const clanIds = await authzService.mentoredClanIds(userId);
    if (!clanIds.length) return { clanIds: [], clanNameById: new Map() };
    const clans = await models.Clan.findAll({ where: { id: { [Op.in]: clanIds } }, attributes: ['id', 'name'] });
    return { clanIds, clanNameById: new Map(clans.map((c) => [c.id, c.name || 'Clan'])) };
  }

  /** Lead + co-mentors of a clan (recipients for pause/return notifications). */
  async _clanMentorIds(clanId) {
    const rows = await models.ClanMembership.findAll({
      where: { clanId, status: 'active', role: { [Op.in]: ['lead_mentor', 'co_mentor', 'core_team'] } },
      attributes: ['userId'], raw: true,
    });
    return [...new Set(rows.map((r) => r.userId))];
  }

  /**
   * Resolve which clan to act on. If clanId is given it must be one the mentor
   * runs; otherwise we pick the mentee's (first) clan among the mentor's clans.
   */
  async _resolveClanId(user, menteeId, clanId) {
    const { clanIds } = await this._scopeClans(user);
    if (!clanIds.length) throw new ForbiddenError('You do not mentor any clan');
    if (clanId) {
      if (!clanIds.includes(clanId)) throw new ForbiddenError('You do not mentor this clan');
      return clanId;
    }
    const m = await models.ClanMembership.findOne({
      where: { userId: menteeId, role: 'mentee', clanId: { [Op.in]: clanIds } },
      attributes: ['clanId'], raw: true,
    });
    if (!m) throw new NotFoundError('Mentee not found in your clans');
    return m.clanId;
  }

  // ── pause / resume (manual, mentor-driven) ────────────────────────────────
  /**
   * Pause a mentee in the given clan (must be one the mentor runs). Sets the
   * membership to 'paused' and starts the win-back cadence from now.
   */
  async pause(user, menteeId, clanId, reason = null, by = 'mentor') {
    clanId = await this._resolveClanId(user, menteeId, clanId);
    const m = await models.ClanMembership.findOne({ where: { clanId, userId: menteeId, role: 'mentee' } });
    if (!m) throw new NotFoundError('Mentee not found in this clan');
    if (m.status === 'paused') return this._shape(m);
    await m.update({
      status: 'paused', pausedAt: new Date(), pausedReason: reason || null, pausedBy: by,
      reengageCount: 0, reengageStage: 0, lastReengagedAt: null, pauseSuggestionDismissedAt: null,
    });
    return this._shape(m);
  }

  /** Resume a paused mentee back to active and clear the win-back state. */
  async resume(user, menteeId, clanId) {
    clanId = await this._resolveClanId(user, menteeId, clanId);
    const m = await models.ClanMembership.findOne({ where: { clanId, userId: menteeId, role: 'mentee' } });
    if (!m) throw new NotFoundError('Mentee not found in this clan');
    await m.update({
      status: 'active', pausedAt: null, pausedReason: null, pausedBy: null,
      reengageCount: 0, reengageStage: 0, lastReengagedAt: null,
    });
    return this._shape(m);
  }

  _shape(m) {
    return { menteeId: m.userId, clanId: m.clanId, status: m.status, pausedAt: m.pausedAt, pausedReason: m.pausedReason };
  }

  // ── attendance / inactivity detection ─────────────────────────────────────
  /**
   * For one clan, compute each active mentee's "missed recent reviews" count:
   * sessions the clan held (since the mentee joined) after their LAST present
   * attendance (or since they joined, if they never attended). Returns
   * Map<menteeId, { missed, totalSinceJoin, lastPresentDate, joinedAt }>.
   */
  async _clanAttendanceSignals(clanId, members) {
    // Attendance-based detection needs clan-scoped review sessions (migration
    // 063). If that column isn't present yet, degrade gracefully: no attendance
    // signal → no auto-suggestions (manual pause + paused list still work).
    let sessions;
    try {
      sessions = await models.CohortReviewSession.findAll({
        where: { clanId }, attributes: ['id', 'sessionDate'], order: [['session_date', 'ASC']], raw: true,
      });
    } catch (e) {
      return new Map();
    }
    const sessionDates = sessions.map((s) => String(s.sessionDate)); // 'YYYY-MM-DD' asc
    const menteeIds = members.map((m) => m.userId);
    const entries = menteeIds.length
      ? await models.CohortReviewEntry.findAll({
          where: { menteeId: { [Op.in]: menteeIds }, attendance: 'present' },
          include: [{ model: models.CohortReviewSession, as: 'session', attributes: ['clanId', 'sessionDate'], required: true, where: { clanId } }],
          attributes: ['menteeId'],
        })
      : [];
    const lastPresentByMentee = new Map();
    for (const e of entries) {
      const d = String(e.session?.sessionDate || '');
      if (!d) continue;
      const cur = lastPresentByMentee.get(e.menteeId);
      if (!cur || d > cur) lastPresentByMentee.set(e.menteeId, d);
    }
    const out = new Map();
    for (const m of members) {
      const joined = m.joinedAt ? new Date(m.joinedAt).toISOString().slice(0, 10) : '0000-00-00';
      const lastPresent = lastPresentByMentee.get(m.userId) || null;
      // Sessions held since they joined.
      const sinceJoin = sessionDates.filter((d) => d >= joined);
      // Sessions strictly after their last present (never present → all sinceJoin).
      const cutoff = lastPresent || joined;
      const missed = sinceJoin.filter((d) => (lastPresent ? d > lastPresent : d >= joined)).length;
      out.set(m.userId, { missed, totalSinceJoin: sinceJoin.length, lastPresentDate: lastPresent, joinedAt: m.joinedAt, cutoff });
    }
    return out;
  }

  // ── suggestions queue (Phase 2): active mentees who look inactive ─────────
  async listSuggestions(user) {
    const { clanIds, clanNameById } = await this._scopeClans(user);
    if (!clanIds.length) return [];
    const now = Date.now();
    const suggestions = [];
    for (const clanId of clanIds) {
      const members = await models.ClanMembership.findAll({
        where: { clanId, role: 'mentee', status: 'active' },
        attributes: ['userId', 'joinedAt', 'pauseSuggestionDismissedAt'], raw: true,
      });
      if (!members.length) continue;
      const signals = await this._clanAttendanceSignals(clanId, members);
      const flaggedIds = [];
      for (const m of members) {
        const s = signals.get(m.userId);
        if (!s) continue;
        const daysSinceJoin = m.joinedAt ? (now - new Date(m.joinedAt).getTime()) / DAY_MS : 999;
        if (daysSinceJoin < INACTIVITY.minDaysSinceJoin) continue;
        if (s.totalSinceJoin < INACTIVITY.reviewsBeforeFlag) continue;
        if (s.missed < INACTIVITY.reviewsBeforeFlag) continue;
        // Honour a recent "keep active" dismissal (snooze ~ minDaysSinceJoin).
        if (m.pauseSuggestionDismissedAt && (now - new Date(m.pauseSuggestionDismissedAt).getTime()) < INACTIVITY.minDaysSinceJoin * DAY_MS) continue;
        flaggedIds.push({ ...m, signals: s });
      }
      if (!flaggedIds.length) continue;
      const users = await models.User.findAll({ where: { id: { [Op.in]: flaggedIds.map((f) => f.userId) } }, attributes: ['id', 'firstName', 'lastName', 'email'] });
      const userById = new Map(users.map((u) => [u.id, u]));
      for (const f of flaggedIds) {
        const u = userById.get(f.userId);
        suggestions.push({
          menteeId: f.userId,
          name: this._name(u),
          email: u?.email || null,
          clanId,
          clanName: clanNameById.get(clanId) || 'Clan',
          neverAttended: !f.signals.lastPresentDate,
          lastPresentDate: f.signals.lastPresentDate,
          missedReviews: f.signals.missed,
          reason: f.signals.lastPresentDate
            ? `No attendance in the last ${f.signals.missed} reviews`
            : `Never attended (${f.signals.missed} reviews held since joining)`,
        });
      }
    }
    return suggestions;
  }

  /** Mentor dismisses a suggestion (keep active); snoozes re-flagging. */
  async dismissSuggestion(user, menteeId, clanId) {
    clanId = await this._resolveClanId(user, menteeId, clanId);
    const m = await models.ClanMembership.findOne({ where: { clanId, userId: menteeId, role: 'mentee' } });
    if (!m) throw new NotFoundError('Mentee not found in this clan');
    await m.update({ pauseSuggestionDismissedAt: new Date() });
    return { dismissed: true };
  }

  // ── paused list (for the mentor's "Paused" filter) ────────────────────────
  async listPaused(user) {
    const { clanIds, clanNameById } = await this._scopeClans(user);
    if (!clanIds.length) return [];
    const rows = await models.ClanMembership.findAll({
      where: { clanId: { [Op.in]: clanIds }, role: 'mentee', status: 'paused' },
      attributes: ['userId', 'clanId', 'pausedAt', 'pausedReason', 'pausedBy', 'reengageCount', 'lastReengagedAt'],
      raw: true,
    });
    if (!rows.length) return [];
    const users = await models.User.findAll({ where: { id: { [Op.in]: rows.map((r) => r.userId) } }, attributes: ['id', 'firstName', 'lastName', 'email'] });
    const userById = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => ({
      menteeId: r.userId, clanId: r.clanId, clanName: clanNameById.get(r.clanId) || 'Clan',
      name: this._name(userById.get(r.userId)), email: userById.get(r.userId)?.email || null,
      pausedAt: r.pausedAt, pausedReason: r.pausedReason, pausedBy: r.pausedBy,
      reengageCount: r.reengageCount, lastReengagedAt: r.lastReengagedAt,
    }));
  }

  /** Pause state of one mentee within the viewer's clans (for the profile). */
  async menteeState(user, menteeId) {
    const { clanIds, clanNameById } = await this._scopeClans(user);
    if (!clanIds.length) return { paused: false, clanId: null };
    const m = await models.ClanMembership.findOne({
      where: { userId: menteeId, role: 'mentee', clanId: { [Op.in]: clanIds } },
      attributes: ['clanId', 'status', 'pausedAt', 'pausedReason'], raw: true,
    });
    if (!m) return { paused: false, clanId: null };
    return { paused: m.status === 'paused', clanId: m.clanId, clanName: clanNameById.get(m.clanId) || null, pausedAt: m.pausedAt, pausedReason: m.pausedReason };
  }

  // ── win-back cadence (Phase 3) — called by notificationScheduler ──────────
  async runReengagement() {
    const paused = await models.ClanMembership.findAll({
      where: { status: 'paused', role: 'mentee', reengageStage: { [Op.lt]: REENGAGE_CADENCE_DAYS.length } },
      attributes: ['id', 'userId', 'clanId', 'pausedAt', 'reengageStage', 'reengageCount'],
    });
    const now = Date.now();
    let sent = 0;
    for (const m of paused) {
      if (!m.pausedAt) continue;
      const dueAt = new Date(m.pausedAt).getTime() + REENGAGE_CADENCE_DAYS[m.reengageStage] * DAY_MS;
      if (now < dueAt) continue;
      const [mentee, clan] = await Promise.all([
        models.User.findByPk(m.userId, { attributes: ['id', 'firstName'] }),
        models.Clan.findByPk(m.clanId, { attributes: ['id', 'name'] }),
      ]);
      if (!mentee) continue;
      const first = mentee.firstName || 'there';
      const clanName = clan?.name || 'your clan';
      try {
        await notificationOrchestrator.dispatch({
          eventKey: NOTIFICATION_EVENTS.MENTEE_REENGAGE,
          recipients: [{ userId: m.userId }],
          payload: {
            title: `We miss you in ${clanName} 👋`,
            message: `Hey ${first}, your spot in ${clanName} is still here. One small step this week gets your momentum back - jump in whenever you're ready.`,
            actionUrl: '/mentee/tasks',
            actionLabel: 'Pick up where I left off',
            emailSubject: `Your clan is waiting for you`,
            // Intentionally NO relatedEntityType/relatedEntityId: the orchestrator
            // dedupes (in-app) and builds the email idempotency key from those, so
            // reusing the clan id would collapse every cadence touch into one send.
            // The reengageStage state machine below already guarantees one send per
            // stage, so we want each touch to go through cleanly.
          },
        });
        await m.update({ reengageStage: m.reengageStage + 1, reengageCount: m.reengageCount + 1, lastReengagedAt: new Date() });
        sent += 1;
      } catch (e) {
        console.error('[reengage] failed for membership', m.id, e.message);
      }
    }
    return sent;
  }

  // ── auto-resume (Phase 3) — called when a paused mentee re-engages ────────
  /**
   * If this mentee is paused in any clan, flip them back to active and tell the
   * clan's mentors they're back. Safe to call on attendance / submission /
   * activity events (no-op when not paused). Never throws into the caller.
   */
  async autoResumeIfPaused(menteeId, trigger = 'activity') {
    try {
      const paused = await models.ClanMembership.findAll({ where: { userId: menteeId, role: 'mentee', status: 'paused' } });
      if (!paused.length) return 0;
      const mentee = await models.User.findByPk(menteeId, { attributes: ['id', 'firstName', 'lastName'] });
      for (const m of paused) {
        // Resume first — this must succeed even if the notification fails.
        await m.update({ status: 'active', pausedAt: null, pausedReason: null, pausedBy: null, reengageCount: 0, reengageStage: 0, lastReengagedAt: null, pauseSuggestionDismissedAt: null });
        // Notify the clan's mentors (best-effort; isolated so a notification
        // error never undoes/blocks the resume). No dedupe: this method only
        // fires when actually paused, so it can't double-send within an episode.
        try {
          const mentorIds = await this._clanMentorIds(m.clanId);
          if (mentorIds.length) {
            const clan = await models.Clan.findByPk(m.clanId, { attributes: ['name'] });
            await notificationOrchestrator.dispatch({
              eventKey: NOTIFICATION_EVENTS.MENTEE_RETURNED,
              recipients: mentorIds.map((userId) => ({ userId })),
              payload: {
                title: `${this._name(mentee)} is back 🎉`,
                message: `${this._name(mentee)} re-engaged in ${clan?.name || 'your clan'} (${trigger}) and has been moved back to active.`,
                actionUrl: `/mentor/mentees/${menteeId}`,
                actionLabel: 'View mentee',
                emailSubject: `${this._name(mentee)} returned to your clan`,
                // No relatedEntityType/relatedEntityId on purpose, so a later
                // pause→return episode isn't deduped against an earlier "is back".
              },
            });
          }
        } catch (notifyErr) {
          console.error('[autoResumeIfPaused] notify failed (resume still applied):', notifyErr.message);
        }
      }
      return paused.length;
    } catch (e) {
      console.error('[autoResumeIfPaused] failed:', e.message);
      return 0;
    }
  }
}

module.exports = new MentorshipPauseService();
