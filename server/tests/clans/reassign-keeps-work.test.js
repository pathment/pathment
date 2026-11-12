'use strict';

/**
 * A mentee moved between clans keeps their work.
 *
 * `reassignMentee` kept the enrolment on a same-programme move, and kept the
 * tasks with it, which reads like the work moves too. It did not. Every
 * clan-scoped query filters `assigned_tasks.clan_id`, and that still named the
 * clan they had just left — so the mentee arrived in an empty clan, the new
 * mentor had nothing to review, and the history was reachable from neither
 * side. Silent, and the kind of silent that looks like the mentee never did
 * anything.
 *
 * Standing clans already had this problem and already solved it, by COPYING
 * the work rather than re-pointing it. Copying is the part that matters: the
 * old programme's record has certificates issued against it, and emptying it
 * would change what they say.
 */

const { models, sequelize } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const {
  cleanDb, createAdmin, createMentor, createMentee, createProgram, createEnrollment,
  createRoadmap, createRoadmapTask, createAssignedTask,
} = require('../helpers/seed');

describe('reassigning a mentee between clans', () => {
  let admin, mentorA, mentorB, program, clanA, clanB, mentee, enrollment, task;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin({ email: `rk-admin-${Date.now()}@test.com` });
    mentorA = await createMentor({ email: `rk-a-${Date.now()}@test.com` });
    mentorB = await createMentor({ email: `rk-b-${Date.now()}@test.com` });
    program = await createProgram({ createdBy: admin.id, name: 'Full Stack' });

    clanA = await models.Clan.create({
      programId: program.id, name: 'Clan A', leadMentorId: mentorA.id, createdBy: admin.id,
    });
    clanB = await models.Clan.create({
      programId: program.id, name: 'Clan B', leadMentorId: mentorB.id, createdBy: admin.id,
    });
    await clanService.addMember(clanA.id, { userId: mentorA.id, role: 'lead_mentor' });
    await clanService.addMember(clanB.id, { userId: mentorB.id, role: 'lead_mentor' });

    mentee = await createMentee({ email: `rk-mentee-${Date.now()}@test.com` });
    enrollment = await createEnrollment({ menteeId: mentee.id, programId: program.id, status: 'active' });
    await clanService.addMember(clanA.id, { userId: mentee.id, role: 'mentee' });

    const roadmap = await createRoadmap({ programId: program.id, createdBy: admin.id });
    const rt = await createRoadmapTask({ roadmapId: roadmap.id });
    task = await createAssignedTask({
      menteeId: mentee.id, mentorId: mentorA.id, roadmapTaskId: rt.id,
      enrollmentId: enrollment.id, status: 'completed',
    });
    await task.update({ clanId: clanA.id });
  });

  it('carries the work into the new clan', async () => {
    const result = await clanService.reassignMentee(mentee.id, clanB.id, admin.id);

    expect(result.carried?.tasks).toBe(1);
    const copy = await models.AssignedTask.findOne({
      where: { clanId: clanB.id, menteeId: mentee.id, continuedFromTaskId: task.id },
    });
    expect(copy).toBeTruthy();
    // The status, not just the row: a finished task must still read finished.
    expect(copy.status).toBe('completed');
    // And it has to hang off an enrolment, or enrolment-filtered reads miss it.
    expect(copy.enrollmentId).toBeTruthy();
  });

  it('leaves the old clan\'s record exactly as it was', async () => {
    await clanService.reassignMentee(mentee.id, clanB.id, admin.id);

    await task.reload();
    expect(task.clanId).toBe(clanA.id);
    expect(task.status).toBe('completed');
  });

  it('does not copy anything twice when they are moved back', async () => {
    await clanService.reassignMentee(mentee.id, clanB.id, admin.id);
    await clanService.reassignMentee(mentee.id, clanA.id, admin.id);
    await clanService.reassignMentee(mentee.id, clanB.id, admin.id);

    const inB = await models.AssignedTask.count({
      where: { clanId: clanB.id, menteeId: mentee.id, continuedFromTaskId: task.id },
    });
    expect(inB).toBe(1);
  });

  /**
   * Across programmes the old enrolment and its tasks are wiped on purpose —
   * a different roadmap's work would mean nothing here — so there is nothing
   * to carry and nothing should be invented.
   */
  it('carries nothing across programmes, where the old work does not apply', async () => {
    const other = await createProgram({ createdBy: admin.id, name: 'Data' });
    const elsewhere = await models.Clan.create({
      programId: other.id, name: 'Elsewhere', leadMentorId: mentorB.id, createdBy: admin.id,
    });
    await clanService.addMember(elsewhere.id, { userId: mentorB.id, role: 'lead_mentor' });

    const result = await clanService.reassignMentee(mentee.id, elsewhere.id, admin.id);

    expect(result.carried).toBeNull();
    expect(result.wipedEnrollments).toContain(enrollment.id);
    const copies = await models.AssignedTask.count({ where: { clanId: elsewhere.id, menteeId: mentee.id } });
    expect(copies).toBe(0);
  });

  it('takes them off the old clan\'s roster', async () => {
    await clanService.reassignMentee(mentee.id, clanB.id, admin.id);

    const [left, joined] = await Promise.all([
      models.ClanMembership.findOne({ where: { clanId: clanA.id, userId: mentee.id, role: 'mentee' } }),
      models.ClanMembership.findOne({ where: { clanId: clanB.id, userId: mentee.id, role: 'mentee' } }),
    ]);
    expect(left.status).toBe('removed');
    expect(joined.status).toBe('active');
  });

  afterAll(async () => { await sequelize.close().catch(() => {}); });

  /**
   * A standing clan is not a season of a programme — it runs alongside one, and
   * joining it does not mean leaving anything. The admin dialog offered every
   * clan as a move target with nothing to tell the two kinds apart, so picking a
   * standing one looked like a plain bug: the right clan, the right button, and
   * a 400 back. The dialog now switches to Add for a standing destination, which
   * only works because of the two behaviours below.
   */
  describe('a standing clan is joined, not transferred into', () => {
    let standing;

    beforeEach(async () => {
      standing = await models.Clan.create({
        programId: program.id, name: 'Feisty Fetch Clan 2026', kind: 'standing',
        leadMentorId: mentorB.id, createdBy: admin.id,
      });
      await clanService.addMember(standing.id, { userId: mentorB.id, role: 'lead_mentor' });
    });

    it('refuses a transfer into one, and leaves the mentee where they were', async () => {
      await expect(clanService.reassignMentee(mentee.id, standing.id, admin.id))
        .rejects.toThrow(/without transferring them/i);

      const stayed = await models.ClanMembership.findOne({
        where: { clanId: clanA.id, userId: mentee.id, role: 'mentee' },
      });
      expect(stayed.status).toBe('active');
    });

    it('adds the mentee to it without disturbing the clan they are in', async () => {
      await clanService.addMember(standing.id, { userId: mentee.id, role: 'mentee' }, admin);

      const joined = await models.ClanMembership.findOne({
        where: { clanId: standing.id, userId: mentee.id, role: 'mentee' },
      });
      expect(joined).toBeTruthy();
      expect(joined.status).toBe('active');

      // The whole point of "add, not move": the original placement survives.
      const original = await models.ClanMembership.findOne({
        where: { clanId: clanA.id, userId: mentee.id, role: 'mentee' },
      });
      expect(original.status).toBe('active');
    });
  });

  /**
   * The admin actions themselves, not the mirror underneath them.
   *
   * mirror-no-duplicates covers the mirror's own rules. These check that the
   * two things an admin actually presses — Move mentee, and Add to clan for a
   * standing one — carry the work across EXACTLY once. A mentee seeing one
   * task twice is the symptom; the mirror being called with the wrong source,
   * or twice, is the cause, and that can only be seen from this level.
   */
  describe('moving a mentee carries their work exactly once', () => {
    /** Live (non-cancelled) rows for this mentee in a clan, by roadmap step. */
    const liveTasks = async (clanId) => models.AssignedTask.findAll({
      where: { clanId, menteeId: mentee.id, status: { [require('sequelize').Op.ne]: 'cancelled' } },
    });

    it('lands one copy in the new clan, not the original and a copy', async () => {
      await clanService.reassignMentee(mentee.id, clanB.id, admin.id);

      const inB = await liveTasks(clanB.id);
      expect(inB).toHaveLength(1);
      expect(inB[0].continuedFromTaskId).toBe(task.id);
      // The source is untouched, which is what makes the old record still true.
      const inA = await liveTasks(clanA.id);
      expect(inA).toHaveLength(1);
      expect(inA[0].id).toBe(task.id);
    });

    it('moving back does not copy their own task back on top of itself', async () => {
      await clanService.reassignMentee(mentee.id, clanB.id, admin.id);
      await clanService.reassignMentee(mentee.id, clanA.id, admin.id);

      // The task they started with is still the only live one in clan A.
      expect(await liveTasks(clanA.id)).toHaveLength(1);
    });

    it('does not duplicate a step the new clan had already assigned', async () => {
      // The receiving mentor gave the same roadmap step before the move.
      const duplicate = await createAssignedTask({
        menteeId: mentee.id, mentorId: mentorB.id, roadmapTaskId: task.roadmapTaskId,
        enrollmentId: enrollment.id, status: 'assigned',
      });
      await duplicate.update({ clanId: clanB.id });

      await clanService.reassignMentee(mentee.id, clanB.id, admin.id);

      const inB = await liveTasks(clanB.id);
      expect(inB).toHaveLength(1);
      expect(inB[0].id).toBe(duplicate.id);
    });

    it('a mentee with no work moves without carrying anything', async () => {
      const fresh = await createMentee({ email: `rk-fresh-${Date.now()}@test.com` });
      await createEnrollment({ menteeId: fresh.id, programId: program.id, status: 'active' });
      await clanService.addMember(clanA.id, { userId: fresh.id, role: 'mentee' });

      const result = await clanService.reassignMentee(fresh.id, clanB.id, admin.id);

      expect(result.reassigned).toBe(true);
      expect(result.carried?.tasks ?? 0).toBe(0);
      const theirs = await models.AssignedTask.findAll({ where: { clanId: clanB.id, menteeId: fresh.id } });
      expect(theirs).toHaveLength(0);
    });
  });

  describe('adding a mentee to a standing clan carries their work exactly once', () => {
    let standing2;

    beforeEach(async () => {
      standing2 = await models.Clan.create({
        programId: program.id, name: 'Standing continuation', kind: 'standing',
        leadMentorId: mentorB.id, createdBy: admin.id,
      });
      await clanService.addMember(standing2.id, { userId: mentorB.id, role: 'lead_mentor' });
    });

    const liveIn = async (clanId) => models.AssignedTask.findAll({
      where: { clanId, menteeId: mentee.id, status: { [require('sequelize').Op.ne]: 'cancelled' } },
    });

    it('brings one copy across and leaves the cohort task where it was', async () => {
      await clanService.addMember(standing2.id, { userId: mentee.id, role: 'mentee' }, admin);

      const inStanding = await liveIn(standing2.id);
      expect(inStanding).toHaveLength(1);
      expect(inStanding[0].continuedFromTaskId).toBe(task.id);
      expect(inStanding[0].status).toBe('completed');
      expect(await liveIn(clanA.id)).toHaveLength(1);
    });

    it('re-adding the same mentee does not give them the task twice', async () => {
      await clanService.addMember(standing2.id, { userId: mentee.id, role: 'mentee' }, admin);
      await clanService.addMember(standing2.id, { userId: mentee.id, role: 'mentee' }, admin).catch(() => {});

      expect(await liveIn(standing2.id)).toHaveLength(1);
    });
  });
});
