const { Op } = require('sequelize');
const crypto = require('crypto');
const { models } = require('../db');
const { NotFoundError, ForbiddenError, ValidationError } = require('../utils/errors/errorTypes');
const cohortService = require('./cohortService');
const emailService = require('./emailService');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const cfg = require('../config/reviewMeeting');
const { buildEventIcs } = require('../utils/ics');
const { renderEmail, plainText } = require('../utils/emailTemplate');

/**
 * adminMeetingService — admin-hosted live meetings (org broadcasts).
 *
 * Audience is one of:
 *   'mentors' — every active mentor.
 *   'clan'    — a specific clan's members (its mentees + its mentors).
 *   'both'    — every active mentor + that clan's mentees.
 * The room is a shared (Jitsi) room reusing the review-meeting provider config.
 * Attendees get a calendar invite + 24h/1h reminders and a live "join" banner.
 * `tick()` (hourly, via notificationScheduler) sends reminders + auto-ends
 * meetings whose scheduled window has long passed.
 */

const clientUrl = () => (process.env.CLIENT_URL || 'https://pathment.me').replace(/\/$/, '');
const orgEmail = () => process.env.RESEND_FROM_EMAIL || 'noreply@pathment.me';
const escHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function fmtInZone(date, tz) {
  const opts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };
  try { return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: tz || 'UTC' }).format(date); }
  catch { return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(date); }
}

class AdminMeetingService {
  // ── audience ────────────────────────────────────────────────────────────────
  async _allMentorIds() {
    const rows = await models.User.findAll({ where: { role: 'mentor', status: 'active' }, attributes: ['id'], raw: true });
    return rows.map((r) => r.id);
  }
  async _clanMentorIds(clanId) {
    const rows = await models.ClanMembership.findAll({
      where: { clanId, status: 'active', role: { [Op.in]: ['lead_mentor', 'co_mentor', 'core_team'] } },
      attributes: ['userId'], raw: true,
    });
    return rows.map((r) => r.userId);
  }

  /** Resolve a meeting's audience to a de-duped set of user ids (incl. the host). */
  async audienceUserIds(meeting) {
    const ids = new Set([meeting.hostId]);
    if (meeting.audienceType === 'mentors' || meeting.audienceType === 'both') {
      (await this._allMentorIds()).forEach((id) => ids.add(id));
    }
    if (meeting.audienceType === 'clan' || meeting.audienceType === 'both') {
      if (meeting.clanId) {
        (await cohortService.resolveMenteeIdsForClan(meeting.clanId)).forEach((id) => ids.add(id));
        // A pure 'clan' audience also includes that clan's mentors.
        if (meeting.audienceType === 'clan') (await this._clanMentorIds(meeting.clanId)).forEach((id) => ids.add(id));
      }
    }
    return [...ids];
  }

