const crypto = require('crypto');
const { Op, col } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ForbiddenError, ValidationError } = require('../utils/errors/errorTypes');
const authzService = require('./authzService');
const cfg = require('../config/reviewMeeting');
const { activeOccurrence } = require('../utils/reviewRecurrence');

// A live meeting older than this with no explicit end is treated as abandoned —
// stops a never-ended meeting from showing the mentee "Join" banner forever.
const MEETING_STALE_HOURS = 3;

/**
 * reviewMeetingService — live video (Jitsi) for a cohort review.
 *
 * The mentor HOSTS: they open the room (start), and their page is the source of
 * truth for attendance seen from the roster and for contribution (dominant-
 * speaker talk time). Mentees JOIN through Pathment, which sets their identity
 * and self-reports their own presence (never someone else's). A direct-link
 * joiner is visible to the host but only mentor-confirmed — see the spec.
 *
 * Provider-flexible: the room URL is built from config.jitsiDomain, so pointing
 * at a self-hosted Jitsi or JaaS later needs no code change.
 */
class ReviewMeetingService {
  _fullName(u) { return u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Guest' : 'Guest'; }

  _joinConfig(session, displayName, avatarUrl) {
    return {
      sessionId: session.id,
      provider: session.meetingProvider || cfg.provider,
      domain: cfg.jitsiDomain,
      room: session.meetingRoom,
      url: session.meetingUrl,
      externalUrl: session.externalMeetingUrl || null,
      displayName: displayName || null,
      // The person's Pathment profile picture, so the call shows the same faces
      // people already know from the platform (Jitsi otherwise shows initials).
      avatarUrl: avatarUrl || null,
      startedAt: session.meetingStartedAt,
      endedAt: session.meetingEndedAt,
      // Mentor-controlled in-call polls (see setPolls). Propagated to mentees so
      // they can vote/see results when it's on.
      pollsEnabled: !!session.pollsEnabled,
    };
  }

  async _hostSession(mentorId, sessionId) {
    const session = await models.CohortReviewSession.findByPk(sessionId);
    if (!session) throw new NotFoundError('Review session not found');
    const clanIds = await authzService.mentoredClanIds(mentorId);
    if (session.clanId ? !clanIds.includes(session.clanId) : session.mentorId !== mentorId) {
      throw new ForbiddenError('You do not mentor this clan');
    }
    return session;
  }

  /** Is this mentee an active member of the session's clan? (self-report guard) */
  async _menteeInClan(userId, session) {
    if (!session.clanId) return false;
    const m = await models.ClanMembership.findOne({
      where: { userId, clanId: session.clanId, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } },
      attributes: ['id'], raw: true,
    });
    return !!m;
  }

  // ── host: open / close the room ──────────────────────────────────────────
  /**
   * Clean the attendance slate for a NEW live call so it never inherits who
   * attended a PREVIOUS call (or a seeded / prior-day mark on the same day-session).
   * Clears present/absent + all presence/talk/auto signals; keeps only a deliberate
   * 'excused' mark (a "can't attend" the mentor set on purpose). Whoever actually
   * joins THIS call re-marks present via auto-attendance.
   */
  async _wipePerCallAttendance(sessionId) {
    await models.CohortReviewEntry.update(
      { attendance: null, autoPresent: false, joinedAt: null, leftAt: null, secondsPresent: 0, talkSeconds: 0 },
      { where: { sessionId, attendance: { [Op.ne]: 'excused' } } }
    );
    // Excused people weren't in the call either — zero their presence/talk too.
    await models.CohortReviewEntry.update(
      { autoPresent: false, joinedAt: null, leftAt: null, secondsPresent: 0, talkSeconds: 0 },
      { where: { sessionId, attendance: 'excused' } }
    );
  }

  /**
   * Room name + URL for a call. Non-guessable — the natural way in is Pathment's
   * Join button, not this URL. Kept readable-ish for support.
   */
  _roomPatch(session) {
    const room = `pathment-review-${session.id.slice(0, 8)}-${crypto.randomBytes(6).toString('hex')}`;
    return {
      meetingProvider: cfg.provider,
      meetingRoom: room,
      meetingUrl: `https://${cfg.jitsiDomain}/${room}`,
    };
  }

