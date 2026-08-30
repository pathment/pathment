const { Op } = require('sequelize');
const crypto = require('crypto');
const { models } = require('../db');
const { NotFoundError, ForbiddenError, ValidationError } = require('../utils/errors/errorTypes');
const authzService = require('./authzService');
const cohortService = require('./cohortService');
const emailService = require('./emailService');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const cfg = require('../config/reviewMeeting');
const { nextOccurrences } = require('../utils/reviewRecurrence');
const { buildEventIcs } = require('../utils/ics');
const { renderEmail, plainText } = require('../utils/emailTemplate');

/**
 * reviewScheduleService — recurring cohort reviews.
 *
 * A mentor sets a weekly/biweekly review (weekday + local time). We materialise
 * upcoming occurrences as CohortReviewSessions (one per clan per date, room
 * pre-created), send a calendar invite + 24h/1h reminders (each rendered in the
 * recipient's own timezone, with an .ics attached), and the room auto-opens at
 * the scheduled time (openness is computed at read time in reviewMeetingService,
 * so it needs no minute-precise cron). `tick()` is driven by notificationScheduler.
 */

const HORIZON_DAYS = 14;                     // materialise this far ahead
const clientUrl = () => (process.env.CLIENT_URL || 'https://pathment.me').replace(/\/$/, '');
const orgEmail = () => process.env.RESEND_FROM_EMAIL || 'noreply@pathment.me';
const escHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Format a UTC instant in a given IANA zone, e.g. "Fri, Aug 14, 2026, 5:00 PM EDT". */
function fmtInZone(date, tz) {
  const opts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };
  try { return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: tz || 'UTC' }).format(date); }
  catch { return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(date); }
}

/**
 * A real IANA zone, and one that was actually given.
 *
 * The undefined check is the point. `new Intl.DateTimeFormat('en-US', {
 * timeZone: undefined })` does not throw, it quietly uses the server's own
 * zone, so a request with no timezone passed this and then died in the column
 * as a bare "Validation failed". That is what a mentor saw as "Could not set
 * that rhythm. Try again." for every attempt: a message that named neither the
 * field nor the fix.
 */