  /** True if `userId` may see/join this meeting. */
  async isInAudience(meeting, userId) {
    if (userId === meeting.hostId) return true;
    const ids = await this.audienceUserIds(meeting);
    return ids.includes(userId);
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────
  async createMeeting(hostId, input = {}) {
    const { title, description = null, scheduledAt, durationMinutes = 60, audienceType = 'mentors', clanId = null } = input;
    if (!title || !String(title).trim()) throw new ValidationError('Title is required');
    if (!scheduledAt || Number.isNaN(new Date(scheduledAt).getTime())) throw new ValidationError('A valid start time is required');
    if (!['mentors', 'clan', 'both'].includes(audienceType)) throw new ValidationError('Invalid audience');
    if ((audienceType === 'clan' || audienceType === 'both') && !clanId) throw new ValidationError('Pick a clan for this audience');
    if (clanId) {
      const clan = await models.Clan.findByPk(clanId, { attributes: ['id'] });
      if (!clan) throw new NotFoundError('Clan not found');
    }

    const room = `pathment-admin-${crypto.randomBytes(9).toString('hex')}`;
    const meeting = await models.AdminMeeting.create({
      hostId, title: String(title).trim(), description: description || null,
      scheduledAt: new Date(scheduledAt), durationMinutes: Number(durationMinutes) || 60,
      audienceType, clanId: audienceType === 'mentors' ? null : clanId,
      meetingProvider: cfg.provider, meetingRoom: room, meetingUrl: `https://${cfg.jitsiDomain}/${room}`,
      status: 'scheduled',
    });
    await this._email(meeting, 'invite').catch((e) => console.error('[adminMeeting] invite failed:', e.message));
    await meeting.update({ invitesSentAt: new Date() });
    return meeting;
  }

  async listMeetings() {
    return models.AdminMeeting.findAll({
      where: { status: { [Op.ne]: 'cancelled' } },
      include: [
        { model: models.User, as: 'host', attributes: ['id', 'firstName', 'lastName'] },
        ...(models.Clan ? [{ model: models.Clan, as: 'clan', attributes: ['id', 'name'] }] : []),
      ],
      order: [['scheduledAt', 'DESC']],
      limit: 200,
    });
  }

  async startMeeting(id) {
    const m = await models.AdminMeeting.findByPk(id);
    if (!m) throw new NotFoundError('Meeting not found');
    if (m.status === 'ended' || m.status === 'cancelled') throw new ValidationError('This meeting is over');
    if (m.status !== 'live') {
      await m.update({ status: 'live', startedAt: m.startedAt || new Date() });
      // Tell the audience it's live now — the Join banner appears globally, and
      // this bell reaches those who aren't on a page at the moment.
      await this._notifyInApp(m, 'live').catch((e) => console.error('[adminMeeting] live notify failed:', e.message));
    }
    return m;
  }

  async endMeeting(id) {
    const m = await models.AdminMeeting.findByPk(id);
    if (!m) throw new NotFoundError('Meeting not found');
    await m.update({ status: 'ended', endedAt: new Date() });
    return m;
  }

  async cancelMeeting(id) {
    const m = await models.AdminMeeting.findByPk(id);
    if (!m) throw new NotFoundError('Meeting not found');
    if (m.status === 'ended') throw new ValidationError('This meeting already ended');
    await m.update({ status: 'cancelled' });
    await this._notifyInApp(m, 'cancelled').catch((e) => console.error('[adminMeeting] cancel notify failed:', e.message));
    return m;
  }

  /** In-app notification to the whole audience (start / cancel). */
  async _notifyInApp(meeting, kind) {
    const ids = await this.audienceUserIds(meeting);
    if (!ids.length) return;
    const copy = {
      live: { title: 'Meeting is live', message: `"${meeting.title}" is live now — join.`, label: 'Join meeting' },
      cancelled: { title: 'Meeting cancelled', message: `"${meeting.title}" has been cancelled.`, label: 'Open Pathment' },
    }[kind];
    await notificationOrchestrator.dispatch({
      eventKey: kind === 'live' ? NOTIFICATION_EVENTS.ADMIN_MEETING_REMINDER : NOTIFICATION_EVENTS.ADMIN_MEETING_INVITE,
      recipients: ids.map((id) => ({ userId: id })),
      payload: { title: copy.title, message: copy.message, actionUrl: '/', actionLabel: copy.label, relatedEntityType: 'admin_meeting' },
      channelOverrides: { inApp: true, email: false, chat: false },
    });
  }

  // ── attendee side ─────────────────────────────────────────────────────────────
  /** Meetings this user can join right now (live) or that are imminent (<30m). */
  async liveForUser(userId) {
    const soon = new Date(Date.now() + 30 * 60 * 1000);
    const candidates = await models.AdminMeeting.findAll({
      where: {
        [Op.or]: [
          { status: 'live' },
          { status: 'scheduled', scheduledAt: { [Op.lte]: soon, [Op.gte]: new Date(Date.now() - 4 * 60 * 60 * 1000) } },
        ],
      },
      include: [...(models.Clan ? [{ model: models.Clan, as: 'clan', attributes: ['id', 'name'] }] : [])],
      order: [['scheduledAt', 'ASC']],
      limit: 20,
    });
    const out = [];
    for (const m of candidates) {
      if (await this.isInAudience(m, userId)) {
        out.push({
          id: m.id, title: m.title, description: m.description,
          status: m.status, scheduledAt: m.scheduledAt, durationMinutes: m.durationMinutes,
          isHost: m.hostId === userId,
          clanName: m.clan?.name || null,
        });
      }
    }
    return out;
  }

  /** Room details for an attendee to join (audience-gated). */
  async joinInfo(meeting, user) {
    if (!(await this.isInAudience(meeting, user.id))) throw new ForbiddenError('This meeting is not open to you');
    if (meeting.status === 'ended' || meeting.status === 'cancelled') throw new ValidationError('This meeting is over');
    const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Guest';
    return {
      id: meeting.id,
      title: meeting.title,
      domain: cfg.jitsiDomain,
      room: meeting.meetingRoom,
      url: meeting.meetingUrl,
      displayName: name,
      avatarUrl: user.profilePictureUrl || null,
      isHost: meeting.hostId === user.id,
      status: meeting.status,
    };
  }

  // ── email (invite / reminders), per-recipient timezone + .ics ───────────────
  async _email(meeting, kind) {
    const ids = await this.audienceUserIds(meeting);
    if (!ids.length) return;
    const [users, settings] = await Promise.all([
      models.User.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'email', 'firstName'], raw: true }),
      models.UserSettings.findAll({ where: { userId: { [Op.in]: ids } }, attributes: ['userId', 'timezone'], raw: true }),
    ]);
    const tzById = new Map(settings.map((s) => [s.userId, s.timezone]));
    const title = meeting.title;
    const start = new Date(meeting.scheduledAt);
    const end = new Date(start.getTime() + (meeting.durationMinutes || 60) * 60000);
    const H = {
      invite: { subject: `Invite: ${title}`, lead: 'You’re invited to a live meeting.' },
      '24h': { subject: `Tomorrow: ${title}`, lead: 'Reminder — this live meeting is in about 24 hours.' },
      '1h': { subject: `Starting soon: ${title}`, lead: 'Heads up — this live meeting starts in about an hour.' },
    }[kind];

    for (const u of users) {
      if (!u.email) continue;
      const tz = tzById.get(u.id) || 'UTC';
      const when = fmtInZone(start, tz);
      const joinUrl = `${clientUrl()}/`;
      const ics = buildEventIcs({
        uid: `admin-meeting-${meeting.id}@pathment.me`, start, end, title,
        description: `${title}${meeting.description ? `\n\n${meeting.description}` : ''}\n\nJoin in Pathment: ${joinUrl}`,
        url: joinUrl, organizerName: 'Pathment', organizerEmail: orgEmail(),
        method: kind === 'invite' ? 'REQUEST' : 'PUBLISH',
      });
      const html = renderEmail({
        heading: title,
        bodyHtml:
          `<p style="margin:0 0 14px;">${escHtml(H.lead)}</p>` +
          (meeting.description ? `<p style="margin:0 0 14px;color:#475569;">${escHtml(meeting.description)}</p>` : '') +
          `<p style="margin:0 0 6px;"><strong>When:</strong> ${escHtml(when)}</p>` +
          `<p style="margin:0 0 14px;color:#94a3b8;font-size:12px;">Shown in your timezone (${escHtml(tz)}). A calendar invite is attached — a Join button appears in Pathment when it goes live.</p>`,
        cta: { label: 'Open Pathment', url: joinUrl },
        preheader: `${title} — ${when}`,
      });
      const text = plainText({ heading: title, bodyText: `${H.lead}\nWhen: ${when} (${tz})`, cta: { label: 'Open Pathment', url: joinUrl } });
      await emailService.enqueue({
        to: u.email, subject: H.subject, text, html,
        emailType: kind === 'invite' ? 'admin_meeting_invite' : 'admin_meeting_reminder',
        recipientId: u.id,
        idempotencyKey: `adminmtg:${kind}:${meeting.id}:${u.id}`,
        attachments: [{ filename: 'meeting.ics', content: Buffer.from(ics.content, 'utf8').toString('base64'), contentType: ics.contentType }],
      });
    }

    // In-app notifications (bell + live socket). Audience spans roles, and the
    // Join banner is global, so a root actionUrl + 'any' audience is right.
    // Email handled above → dispatch in-app only.
    const eventKey = kind === 'invite' ? NOTIFICATION_EVENTS.ADMIN_MEETING_INVITE : NOTIFICATION_EVENTS.ADMIN_MEETING_REMINDER;
    const msg = {
      invite: `You're invited to "${title}". You'll get a Join button when it goes live.`,
      '24h': `Reminder: "${title}" is in about 24 hours.`,
      '1h': `Heads up: "${title}" starts in about an hour.`,
    }[kind];
    await notificationOrchestrator.dispatch({
      eventKey,
      recipients: ids.map((id) => ({ userId: id })),
      payload: {
        title: kind === 'invite' ? 'Meeting scheduled' : 'Meeting reminder',
        message: msg,
        actionUrl: '/',
        actionLabel: 'Open Pathment',
        // No relatedEntityId — avoid the orchestrator auto-dedupe dropping a
        // re-sent invite or deduping reminders against the invite.
        relatedEntityType: 'admin_meeting',
      },
      channelOverrides: { inApp: true, email: false, chat: false },
    }).catch((e) => console.error('[adminMeeting] in-app notify failed:', e.message));
  }

  // ── scheduler entry point (hourly) ─────────────────────────────────────────
  async tick() {
    const now = new Date();
    await this._remind(now, 'reminded24hAt', '24h', 23, 25);
    await this._remind(now, 'reminded1hAt', '1h', 0.5, 1.5);
    // Auto-end meetings whose window ended over 2h ago and were never closed.
    const stale = await models.AdminMeeting.findAll({
      where: { status: { [Op.in]: ['scheduled', 'live'] }, scheduledAt: { [Op.lt]: new Date(now.getTime() - 6 * 3600000) } },
      attributes: ['id', 'scheduledAt', 'durationMinutes', 'status'],
    });
    for (const m of stale) {
      const windowEnd = new Date(new Date(m.scheduledAt).getTime() + (m.durationMinutes || 60) * 60000 + 2 * 3600000);
      if (now > windowEnd) await m.update({ status: 'ended', endedAt: m.endedAt || windowEnd });
    }
  }

  async _remind(now, flagField, kind, lowH, highH) {
    const lo = new Date(now.getTime() + lowH * 3600000);
    const hi = new Date(now.getTime() + highH * 3600000);
    const due = await models.AdminMeeting.findAll({
      where: { status: 'scheduled', scheduledAt: { [Op.between]: [lo, hi] }, [flagField]: null },
    });
    for (const m of due) {
      await this._email(m, kind).catch((e) => console.error(`[adminMeeting] ${kind} reminder failed:`, e.message));
      await m.update({ [flagField]: new Date() });
    }
  }
}

module.exports = new AdminMeetingService();