  /**
   * Does this call need a fresh room?
   *
   * Yes when there's no room yet, and yes when the previous call was ENDED — a
   * new call must not reuse the room the last one ran in. Jitsi keeps a
   * participant around until it times them out, so anyone whose browser didn't
   * leave cleanly (closed laptop, killed tab, dropped network) is still sitting
   * in that room; rejoining it shows those ghosts as extra people. A fresh room
   * per call makes that structurally impossible.
   *
   * No while a call is LIVE (meetingEndedAt null) — rotating then would strand
   * everyone already in the room, including the host.
   */
  _needsFreshRoom(session) {
    return !session.meetingRoom || !!session.meetingEndedAt;
  }

  /** Start (or return) the live room for a session. Idempotent. */
  async startMeeting(mentorId, sessionId, { externalUrl } = {}) {
    if (!cfg.enabled) throw new ForbiddenError('Live review video is not enabled');
    const session = await this._hostSession(mentorId, sessionId);
    // Every call start begins with a clean attendance slate (no carry-over from a
    // prior call or seeded/earlier marks) — only actual joiners of THIS call count.
    await this._wipePerCallAttendance(sessionId);
    const patch = {};
    // First call gets a room; every call AFTER an ended one gets a brand-new room
    // so it can never inherit the previous call's ghost participants.
    if (this._needsFreshRoom(session)) Object.assign(patch, this._roomPatch(session));
    // Always (re)stamp the start — opening or RESUMING the room means it's live
    // "now". Without this a resumed meeting keeps its original (old) start time,
    // and the mentee-facing staleness check (activeForMentee, 3h window) would
    // treat a genuinely live call as stale and hide the Join banner.
    patch.meetingStartedAt = new Date();
    patch.meetingEndedAt = null; // reopening clears a prior end
    // Starting a live call means the review is active again — flip a 'finished'
    // session back to in_progress so the whole flow (roster edits, attendance)
    // is consistent with a call being live.
    if (session.status !== 'in_progress') patch.status = 'in_progress';
    if (externalUrl !== undefined) patch.externalMeetingUrl = externalUrl || null;
    if (Object.keys(patch).length) await session.update(patch);

    const host = await models.User.findByPk(mentorId, { attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'] });

    // Push a real-time "review started" to the clan's mentees so their Join
    // banner appears instantly instead of waiting for the next poll. Best-effort.
    if (session.clanId) {
      this._notifyMenteesStarted(session).catch((err) => console.error('review start notify failed (non-fatal):', err.message));
    }
    return this._joinConfig(session, this._fullName(host), host && host.profilePictureUrl);
  }

  /**
   * Tell the clan's mentees a review just went live: a real-time `review:started`
   * socket event (instant banner) AND a persistent in-app notification (the bell).
   * The notification is the reliable path — it survives a dropped/absent socket
   * (e.g. a misconfigured origin) and the mentee's 12s poll still shows the banner.
   */
  async _notifyMenteesStarted(session) {
    if (!session.clanId) return;
    const { emitToUser } = require('../socket');
    const cohortService = require('./cohortService');
    const [menteeIds, clan] = await Promise.all([
      cohortService.resolveMenteeIdsForClan(session.clanId),
      models.Clan.findByPk(session.clanId, { attributes: ['name'] }),
    ]);
    if (!menteeIds.length) return;
    const clanName = clan?.name || 'your clan';
    // Real-time banner.
    const payload = { sessionId: session.id, clanName };
    for (const uid of menteeIds) emitToUser(uid, 'review:started', payload);
    // Persistent bell notification (in-app only; no email/dedupe key so it always
    // fires on a genuine start). Best-effort — never block the call from starting.
    try {
      const notificationOrchestrator = require('./notificationOrchestrator');
      const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.REVIEW_REMINDER,
        recipients: menteeIds.map((id) => ({ userId: id })),
        payload: {
          title: 'Review is live',
          message: `Your mentor started the ${clanName} review — join now.`,
          // ?join=review makes the dashboard open the call directly (see ReviewJoinBar).
          actionUrl: '/mentee/dashboard?join=review',
          actionLabel: 'Join review',
          relatedEntityType: 'review_session',
        },
        channelOverrides: { inApp: true, email: false, chat: false },
      });
    } catch (e) { console.error('[review] start in-app notify failed (non-fatal):', e.message); }
  }

