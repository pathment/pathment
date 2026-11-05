const crypto = require('crypto');
const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ForbiddenError, ValidationError } = require('../utils/errors/errorTypes');
const cfg = require('../config/reviewMeeting');
const clanLifecycleService = require('./clanLifecycleService');
const notificationOrchestrator = require('./notificationOrchestrator');
const emailService = require('./emailService');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { shouldCreateNotification } = require('../utils/notificationPreferences');
const { buildEventIcs } = require('../utils/ics');
const { renderEmail, plainText } = require('../utils/emailTemplate');
const { pageLink } = require('../utils/links');
const { discussionRating, CRITERIA } = require('../utils/discussionRating');
const {
  meetingView, REMINDER_LEAD_MINUTES, OPEN_HOURS_WITHOUT_END, MINUTE, HOUR,
} = require('../utils/discussionMeeting');

/** Task statuses a join hands in. Already submitted, or sent back, is left alone. */
const AUTO_SUBMIT_STATUSES = ['assigned', 'not_started', 'in_progress'];
const MENTOR_ROLES = ['lead_mentor', 'co_mentor'];
const NOTE_MAX = 2000;
const MAX_SECONDS = 24 * 3600;
const USER_ATTRS = ['id', 'firstName', 'lastName', 'profilePictureUrl'];

const escHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fullName = (u) => (u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Someone' : 'Someone');
const seconds = (value) => Math.max(0, Math.min(MAX_SECONDS, parseInt(value, 10) || 0));
const fmtInZone = (date, tz) => require('./adminMeetingService').fmtInZone(date, tz);

/**
 * A group's meeting is a Clan Review session of kind 'discussion'. The model's
 * default scope hides every such row from the Clan Review code, so this is the
 * only way in. `discussionGroupId` is always set on ours, which also keeps out
 * the retired rubric 'discussion' sessions that have none.
 */
const Sessions = () => models.CohortReviewSession.scope('discussion');
const OURS = { discussionGroupId: { [Op.ne]: null } };

/**
 * discussionMeetingService - a live (Jitsi) meeting for a group discussion,
 * who took part, and the mentor's feedback on each mentee.
 *
 * It is the Clan Review call pointed at a group instead of a clan, and it is
 * stored the same way: the meeting is a CohortReviewSession (room, schedule,
 * start, end, reminder) and each person in it a CohortReviewEntry (joined,
 * left, seconds present, talk seconds). It shares the Jitsi config and
 * feature flag, the fresh-room rule after an ended call, and dominant-speaker
 * talk time reported by both sides and kept as the larger. What differs is who
 * is in it (the group's members and its clan's mentors, not the whole clan)
 * and what happens around it: a scheduled start, an invite, a reminder ten
 * minutes out, and a mentee's Group Discussion task handed in when they join.
 */
class DiscussionMeetingService {
  // ── access ───────────────────────────────────────────────────────────────

  _mentorGroup(mentorId, groupId) {
    return require('./groupDiscussionService')._mentorGroup(mentorId, groupId);
  }

  /** The group, if this person is one of its current mentee members. */
  async _memberGroup(userId, groupId) {
    const group = await models.DiscussionGroup.findByPk(groupId, {
      include: [{ model: models.DiscussionScenario, as: 'scenario', attributes: ['id', 'title'] }],
    });
    if (!group?.conversationId) throw new NotFoundError('Group discussion not found');
    const seat = await models.ConversationParticipant.findOne({
      where: { conversationId: group.conversationId, userId, leftAt: null, role: 'participant' },
      attributes: ['id'],
    });
    if (!seat) throw new ForbiddenError('You are not part of this discussion');
    return group;
  }

  /** The group's meeting session, or null when it has never had one. */
  _session(groupId, options = {}) {
    return Sessions().findOne({ where: { discussionGroupId: groupId }, ...options });
  }

  /** Each group's meeting as the screens read it, for list views. */
  async viewsFor(groupIds) {
    const ids = [...new Set((groupIds || []).filter(Boolean))];
    if (!ids.length) return new Map();
    const sessions = await Sessions().findAll({ where: { discussionGroupId: { [Op.in]: ids } } });
    return new Map(sessions.map((s) => [s.discussionGroupId, meetingView(s)]));
  }

  /** The group's mentees, and the mentors who may run its meeting. */
  async _audience(group) {
    const [seats, clanMentors] = await Promise.all([
      models.ConversationParticipant.findAll({
        where: { conversationId: group.conversationId, leftAt: null },
        attributes: ['userId', 'role'],
        raw: true,
      }),
      models.ClanMembership.findAll({
        where: { clanId: group.clanId, status: 'active', role: { [Op.in]: MENTOR_ROLES } },
        attributes: ['userId'],
        raw: true,
      }),
    ]);
    const mentorIds = new Set([
      ...seats.filter((s) => s.role === 'owner').map((s) => s.userId),
      ...clanMentors.map((m) => m.userId),
    ]);
    const menteeIds = seats.filter((s) => s.role === 'participant' && !mentorIds.has(s.userId)).map((s) => s.userId);
    return { mentorIds: [...mentorIds], menteeIds };
  }

  _roomPatch(group) {
    const room = `pathment-discussion-${group.id.slice(0, 8)}-${crypto.randomBytes(6).toString('hex')}`;
    return { meetingProvider: cfg.provider, meetingRoom: room, meetingUrl: `https://${cfg.jitsiDomain}/${room}` };
  }

  _joinConfig(group, session, user) {
    return {
      groupId: group.id,
      domain: cfg.jitsiDomain,
      room: session.meetingRoom,
      url: session.meetingUrl,
      displayName: user ? fullName(user) : null,
      avatarUrl: user?.profilePictureUrl || null,
      title: group.scenario?.title ? `${group.name} · ${group.scenario.title}` : group.name,
    };
  }

  _links(group) {
    return {
      mentor: `/mentor/group-discussions/${group.id}`,
      // A mentee's discussion opens in Messages; `join=meeting` joins on arrival.
      mentee: `/mentee/messages?discussion=${group.id}&join=meeting`,
    };
  }

  /** One mentee's call, the entry row read the way the screens want it. */
  _callOut(entry) {
    return {
      joined: !!entry?.joinedAt,
      joinedAt: entry?.joinedAt || null,
      leftAt: entry?.leftAt || null,
      secondsPresent: entry?.secondsPresent || 0,
      talkSeconds: entry?.talkSeconds || 0,
    };
  }

  _entry(session, menteeId) {
    return models.CohortReviewEntry.findOrCreate({
      where: { sessionId: session.id, menteeId },
      defaults: { sessionId: session.id, menteeId, status: 'pending' },
    }).then(([row]) => row);
  }

  // ── schedule ─────────────────────────────────────────────────────────────

  /**
   * Create or move the group's meeting. The start is required and the end is
   * optional; both arrive as instants (ISO with an offset, or UTC) and are
   * stored as such, so a mentor and a mentee in different timezones mean the
   * same moment. Moving it sends the invite again and re-arms the reminder.
   */
  async scheduleMeeting(mentorId, groupId, { startsAt, endsAt } = {}) {
    if (!cfg.enabled) throw new ForbiddenError('Live video meetings are not enabled');
    const group = await this._mentorGroup(mentorId, groupId);
    await clanLifecycleService.assertClanWritable(group.clanId);
    let session = await this._session(group.id);
    const view = meetingView(session);
    if (view?.state === 'live') throw new ValidationError('The meeting is live. End it before moving it.');

    const start = startsAt ? new Date(startsAt) : null;
    const end = endsAt ? new Date(endsAt) : null;
    if (!start || Number.isNaN(start.getTime())) throw new ValidationError('Choose when the meeting starts');
    if (end && Number.isNaN(end.getTime())) throw new ValidationError('That is not a valid end time');
    if (start.getTime() < Date.now() - 5 * MINUTE) throw new ValidationError('The start time must be in the future');
    if (end && end <= start) throw new ValidationError('The end time must be after the start time');

    const now = new Date();
    const patch = {
      scheduledAt: start,
      scheduledEndAt: end,
      sessionDate: start.toISOString().slice(0, 10),
      title: group.name.slice(0, 150),
      // A meeting that already ran and is being set up again is a new call.
      meetingStartedAt: view?.state === 'ended' ? null : (session?.meetingStartedAt ?? null),
      meetingEndedAt: null,
      status: 'in_progress',
      finishedAt: null,
      // Close enough that the invite is the reminder: do not send both.
      reminded1hAt: start.getTime() - now.getTime() <= REMINDER_LEAD_MINUTES * MINUTE ? now : null,
    };
    if (!session?.meetingRoom || view?.state === 'ended') Object.assign(patch, this._roomPatch(group));
    // "Moved" only when a meeting still to come gets a new time, as the
    // schedule drawer reads it; one that already ran is set up as a new one.
    const rescheduled = view?.state === 'scheduled' || view?.state === 'missed';
    if (session) {
      await session.update(patch);
    } else {
      session = await Sessions().create({
        kind: 'discussion',
        discussionGroupId: group.id,
        clanId: group.clanId,
        mentorId,
        // Joining a discussion is not a review attendance mark.
        attendanceTracking: false,
        ...patch,
      });
    }

    // Awaited so the bell is there by the time the mentor sees "scheduled";
    // caught so a failed invite never undoes the meeting itself.
    try {
      await this._notifyScheduled(group, session, rescheduled, mentorId);
    } catch (error) {
      console.error('[discussionMeeting] invite failed (non-fatal):', error.message);
    }
    return this.hostView(mentorId, groupId);
  }

  /** Take a meeting off the calendar. Who joined and the feedback are kept. */
  async cancelMeeting(mentorId, groupId) {
    const group = await this._mentorGroup(mentorId, groupId);
    await clanLifecycleService.assertClanWritable(group.clanId);
    const session = await this._session(group.id);
    const view = meetingView(session);
    if (!view) throw new NotFoundError('This group has no meeting');
    if (view.state === 'live') throw new ValidationError('The meeting is live. End it instead.');
    await session.update({
      scheduledAt: null, scheduledEndAt: null, meetingStartedAt: null, meetingEndedAt: null, reminded1hAt: null,
    });
    return { cancelled: true };
  }

  // ── host ─────────────────────────────────────────────────────────────────

  /** Open the room. Works early, and again after it was ended (in a fresh room). */
  async startMeeting(mentorId, groupId) {
    if (!cfg.enabled) throw new ForbiddenError('Live video meetings are not enabled');
    const group = await this._mentorGroup(mentorId, groupId);
    await clanLifecycleService.assertClanWritable(group.clanId);
    const session = await this._session(group.id);
    if (!session?.scheduledAt) throw new ValidationError('Schedule the meeting first');

    const patch = { meetingStartedAt: new Date(), meetingEndedAt: null, status: 'in_progress', finishedAt: null };
    // The Clan Review rule: a call after an ended one gets a new room, so the
    // people Jitsi still thinks are in the old one can never appear in it.
    if (require('./reviewMeetingService')._needsFreshRoom(session)) Object.assign(patch, this._roomPatch(group));
    const wasLive = meetingView(session)?.state === 'live';
    await session.update(patch);

    if (!wasLive) {
      this._notifyLive(group, mentorId)
        .catch((error) => console.error('[discussionMeeting] live notify failed (non-fatal):', error.message));
    }
    const host = await models.User.findByPk(mentorId, { attributes: USER_ATTRS });
    return this._joinConfig(group, session, host);
  }

  async endMeeting(mentorId, groupId) {
    const group = await this._mentorGroup(mentorId, groupId);
    await clanLifecycleService.assertClanWritable(group.clanId);
    const session = await this._session(group.id);
    if (session?.meetingStartedAt && !session.meetingEndedAt) {
      const now = new Date();
      await session.update({ meetingEndedAt: now, status: 'finished', finishedAt: now });
      await this._emitToMembers(group, 'discussion-meeting:ended', { groupId: group.id });
      // Whoever was rated during the call is reviewed now.
      await this._completeTasks(group, session);
    }
    return this.summary(mentorId, groupId);
  }

  /** What the host's panel shows: the meeting, and each mentee with their call and the host's own feedback. */
  async hostView(mentorId, groupId) {
    if (!cfg.enabled) return { enabled: false, comingSoon: !!cfg.comingSoon };
    const group = await this._mentorGroup(mentorId, groupId);
    const session = await this._session(group.id);
    const view = meetingView(session);
    const [seats, entries, mine, host, tasks] = await Promise.all([
      models.ConversationParticipant.findAll({
        where: { conversationId: group.conversationId, role: 'participant', leftAt: null },
        include: [{ model: models.User, as: 'user', attributes: USER_ATTRS }],
      }),
      session ? models.CohortReviewEntry.findAll({ where: { sessionId: session.id } }) : [],
      models.DiscussionFeedback.findAll({ where: { groupId: group.id, mentorId } }),
      models.User.findByPk(mentorId, { attributes: USER_ATTRS }),
      // Each mentee's Group Discussion task, so the panel can open its review.
      models.AssignedTask.findAll({
        where: { discussionGroupId: group.id, status: { [Op.ne]: 'cancelled' } },
        attributes: ['id', 'menteeId', 'status'],
        order: [['createdAt', 'DESC']],
      }),
    ]);
    const entryBy = new Map(entries.map((row) => [row.menteeId, row]));
    const feedbackBy = new Map(mine.map((row) => [row.menteeId, row]));
    const taskBy = new Map();
    for (const task of tasks) if (!taskBy.has(task.menteeId)) taskBy.set(task.menteeId, task);
    const roster = seats
      .map((seat) => {
        const call = this._callOut(entryBy.get(seat.userId));
        return {
          menteeId: seat.userId,
          name: fullName(seat.user),
          avatarUrl: seat.user?.profilePictureUrl || null,
          present: call.joined,
          joinedAt: call.joinedAt,
          leftAt: call.leftAt,
          secondsPresent: call.secondsPresent,
          talkSeconds: call.talkSeconds,
          feedback: this._feedbackOut(feedbackBy.get(seat.userId)),
          task: taskBy.has(seat.userId)
            ? { id: taskBy.get(seat.userId).id, status: taskBy.get(seat.userId).status }
            : null,
        };
      })
      // Who is in the call first, then by name: the people to watch are on top.
      .sort((a, b) => (a.present === b.present ? a.name.localeCompare(b.name) : a.present ? -1 : 1));
    return {
      enabled: true,
      meeting: view,
      join: view && session.meetingRoom ? this._joinConfig(group, session, host) : null,
      roster,
    };
  }

  /** Host-observed talk time (Jitsi dominant speaker, mapped by name). Never lowers a value. */
  async recordTalkTime(mentorId, groupId, items = []) {
    const group = await this._mentorGroup(mentorId, groupId);
    if (!Array.isArray(items)) throw new ValidationError('items must be an array');
    const session = await this._session(group.id);
    if (!session) return { ok: true };
    const { menteeIds } = await this._audience(group);
    const allowed = new Set(menteeIds);
    for (const item of items) {
      if (!item?.menteeId || !allowed.has(item.menteeId)) continue;
      // eslint-disable-next-line no-await-in-loop
      const row = await this._entry(session, item.menteeId);
      const secs = seconds(item.seconds);
      // eslint-disable-next-line no-await-in-loop
      if (secs > (row.talkSeconds || 0)) await row.update({ talkSeconds: secs });
    }
    return { ok: true };
  }

  // ── mentee ───────────────────────────────────────────────────────────────

  /** The room, for a member, while it is joinable. Carries their talk time so far. */
  async joinInfo(userId, groupId) {
    if (!cfg.enabled) throw new ForbiddenError('Live video meetings are not enabled');
    const group = await this._memberGroup(userId, groupId);
    const session = await this._session(group.id);
    const view = meetingView(session);
    if (!view) throw new NotFoundError('This group has no meeting');
    if (!view.joinable) {
      throw new ValidationError(view.state === 'scheduled' ? 'The meeting has not opened yet' : 'The meeting is over');
    }
    const [user, entry] = await Promise.all([
      models.User.findByPk(userId, { attributes: USER_ATTRS }),
      models.CohortReviewEntry.findOne({ where: { sessionId: session.id, menteeId: userId }, attributes: ['talkSeconds'] }),
    ]);
    return { ...this._joinConfig(group, session, user), meeting: view, talkSeconds: entry?.talkSeconds || 0 };
  }

  /**
   * The mentee is in the call: on joining, and every 15 seconds after (the
   * heartbeat carries their own talk time). The first time, their Group
   * Discussion task for this group is handed in for them - joining the
   * meeting IS the work - through the same submission path as Submit work,
   * so their mentor is notified and the task lands in Approvals.
   */
  async selfJoin(userId, groupId, { talkSeconds } = {}) {
    const group = await this._memberGroup(userId, groupId);
    const session = await this._session(group.id);
    const view = meetingView(session);
    // A heartbeat that lands after the end is not an error worth showing.
    if (!view || !(view.joinable || view.state === 'live')) return { present: false, state: view?.state || null };
    await clanLifecycleService.assertClanWritable(group.clanId);

    const row = await this._entry(session, userId);
    const patch = { leftAt: null };
    if (!row.joinedAt) patch.joinedAt = new Date();
    const secs = seconds(talkSeconds);
    if (secs > (row.talkSeconds || 0)) patch.talkSeconds = secs;
    await row.update(patch);

    const submitted = await this._autoSubmit(group, userId);
    return { present: true, state: view.state, submitted };
  }

  async selfLeave(userId, groupId, secondsPresent = 0) {
    const group = await this._memberGroup(userId, groupId);
    const session = await this._session(group.id);
    if (!session) return { ok: true };
    const row = await models.CohortReviewEntry.findOne({ where: { sessionId: session.id, menteeId: userId } });
    if (!row) return { ok: true };
    await row.update({ leftAt: new Date(), secondsPresent: (row.secondsPresent || 0) + seconds(secondsPresent) });
    return { ok: true };
  }

  async _autoSubmit(group, userId) {
    const tasks = await models.AssignedTask.findAll({
      where: { discussionGroupId: group.id, menteeId: userId, status: { [Op.in]: AUTO_SUBMIT_STATUSES } },
      attributes: ['id'],
    });
    const submissionService = require('./submissionService');
    let submitted = 0;
    for (const task of tasks) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await submissionService.submitTaskWithFiles(task.id, userId, {
          submissionText: `<p>Joined the group discussion meeting for “${escHtml(group.name)}”.</p>`,
        }, []);
        submitted += 1;
      } catch (error) {
        // The join must never fail because a task could not be handed in.
        console.warn('[discussionMeeting] auto-submit failed for', task.id, error.message);
      }
    }
    return submitted;
  }

  // ── feedback ─────────────────────────────────────────────────────────────

  _feedbackOut(row, mentor = null) {
    if (!row) return null;
    const out = { note: row.note || '', updatedAt: row.updatedAt };
    for (const key of CRITERIA) out[key] = row[key];
    if (mentor !== null) {
      out.mentorId = row.mentorId;
      out.mentorName = fullName(mentor);
    }
    return out;
  }

  /** One mentor's feedback on one mentee. Saving again replaces it. */
  async saveFeedback(mentorId, groupId, menteeId, body = {}) {
    const group = await this._mentorGroup(mentorId, groupId);
    await clanLifecycleService.assertClanWritable(group.clanId);
    const { menteeIds } = await this._audience(group);
    if (!menteeIds.includes(menteeId)) throw new ValidationError('That mentee is not in this group');

    const values = {};
    for (const key of CRITERIA) {
      if (body[key] === undefined) continue;
      const n = Number(body[key]);
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new ValidationError(`${key} must be between 0 and 100`);
      values[key] = Math.round(n);
    }
    if (body.note !== undefined) {
      const note = String(body.note || '').trim();
      if (note.length > NOTE_MAX) throw new ValidationError(`The note can be at most ${NOTE_MAX} characters`);
      values.note = note || null;
    }

    const [row, created] = await models.DiscussionFeedback.findOrCreate({
      where: { groupId: group.id, menteeId, mentorId },
      defaults: { groupId: group.id, menteeId, mentorId, ...values },
    });
    if (!created && Object.keys(values).length) await row.update(values);
    // After the meeting, feedback is the review: it completes the task.
    const completed = await this._completeTasks(group, await this._session(group.id), [menteeId]);
    return { ...this._feedbackOut(row), taskCompleted: completed > 0 };
  }

  /**
   * The task review's text: the mentors' notes, in plain words. Plain text on
   * purpose - some screens print a review as text - and short, because the
   * five criteria, the stars and the speaking time are shown properly by the
   * participation section beside it.
   */
  _reviewText(member) {
    const notes = member.feedbackRows.filter((row) => row.note).map((row) => row.note.trim());
    return notes.length
      ? notes.join(' · ')
      : 'Approved from your group discussion. Your feedback for each skill is below.';
  }

  /**
   * After the meeting, a mentee who joined (so their task was submitted) and
   * has feedback, and whom no mentor has reviewed yet, has their Group
   * Discussion task approved through the ordinary review path, so it
   * completes, earns its points, notifies them and shows its rating and
   * feedback like any other task. The rating is their star rating and the
   * mentor whose feedback is newest is the reviewer.
   *
   * A review that already exists is never touched: a mentor who reviewed the
   * task in the review drawer chose its rating and wrote its note, and later
   * slider changes must not overwrite either. Those still show, live, on the
   * participation section. Never throws: a review that cannot be written
   * leaves the task submitted, for the mentor to approve in Approvals.
   */
  async _completeTasks(group, session, menteeIds = null) {
    if (meetingView(session)?.state !== 'ended') return 0;
    const submissionService = require('./submissionService');
    let completed = 0;
    try {
      const { members } = await this._scores(group, session);
      const rated = members.filter((m) => m.feedbackRows.length && m.rating.stars !== null
        && (!menteeIds || menteeIds.includes(m.menteeId)));
      for (const member of rated) {
        // eslint-disable-next-line no-await-in-loop
        const task = await models.AssignedTask.findOne({
          where: { discussionGroupId: group.id, menteeId: member.menteeId, status: 'submitted' },
          order: [['updatedAt', 'DESC']],
        });
        if (!task) continue;
        // eslint-disable-next-line no-await-in-loop
        const submission = await models.TaskSubmission.findOne({ where: { assignedTaskId: task.id }, order: [['version', 'DESC']] });
        if (!submission || !['pending', 'reviewing'].includes(submission.status)) continue;
        const reviewer = member.feedbackRows[0].mentorId; // newest first
        try {
          // eslint-disable-next-line no-await-in-loop
          await submissionService.reviewSubmission(submission.id, reviewer, {
            rating: member.rating.stars,
            feedbackText: this._reviewText(member),
            isApproved: true,
            decision: 'approved',
          });
          completed += 1;
        } catch (error) {
          console.warn('[discussionMeeting] task review failed for', task.id, error.message);
        }
      }
    } catch (error) {
      console.warn('[discussionMeeting] completing tasks failed:', error.message);
    }
    return completed;
  }

  // ── what it all adds up to ───────────────────────────────────────────────

  /**
   * Every current member's participation and rating. One pass over the group,
   * because each rating is relative to the group's busiest member.
   */
  async _scores(group, session) {
    const members = await require('./groupDiscussionService').contribution(group);
    const memberIds = members.map((m) => m.userId);
    if (!memberIds.length) return { members: [], groupMax: { messages: 0, talk: 0, voice: 0, files: 0 } };

    const [attachments, entries, feedback] = await Promise.all([
      models.MessageAttachment.findAll({
        attributes: ['fileType', [sequelize.col('message.sender_id'), 'senderId']],
        include: [{
          model: models.Message,
          as: 'message',
          attributes: [],
          required: true,
          where: { threadId: group.conversationId, senderId: { [Op.in]: memberIds } },
        }],
        raw: true,
      }),
      session ? models.CohortReviewEntry.findAll({ where: { sessionId: session.id, menteeId: { [Op.in]: memberIds } } }) : [],
      models.DiscussionFeedback.findAll({
        where: { groupId: group.id, menteeId: { [Op.in]: memberIds } },
        include: [{ model: models.User, as: 'mentor', attributes: ['id', 'firstName', 'lastName'] }],
        order: [['updatedAt', 'DESC']],
      }),
    ]);

    const kinds = new Map(memberIds.map((id) => [id, { voice: 0, image: 0, video: 0, file: 0 }]));
    for (const { fileType, senderId } of attachments) {
      const count = kinds.get(senderId);
      if (!count) continue;
      const type = String(fileType || '');
      if (type.startsWith('audio/')) count.voice += 1;
      else if (type.startsWith('image/')) count.image += 1;
      else if (type.startsWith('video/')) count.video += 1;
      else count.file += 1;
    }
    const entryBy = new Map(entries.map((row) => [row.menteeId, row]));
    const feedbackBy = new Map();
    for (const row of feedback) {
      if (!feedbackBy.has(row.menteeId)) feedbackBy.set(row.menteeId, []);
      feedbackBy.get(row.menteeId).push(row);
    }

    const activity = members.map((member) => {
      const count = kinds.get(member.userId);
      const call = this._callOut(entryBy.get(member.userId));
      return {
        member,
        count,
        call,
        mine: { messages: member.messageCount, talk: call.talkSeconds, voice: count.voice, files: count.image + count.video + count.file },
      };
    });
    const groupMax = { messages: 0, talk: 0, voice: 0, files: 0 };
    for (const { mine } of activity) {
      for (const key of Object.keys(groupMax)) groupMax[key] = Math.max(groupMax[key], mine[key]);
    }

    return {
      groupMax,
      members: activity.map(({ member, count, call, mine }) => {
        const rows = feedbackBy.get(member.userId) || [];
        return {
          menteeId: member.userId,
          name: `${member.firstName} ${member.lastName}`.trim() || 'Mentee',
          profilePictureUrl: member.profilePictureUrl,
          activity: member.activity,
          messageCount: member.messageCount,
          voiceCount: count.voice,
          imageCount: count.image,
          videoCount: count.video,
          fileCount: count.file,
          meeting: {
            joined: call.joined, joinedAt: call.joinedAt, secondsPresent: call.secondsPresent, talkSeconds: call.talkSeconds,
          },
          // Their Group Discussion task, so the summary can open its review.
          task: member.task ? { id: member.task.id, status: member.task.status } : null,
          feedbackRows: rows,
          rating: discussionRating({ feedbackRows: rows, mine, groupMax }),
        };
      }),
    };
  }

  /** Post-meeting summary for a mentor: every mentee, with the mentor's own feedback to edit. */
  async summary(mentorId, groupId) {
    const group = await this._mentorGroup(mentorId, groupId);
    const session = await this._session(group.id);
    const { members, groupMax } = await this._scores(group, session);
    return {
      group: { id: group.id, name: group.name, scenarioTitle: group.scenario?.title || null },
      meeting: meetingView(session),
      groupMax,
      members: members.map(({ feedbackRows, ...member }) => ({
        ...member,
        myFeedback: this._feedbackOut(feedbackRows.find((row) => row.mentorId === mentorId)),
        raters: feedbackRows.length,
      })),
    };
  }

  /**
   * One mentee's result: their call, their rating, and every mentor's
   * feedback with the mentor's name. Used for the mentor reviewing their task
   * and for the mentee themselves; nobody else's row is ever in it.
   * `hideLiveFeedback` keeps a mentee from watching scores move mid-call.
   */
  async resultFor(group, menteeId, { hideLiveFeedback = false } = {}) {
    const session = await this._session(group.id);
    const { members, groupMax } = await this._scores(group, session);
    const me = members.find((m) => m.menteeId === menteeId);
    const view = meetingView(session);
    if (!me) return { meeting: view, groupMax, member: null, rating: null, feedback: [] };
    const hidden = hideLiveFeedback && view?.state === 'live';
    const { feedbackRows, rating, ...member } = me;
    return {
      meeting: view,
      groupMax,
      member,
      rating: hidden ? null : rating,
      feedback: hidden ? [] : feedbackRows.map((row) => this._feedbackOut(row, row.mentor || {})),
      feedbackHiddenUntilEnd: hidden,
    };
  }

  async myResult(userId, groupId) {
    const group = await this._memberGroup(userId, groupId);
    return this.resultFor(group, userId, { hideLiveFeedback: true });
  }

  // ── the banner ───────────────────────────────────────────────────────────

  /**
   * Meetings this person is in that are live or start within the hour: as a
   * mentee of the group, or as a mentor of its clan. The client shows the
   * banner from two minutes before, on its own clock.
   */
  async upcomingForUser(userId) {
    if (!cfg.enabled) return [];
    const now = Date.now();
    const [mentorClanIds, seats] = await Promise.all([
      require('./authzService').mentoredClanIds(userId),
      models.ConversationParticipant.findAll({
        where: { userId, leftAt: null, role: 'participant' }, attributes: ['conversationId'], raw: true,
      }),
    ]);
    const conversationIds = seats.map((s) => s.conversationId);
    const mine = [];
    if (mentorClanIds.length) mine.push({ clanId: { [Op.in]: mentorClanIds } });
    if (conversationIds.length) mine.push({ conversationId: { [Op.in]: conversationIds } });
    if (!mine.length) return [];

    const sessions = await Sessions().findAll({
      where: {
        ...OURS,
        meetingEndedAt: null,
        [Op.or]: [
          { meetingStartedAt: { [Op.ne]: null } },
          { scheduledAt: { [Op.between]: [new Date(now - OPEN_HOURS_WITHOUT_END * HOUR), new Date(now + HOUR)] } },
        ],
      },
      include: [{
        model: models.DiscussionGroup,
        as: 'discussionGroup',
        required: true,
        where: { [Op.or]: mine },
        include: [{ model: models.DiscussionScenario, as: 'scenario', attributes: ['title'] }],
      }],
      order: [['scheduledAt', 'ASC']],
      limit: 20,
    });
    const asMentee = new Set(conversationIds);
    return sessions
      .map((session) => ({ group: session.discussionGroup, view: meetingView(session) }))
      .filter(({ view }) => view && (view.state === 'live' || view.state === 'scheduled'))
      .map(({ group, view }) => ({
        groupId: group.id,
        groupName: group.name,
        scenarioTitle: group.scenario?.title || null,
        role: asMentee.has(group.conversationId) ? 'mentee' : 'mentor',
        meeting: view,
      }));
  }

  // ── notifications ────────────────────────────────────────────────────────

  async _emitToMembers(group, event, payload) {
    try {
      const { emitToUser } = require('../socket');
      const { mentorIds, menteeIds } = await this._audience(group);
      for (const id of [...mentorIds, ...menteeIds]) emitToUser(id, event, payload);
    } catch (error) {
      console.error('[discussionMeeting] socket emit failed:', error.message);
    }
  }

  /** Everyone in the audience with their timezone, email and settings. */
  async _recipients(group) {
    const { mentorIds, menteeIds } = await this._audience(group);
    const ids = [...mentorIds, ...menteeIds];
    if (!ids.length) return [];
    const users = await models.User.findAll({
      where: { id: { [Op.in]: ids }, status: 'active' },
      attributes: ['id', 'email', 'firstName'],
      include: [{ model: models.UserSettings, as: 'settings', required: false, attributes: ['timezone', 'emailNotifications'] }],
    });
    const mentors = new Set(mentorIds);
    return users.map((user) => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      settings: user.settings || null,
      tz: user.settings?.timezone || 'UTC',
      role: mentors.has(user.id) ? 'mentor' : 'mentee',
    }));
  }

  /** Same message to everyone sharing a timezone and a role, so each reads their own clock. */
  _byZoneAndRole(recipients) {
    const out = new Map();
    for (const r of recipients) {
      const key = `${r.role}|${r.tz}`;
      if (!out.has(key)) out.set(key, { role: r.role, tz: r.tz, people: [] });
      out.get(key).people.push(r);
    }
    return [...out.values()];
  }

  _when(session, tz) {
    const start = fmtInZone(new Date(session.scheduledAt), tz);
    return session.scheduledEndAt ? `${start} – ${fmtInZone(new Date(session.scheduledEndAt), tz)}` : start;
  }

  /**
   * The invite: a bell for everyone but the mentor who scheduled it (their
   * screen already says so), and an email with a calendar file for everyone,
   * them included, so it lands in their calendar too.
   */
  async _notifyScheduled(group, session, rescheduled, actorId = null) {
    const recipients = await this._recipients(group);
    if (!recipients.length) return;
    const links = this._links(group);
    const title = rescheduled ? 'Discussion meeting moved' : 'Discussion meeting scheduled';

    for (const batch of this._byZoneAndRole(recipients.filter((person) => person.id !== actorId))) {
      // eslint-disable-next-line no-await-in-loop
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.DISCUSSION_MEETING_SCHEDULED,
        recipients: batch.people.map((p) => ({ userId: p.id })),
        payload: {
          title,
          message: `"${group.name}" meets on ${this._when(session, batch.tz)}. Join from Pathment when it opens.`,
          actionUrl: links[batch.role],
          actionLabel: 'Open discussion',
          relatedEntityType: 'discussion_meeting',
          clanId: group.clanId,
        },
        channelOverrides: { inApp: true, email: false, chat: false },
      }).catch((error) => console.error('[discussionMeeting] in-app invite failed:', error.message));
    }

    // The same global switch as every notification email.
    if (!notificationOrchestrator.isNotificationEmailEnabled?.()) return;
    const start = new Date(session.scheduledAt);
    const end = session.scheduledEndAt ? new Date(session.scheduledEndAt) : new Date(start.getTime() + HOUR);
    for (const person of recipients) {
      if (!person.email) continue;
      const allowed = shouldCreateNotification(person.settings, 'discussion_meeting_scheduled', {
        checkEmail: true, checkPush: false, respectQuietHours: false,
      }).should_create;
      if (!allowed) continue;
      const joinUrl = pageLink(links[person.role]);
      const when = this._when(session, person.tz);
      const ics = buildEventIcs({
        uid: `discussion-meeting-${group.id}@pathment.me`,
        start,
        end,
        title: `Group discussion: ${group.name}`,
        description: `Group discussion "${group.name}".\n\nJoin in Pathment: ${joinUrl}`,
        url: joinUrl,
        organizerName: 'Pathment',
        organizerEmail: process.env.RESEND_FROM_EMAIL || 'noreply@pathment.me',
        method: 'REQUEST',
      });
      const lead = rescheduled ? 'Your group discussion meeting has a new time.' : 'You have a group discussion meeting.';
      const html = renderEmail({
        heading: group.name,
        bodyHtml:
          `<p style="margin:0 0 14px;">${escHtml(lead)}</p>`
          + `<p style="margin:0 0 6px;"><strong>When:</strong> ${escHtml(when)}</p>`
          + `<p style="margin:0 0 14px;color:#94a3b8;font-size:12px;">Shown in your timezone (${escHtml(person.tz)}). A calendar invite is attached. The Join button opens two minutes before the start.</p>`,
        cta: { label: 'Open the discussion', url: joinUrl },
        preheader: `${group.name}: ${when}`,
      });
      // eslint-disable-next-line no-await-in-loop
      await emailService.enqueue({
        to: person.email,
        subject: `${rescheduled ? 'Moved' : 'Invite'}: ${group.name} group discussion`,
        text: plainText({ heading: group.name, bodyText: `${lead}\nWhen: ${when} (${person.tz})`, cta: { label: 'Open the discussion', url: joinUrl } }),
        html,
        emailType: 'discussion_meeting_invite',
        recipientId: person.id,
        idempotencyKey: `discmtg:invite:${group.id}:${start.toISOString()}:${person.id}`,
        attachments: [{ filename: 'meeting.ics', content: Buffer.from(ics.content, 'utf8').toString('base64'), contentType: ics.contentType }],
      }).catch((error) => console.error('[discussionMeeting] invite email failed:', error.message));
    }
  }

  /**
   * Ten minutes out. Whoever has Pathment open gets the bell; whoever does not
   * gets an email instead, because a bell nobody is looking at reminds nobody.
   */
  async _sendReminder(group, session) {
    const recipients = await this._recipients(group);
    if (!recipients.length) return;
    const { isUserOnline } = require('../socket');
    const links = this._links(group);
    for (const batch of this._byZoneAndRole(recipients)) {
      const online = batch.people.filter((p) => isUserOnline(p.id));
      const offline = batch.people.filter((p) => !isUserOnline(p.id));
      const payload = {
        title: 'Discussion meeting in 10 minutes',
        message: `"${group.name}" starts at ${fmtInZone(new Date(session.scheduledAt), batch.tz)}. The Join button opens two minutes before.`,
        actionUrl: links[batch.role],
        actionLabel: batch.role === 'mentor' ? 'Open discussion' : 'Join meeting',
        relatedEntityType: 'discussion_meeting',
        clanId: group.clanId,
        emailSubject: `Starting soon: ${group.name} group discussion`,
      };
      if (online.length) {
        // eslint-disable-next-line no-await-in-loop
        await notificationOrchestrator.dispatch({
          eventKey: NOTIFICATION_EVENTS.DISCUSSION_MEETING_REMINDER,
          recipients: online.map((p) => ({ userId: p.id })),
          payload,
          channelOverrides: { inApp: true, email: false, chat: false },
        }).catch((error) => console.error('[discussionMeeting] reminder (in-app) failed:', error.message));
      }
      if (offline.length) {
        // eslint-disable-next-line no-await-in-loop
        await notificationOrchestrator.dispatch({
          eventKey: NOTIFICATION_EVENTS.DISCUSSION_MEETING_REMINDER,
          recipients: offline.map((p) => ({ userId: p.id })),
          payload,
          channelOverrides: { inApp: false, email: true, chat: false },
        }).catch((error) => console.error('[discussionMeeting] reminder (email) failed:', error.message));
      }
    }
  }

  /** A mentor opened the room: the Join banner appears now, and a bell for anyone not looking. */
  async _notifyLive(group, hostId) {
    await this._emitToMembers(group, 'discussion-meeting:started', { groupId: group.id });
    const { menteeIds } = await this._audience(group);
    if (!menteeIds.length) return;
    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.DISCUSSION_MEETING_REMINDER,
      recipients: menteeIds.filter((id) => id !== hostId).map((id) => ({ userId: id })),
      payload: {
        title: 'Discussion meeting is live',
        message: `"${group.name}" has started. Join now.`,
        actionUrl: this._links(group).mentee,
        actionLabel: 'Join meeting',
        relatedEntityType: 'discussion_meeting',
        clanId: group.clanId,
      },
      channelOverrides: { inApp: true, email: false, chat: false },
    });
  }

  // ── the worker ───────────────────────────────────────────────────────────

  /**
   * Every minute, per workspace: send the 10 minute reminders that are due,
   * and close meetings nobody ended. The claim is a conditional update, so two
   * servers running this never send the same reminder twice.
   */
  async tick(now = new Date()) {
    if (!cfg.enabled) return { reminded: 0, closed: 0 };
    let reminded = 0;
    let closed = 0;

    const due = await Sessions().findAll({
      where: {
        ...OURS,
        reminded1hAt: null,
        meetingEndedAt: null,
        scheduledAt: { [Op.between]: [new Date(now.getTime() - MINUTE), new Date(now.getTime() + REMINDER_LEAD_MINUTES * MINUTE)] },
      },
      include: [{ model: models.DiscussionGroup, as: 'discussionGroup', required: true }],
    });
    for (const session of due) {
      // eslint-disable-next-line no-await-in-loop
      const [claimed] = await Sessions().update(
        { reminded1hAt: now },
        { where: { id: session.id, reminded1hAt: null } },
      );
      if (!claimed || session.meetingStartedAt) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        await this._sendReminder(session.discussionGroup, session);
        reminded += 1;
      } catch (error) {
        console.error('[discussionMeeting] reminder failed:', error.message);
      }
    }

    const live = await Sessions().findAll({
      where: { ...OURS, meetingStartedAt: { [Op.ne]: null }, meetingEndedAt: null },
      include: [{ model: models.DiscussionGroup, as: 'discussionGroup', required: false }],
    });
    for (const session of live) {
      const startedLongAgo = now - new Date(session.meetingStartedAt) > OPEN_HOURS_WITHOUT_END * HOUR;
      const pastItsEnd = session.scheduledEndAt && now - new Date(session.scheduledEndAt) > HOUR;
      if (!startedLongAgo && !pastItsEnd) continue;
      const ended = { meetingEndedAt: now, status: 'finished', finishedAt: now };
      // Conditional, so of several servers only one closes it and reviews its tasks.
      // eslint-disable-next-line no-await-in-loop
      const [claimed] = await Sessions().update(ended, { where: { id: session.id, meetingEndedAt: null } });
      if (!claimed) continue;
      closed += 1;
      if (!session.discussionGroup) continue;
      // As End meeting does: whoever was rated during the call is reviewed now.
      // Never throws, so one group cannot stop the others closing.
      session.set(ended);
      // eslint-disable-next-line no-await-in-loop
      await this._completeTasks(session.discussionGroup, session);
    }
    return { reminded, closed };
  }
}

module.exports = new DiscussionMeetingService();