const VALID_TZ = (tz) => {
  if (typeof tz !== 'string' || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

class ReviewScheduleService {
  async _assertMentorsClan(mentorId, clanId) {
    const clanIds = await authzService.mentoredClanIds(mentorId);
    if (!clanIds.includes(clanId)) throw new ForbiddenError('You do not mentor this clan');
  }

  async createSchedule(mentorId, input = {}) {
    const { clanId, title, dayOfWeek, timeLocal, timezone, intervalWeeks = 1, durationMinutes = 60, startsOn, endsOn = null } = input;
    if (!clanId) throw new ValidationError('clanId is required');
    await this._assertMentorsClan(mentorId, clanId);
    if (!(dayOfWeek >= 0 && dayOfWeek <= 6)) throw new ValidationError('dayOfWeek must be 0–6');
    if (!/^\d{2}:\d{2}$/.test(String(timeLocal || ''))) throw new ValidationError('timeLocal must be HH:mm');
    if (!VALID_TZ(timezone)) {
      throw new ValidationError(
        'A timezone is required, and must be one like Asia/Karachi. The time you set is a wall clock, so it means nothing without the clock it was read from.'
      );
    }
    if (![1, 2].includes(Number(intervalWeeks))) throw new ValidationError('intervalWeeks must be 1 or 2');
    if (!startsOn) throw new ValidationError('startsOn is required');

    const schedule = await models.ReviewSchedule.create({
      clanId, mentorId, title: title || null, dayOfWeek: Number(dayOfWeek), timeLocal, timezone,
      intervalWeeks: Number(intervalWeeks), durationMinutes: Number(durationMinutes) || 60, startsOn, endsOn: endsOn || null, active: true,
    });
    // Create the near-horizon sessions, then ALWAYS announce the next occurrence
    // to the audience — a deliberate user action should notify even if a session
    // for that date already existed (a prior schedule, or today's ad-hoc review),
    // in which case the invitesSentAt guard would otherwise silently skip it.
    await this._materialize(schedule, false).catch((e) => console.error('[reviewSchedule] initial materialize failed:', e.message));
    await this._announceNext(schedule).catch((e) => console.error('[reviewSchedule] announce failed:', e.message));
    return schedule;
  }

  /** Send the invite (email + in-app) for the schedule's nearest occurrence, now,
   *  unconditionally — used when a schedule is (re)created. */
  async _announceNext(schedule) {
    const occ = nextOccurrences(schedule, new Date(), 1);
    if (!occ.length) return;
    const session = await this._findOrCreateSession(schedule, occ[0]);
    await this._email(session, schedule, 'invite');
    if (!session.invitesSentAt) await session.update({ invitesSentAt: new Date() });
  }

  async listSchedules(mentorId) {
    const clanIds = await authzService.mentoredClanIds(mentorId);
    if (!clanIds.length) return [];
    return models.ReviewSchedule.findAll({
      where: { clanId: { [Op.in]: clanIds } },
      include: [{ model: models.Clan, as: 'clan', attributes: ['id', 'name'] }],
      order: [['active', 'DESC'], ['createdAt', 'DESC']],
    });
  }

  async cancelSchedule(mentorId, scheduleId) {
    const schedule = await models.ReviewSchedule.findByPk(scheduleId);
    if (!schedule) throw new NotFoundError('Schedule not found');
    await this._assertMentorsClan(mentorId, schedule.clanId);
    await schedule.update({ active: false });
    // Drop FUTURE occurrences that haven't opened yet (leave past/live ones alone).
    await models.CohortReviewSession.update(
      { status: 'finished', meetingEndedAt: new Date() },
      { where: { reviewScheduleId: schedule.id, scheduledAt: { [Op.gt]: new Date() }, meetingStartedAt: null } }
    );
    // Tell the host + mentees it's off.
    await this._notifyCancelled(schedule).catch((e) => console.error('[reviewSchedule] cancel notify failed:', e.message));
    return { ok: true };
  }

  // ── materialisation ────────────────────────────────────────────────────────
  async _materialize(schedule, sendInvites) {
    if (!schedule.active) return;
    const horizon = new Date(Date.now() + HORIZON_DAYS * 86400000);
    const occ = nextOccurrences(schedule, new Date(), 4).filter((o) => o.start <= horizon);
    for (const o of occ) {
      const session = await this._findOrCreateSession(schedule, o);
      if (sendInvites && !session.invitesSentAt) {
        await this._email(session, schedule, 'invite').catch((e) => console.error('[reviewSchedule] invite failed:', e.message));
        await session.update({ invitesSentAt: new Date() });
      }
    }
  }

  async _findOrCreateSession(schedule, occ) {
    // One session per clan per date (matches the ad-hoc "today's review" model).
    const [session] = await models.CohortReviewSession.findOrCreate({
      where: { clanId: schedule.clanId, sessionDate: occ.dateStr },
      defaults: { clanId: schedule.clanId, mentorId: schedule.mentorId, sessionDate: occ.dateStr, status: 'in_progress' },
    });
    const patch = {};
    if (!session.scheduledAt) patch.scheduledAt = occ.start;
    if (!session.reviewScheduleId) patch.reviewScheduleId = schedule.id;
    if (session.status === 'draft') patch.status = 'in_progress';
    if (!session.meetingRoom) {
      patch.meetingProvider = cfg.provider;
      patch.meetingRoom = `pathment-review-${session.id.slice(0, 8)}-${crypto.randomBytes(6).toString('hex')}`;
      patch.meetingUrl = `https://${cfg.jitsiDomain}/${patch.meetingRoom}`;
    }
    if (Object.keys(patch).length) await session.update(patch);
    return session;
  }

  // ── email (invite / reminders), per-recipient timezone + .ics ───────────────
  async _email(session, schedule, kind) {
    if (!session.scheduledAt) return;
    const menteeIds = await cohortService.resolveMenteeIdsForClan(schedule.clanId);
    const ids = [...new Set([schedule.mentorId, ...menteeIds])];
    const [users, settings, clan] = await Promise.all([
      models.User.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'email', 'firstName'], raw: true }),
      models.UserSettings.findAll({ where: { userId: { [Op.in]: ids } }, attributes: ['userId', 'timezone'], raw: true }),
      models.Clan.findByPk(schedule.clanId, { attributes: ['name'], raw: true }),
    ]);
    const tzById = new Map(settings.map((s) => [s.userId, s.timezone]));
    const title = schedule.title || `${clan?.name || 'Clan'} cohort review`;
    const start = new Date(session.scheduledAt);
    const end = new Date(start.getTime() + (schedule.durationMinutes || 60) * 60000);

    const H = {
      invite: { subject: `Invite: ${title}`, lead: 'A cohort review has been scheduled.' },
      '24h': { subject: `Tomorrow: ${title}`, lead: 'Reminder — your cohort review is in about 24 hours.' },
      '1h': { subject: `Starting soon: ${title}`, lead: 'Heads up — your cohort review starts in about an hour.' },
    }[kind];

    for (const u of users) {
      if (!u.email) continue;
      const tz = tzById.get(u.id) || schedule.timezone || 'UTC';
      const when = fmtInZone(start, tz);
      const isMentor = u.id === schedule.mentorId;
      const joinUrl = `${clientUrl()}/${isMentor ? 'mentor/review' : 'mentee/dashboard'}`;
      const ics = buildEventIcs({
        uid: `review-${session.id}@pathment.me`, start, end, title,
        description: `${title}. Join in Pathment: ${joinUrl}`, url: joinUrl,
        organizerName: 'Pathment', organizerEmail: orgEmail(),
        method: kind === 'invite' ? 'REQUEST' : 'PUBLISH',
      });
      const html = renderEmail({
        heading: title,
        bodyHtml:
          `<p style="margin:0 0 14px;">${escHtml(H.lead)}</p>` +
          `<p style="margin:0 0 6px;"><strong>When:</strong> ${escHtml(when)}</p>` +
          `<p style="margin:0 0 14px;color:#94a3b8;font-size:12px;">Shown in your timezone (${escHtml(tz)}). A calendar invite is attached.</p>`,
        cta: { label: isMentor ? 'Open the review' : 'Join the review', url: joinUrl },
        preheader: `${title} — ${when}`,
      });
      const text = plainText({ heading: title, bodyText: `${H.lead}\nWhen: ${when} (${tz})`, cta: { label: 'Join', url: joinUrl } });
      await emailService.enqueue({
        to: u.email, subject: H.subject, text, html,
        emailType: kind === 'invite' ? 'review_invite' : 'review_reminder',
        recipientId: u.id,
        idempotencyKey: `revsched:${kind}:${session.id}:${u.id}`,
        attachments: [{ filename: 'review.ics', content: Buffer.from(ics.content, 'utf8').toString('base64'), contentType: ics.contentType }],
      });
    }

    // In-app notifications (the bell + live socket push). Role-scoped actionUrl so
    // resolveAudience routes it to the right portal. Email is handled above, so
    // dispatch is in-app only here (channelOverrides email:false).
    await this._notifyInApp(session, schedule, kind, menteeIds).catch((e) => console.error('[reviewSchedule] in-app notify failed:', e.message));
  }

  async _notifyInApp(session, schedule, kind, menteeIds) {
    const clan = await models.Clan.findByPk(schedule.clanId, { attributes: ['name'], raw: true });
    const title = schedule.title || `${clan?.name || 'Clan'} cohort review`;
    const eventKey = kind === 'invite' ? NOTIFICATION_EVENTS.REVIEW_SCHEDULED : NOTIFICATION_EVENTS.REVIEW_REMINDER;
    const msg = {
      invite: `"${title}" has been scheduled. You'll get a reminder before it starts.`,
      '24h': `Reminder: "${title}" is in about 24 hours.`,
      '1h': `Heads up: "${title}" starts in about an hour.`,
    }[kind];
    await this._dispatchInApp(schedule, menteeIds, {
      eventKey,
      title: kind === 'invite' ? 'Review scheduled' : 'Review reminder',
      message: msg,
      mentorLabel: 'Open review', menteeLabel: 'Join review',
    });
  }

  /**
   * Fan an in-app notification to the host (→/mentor/review) and the clan's
   * mentees (→/mentee/dashboard, where the Join banner appears). Role-scoped
   * actionUrl so resolveAudience routes it to the right portal. In-app only —
   * any email is handled on its own path. No relatedEntityId (avoids the
   * orchestrator auto-dedupe dropping repeat/related notifications).
   */
  async _dispatchInApp(schedule, menteeIds, { eventKey, title, message, mentorLabel = 'Open review', menteeLabel = 'Join review' }) {
    const inAppOnly = { inApp: true, email: false, chat: false };
    const base = { title, message, relatedEntityType: 'review_session' };
    await notificationOrchestrator.dispatch({
      eventKey, recipients: [{ userId: schedule.mentorId }],
      payload: { ...base, actionLabel: mentorLabel, actionUrl: '/mentor/review' }, channelOverrides: inAppOnly,
    });
    if (menteeIds && menteeIds.length) {
      await notificationOrchestrator.dispatch({
        eventKey, recipients: menteeIds.map((id) => ({ userId: id })),
        payload: { ...base, actionLabel: menteeLabel, actionUrl: '/mentee/dashboard' }, channelOverrides: inAppOnly,
      });
    }
  }

  /** "Your review is live — join now" (host + mentees), fired when it opens. */
  async _notifyStartedInApp(session, schedule) {
    const clan = await models.Clan.findByPk(schedule.clanId, { attributes: ['name'], raw: true });
    const title = schedule.title || `${clan?.name || 'Clan'} cohort review`;
    const menteeIds = await cohortService.resolveMenteeIdsForClan(schedule.clanId);
    await this._dispatchInApp(schedule, menteeIds, {
      eventKey: NOTIFICATION_EVENTS.REVIEW_REMINDER,
      title: 'Review is live',
      message: `"${title}" is starting now — join.`,
      mentorLabel: 'Join review', menteeLabel: 'Join review',
    });
  }

  /** "Recurring review cancelled" (host + mentees). */
  async _notifyCancelled(schedule) {
    const clan = await models.Clan.findByPk(schedule.clanId, { attributes: ['name'], raw: true });
    const title = schedule.title || `${clan?.name || 'Clan'} cohort review`;
    const menteeIds = await cohortService.resolveMenteeIdsForClan(schedule.clanId);
    await this._dispatchInApp(schedule, menteeIds, {
      eventKey: NOTIFICATION_EVENTS.REVIEW_REMINDER,
      title: 'Review cancelled',
      message: `The recurring review "${title}" was cancelled. Upcoming sessions have been removed.`,
      mentorLabel: 'Open reviews', menteeLabel: 'Open dashboard',
    });
  }

  // ── scheduler entry point (hourly) ─────────────────────────────────────────
  async tick() {
    const now = new Date();
    // 1) materialise upcoming occurrences + send invites for new ones
    const schedules = await models.ReviewSchedule.findAll({ where: { active: true } });
    for (const s of schedules) {
      try { await this._materialize(s, true); } catch (e) { console.error('[reviewSchedule] materialize failed:', e.message); }
    }
    // 2) 24h reminders (wide window; the flag prevents repeats)
    await this._remind(now, 'reminded24hAt', '24h', 23, 25);
    // 3) 1h reminders
    await this._remind(now, 'reminded1hAt', '1h', 0.5, 1.5);
  }

  async _remind(now, flagField, kind, lowH, highH) {
    const lo = new Date(now.getTime() + lowH * 3600000);
    const hi = new Date(now.getTime() + highH * 3600000);
    const due = await models.CohortReviewSession.findAll({
      where: {
        reviewScheduleId: { [Op.ne]: null },
        scheduledAt: { [Op.between]: [lo, hi] },
        meetingEndedAt: null,
        [flagField]: null,
      },
    });
    for (const session of due) {
      const schedule = await models.ReviewSchedule.findByPk(session.reviewScheduleId);
      if (schedule && schedule.active) {
        await this._email(session, schedule, kind).catch((e) => console.error(`[reviewSchedule] ${kind} reminder failed:`, e.message));
      }
      await session.update({ [flagField]: new Date() });
    }
  }
}

module.exports = new ReviewScheduleService();