  /** Close the room (stops new auto-attendance; contribution is finalized separately).
   *  Ending the call also FINISHES the review automatically — the mentor no longer
   *  has to click "Finish" separately. A later "Start a new call" reopens it
   *  (startMeeting flips status back to in_progress). */
  async endMeeting(mentorId, sessionId) {
    const session = await this._hostSession(mentorId, sessionId);
    const patch = {};
    if (!session.meetingEndedAt) patch.meetingEndedAt = new Date();
    if (session.status !== 'finished') {
      patch.status = 'finished';
      patch.finishedAt = session.finishedAt || new Date();
    }
    if (Object.keys(patch).length) await session.update(patch);
    return this._joinConfig(session, null);
  }

  /**
   * If ANY active recurring schedule for one of `clanIds` has an occurrence whose
   * window contains `now`, ensure that clan's day-session is OPEN for it and return
   * it. Liveness is driven by the SCHEDULE's occurrence window — NOT the session's
   * single frozen `scheduled_at` — so a clan can run several reviews on the same
   * day (e.g. 4:10 AM and 3:00 PM) and each goes live at its own time. Also
   * (re)opens over an earlier call that day. Returns { schedule, occ, session } or null.
   */
  async _liveScheduleForClans(clanIds, now = new Date()) {
    if (!clanIds || !clanIds.length) return null;
    const schedules = await models.ReviewSchedule.findAll({ where: { clanId: { [Op.in]: clanIds }, active: true } });
    for (const s of schedules) {
      const occ = activeOccurrence(s, now);
      if (!occ) continue;
      const session = await require('./reviewScheduleService')._findOrCreateSession(s, occ);
      // Deliberately ended AFTER this occurrence started → stays closed.
      if (session.meetingEndedAt && new Date(session.meetingEndedAt).getTime() >= occ.start.getTime()) continue;

      const isConfiguredForOcc = session.scheduledAt
        && new Date(session.scheduledAt).getTime() === occ.start.getTime();
      if (!isConfiguredForOcc) {
        // Fresh occurrence — clean the attendance slate so it doesn't inherit an
        // earlier call's / seeded marks, then configure for this occurrence.
        await this._wipePerCallAttendance(session.id);
        const patch = { scheduledAt: occ.start, reviewScheduleId: s.id };
        if (this._needsFreshRoom(session)) Object.assign(patch, this._roomPatch(session));
        await session.update(patch);
      }
      return { schedule: s, occ, session };
    }
    return null;
  }

