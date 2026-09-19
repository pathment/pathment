'use strict';

/**
 * Issue #720: a mentee may hold visible memberships in more than one clan.
 * Work (tasks, schedules, stats) is isolated per clan. Reassign still replaces.
 */

const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const taskService = require('../../src/services/taskService');
const scheduleTemplateService = require('../../src/services/scheduleTemplateService');
const authService = require('../../src/services/authService');
const adminService = require('../../src/services/adminService');
const notificationOrchestrator = require('../../src/services/notificationOrchestrator');
const { resolveMenteeClanId } = require('../../src/services/menteeClanScope');
const { cleanDb, createMentor, createMentee, createProgram } = require('../helpers/seed');

describe('mentee multi-clan', () => {
  let lead, mentee, program, clanA, clanB;

  beforeEach(async () => {
    await cleanDb();
    lead = await createMentor({ email: 'lead@test.com' });
    mentee = await createMentee({ email: 'sam@test.com', firstName: 'Sam', lastName: 'Lee' });
    program = await createProgram({ createdBy: lead.id });
    clanA = await models.Clan.create({ programId: program.id, name: 'Clan A', leadMentorId: lead.id, createdBy: lead.id });
    clanB = await models.Clan.create({ programId: program.id, name: 'Clan B', leadMentorId: lead.id, createdBy: lead.id });
    await clanService.addMember(clanA.id, { userId: lead.id, role: 'lead_mentor' });
    await clanService.addMember(clanB.id, { userId: lead.id, role: 'lead_mentor' });
  });

  it('still places a mentee in one clan', async () => {
    await clanService.addMember(clanA.id, { userId: mentee.id, role: 'mentee' });
    const rows = await models.ClanMembership.findAll({ where: { userId: mentee.id, role: 'mentee', status: 'active' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].clanId).toBe(clanA.id);
  });

  it('adds a second clan without removing the first', async () => {
    await clanService.addMember(clanA.id, { userId: mentee.id, role: 'mentee' });
    await clanService.addMember(clanB.id, { userId: mentee.id, role: 'mentee' });
    const rows = await models.ClanMembership.findAll({
      where: { userId: mentee.id, role: 'mentee', status: 'active' },
    });
    expect(rows.map((r) => r.clanId).sort()).toEqual([clanA.id, clanB.id].sort());
  });

  it('rejects a duplicate mentee membership in the same clan', async () => {
    await clanService.addMember(clanA.id, { userId: mentee.id, role: 'mentee' });
    await expect(clanService.addMember(clanA.id, { userId: mentee.id, role: 'mentee' }))
      .rejects.toThrow(/already a mentee of this clan/);
  });

  it('reassign still transfers (replacement)', async () => {
    await clanService.addMember(clanA.id, { userId: mentee.id, role: 'mentee' });
    await clanService.reassignMentee(mentee.id, clanB.id, lead.id);
    const a = await models.ClanMembership.findOne({ where: { userId: mentee.id, clanId: clanA.id, role: 'mentee' } });
    const b = await models.ClanMembership.findOne({ where: { userId: mentee.id, clanId: clanB.id, role: 'mentee', status: 'active' } });
    expect(a.status).toBe('removed');
    expect(b).toBeTruthy();
  });

  describe('tasks and stats', () => {
    beforeEach(async () => {
      await clanService.addMember(clanA.id, { userId: mentee.id, role: 'mentee' });
      await clanService.addMember(clanB.id, { userId: mentee.id, role: 'mentee' });
    });

    it('keeps Clan A tasks out of Clan B and vice versa', async () => {
      const taskA = await taskService.createCustomTask({
        menteeId: mentee.id, clanId: clanA.id, title: 'A work', type: 'exercise',
      }, lead.id);
      const taskB = await taskService.createCustomTask({
        menteeId: mentee.id, clanId: clanB.id, title: 'B work', type: 'exercise',
      }, lead.id);

      const inA = await taskService.getMenteeTasks(mentee.id, { clanId: clanA.id });
      const inB = await taskService.getMenteeTasks(mentee.id, { clanId: clanB.id });
      expect(inA.map((t) => t.id)).toEqual([taskA.id]);
      expect(inB.map((t) => t.id)).toEqual([taskB.id]);
    });

    it('does not mix task stats across clans', async () => {
      await taskService.createCustomTask({
        menteeId: mentee.id, clanId: clanA.id, title: 'A1', type: 'exercise',
      }, lead.id);
      await taskService.createCustomTask({
        menteeId: mentee.id, clanId: clanB.id, title: 'B1', type: 'exercise',
      }, lead.id);
      const statsA = await taskService.getMenteeTaskStats(mentee.id, null, clanA.id);
      const statsB = await taskService.getMenteeTaskStats(mentee.id, null, clanB.id);
      expect(statsA.total).toBe(1);
      expect(statsB.total).toBe(1);
    });

    it('refuses to infer a clan when more than one exists', async () => {
      await expect(resolveMenteeClanId(mentee.id, null)).rejects.toThrow(/clanId is required/);
    });

    it('preserves clan on a recurring-style custom task', async () => {
      const task = await taskService.createCustomTask({
        menteeId: mentee.id, clanId: clanB.id, title: 'Ritual', type: 'exercise',
        scheduleSlotId: 'morning', occurrenceDate: '2026-09-18',
      }, lead.id);
      expect(task.clanId || task.assignedTask?.clanId || (await models.AssignedTask.findByPk(task.id)).clanId)
        .toBe(clanB.id);
    });
  });

  describe('schedules', () => {
    let template;

    beforeEach(async () => {
      await clanService.addMember(clanA.id, { userId: mentee.id, role: 'mentee' });
      await clanService.addMember(clanB.id, { userId: mentee.id, role: 'mentee' });
      template = await scheduleTemplateService.createTemplate(lead.id, {
        name: 'Day',
        blocks: [{ label: 'Morning', time: '09:00' }],
      });
    });

    it('stores independent schedules per clan', async () => {
      await scheduleTemplateService.assignToMentees(template.id, [mentee.id], lead.id, clanA.id);
      await scheduleTemplateService.assignToMentees(template.id, [mentee.id], lead.id, clanB.id);
      const a = await models.MenteeSchedule.findOne({ where: { menteeId: mentee.id, clanId: clanA.id } });
      const b = await models.MenteeSchedule.findOne({ where: { menteeId: mentee.id, clanId: clanB.id } });
      expect(a.id).not.toBe(b.id);

      await scheduleTemplateService.updateSlot(mentee.id, a.schedule[0].id, { kind: 'empty' }, lead.id, clanA.id);
      const aAfter = await models.MenteeSchedule.findByPk(a.id);
      const bAfter = await models.MenteeSchedule.findByPk(b.id);
      expect(bAfter.schedule[0].kind).toBe(b.schedule[0].kind);
      expect(aAfter.schedule[0].kind).toBe('empty');
    });
  });

  describe('invites', () => {
    it('creates a new-user invite as before', async () => {
      const invite = await adminService.createRegistrationInvite({
        email: 'new@test.com', role: 'mentee', programId: program.id, clanId: clanA.id,
      }, lead.id);
      expect(invite.email).toBe('new@test.com');
      expect(invite.usedAt).toBeFalsy();
    });

    it('lets an existing user accept a clan invite', async () => {
      await clanService.addMember(clanA.id, { userId: mentee.id, role: 'mentee' });
      const { generateRandomToken, hashToken } = require('../../src/utils/jwt');
      const raw = generateRandomToken();
      await models.RegistrationInvite.create({
        tokenHash: hashToken(raw),
        email: mentee.email,
        role: 'mentee',
        invitedBy: lead.id,
        expiresAt: new Date(Date.now() + 86400000),
        programId: program.id,
        clanId: clanB.id,
      });
      const result = await authService.acceptRegistrationInvite(mentee, raw);
      expect(result.clanId).toBe(clanB.id);
      const b = await models.ClanMembership.findOne({
        where: { userId: mentee.id, clanId: clanB.id, role: 'mentee', status: 'active' },
      });
      expect(b).toBeTruthy();
      const a = await models.ClanMembership.findOne({
        where: { userId: mentee.id, clanId: clanA.id, role: 'mentee', status: 'active' },
      });
      expect(a).toBeTruthy();
    });

    it('rejects accept from the wrong user', async () => {
      const other = await createMentee({ email: 'other@test.com' });
      const { generateRandomToken, hashToken } = require('../../src/utils/jwt');
      const raw = generateRandomToken();
      await models.RegistrationInvite.create({
        tokenHash: hashToken(raw),
        email: mentee.email,
        role: 'mentee',
        invitedBy: lead.id,
        expiresAt: new Date(Date.now() + 86400000),
        programId: program.id,
        clanId: clanB.id,
      });
      await expect(authService.acceptRegistrationInvite(other, raw)).rejects.toThrow(/different account/);
    });
  });

  describe('notifications', () => {
    it('passes clanId on task-assigned notifications', async () => {
      await clanService.addMember(clanA.id, { userId: mentee.id, role: 'mentee' });
      notificationOrchestrator.dispatch.mockClear();
      await taskService.createCustomTask({
        menteeId: mentee.id, clanId: clanA.id, title: 'Ping', type: 'exercise',
      }, lead.id);
      expect(notificationOrchestrator.dispatch).toHaveBeenCalledWith(expect.objectContaining({
        payload: expect.objectContaining({ clanId: clanA.id }),
      }));
    });
  });

  describe('authorization', () => {
    it('rejects a clan the mentee is not in', async () => {
      await clanService.addMember(clanA.id, { userId: mentee.id, role: 'mentee' });
      await expect(resolveMenteeClanId(mentee.id, clanB.id)).rejects.toThrow(/do not have mentee access/);
    });

    it('allows a valid mentee membership', async () => {
      await clanService.addMember(clanA.id, { userId: mentee.id, role: 'mentee' });
      await expect(resolveMenteeClanId(mentee.id, clanA.id)).resolves.toBe(clanA.id);
    });
  });
});
