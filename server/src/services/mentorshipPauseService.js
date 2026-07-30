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
    await this._notifyPaused(menteeId, clanId, reason);
    return this._shape(m);
  }

  /**
   * Tell the mentee they've been paused (in-app + email): what it means and how
   * to come back — ask their clan's mentor to unpause them. Best-effort: a
   * notification failure must never undo or block the pause itself.
   */
  async _notifyPaused(menteeId, clanId, reason = null) {
    try {
      const [mentee, clan] = await Promise.all([
        models.User.findByPk(menteeId, { attributes: ['id', 'firstName'] }),
        models.Clan.findByPk(clanId, { attributes: ['id', 'name'] }),
      ]);
      if (!mentee) return;
      const first = mentee.firstName || 'there';
      const clanName = clan?.name || 'your clan';
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.MENTEE_PAUSED,
        recipients: [{ userId: menteeId }],
        payload: {
          title: `Your place in ${clanName} is paused`,
          message: `Hi ${first}, your mentee dashboard in ${clanName} has been paused${reason ? ` (${reason})` : ''}. You can still sign in, but your tasks and clan are on hold until a mentor resumes you. Ready to come back? Message your mentor and ask them to unpause you — one click and you're back in.`,
          actionUrl: '/mentee/dashboard',
          actionLabel: 'Ask my mentor to unpause me',
          emailSubject: `You've been paused in ${clanName}`,
          // No relatedEntityId: a later pause episode must not be deduped against
          // an earlier one — each pause should send its own notice.
        },
      });
    } catch (e) {
      console.error('[notifyPaused] failed (pause still applied):', e.message);
    }
  }

  /**
   * Self-service pause state for the signed-in mentee — powers the "you're
   * paused" gate on the mentee side. Reports every clan they're paused in and
   * who to ask for a resume. A user who is ALSO a mentor is unaffected on their
   * mentor side; this only reflects their mentee memberships.
   */
  async selfPauseState(userId) {
    const rows = await models.ClanMembership.findAll({
      where: { userId, role: 'mentee', status: 'paused' },
      attributes: ['clanId', 'pausedAt', 'pausedReason'], raw: true,
    });
    if (!rows.length) return { paused: false, clans: [] };
    const clanIds = rows.map((r) => r.clanId);
    const clans = await models.Clan.findAll({ where: { id: { [Op.in]: clanIds } }, attributes: ['id', 'name'] });
    const clanNameById = new Map(clans.map((c) => [c.id, c.name || 'your clan']));
    const out = [];
    for (const r of rows) {
      const mentorIds = await this._clanMentorIds(r.clanId);
      const mentors = mentorIds.length
        ? await models.User.findAll({ where: { id: { [Op.in]: mentorIds } }, attributes: ['id', 'firstName', 'lastName', 'email'] })
        : [];
      out.push({
        clanId: r.clanId,
        clanName: clanNameById.get(r.clanId) || 'your clan',
        pausedAt: r.pausedAt,
        pausedReason: r.pausedReason,
        mentors: mentors.map((u) => ({ id: u.id, name: this._name(u), email: u.email })),
      });
    }
    return { paused: true, clans: out };
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

  /**
   * Task-activity signal per mentee for one clan. A mentee is "inactive on
   * tasks" only when they have OPEN assigned work (not completed/cancelled) AND
   * have neither started nor submitted anything within the window. `startedAt`
   * and `submittedAt` are set by the mentee's own actions (submissionService),
   * so this measures the mentee, never a mentor editing the task.
   * Returns Map<menteeId, { hasOpenTasks, taskInactive }>.
   */
  async _clanTaskSignals(memberIds, cutoff) {
    const out = new Map();
    if (!memberIds.length) return out;
    const OPEN = ['not_started', 'assigned', 'in_progress', 'revision_needed'];
    const tasks = await models.AssignedTask.findAll({
      where: { menteeId: { [Op.in]: memberIds } },
      attributes: ['menteeId', 'status', 'startedAt', 'submittedAt'], raw: true,
    });
    const agg = new Map(); // menteeId -> { open, recentActivity }
    for (const t of tasks) {
      const a = agg.get(t.menteeId) || { open: 0, recentActivity: false };
      if (OPEN.includes(t.status)) a.open += 1;
      // Started or submitted within the window = the mentee touched their work.
      const started = t.startedAt && new Date(t.startedAt).getTime() >= cutoff;
      const submitted = t.submittedAt && new Date(t.submittedAt).getTime() >= cutoff;
      if (started || submitted) a.recentActivity = true;
      agg.set(t.menteeId, a);
    }
    for (const id of memberIds) {
      const a = agg.get(id) || { open: 0, recentActivity: false };
      // recentActivity spares them regardless of open-task count (they submitted
      // their last task = engaged). taskInactive only when open work sits untouched.
      out.set(id, {
        hasOpenTasks: a.open > 0,
        recentActivity: a.recentActivity,
        taskInactive: a.open > 0 && !a.recentActivity,
      });
    }
    return out;
  }

  // ── suggestions queue (Phase 2): active mentees who look inactive ─────────
  /**
   * Active mentees who look inactive, by the combined rule:
   *   missed ≥ N consecutive recent reviews  AND
   *   (if they have open tasks) no task activity in the window.
   * A mentee actively doing assigned work is never flagged, even if they skip
   * reviews. When a clan records no reviews at all, we fall back to the task
   * signal alone so task-driven clans are still monitored.
   * @param {string} [clanId] restrict to one clan (admin "check this clan").
   */
  async listSuggestions(user, clanId = null) {
    let { clanIds, clanNameById } = await this._scopeClans(user);
    if (clanId) {
      if (!clanIds.includes(clanId)) throw new ForbiddenError('You do not oversee this clan');
      clanIds = [clanId];
    }
    if (!clanIds.length) return [];
    const now = Date.now();
    const taskCutoff = now - INACTIVITY.taskInactivityDays * DAY_MS;
    const suggestions = [];
    for (const cid of clanIds) {
      const members = await models.ClanMembership.findAll({
        where: { clanId: cid, role: 'mentee', status: 'active' },
        attributes: ['userId', 'joinedAt', 'pauseSuggestionDismissedAt'], raw: true,
      });
      if (!members.length) continue;
      const attendance = await this._clanAttendanceSignals(cid, members);
      const taskSignals = await this._clanTaskSignals(members.map((m) => m.userId), taskCutoff);
      // Does this clan run reviews at all? If not, attendance can't decide and
      // we lean on tasks alone.
      const clanHasReviews = [...attendance.values()].some((s) => s.totalSinceJoin > 0);

      const flagged = [];
      for (const m of members) {
        const daysSinceJoin = m.joinedAt ? (now - new Date(m.joinedAt).getTime()) / DAY_MS : 999;
        if (daysSinceJoin < INACTIVITY.minDaysSinceJoin) continue;
        // Honour a recent "keep active" dismissal (snooze ~ minDaysSinceJoin).
        if (m.pauseSuggestionDismissedAt && (now - new Date(m.pauseSuggestionDismissedAt).getTime()) < INACTIVITY.minDaysSinceJoin * DAY_MS) continue;

        const a = attendance.get(m.userId);
        const t = taskSignals.get(m.userId) || { hasOpenTasks: false, taskInactive: false };
        const missedEnough = !!a && a.totalSinceJoin >= INACTIVITY.reviewsBeforeFlag && a.missed >= INACTIVITY.reviewsBeforeFlag;

        // Missed reviews is the REQUIRED signal — never flag on tasks alone.
        // If a clan records no reviews (or the attendance data isn't there),
        // nobody is flagged here rather than the whole clan: tasks only ever
        // reduce flags, they never create them.
        if (!clanHasReviews || !missedEnough) continue;
        // Any recent task activity means engaged — spare them whatever the
        // reviews say (the mentee who submits work but skips reviews).
        if (t.recentActivity) continue;
        // If they have open tasks, require those to be idle too; with no open
        // tasks, the review miss stands on its own.
        if (t.hasOpenTasks && !t.taskInactive) continue;
        const reason = t.hasOpenTasks
          ? `Missed the last ${a.missed} reviews and no task activity in ${INACTIVITY.taskInactivityDays} days`
          : (a.lastPresentDate ? `No attendance in the last ${a.missed} reviews` : `Never attended (${a.missed} reviews held since joining)`);
        flagged.push({ ...m, attendance: a, task: t, reason });
      }
      if (!flagged.length) continue;
      const users = await models.User.findAll({ where: { id: { [Op.in]: flagged.map((f) => f.userId) } }, attributes: ['id', 'firstName', 'lastName', 'email'] });
      const userById = new Map(users.map((u) => [u.id, u]));
      for (const f of flagged) {
        const u = userById.get(f.userId);
        suggestions.push({
          menteeId: f.userId,
          name: this._name(u),
          email: u?.email || null,
          clanId: cid,
          clanName: clanNameById.get(cid) || 'Clan',
          neverAttended: !(f.attendance && f.attendance.lastPresentDate),
          lastPresentDate: f.attendance ? f.attendance.lastPresentDate : null,
          missedReviews: f.attendance ? f.attendance.missed : 0,
          hasOpenTasks: f.task.hasOpenTasks,
          taskInactive: f.task.taskInactive,
          reason: f.reason,
        });
      }
    }
    return suggestions;
  }

  /**
   * Admin/mentor "run an inactivity check". Previews (autoPause=false) or pauses
   * (autoPause=true) every mentee the rule flags, across all overseen clans or
   * one specific clan. Auto-paused mentees get the pause email.
   */
  async runInactivityCheck(user, { clanId = null, autoPause = false } = {}) {
    const flagged = await this.listSuggestions(user, clanId);
    if (!autoPause) return { checked: true, autoPaused: false, flaggedCount: flagged.length, flagged };

    let paused = 0;
    for (const f of flagged) {
      try {
        const m = await models.ClanMembership.findOne({ where: { clanId: f.clanId, userId: f.menteeId, role: 'mentee' } });
        if (!m || m.status === 'paused') continue;
        await m.update({
          status: 'paused', pausedAt: new Date(), pausedReason: f.reason, pausedBy: 'auto',
          reengageCount: 0, reengageStage: 0, lastReengagedAt: null, pauseSuggestionDismissedAt: null,
        });
        await this._notifyPaused(f.menteeId, f.clanId, f.reason);
        paused += 1;
      } catch (e) {
        console.error('[inactivityCheck] pause failed for', f.menteeId, e.message);
      }
    }
    return { checked: true, autoPaused: true, flaggedCount: flagged.length, pausedCount: paused, flagged };
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