  /** Host's embed config + live roster (attendance/talk state per mentee). */
  async hostView(mentorId, sessionId) {
    if (!cfg.enabled) return { enabled: false, comingSoon: cfg.comingSoon };
    const session = await this._hostSession(mentorId, sessionId);
    // A scheduled review auto-opens when any active schedule for this clan is live
    // NOW (window-based, so multiple reviews/day + a stale scheduled_at both work).
    try {
      const live = await this._liveScheduleForClans([session.clanId], new Date());
      if (live) await session.reload();
    } catch (e) { console.error('scheduled review auto-open failed (non-fatal):', e.message); }
    // Reconcile first so the roster covers EVERY clan mentee, not just those who
    // already self-reported — otherwise the mentor can't mark a direct joiner
    // present, or even see who hasn't shown up.
    try { await require('./cohortReviewService')._reconcileEntries(session); } catch { /* roster falls back to existing entries */ }
    const host = await models.User.findByPk(mentorId, { attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'] });
    const entries = await models.CohortReviewEntry.findAll({
      where: { sessionId },
      include: [{ model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName'] }],
    });
    const roster = entries.map((e) => ({
      menteeId: e.menteeId,
      name: this._fullName(e.mentee),
      attendance: e.attendance,
      autoPresent: e.autoPresent,
      joinedAt: e.joinedAt,
      secondsPresent: e.secondsPresent,
      talkSeconds: e.talkSeconds,
      contributionPoints: e.contributionPoints,
    }));
    return { enabled: true, meeting: this._joinConfig(session, this._fullName(host), host && host.profilePictureUrl), roster, live: !!session.meetingStartedAt && !session.meetingEndedAt, attendanceTracking: !!session.attendanceTracking };
  }

  /** Mentor toggles whether joining this review auto-marks mentees present. */
  async setAttendanceTracking(mentorId, sessionId, enabled) {
    const session = await this._hostSession(mentorId, sessionId);
    await session.update({ attendanceTracking: !!enabled });
    let marked = 0;
    if (enabled) {
      // Turning tracking ON mid-call must credit whoever is ALREADY in the room
      // (they joined before the toggle, so selfPresent never marked them). Mark
      // present anyone with a recorded join, except an explicit 'excused'.
      const [count] = await models.CohortReviewEntry.update(
        { attendance: 'present', autoPresent: true },
        { where: { sessionId, joinedAt: { [Op.ne]: null }, attendance: { [Op.ne]: 'excused' } } }
      );
      marked = count || 0;
    }
    return { attendanceTracking: !!enabled, marked };
  }

  /** Mentor toggle: enable/disable Jitsi in-call polls for the session (propagated
   *  to mentees via the join config so they can vote/see results while it's on). */
  async setPolls(mentorId, sessionId, enabled) {
    const session = await this._hostSession(mentorId, sessionId);
    await session.update({ pollsEnabled: !!enabled });
    return { pollsEnabled: !!enabled };
  }

  // ── mentee: discover + join + leave ──────────────────────────────────────
  /** The live review the signed-in mentee can join right now (or null). */
  async activeForMentee(userId) {
    if (!cfg.enabled) return null;
    const clanIds = (await models.ClanMembership.findAll({
      where: { userId, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } },
      attributes: ['clanId'], raw: true,
    })).map((m) => m.clanId).filter(Boolean);
    if (!clanIds.length) return null;

    const now = new Date();
    // (0) SCHEDULE-DRIVEN liveness (the reliable path): if any active recurring
    //     schedule for the mentee's clan is live right now, AND has been explicitly started.
    try {
      const live = await this._liveScheduleForClans(clanIds, now);
      if (live && live.session.meetingStartedAt && !live.session.meetingEndedAt) {
        const u = await models.User.findByPk(userId, { attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'] });
        const clan = await models.Clan.findByPk(live.session.clanId, { attributes: ['name'] });
        return { ...this._joinConfig(live.session, this._fullName(u), u && u.profilePictureUrl), clanName: clan?.name || 'your clan' };
      }
    } catch (e) { console.error('[activeForMentee] schedule-live check failed:', e.message); }

    // (1) Ad-hoc / manual: the mentor started a call recently and hasn't ended it.
    const freshCutoff = new Date(Date.now() - MEETING_STALE_HOURS * 60 * 60 * 1000);
    const session = await models.CohortReviewSession.findOne({
      where: {
        clanId: { [Op.in]: clanIds },
        meetingStartedAt: { [Op.gt]: freshCutoff },
        meetingEndedAt: null,
      },
      order: [['scheduled_at', 'DESC'], ['meeting_started_at', 'DESC']],
    });

    if (session) {
      const u = await models.User.findByPk(userId, { attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'] });
      const clan = await models.Clan.findByPk(session.clanId, { attributes: ['name'] });
      return { ...this._joinConfig(session, this._fullName(u), u && u.profilePictureUrl), clanName: clan?.name || 'your clan' };
    }

    return null;
  }

  /** Mark the AUTHENTICATED mentee present (self-report). Only marks themselves. */
  async selfPresent(userId, sessionId, { talkSeconds } = {}) {
    const session = await models.CohortReviewSession.findByPk(sessionId);
    if (!session) throw new NotFoundError('Review session not found');
    if (!(await this._menteeInClan(userId, session))) throw new ForbiddenError('You are not a mentee of this clan');

    const [entry] = await models.CohortReviewEntry.findOrCreate({
      where: { sessionId, menteeId: userId },
      defaults: { sessionId, menteeId: userId, status: 'pending' },
    });
    const patch = {};
    // Mentee self-reports their own dominant-speaker time (heartbeat). Monotonic —
    // never lower it; the mentor's name-based tracking also feeds the same field.
    const ts = Math.max(0, Math.min(24 * 3600, parseInt(talkSeconds, 10) || 0));
    if (ts > (entry.talkSeconds || 0)) patch.talkSeconds = ts;
    // Attendance is only touched when the mentor turned tracking ON for this call
    // (a review, not a general meeting). When on, JOINING is live proof of
    // presence, so mark present even over a prior 'absent' — but respect an
    // explicit 'excused'. When off, we just record the join (no attendance).
    if (session.attendanceTracking && entry.attendance !== 'excused') {
      patch.attendance = 'present';
      patch.autoPresent = true;
    }
    if (!entry.joinedAt) patch.joinedAt = new Date();
    if (Object.keys(patch).length) await entry.update(patch);

    // Re-engage a paused mentee who shows up — reuse the existing behaviour.
    require('./mentorshipPauseService').autoResumeIfPaused(userId, 'joined a review').catch(() => {});
    return { present: (patch.attendance || entry.attendance) === 'present' };
  }

  /** Stamp the mentee's leave + accumulate presence seconds. */
  async selfLeave(userId, sessionId, seconds = 0) {
    const entry = await models.CohortReviewEntry.findOne({ where: { sessionId, menteeId: userId } });
    if (!entry) return { ok: true };
    const add = Math.max(0, Math.min(24 * 3600, parseInt(seconds, 10) || 0));
    await entry.update({ leftAt: new Date(), secondsPresent: (entry.secondsPresent || 0) + add });
    return { ok: true };
  }

  // ── host: contribution ────────────────────────────────────────────────────
  /** Record accumulated dominant-speaker seconds per mentee (host-observed). */
  async recordTalkTime(mentorId, sessionId, items = []) {
    await this._hostSession(mentorId, sessionId);
    if (!Array.isArray(items)) throw new ValidationError('items must be an array');
    for (const it of items) {
      if (!it || !it.menteeId) continue;
      const secs = Math.max(0, Math.min(24 * 3600, parseInt(it.seconds, 10) || 0));
      const [entry] = await models.CohortReviewEntry.findOrCreate({
        where: { sessionId, menteeId: it.menteeId },
        defaults: { sessionId, menteeId: it.menteeId, status: 'pending' },
      });
      // Monotonic — never lower an accumulated count on a late/re-send.
      if (secs > (entry.talkSeconds || 0)) await entry.update({ talkSeconds: secs });
    }
    return { ok: true };
  }

  /**
   * Scoring list for the mentor: the WHOLE roster, with `proposed` pre-set for
   * anyone who spoke past the threshold. Returning everyone (not just speakers)
   * lets the mentor also credit someone who contributed in chat or by helping —
   * talk time is a proxy, not the definition of contributing.
   */
  async proposeContribution(mentorId, sessionId) {
    const view = await this.hostView(mentorId, sessionId);
    return view.roster
      .filter((r) => r.attendance === 'present' || r.talkSeconds > 0)
      .map((r) => ({
        menteeId: r.menteeId,
        name: r.name,
        talkSeconds: r.talkSeconds,
        alreadyAwarded: r.contributionPoints > 0,
        proposed: r.talkSeconds >= cfg.contributionThresholdSeconds,
      }));
  }

  /**
   * Award the contribution point to the confirmed mentees. Idempotent per
   * (session, mentee) — a re-finalize never double-awards.
   */
  async finalizeContribution(mentorId, sessionId, menteeIds = [], { sendAbsentEmails } = {}) {
    const session = await this._hostSession(mentorId, sessionId);
    if (!Array.isArray(menteeIds)) throw new ValidationError('menteeIds must be an array');
    const gamificationService = require('./gamificationService');
    let awarded = 0;
    for (const menteeId of [...new Set(menteeIds)]) {
      const entry = await models.CohortReviewEntry.findOne({ where: { sessionId, menteeId } });
      if (!entry || entry.contributionPoints > 0) continue; // already awarded → skip
      try {
        await gamificationService.awardPoints(menteeId, cfg.contributionPoints, 'review_contribution', sessionId, 'Contributed in the cohort review');
        await entry.update({ contributionPoints: cfg.contributionPoints });
        awarded += 1;
      } catch (e) {
        // A mentee with no MenteeProfile (edge) shouldn't sink the batch.
        console.warn('[reviewMeeting] contribution award failed for', menteeId, e.message);
      }
    }

    if (sendAbsentEmails) {
      require('./cohortReviewService')._notifyAbsentMentees(session).catch(() => {});
    }

    return { awarded };
  }
}

module.exports = new ReviewMeetingService();
