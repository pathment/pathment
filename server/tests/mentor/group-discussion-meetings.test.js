'use strict';

/**
 * A group discussion's live meeting: scheduling it, joining it, the mentor's
 * feedback, and the star rating the task review shows.
 *
 *   JOINING IS THE WORK. A mentee who joins has their Group Discussion task
 *   handed in for them, once.
 *   FEEDBACK IS PRIVATE. A mentee sees their own and nobody else's, and not
 *   while the call is still running.
 *   THE RATING IS RELATIVE. Activity counts against the group's busiest
 *   member, and a measure nobody used is left out.
 *   ONE REMINDER. Ten minutes out, claimed once however often the worker runs.
 */

const { models } = require('../../src/db');
const cfg = require('../../src/config/reviewMeeting');
const notificationOrchestrator = require('../../src/services/notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../../src/config/notificationMatrix');
const service = require('../../src/services/groupDiscussionService');
const meetings = require('../../src/services/discussionMeetingService');
const messaging = require('../../src/services/messagingService');
const clanService = require('../../src/services/clanService');
const { discussionRating } = require('../../src/utils/discussionRating');
const { meetingView } = require('../../src/utils/discussionMeeting');
const {
  cleanDb, createAdmin, createMentor, createMentee, createProgram, createEnrollment,
} = require('../helpers/seed');

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const at = (ms) => new Date(Date.now() + ms).toISOString();

