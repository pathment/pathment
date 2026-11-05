'use strict';

/**
 * Group discussions: mentees talking a scenario through in a shared chat.
 *
 * The chat is the existing one, so most of what matters here is the seam: what
 * a group changes about sending a message, and what it must not change for a
 * one-to-one conversation.
 *
 *   FROZEN AFTER THE END. Mentees stop being able to post; the mentor does not.
 *   THE GROUP DECIDES WHO SPEAKS. Removing somebody really removes them.
 *   NO SIDE EFFECTS. No AI draft for the mentor, no unread count on one member,
 *   and no group threads in anybody's direct-message inbox.
 */

jest.mock('../../src/utils/cloudinaryUpload', () => ({
  ...jest.requireActual('../../src/utils/cloudinaryUpload'),
  uploadToCloudinary: jest.fn().mockResolvedValue({ secure_url: 'https://res.cloudinary.com/x/video/upload/v1/pathment/discussions/note.webm' }),
  deleteFromCloudinary: jest.fn().mockResolvedValue({}),
}));

const { models } = require('../../src/db');
const service = require('../../src/services/groupDiscussionService');
const messaging = require('../../src/services/messagingService');
const taskService = require('../../src/services/taskService');
const clanService = require('../../src/services/clanService');
const { discussionWindow } = require('../../src/utils/discussionWindow');
const {
  cleanDb, createAdmin, createMentor, createMentee, createProgram, createEnrollment,
} = require('../helpers/seed');

const HOUR = 3600000;
const past = (hours) => new Date(Date.now() - hours * HOUR).toISOString();
const future = (hours) => new Date(Date.now() + hours * HOUR).toISOString();

