const crypto = require('crypto');
const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ForbiddenError, ValidationError } = require('../utils/errors/errorTypes');
const authzService = require('./authzService');
const cfg = require('../config/reviewMeeting');

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
  /** Start (or return) the live room for a session. Idempotent. */
  async startMeeting(mentorId, sessionId, { externalUrl } = {}) {
    if (!cfg.enabled) throw new ForbiddenError('Live review video is not enabled');
    const session = await this._hostSession(mentorId, sessionId);
    // Re-opening after a prior call = a fresh call. Wipe the per-call attendance
    // signals so a new meeting doesn't inherit who attended the LAST one (joined,
    // seconds, talk time, and any AUTO 'present'). A mentor's MANUAL marks
    // (auto_present = false) are kept.
    const isRestart = !!session.meetingStartedAt;
    if (isRestart) {
      await models.CohortReviewEntry.update(
        { attendance: null },
        { where: { sessionId, autoPresent: true } }
      );
      await models.CohortReviewEntry.update(
        { autoPresent: false, joinedAt: null, leftAt: null, secondsPresent: 0, talkSeconds: 0 },
        { where: { sessionId } }
      );
    }
    const patch = {};
    if (!session.meetingRoom) {
      // Non-guessable slug — the natural way in is Pathment's Join button, not
      // this URL. Kept readable-ish for support.
      patch.meetingProvider = cfg.provider;
      patch.meetingRoom = `pathment-review-${session.id.slice(0, 8)}-${crypto.randomBytes(6).toString('hex')}`;
      patch.meetingUrl = `https://${cfg.jitsiDomain}/${patch.meetingRoom}`;
    }
    // Always (re)stamp the start — opening or RESUMING the room means it's live
    // "now". Without this a resumed meeting keeps its original (old) start time,
    // and the mentee-facing staleness check (activeForMentee, 3h window) would
    // treat a genuinely live call as stale and hide the Join banner.
    patch.meetingStartedAt = new Date();
    patch.meetingEndedAt = null; // reopening clears a prior end
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

  /** Emit `review:started` to every mentee in the session's clan (real-time banner). */
  async _notifyMenteesStarted(session) {
    const { emitToUser } = require('../socket');
    const cohortService = require('./cohortService');
    const [menteeIds, clan] = await Promise.all([
      cohortService.resolveMenteeIdsForClan(session.clanId),
      models.Clan.findByPk(session.clanId, { attributes: ['name'] }),
    ]);
    const payload = { sessionId: session.id, clanName: clan?.name || 'your clan' };
    for (const uid of menteeIds) emitToUser(uid, 'review:started', payload);
  }

  /** Close the room (stops new auto-attendance; contribution is finalized separately). */
  async endMeeting(mentorId, sessionId) {
    const session = await this._hostSession(mentorId, sessionId);
    if (!session.meetingEndedAt) await session.update({ meetingEndedAt: new Date() });
    return this._joinConfig(session, null);
  }

  /** Host's embed config + live roster (attendance/talk state per mentee). */
  async hostView(mentorId, sessionId) {
    if (!cfg.enabled) return { enabled: false, comingSoon: cfg.comingSoon };
    const session = await this._hostSession(mentorId, sessionId);
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

  // ── mentee: discover + join + leave ──────────────────────────────────────
  /** The live review the signed-in mentee can join right now (or null). */
  async activeForMentee(userId) {
    if (!cfg.enabled) return null;
    const clanIds = (await models.ClanMembership.findAll({
      where: { userId, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } },
      attributes: ['clanId'], raw: true,
    })).map((m) => m.clanId).filter(Boolean);
    if (!clanIds.length) return null;

    // Staleness guard: a meeting the mentor never cleanly ended (closed the tab
    // / hung up in Jitsi instead of "End & score") would otherwise leave
    // meetingEndedAt null forever and show the "Join review" banner to mentees
    // indefinitely. Only treat a meeting as live if it started recently.
    const freshCutoff = new Date(Date.now() - MEETING_STALE_HOURS * 60 * 60 * 1000);
    const session = await models.CohortReviewSession.findOne({
      where: {
        clanId: { [Op.in]: clanIds },
        status: 'in_progress',
        meetingStartedAt: { [Op.gt]: freshCutoff },
        meetingEndedAt: null,
      },
      order: [['meeting_started_at', 'DESC']],
    });
    if (!session) return null;
    const user = await models.User.findByPk(userId, { attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'] });
    const clan = await models.Clan.findByPk(session.clanId, { attributes: ['name'] });
    return { ...this._joinConfig(session, this._fullName(user), user && user.profilePictureUrl), clanName: clan?.name || 'your clan' };
  }

  /** Mark the AUTHENTICATED mentee present (self-report). Only marks themselves. */
  async selfPresent(userId, sessionId) {
    const session = await models.CohortReviewSession.findByPk(sessionId);
    if (!session) throw new NotFoundError('Review session not found');
    if (!(await this._menteeInClan(userId, session))) throw new ForbiddenError('You are not a mentee of this clan');

    const [entry] = await models.CohortReviewEntry.findOrCreate({
      where: { sessionId, menteeId: userId },
      defaults: { sessionId, menteeId: userId, status: 'pending' },
    });
    const patch = {};
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
  async finalizeContribution(mentorId, sessionId, menteeIds = []) {
    await this._hostSession(mentorId, sessionId);
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
    return { awarded };
  }
}

module.exports = new ReviewMeetingService();