describe('group discussion meetings', () => {
  let admin, mentor, alice, bob, clan, scenario, group;
  const wasEnabled = cfg.enabled;

  beforeAll(() => { cfg.enabled = true; });
  afterAll(() => { cfg.enabled = wasEnabled; });

  beforeEach(async () => {
    await cleanDb();
    notificationOrchestrator.dispatch.mockClear();
    admin = await createAdmin({ email: `dm-admin-${Date.now()}@test.com` });
    mentor = await createMentor({ email: `dm-mentor-${Date.now()}@test.com` });
    alice = await createMentee({ email: `dm-alice-${Date.now()}@test.com`, firstName: 'Alice' });
    bob = await createMentee({ email: `dm-bob-${Date.now()}@test.com`, firstName: 'Bob' });
    const program = await createProgram({ createdBy: admin.id, name: 'Fellowship' });
    clan = await models.Clan.create({ programId: program.id, name: 'Clan A', leadMentorId: mentor.id, createdBy: admin.id });
    await clanService.addMember(clan.id, { userId: mentor.id, role: 'lead_mentor' });
    for (const m of [alice, bob]) {
      await createEnrollment({ menteeId: m.id, programId: program.id, status: 'active' });
      await clanService.addMember(clan.id, { userId: m.id, role: 'mentee' });
    }
    scenario = await service.createScenario(mentor.id, { clanId: clan.id, title: 'Missed deadline', prompt: 'What do you do?' });
    // Creating the group assigns both mentees their Group Discussion task.
    group = await service.createGroup(mentor.id, {
      scenarioId: scenario.id, name: 'Group A', schedule: { repeat: 'none', startsAt: at(-HOUR), endsAt: at(48 * HOUR) },
    });
  });

  const taskOf = (menteeId) => models.AssignedTask.findOne({ where: { discussionGroupId: group.id, menteeId } });
  // The meeting is a Clan Review session of kind 'discussion'.
  const sessionOf = () => models.CohortReviewSession.scope('discussion').findOne({ where: { discussionGroupId: group.id } });
  const moveStart = (ms) => models.CohortReviewSession.scope('discussion').update(
    { scheduledAt: new Date(Date.now() + ms) }, { where: { discussionGroupId: group.id } },
  );
  const schedule = (startsIn = 30 * MINUTE, extra = {}) => meetings.scheduleMeeting(mentor.id, group.id, { startsAt: at(startsIn), ...extra });

  describe('scheduling', () => {
    it('needs a start, and an end after it', async () => {
      await expect(meetings.scheduleMeeting(mentor.id, group.id, {})).rejects.toThrow(/starts/);
      await expect(schedule(HOUR, { endsAt: at(30 * MINUTE) })).rejects.toThrow(/after the start/);
    });

    it('stores the meeting with its own room, and tells everybody but the mentor who scheduled it', async () => {
      const coMentor = await createMentor({ email: `dm-co-${Date.now()}@test.com` });
      await clanService.addMember(clan.id, { userId: coMentor.id, role: 'co_mentor' });
      const view = await schedule(HOUR);
      expect(view.meeting).toMatchObject({ state: 'scheduled', joinable: false, endsAt: null });
      const session = await sessionOf();
      expect(session).toMatchObject({ kind: 'discussion', clanId: clan.id, attendanceTracking: false });
      expect(session.meetingRoom).toMatch(/^pathment-discussion-/);
      const invites = notificationOrchestrator.dispatch.mock.calls
        .map(([args]) => args)
        .filter((args) => args.eventKey === NOTIFICATION_EVENTS.DISCUSSION_MEETING_SCHEDULED);
      const invited = invites.flatMap((args) => args.recipients.map((r) => r.userId));
      // The scheduling mentor's own screen already says so: no bell for them.
      expect(invited.sort()).toEqual([coMentor.id, alice.id, bob.id].sort());
      // Each role lands on its own page.
      const urls = invites.map((args) => args.payload.actionUrl);
      expect(urls).toEqual(expect.arrayContaining([`/mentor/group-discussions/${group.id}`, `/mentee/messages?discussion=${group.id}&join=meeting`]));
      expect(invites.every((args) => args.payload.title === 'Discussion meeting scheduled')).toBe(true);
    });

    it('says "moved" only when a meeting still to come gets a new time', async () => {
      const titles = () => notificationOrchestrator.dispatch.mock.calls
        .map(([args]) => args)
        .filter((args) => args.eventKey === NOTIFICATION_EVENTS.DISCUSSION_MEETING_SCHEDULED)
        .map((args) => args.payload.title);

      await schedule(HOUR);
      notificationOrchestrator.dispatch.mockClear();
      await schedule(2 * HOUR);
      expect(titles().length).toBeGreaterThan(0);
      expect(titles().every((t) => t === 'Discussion meeting moved')).toBe(true);

      // A meeting that already ran is set up again as a new one.
      await moveStart(MINUTE);
      await meetings.startMeeting(mentor.id, group.id);
      await meetings.endMeeting(mentor.id, group.id);
      notificationOrchestrator.dispatch.mockClear();
      await schedule(HOUR);
      expect(titles().length).toBeGreaterThan(0);
      expect(titles().every((t) => t === 'Discussion meeting scheduled')).toBe(true);
    });

    it('is refused to a mentor who does not run the clan', async () => {
      const other = await createMentor({ email: `dm-other-${Date.now()}@test.com` });
      await expect(meetings.scheduleMeeting(other.id, group.id, { startsAt: at(HOUR) })).rejects.toThrow(/do not mentor/);
    });
  });

  describe('joining', () => {
    it('opens two minutes before the start, not earlier', async () => {
      await schedule(30 * MINUTE);
      await expect(meetings.joinInfo(alice.id, group.id)).rejects.toThrow(/not opened yet/);
      await moveStart(MINUTE);
      await expect(meetings.joinInfo(alice.id, group.id)).resolves.toMatchObject({ groupId: group.id });
    });

    it('hands in the mentee\'s task the first time they join, and only then', async () => {
      await schedule(MINUTE);
      await meetings.startMeeting(mentor.id, group.id);
      const first = await meetings.selfJoin(alice.id, group.id, {});
      expect(first).toMatchObject({ present: true, submitted: 1 });
      expect((await taskOf(alice.id)).status).toBe('submitted');

      // The heartbeat carries talk time and never submits again.
      const beat = await meetings.selfJoin(alice.id, group.id, { talkSeconds: 40 });
      expect(beat.submitted).toBe(0);
      await meetings.selfJoin(alice.id, group.id, { talkSeconds: 10 });
      const row = await models.CohortReviewEntry.findOne({ where: { sessionId: (await sessionOf()).id, menteeId: alice.id } });
      expect(row.talkSeconds).toBe(40); // never lowered
      expect(row.joinedAt).not.toBeNull();
      expect(row.attendance).toBeNull(); // a discussion join is not a review attendance mark
      expect(await models.TaskSubmission.count({ where: { assignedTaskId: (await taskOf(alice.id)).id } })).toBe(1);
      expect((await taskOf(bob.id)).status).not.toBe('submitted');
    });

    it('refuses somebody outside the group', async () => {
      const outsider = await createMentee({ email: `dm-out-${Date.now()}@test.com` });
      await schedule(MINUTE);
      await expect(meetings.joinInfo(outsider.id, group.id)).rejects.toThrow(/not part of this discussion/);
    });
  });

  describe('feedback and the rating', () => {
    beforeEach(async () => {
      await schedule(MINUTE);
      await meetings.startMeeting(mentor.id, group.id);
      await meetings.selfJoin(alice.id, group.id, { talkSeconds: 120 });
      await meetings.selfJoin(bob.id, group.id, { talkSeconds: 60 });
      await messaging.sendMessage(alice.id, { conversationId: group.conversationId, messageText: 'I would ask early' });
    });

    it('keeps each criterion between 0 and 100, and only for the group\'s mentees', async () => {
      await expect(meetings.saveFeedback(mentor.id, group.id, alice.id, { communication: 140 })).rejects.toThrow(/between 0 and 100/);
      const outsider = await createMentee({ email: `dm-out2-${Date.now()}@test.com` });
      await expect(meetings.saveFeedback(mentor.id, group.id, outsider.id, { communication: 60 })).rejects.toThrow(/not in this group/);
      const saved = await meetings.saveFeedback(mentor.id, group.id, alice.id, { communication: 80, relevance: 90, note: 'Clear' });
      expect(saved).toMatchObject({ communication: 80, relevance: 90, openness: 50, note: 'Clear' });
      // Saving again is a correction, not a second row.
      await meetings.saveFeedback(mentor.id, group.id, alice.id, { communication: 70 });
      expect(await models.DiscussionFeedback.count({ where: { groupId: group.id, menteeId: alice.id } })).toBe(1);
    });

    it('rates the reviewed task from feedback and activity', async () => {
      await meetings.saveFeedback(mentor.id, group.id, alice.id, {
        communication: 100, relevance: 100, openness: 100, criticalThinking: 100, collaboration: 100,
      });
      const task = await taskOf(alice.id);
      const participation = await service.participationForTask(mentor.id, task.id);
      expect(participation.rating).toMatchObject({ basis: 'both', stars: 5 });
      expect(participation.meeting).toMatchObject({ joined: true, talkSeconds: 120 });
      expect(participation.feedback[0]).toMatchObject({ communication: 100, mentorId: mentor.id });
    });

    it('shows a mentee only their own feedback, and only once the call has ended', async () => {
      await meetings.saveFeedback(mentor.id, group.id, alice.id, { communication: 90, note: 'For Alice' });
      const during = await meetings.myResult(alice.id, group.id);
      expect(during.feedback).toEqual([]);
      expect(during.feedbackHiddenUntilEnd).toBe(true);

      await meetings.endMeeting(mentor.id, group.id);
      const mine = await meetings.myResult(alice.id, group.id);
      expect(mine.feedback).toHaveLength(1);
      expect(mine.feedback[0].note).toBe('For Alice');
      expect(mine.member.meeting.talkSeconds).toBe(120);

      const bobs = await meetings.myResult(bob.id, group.id);
      expect(bobs.feedback).toEqual([]);
      expect(bobs.member.menteeId).toBe(bob.id);
    });
  });

  describe('completing the task', () => {
    beforeEach(async () => {
      await schedule(MINUTE);
      await meetings.startMeeting(mentor.id, group.id);
      await meetings.selfJoin(alice.id, group.id, { talkSeconds: 60 });
    });

    it('approves it when the mentor rates a mentee after the meeting', async () => {
      await meetings.endMeeting(mentor.id, group.id);
      expect((await taskOf(alice.id)).status).toBe('submitted'); // not rated yet
      const saved = await meetings.saveFeedback(mentor.id, group.id, alice.id, {
        communication: 100, relevance: 100, openness: 100, criticalThinking: 100, collaboration: 100, note: 'Great',
      });
      expect(saved.taskCompleted).toBe(true);
      const task = await taskOf(alice.id);
      expect(task.status).toBe('completed');
      expect(Number(task.finalRating)).toBe(5);
      const review = await models.TaskFeedback.findOne({ where: { assignedTaskId: task.id } });
      // Plain text: some screens print a review as text, never as HTML.
      expect(review.feedbackText).toBe('Great');
    });

    it('approves whoever was rated during the call when it ends, and leaves the rest', async () => {
      await meetings.saveFeedback(mentor.id, group.id, alice.id, { communication: 60 });
      await meetings.saveFeedback(mentor.id, group.id, bob.id, { communication: 60 }); // never joined
      expect((await taskOf(alice.id)).status).toBe('submitted'); // still live
      await meetings.endMeeting(mentor.id, group.id);
      expect((await taskOf(alice.id)).status).toBe('completed');
      expect((await taskOf(bob.id)).status).not.toBe('completed');
    });

    it('approves whoever was rated during the call when the worker closes it, once', async () => {
      await meetings.saveFeedback(mentor.id, group.id, alice.id, { communication: 60 });
      expect((await taskOf(alice.id)).status).toBe('submitted'); // still live
      // Nobody pressed End: the worker closes it once it has run too long.
      await models.CohortReviewSession.scope('discussion').update(
        { meetingStartedAt: new Date(Date.now() - 7 * HOUR) }, { where: { discussionGroupId: group.id } },
      );
      expect((await meetings.tick()).closed).toBe(1);
      expect((await sessionOf()).meetingEndedAt).not.toBeNull();
      expect((await taskOf(alice.id)).status).toBe('completed');
      expect((await taskOf(bob.id)).status).not.toBe('completed'); // never joined
      expect((await meetings.tick()).closed).toBe(0);
      const reviews = await models.TaskFeedback.findAll({ where: { assignedTaskId: (await taskOf(alice.id)).id } });
      expect(reviews).toHaveLength(1);
    });

    it('never overwrites a review once written, but the rating still follows the feedback', async () => {
      await meetings.endMeeting(mentor.id, group.id);
      await meetings.saveFeedback(mentor.id, group.id, alice.id, { communication: 100, note: 'First' });
      const task = await taskOf(alice.id);
      const firstRating = Number(task.finalRating);
      await meetings.saveFeedback(mentor.id, group.id, alice.id, { communication: 0, note: 'Second' });
      const reviews = await models.TaskFeedback.findAll({ where: { assignedTaskId: task.id } });
      expect(reviews).toHaveLength(1);
      expect(reviews[0].feedbackText).toMatch(/First/);
      expect(Number((await taskOf(alice.id)).finalRating)).toBe(firstRating);
      // The participation section reads the live feedback.
      const participation = await service.participationForTask(mentor.id, task.id);
      expect(participation.feedback[0].note).toBe('Second');
    });

    it('lists each mentee\'s task on the host roster, for the review drawer', async () => {
      const view = await meetings.hostView(mentor.id, group.id);
      const row = view.roster.find((r) => r.menteeId === alice.id);
      expect(row.task).toMatchObject({ id: (await taskOf(alice.id)).id, status: 'submitted' });
    });
  });

  describe('the rating math', () => {
    const groupMax = { messages: 10, talk: 100, voice: 0, files: 0 };

    it('weighs feedback 70% and activity 30%', () => {
      const all = { communication: 100, relevance: 100, openness: 100, criticalThinking: 100, collaboration: 100 };
      const r = discussionRating({ feedbackRows: [all], mine: { messages: 0, talk: 0, voice: 0, files: 0 }, groupMax });
      expect(r.score).toBe(0.7);
      expect(r.stars).toBe(4);
    });

    it('leaves out a measure nobody in the group used', () => {
      const r = discussionRating({ feedbackRows: [], mine: { messages: 10, talk: 100, voice: 0, files: 0 }, groupMax });
      expect(r).toMatchObject({ basis: 'activity', score: 1, stars: 5 });
      expect(r.activity.parts).not.toHaveProperty('voice');
    });

    it('gives 0 stars, not 1, to someone who did nothing while others took part', () => {
      const r = discussionRating({ feedbackRows: [], mine: { messages: 0, talk: 0, voice: 0, files: 0 }, groupMax });
      expect(r).toMatchObject({ basis: 'activity', score: 0, stars: 0 });
    });

    it('keeps the 1-5 scale once a mentor has rated them, even at the bottom', () => {
      const lowest = { communication: 0, relevance: 0, openness: 0, criticalThinking: 0, collaboration: 0 };
      const r = discussionRating({ feedbackRows: [lowest], mine: { messages: 0, talk: 0, voice: 0, files: 0 }, groupMax });
      expect(r.stars).toBe(1);
    });

    it('has no rating with nothing to go on', () => {
      const r = discussionRating({ feedbackRows: [], mine: { messages: 0, talk: 0, voice: 0, files: 0 }, groupMax: { messages: 0, talk: 0, voice: 0, files: 0 } });
      expect(r.stars).toBeNull();
    });
  });

  describe('the reminder and the banner', () => {
    it('reminds once, ten minutes out', async () => {
      await schedule(HOUR);
      expect((await meetings.tick()).reminded).toBe(0);
      await moveStart(9 * MINUTE);
      expect((await meetings.tick()).reminded).toBe(1);
      expect((await meetings.tick()).reminded).toBe(0);
    });

    it('does not remind again when the invite already went out inside ten minutes', async () => {
      await schedule(5 * MINUTE);
      expect((await meetings.tick()).reminded).toBe(0);
    });

    it('lists the meeting for its mentees and its mentor, not for anyone else', async () => {
      await schedule(20 * MINUTE);
      expect((await meetings.upcomingForUser(alice.id)).map((m) => m.role)).toEqual(['mentee']);
      expect((await meetings.upcomingForUser(mentor.id)).map((m) => m.role)).toEqual(['mentor']);
      const outsider = await createMentee({ email: `dm-out3-${Date.now()}@test.com` });
      expect(await meetings.upcomingForUser(outsider.id)).toEqual([]);
    });

    it('reads a meeting past its window as missed', () => {
      const view = meetingView({ scheduledAt: new Date(Date.now() - 3 * HOUR), scheduledEndAt: new Date(Date.now() - 2 * HOUR) });
      expect(view).toMatchObject({ state: 'missed', joinable: false });
    });
  });

  describe('Clan Review never sees it', () => {
    it('is invisible to every default read of the session table', async () => {
      await schedule(MINUTE);
      await meetings.startMeeting(mentor.id, group.id);
      await meetings.selfJoin(alice.id, group.id, {});
      expect(await models.CohortReviewSession.count({ where: { clanId: clan.id } })).toBe(0);
      const session = await sessionOf();
      expect(await models.CohortReviewSession.findByPk(session.id)).toBeNull();
      // An entry read through its session (attendance, history, pause) skips it too.
      const viaSession = await models.CohortReviewEntry.findAll({
        where: { menteeId: alice.id },
        include: [{ model: models.CohortReviewSession, as: 'session', required: true }],
      });
      expect(viaSession).toHaveLength(0);
    });

    it('does not show the clan a review Join banner', async () => {
      const reviewMeeting = require('../../src/services/reviewMeetingService');
      await schedule(MINUTE);
      await meetings.startMeeting(mentor.id, group.id);
      expect(await reviewMeeting.activeForMentee(bob.id)).toBeNull();
    });

    it('goes with the group when the group is deleted', async () => {
      await schedule(MINUTE);
      await meetings.startMeeting(mentor.id, group.id);
      await meetings.selfJoin(alice.id, group.id, {});
      await meetings.saveFeedback(mentor.id, group.id, alice.id, { communication: 70 });
      const session = await sessionOf();
      await service.deleteGroup(mentor.id, group.id);
      expect(await models.CohortReviewSession.scope('discussion').count({ where: { id: session.id } })).toBe(0);
      expect(await models.CohortReviewEntry.count({ where: { sessionId: session.id } })).toBe(0);
      expect(await models.DiscussionFeedback.count({ where: { menteeId: alice.id } })).toBe(0);
    });
  });
});