describe('group discussions', () => {
  let admin, mentor, alice, bob, program, clan, scenario;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin({ email: `dg-admin-${Date.now()}@test.com` });
    mentor = await createMentor({ email: `dg-mentor-${Date.now()}@test.com` });
    alice = await createMentee({ email: `dg-alice-${Date.now()}@test.com` });
    bob = await createMentee({ email: `dg-bob-${Date.now()}@test.com` });
    program = await createProgram({ createdBy: admin.id, name: 'Fellowship' });
    clan = await models.Clan.create({
      programId: program.id, name: 'Clan A', leadMentorId: mentor.id, createdBy: admin.id,
    });
    await clanService.addMember(clan.id, { userId: mentor.id, role: 'lead_mentor' });
    for (const m of [alice, bob]) {
      await createEnrollment({ menteeId: m.id, programId: program.id, status: 'active' });
      await clanService.addMember(clan.id, { userId: m.id, role: 'mentee' });
    }
    scenario = await service.createScenario(mentor.id, { clanId: clan.id, title: 'Missed deadline', prompt: 'What do you do?' });
  });

  /*
   * A group needs both dates now. A test that leaves one out means a group made
   * before they were required, so it is created with both and the missing one
   * is cleared on the row: the fallbacks those older groups take stay tested.
   */
  const makeGroup = async (extra = {}) => {
    const asked = extra.schedule;
    if (asked?.repeat === 'weekly') {
      return service.createGroup(mentor.id, { scenarioId: scenario.id, name: 'Group A', ...extra });
    }
    const schedule = { repeat: 'none', startsAt: past(1), endsAt: future(24 * 30), ...(asked || {}) };
    const group = await service.createGroup(mentor.id, { scenarioId: scenario.id, name: 'Group A', ...extra, schedule });
    const legacy = {};
    if (!asked?.startsAt) legacy.startsAt = null;
    if (!asked?.endsAt) legacy.endsAt = null;
    if (!Object.keys(legacy).length) return group;
    await models.DiscussionGroup.update(legacy, { where: { id: group.id } });
    return service.getForMentor(mentor.id, group.id);
  };
  const say = (userId, group, messageText = 'hello') => messaging.sendMessage(userId, { conversationId: group.conversationId, messageText });
  const ids = (group) => group.members.map((m) => m.userId).sort();
  const freeze = (group) => models.DiscussionGroup.update({ endsAt: new Date(Date.now() - HOUR) }, { where: { id: group.id } });
  const image = { buffer: Buffer.from('x'), mimetype: 'image/png', originalname: 'a.png', size: 1 };

  describe('creating', () => {
    it('selects every mentee of the clan by default', async () => {
      expect(ids(await makeGroup())).toEqual([alice.id, bob.id].sort());
    });

    it('takes a smaller list when the mentor chooses one', async () => {
      expect(ids(await makeGroup({ menteeIds: [alice.id] }))).toEqual([alice.id]);
    });

    it('refuses somebody from another clan', async () => {
      const outsider = await createMentee({ email: `dg-out-${Date.now()}@test.com` });
      await expect(makeGroup({ menteeIds: [alice.id, outsider.id] })).rejects.toThrow(/mentee of this clan/);
    });

    it('lets one mentee be in several groups', async () => {
      await makeGroup({ name: 'One' });
      await makeGroup({ name: 'Two' });
      expect(await service.listForMentee(alice.id)).toHaveLength(2);
    });

    it('lists scenarios with their groups for the mentor', async () => {
      await makeGroup();
      const { scenarios } = await service.listForMentor(mentor.id, clan.id);
      expect(scenarios[0].title).toBe('Missed deadline');
      expect(scenarios[0].groups[0]).toMatchObject({ name: 'Group A', memberCount: 2, state: 'open' });
    });

    it('refuses a mentor who does not run the clan', async () => {
      const other = await createMentor({ email: `dg-other-${Date.now()}@test.com` });
      await expect(service.createGroup(other.id, { scenarioId: scenario.id, name: 'X' })).rejects.toThrow(/do not mentor/);
    });
  });

  describe('the window', () => {
    const friday = {
      repeat: 'weekly', dayOfWeek: 5, timeLocal: '10:00', durationMinutes: 60, timezone: 'UTC', startsOn: '2026-10-01',
    };

    it('is open with no times set', () => {
      expect(discussionWindow({ repeat: 'none' }).state).toBe('open');
    });

    it('follows the start and end', () => {
      expect(discussionWindow({ repeat: 'none', startsAt: future(1) }).state).toBe('upcoming');
      expect(discussionWindow({ repeat: 'none', startsAt: past(2), endsAt: future(1) }).state).toBe('open');
      expect(discussionWindow({ repeat: 'none', endsAt: past(1) }).state).toBe('ended');
    });

    it('repeats weekly, open only during the occurrence', () => {
      expect(discussionWindow(friday, new Date('2026-10-30T10:30:00Z')).state).toBe('open');
      expect(discussionWindow(friday, new Date('2026-11-06T10:30:00Z')).state).toBe('open');
      expect(discussionWindow(friday, new Date('2026-10-30T12:00:00Z')).state).toBe('upcoming');
    });

    it('ends for good after the last weekly date', () => {
      expect(discussionWindow({ ...friday, endsOn: '2026-10-09' }, new Date('2026-10-30T12:00:00Z')).state).toBe('ended');
    });

    it('refuses an end before the start', async () => {
      await expect(makeGroup({ schedule: { repeat: 'none', startsAt: future(2), endsAt: future(1) } }))
        .rejects.toThrow(/after the start/);
    });
  });

  describe('the chat', () => {
    it('reaches every member, without treating one of them as the reader', async () => {
      const group = await makeGroup();
      const result = await say(alice.id, group, 'my take');
      expect(result.recipientIds.sort()).toEqual([mentor.id, bob.id].sort());
      expect(result.message.isRead).toBe(true);
    });

    it('freezes for mentees after the end, but not for the mentor', async () => {
      const group = await makeGroup({ schedule: { repeat: 'none', endsAt: future(1) } });
      await freeze(group);
      await expect(say(alice.id, group)).rejects.toThrow(/frozen/);
      await expect(say(mentor.id, group, 'closing note')).resolves.toBeDefined();
    });

    it('stays closed to mentees before it opens', async () => {
      const group = await makeGroup({ schedule: { repeat: 'none', startsAt: future(1) } });
      await expect(say(alice.id, group)).rejects.toThrow(/not open yet/);
    });

    it('still reads after it freezes', async () => {
      const group = await makeGroup({ schedule: { repeat: 'none', endsAt: future(1) } });
      await say(alice.id, group, 'before the end');
      await freeze(group);
      expect(await messaging.listMessages(bob.id, group.conversationId)).toHaveLength(1);
    });

    it('stops somebody removed from reading or posting', async () => {
      const group = await makeGroup();
      await service.removeMember(mentor.id, group.id, bob.id);
      await expect(say(bob.id, group)).rejects.toThrow(/not part of this discussion/);
      await expect(messaging.listMessages(bob.id, group.conversationId)).rejects.toThrow();
    });

    it('shows somebody added later the whole discussion', async () => {
      const group = await makeGroup({ menteeIds: [alice.id] });
      await say(alice.id, group, 'early');
      await service.addMembers(mentor.id, group.id, [bob.id]);
      expect(await messaging.listMessages(bob.id, group.conversationId)).toHaveLength(1);
    });

    it('stays out of the direct-message inbox', async () => {
      const group = await makeGroup();
      await say(alice.id, group);
      const inbox = await messaging.listConversations(bob.id);
      expect(JSON.stringify(inbox)).not.toContain(group.conversationId);
    });

    it('cannot be left or archived by a member', async () => {
      const group = await makeGroup();
      await expect(messaging.deleteConversation(alice.id, group.conversationId)).rejects.toThrow(/managed by its mentor/);
      await expect(messaging.archiveConversation(alice.id, group.conversationId)).rejects.toThrow(/managed by its mentor/);
    });

    it('does not ask the AI to answer a group message', async () => {
      const { RagFacade } = require('../../src/features/rag');
      const spy = jest.spyOn(RagFacade, 'handleNewMessage').mockResolvedValue(null);
      const group = await makeGroup({ menteeIds: [alice.id] });
      await say(alice.id, group);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('sends a voice note with no text, and refuses other kinds of file', async () => {
      const group = await makeGroup();
      const note = { buffer: Buffer.from('x'), mimetype: 'audio/webm', originalname: 'note.webm', size: 1 };
      const result = await messaging.sendGroupAttachment(alice.id, { conversationId: group.conversationId }, note);
      expect(result.message.attachments).toHaveLength(1);
      expect(result.message.attachments[0].fileType).toBe('audio/webm');
      const zip = { ...note, mimetype: 'application/zip', originalname: 'code.zip' };
      await expect(messaging.sendGroupAttachment(alice.id, { conversationId: group.conversationId }, zip))
        .rejects.toThrow(/PDF, Word, Excel, PowerPoint or text file/);
    });

    it('sends a PDF or Word file as a raw upload that keeps its name', async () => {
      const { uploadToCloudinary } = require('../../src/utils/cloudinaryUpload');
      uploadToCloudinary.mockClear();
      const group = await makeGroup();
      const pdf = { buffer: Buffer.from('%PDF'), mimetype: 'application/pdf', originalname: 'Team plan.v2.pdf', size: 4 };
      const result = await messaging.sendGroupAttachment(alice.id, { conversationId: group.conversationId }, pdf);
      expect(result.message.attachments[0]).toMatchObject({ fileName: 'Team plan.v2.pdf', fileType: 'application/pdf' });
      const [, folder, resourceType, extra] = uploadToCloudinary.mock.calls[0];
      expect([folder, resourceType]).toEqual(['pathment/discussions', 'raw']);
      expect(extra.filename_override).toBe('Team plan_v2.pdf');

      const docx = {
        buffer: Buffer.from('x'), mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalname: 'notes.docx', size: 1,
      };
      await expect(messaging.sendGroupAttachment(alice.id, { conversationId: group.conversationId }, docx)).resolves.toBeTruthy();
    });

    it('does not store a file in a frozen chat', async () => {
      const { uploadToCloudinary } = require('../../src/utils/cloudinaryUpload');
      uploadToCloudinary.mockClear();
      const group = await makeGroup({ schedule: { repeat: 'none', endsAt: future(1) } });
      await freeze(group);
      await expect(messaging.sendGroupAttachment(alice.id, { conversationId: group.conversationId }, image)).rejects.toThrow(/frozen/);
      expect(uploadToCloudinary).not.toHaveBeenCalled();
    });
  });

  describe('one-to-one chat is unchanged', () => {
    it('still sends, and stays unread for the recipient', async () => {
      const conversation = await messaging.createOrGetDirectConversation(alice.id, mentor.id);
      const result = await messaging.sendMessage(alice.id, { conversationId: conversation.id, messageText: 'hi' });
      expect(result.message.isRead).toBe(false);
      expect(result.notifications[0].actionUrl).toBe(`/mentor/messages?conversationId=${conversation.id}`);
    });

    it('still lets somebody leave', async () => {
      const conversation = await messaging.createOrGetDirectConversation(alice.id, mentor.id);
      await expect(messaging.deleteConversation(alice.id, conversation.id)).resolves.toEqual({ deleted: true });
    });

    it('refuses a file', async () => {
      const conversation = await messaging.createOrGetDirectConversation(alice.id, mentor.id);
      await expect(messaging.sendGroupAttachment(alice.id, { conversationId: conversation.id }, image))
        .rejects.toThrow(/only be sent in a group/);
    });
  });

  describe('contribution', () => {
    it('counts messages and marks members against the group average', async () => {
      const group = await makeGroup();
      await say(alice.id, group, 'one');
      await say(alice.id, group, 'two');
      await say(alice.id, group, 'three');
      await say(bob.id, group, 'just one');
      const { members } = await service.getForMentor(mentor.id, group.id);
      expect(members[0]).toMatchObject({ userId: alice.id, messageCount: 3, activity: 'more_active' });
      expect(members[1]).toMatchObject({ userId: bob.id, messageCount: 1, activity: 'less_active' });
    });

    it('tells reading apart from never opening it', async () => {
      const group = await makeGroup();
      await messaging.markConversationRead(bob.id, group.conversationId);
      const { members } = await service.getForMentor(mentor.id, group.id);
      expect(members.find((m) => m.userId === bob.id).activity).toBe('read_only');
      expect(members.find((m) => m.userId === alice.id).activity).toBe('not_joined');
    });

    it('counts files', async () => {
      const group = await makeGroup();
      await messaging.sendGroupAttachment(alice.id, { conversationId: group.conversationId, messageText: 'see this' }, image);
      const { members } = await service.getForMentor(mentor.id, group.id);
      expect(members.find((m) => m.userId === alice.id).fileCount).toBe(1);
    });
  });

  describe('deleting', () => {
    it('removes the group, its chat and everything said in it', async () => {
      const group = await makeGroup();
      await messaging.sendGroupAttachment(alice.id, { conversationId: group.conversationId, messageText: 'x' }, image);
      await service.deleteGroup(mentor.id, group.id);
      expect(await models.DiscussionGroup.count({ where: { id: group.id } })).toBe(0);
      expect(await models.Conversation.count({ where: { id: group.conversationId } })).toBe(0);
      expect(await models.Message.count({ where: { threadId: group.conversationId } })).toBe(0);
    });

    it('is the mentor\'s right, and works on a frozen group', async () => {
      const group = await makeGroup({ schedule: { repeat: 'none', endsAt: future(1) } });
      await freeze(group);
      const other = await createMentor({ email: `dg-other-${Date.now()}@test.com` });
      await expect(service.deleteGroup(other.id, group.id)).rejects.toThrow(/do not mentor/);
      await expect(service.deleteGroup(mentor.id, group.id)).resolves.toEqual({ deleted: true });
    });

    it('leaves an assigned task in place', async () => {
      const group = await makeGroup();
      const task = await taskService.createCustomTask({
        menteeId: alice.id, clanId: clan.id, title: 'Discuss', description: 'x', type: 'group_discussion', dueDate: future(48), discussionGroupId: group.id,
      }, mentor.id);
      await service.deleteGroup(mentor.id, group.id);
      const after = await models.AssignedTask.findByPk(task.id);
      expect(after).not.toBeNull();
      expect(after.discussionGroupId).toBeNull();
    });
  });

  describe('the assigned task', () => {
    const assign = (menteeId, group, extra = {}) => taskService.createCustomTask({
      menteeId, clanId: clan.id, title: 'Discuss', description: 'x', type: 'group_discussion', dueDate: future(48), discussionGroupId: group?.id, ...extra,
    }, mentor.id);

    it('requires a group', async () => {
      await expect(assign(alice.id, null)).rejects.toThrow(/Choose the group discussion/);
    });

    it('carries the group, and shows on the mentor\'s progress view', async () => {
      const group = await makeGroup();
      const task = await assign(alice.id, group);
      const read = await taskService.getAssignedTaskById(task.id);
      expect(read.discussionGroup).toMatchObject({ id: group.id, name: 'Group A', state: 'open' });
      expect(read.discussionGroup.scenario.title).toBe('Missed deadline');
      const { members } = await service.getForMentor(mentor.id, group.id);
      expect(members.find((m) => m.userId === alice.id).task.status).toBe('assigned');
    });

    it('brings back somebody who had been removed', async () => {
      const group = await makeGroup();
      await service.removeMember(mentor.id, group.id, bob.id);
      await assign(bob.id, group);
      expect(ids(await service.getForMentor(mentor.id, group.id))).toContain(bob.id);
    });

    it('refuses an ended group, and a schedule', async () => {
      const group = await makeGroup({ schedule: { repeat: 'none', endsAt: future(1) } });
      await expect(assign(alice.id, group, { schedule: { mode: 'once' } })).rejects.toThrow(/own schedule/);
      await freeze(group);
      await expect(assign(alice.id, group)).rejects.toThrow(/already ended/);
    });

    describe('the deadline', () => {
      const dueOf = (task) => new Date(task.dueDate).getTime();
      const at = (iso) => new Date(iso).getTime();

      it('moves up to when the discussion closes', async () => {
        const closes = future(24 * 10);
        const group = await makeGroup({ schedule: { repeat: 'none', endsAt: closes } });
        expect(dueOf(await assign(alice.id, group, { dueDate: future(24) }))).toBe(at(closes));
      });

      it('moves up to when it opens, if it has no end', async () => {
        const opens = future(24 * 10);
        const group = await makeGroup({ schedule: { repeat: 'none', startsAt: opens } });
        expect(dueOf(await assign(alice.id, group, { dueDate: future(24) }))).toBe(at(opens));
      });

      it('stays where the mentor put it, after the close', async () => {
        const closes = future(24 * 2);
        const group = await makeGroup({ schedule: { repeat: 'none', endsAt: closes } });
        expect(dueOf(await assign(alice.id, group, { dueDate: future(24 * 10) }))).toBeGreaterThan(at(closes) + 24 * HOUR);
      });

      it('is left alone by a group with no times', async () => {
        const group = await makeGroup();
        expect(dueOf(await assign(alice.id, group, { dueDate: future(24) }))).toBeLessThan(Date.now() + 3 * 24 * HOUR);
      });
    });

    it('leaves the old plain Discussion task as it was', async () => {
      const task = await taskService.createCustomTask({
        menteeId: alice.id, clanId: clan.id, title: 'Talk', description: 'x', type: 'discussion', dueDate: future(48),
      }, mentor.id);
      expect(task.discussionGroupId).toBeNull();
    });
  });

  describe('what a mentee sees', () => {
    it('shows only their own groups, and refuses others', async () => {
      const group = await makeGroup({ menteeIds: [alice.id] });
      expect(await service.listForMentee(bob.id)).toEqual([]);
      await expect(service.getForMentee(bob.id, group.id)).rejects.toThrow(/not part of this discussion/);
      const mine = await service.getForMentee(alice.id, group.id);
      expect(mine.scenario.prompt).toBe('What do you do?');
      expect(mine.members).toBeUndefined();
    });
  });
});
