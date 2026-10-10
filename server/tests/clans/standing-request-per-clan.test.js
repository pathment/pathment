'use strict';

/**
 * A standing clan continues a CLAN, not a programme.
 *
 * The request was keyed on (mentor, programme) with a unique index allowing one
 * pending row per mentor per programme. That assumed a mentor runs one clan in
 * a programme, and they often do not: lead mentor of "Viral Loop Clan 2026" and
 * co-mentor of "Core Team 2026", both inside "Full Stack AI Engineering".
 *
 * So a request raised from Core Team made Viral Loop's banner read "Standing
 * clan requested" too, and the unique index meant Viral Loop could never get a
 * standing clan of its own. Two separate groups of people, two continuations.
 */

const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const standingClanService = require('../../src/services/standingClanService');
const { cleanDb, createAdmin, createMentor, createProgram } = require('../helpers/seed');

describe('standing clan requests are per clan', () => {
  let admin, mentor, other, program, viralLoop, coreTeam;

  beforeEach(async () => {
    await cleanDb();
    await models.StandingClanRequest.destroy({ where: {}, force: true });

    admin = await createAdmin({ email: 'admin@test.com' });
    mentor = await createMentor({ email: 'mentor@test.com' });
    other = await createMentor({ email: 'other@test.com' });

    program = await createProgram({ createdBy: admin.id });
    // The programme is closed — that is what makes a continuation possible.
    await program.update({ status: 'completed', closedAt: new Date() });

    viralLoop = await models.Clan.create({
      programId: program.id, name: 'Viral Loop Clan 2026', kind: 'cohort',
      leadMentorId: mentor.id, createdBy: admin.id,
    });
    coreTeam = await models.Clan.create({
      programId: program.id, name: 'Core Team 2026', kind: 'cohort', createdBy: admin.id,
    });
    // Lead of one, co-mentor of the other — the shape that broke.
    await clanService.addMember(viralLoop.id, { userId: mentor.id, role: 'lead_mentor' });
    await clanService.addMember(coreTeam.id, { userId: mentor.id, role: 'co_mentor' });
  });

  const ask = (clan, name) => standingClanService.request({
    programId: program.id, sourceClanId: clan.id, name, description: 'Keep going',
  }, mentor);

  describe('eligibility is listed per clan', () => {
    it('offers both clans the mentor runs in the closed programme', async () => {
      const eligible = await standingClanService.eligibleClans(mentor);
      expect(eligible.map((c) => c.clanName).sort())
        .toEqual(['Core Team 2026', 'Viral Loop Clan 2026']);
      for (const entry of eligible) expect(entry.program.id).toBe(program.id);
    });

    it('offers nothing to a mentor who runs neither', async () => {
      expect(await standingClanService.eligibleClans(other)).toEqual([]);
    });

    it('offers nothing while the programme is still open', async () => {
      await program.update({ status: 'published', closedAt: null });
      expect(await standingClanService.eligibleClans(mentor)).toEqual([]);
    });
  });

  describe('one request does not speak for the other clan', () => {
    it('records which clan it came from', async () => {
      const request = await ask(coreTeam, 'Core Team 2026 · Standing');
      expect(request.sourceClanId).toBe(coreTeam.id);
      expect(request.programId).toBe(program.id);
    });

    it('lets the SECOND clan request too — the bug', async () => {
      await ask(coreTeam, 'Core Team 2026 · Standing');
      const second = await ask(viralLoop, 'Viral Loop Clan 2026 · Standing');

      expect(second.sourceClanId).toBe(viralLoop.id);
      const open = await models.StandingClanRequest.findAll({
        where: { mentorId: mentor.id, status: 'pending' },
      });
      expect(open).toHaveLength(2);
      expect(open.map((r) => r.sourceClanId).sort()).toEqual([coreTeam.id, viralLoop.id].sort());
    });

    it('still refuses a SECOND request for the SAME clan', async () => {
      const first = await ask(coreTeam, 'Core Team 2026 · Standing');
      const again = await ask(coreTeam, 'Core Team again');
      // Idempotent rather than an error: a retry gets the pending request back.
      expect(again.id).toBe(first.id);
      expect(await models.StandingClanRequest.count({ where: { mentorId: mentor.id } })).toBe(1);
    });

    it('carries the source clan through the list, so a client can scope it', async () => {
      await ask(coreTeam, 'Core Team 2026 · Standing');
      const [row] = await standingClanService.list(mentor);
      expect(row.sourceClanId).toBe(coreTeam.id);
      expect(row.sourceClan?.name).toBe('Core Team 2026');
    });
  });

  describe('the standing clan keeps the source clan\'s mentor team', () => {
    /**
     * Requesting is not a promotion. A co-mentor who asks for a continuation
     * used to become its lead — over the head of the lead mentor who had
     * actually run the clan, and who was then left out of the new group
     * entirely.
     */
    let lead;
    beforeEach(async () => {
      lead = await createMentor({ email: 'lead@test.com' });
      await models.Clan.update({ leadMentorId: lead.id }, { where: { id: coreTeam.id } });
      await clanService.addMember(coreTeam.id, { userId: lead.id, role: 'lead_mentor' });
    });

    const approveFrom = async (clan) => {
      const request = await ask(clan, `${clan.name} · Standing`);
      await standingClanService.decide(request.id, 'approved', '', admin);
      return models.StandingClanRequest.findByPk(request.id);
    };

    it('keeps the lead mentor as lead, not the co-mentor who asked', async () => {
      const decided = await approveFrom(coreTeam);
      const created = await models.Clan.findByPk(decided.createdClanId);
      expect(created.leadMentorId).toBe(lead.id);
      expect(created.leadMentorId).not.toBe(mentor.id);
    });

    it('carries the requester across as the co-mentor they already were', async () => {
      const decided = await approveFrom(coreTeam);
      const membership = await models.ClanMembership.findOne({
        where: { clanId: decided.createdClanId, userId: mentor.id },
      });
      expect(membership).toBeTruthy();
      expect(membership.role).toBe('co_mentor');
    });

    it('still makes the requester lead when they ARE the lead', async () => {
      const decided = await approveFrom(viralLoop);
      const created = await models.Clan.findByPk(decided.createdClanId);
      expect(created.leadMentorId).toBe(mentor.id);
    });

    it('falls back to the requester when the source lead has been suspended', async () => {
      await lead.update({ status: 'suspended' });
      const decided = await approveFrom(coreTeam);
      const created = await models.Clan.findByPk(decided.createdClanId);
      // Better the requester leads than the clan has no lead at all.
      expect(created.leadMentorId).toBe(mentor.id);
    });
  });

  describe('it is still a clan they mentor', () => {
    it('refuses a clan the mentor has nothing to do with', async () => {
      await expect(standingClanService.request({
        programId: program.id, sourceClanId: coreTeam.id, name: 'Not mine', description: '',
      }, other)).rejects.toThrow(/clan you mentor/i);
    });

    it('refuses with no clan at all, rather than falling back to the programme', async () => {
      await expect(standingClanService.request({
        programId: program.id, name: 'Programme-wide', description: '',
      }, mentor)).rejects.toThrow(/which clan/i);
    });

    it('refuses when the clan is not in the programme given', async () => {
      const otherProgram = await createProgram({ createdBy: admin.id, name: 'Other' });
      await expect(standingClanService.request({
        programId: otherProgram.id, sourceClanId: coreTeam.id, name: 'Mismatch', description: '',
      }, mentor)).rejects.toThrow();
    });

    it('refuses a name that is blank', async () => {
      await expect(ask(coreTeam, '   ')).rejects.toThrow(/1–150 characters/i);
    });
  });
});

/**
 * History is linked, never moved.
 *
 * A mentee's past work stays in the clan where it happened. Re-pointing those
 * rows at the standing clan would empty the completed programme's record and
 * break the certificate awarded on it — the evidence reads them live. Copying
 * them would inflate the standing clan's activity with work done elsewhere,
 * and activity is the one thing a standing clan measures.
 *
 * So the record is shown, and only UNFINISHED work can be carried forward —
 * as new assignments the mentor chooses, not as migrated history.
 */
describe('carrying a mentee into a standing clan', () => {
  const { models: m } = require('../../src/db');
  let admin2, lead2, mentee2, program2, cohort, standing;

  beforeEach(async () => {
    await cleanDb();
    admin2 = await createAdmin({ email: 'a2@test.com' });
    lead2 = await createMentor({ email: 'l2@test.com' });
    mentee2 = await (require('../helpers/seed').createMentee)({ email: 'm2@test.com' });

    program2 = await createProgram({ createdBy: admin2.id });
    await program2.update({ status: 'completed', closedAt: new Date() });

    cohort = await m.Clan.create({ programId: program2.id, name: 'Cohort A', kind: 'cohort', leadMentorId: lead2.id, createdBy: admin2.id });
    standing = await m.Clan.create({ programId: program2.id, name: 'Cohort A · Standing', kind: 'standing', leadMentorId: lead2.id, createdBy: admin2.id });
    await clanService.addMember(cohort.id, { userId: lead2.id, role: 'lead_mentor' });
    await clanService.addMember(standing.id, { userId: lead2.id, role: 'lead_mentor' });
    await clanService.addMember(cohort.id, { userId: mentee2.id, role: 'mentee' });

    // Two finished, one left open, in the COHORT clan. Every assignment points
    // at a roadmap task — the column is NOT NULL.
    const { createRoadmap, createRoadmapTask } = require('../helpers/seed');
    const roadmap = await createRoadmap({ programId: program2.id, createdBy: admin2.id });
    let order = 0;
    for (const status of ['completed', 'completed', 'in_progress']) {
      order += 1;
      const roadmapTask = await createRoadmapTask({ roadmapId: roadmap.id, title: `Task ${status} ${order}`, taskOrder: order });
      await m.AssignedTask.create({
        organizationId: cohort.organizationId, clanId: cohort.id, menteeId: mentee2.id,
        mentorId: lead2.id, roadmapTaskId: roadmapTask.id, titleOverride: `Task ${status}`,
        status, assignedAt: new Date(), completedAt: status === 'completed' ? new Date() : null,
      });
    }
    await clanService.addMember(standing.id, { userId: mentee2.id, role: 'mentee' });
  });

  /**
   * A core-team clan is made of mentors who also learn. Only `role = 'mentee'`
   * accounts get a MenteeProfile at signup, so requiring one up front made that
   * whole roster unaddable to its own continuation — even though the ordinary
   * cohort path, which calls `ensureMenteeProfile`, had taken them all along.
   */
  it('adds a mentor-role account who learns as a mentee, creating their profile', async () => {
    const mentorWhoLearns = await createMentor({ email: 'learner@test.com' });
    expect(await m.MenteeProfile.count({ where: { userId: mentorWhoLearns.id } })).toBe(0);

    await standingClanService.addMenteesToStandingClan(standing.id, [mentorWhoLearns.id], lead2);

    const membership = await m.ClanMembership.findOne({
      where: { clanId: standing.id, userId: mentorWhoLearns.id, role: 'mentee' },
    });
    expect(membership).toBeTruthy();
    expect(await m.MenteeProfile.count({ where: { userId: mentorWhoLearns.id } })).toBe(1);
  });

  /**
   * 25 is a cohort's number. A standing clan is open-ended, and inheriting that
   * default meant a 34-person cohort could not be carried into its own
   * continuation — it filled at 25 and told the mentor to raise a capacity they
   * had no control over.
   */
  it('is created uncapped, so a whole cohort can be carried across', async () => {
    // The real path: approval is the only way a standing clan is made.
    const created = await clanService.createClan(
      { programId: program2.id, name: 'Via service · Standing', kind: 'standing', leadMentorId: lead2.id },
      admin2.id,
      { standingApproval: true },
    );
    expect(created.maxMentees).toBeNull();
  });

  it('still caps a cohort clan at 25', async () => {
    // A cohort cannot be created in a closed programme, so use an open one.
    const open = await createProgram({ createdBy: admin2.id, name: 'Still running' });
    const cohortClan = await clanService.createClan(
      { programId: open.id, name: 'A cohort', kind: 'cohort', leadMentorId: lead2.id },
      admin2.id,
    );
    expect(cohortClan.maxMentees).toBe(25);
  });

  it('still refuses somebody outside the organization', async () => {
    const outsider = await createMentor({ email: 'outsider-org@test.com' });
    await m.OrganizationMembership.destroy({ where: { userId: outsider.id } });
    await expect(standingClanService.addMenteesToStandingClan(standing.id, [outsider.id], lead2))
      .rejects.toThrow(/belong to your organization/i);
  });

  it('still refuses a suspended account', async () => {
    const suspended = await (require('../helpers/seed').createMentee)({ email: 'susp@test.com' });
    await suspended.update({ status: 'suspended' });
    await expect(standingClanService.addMenteesToStandingClan(standing.id, [suspended.id], lead2))
      .rejects.toThrow(/suspended/i);
  });

  it('does not move the work — the cohort keeps all of it', async () => {
    expect(await m.AssignedTask.count({ where: { clanId: cohort.id, menteeId: mentee2.id } })).toBe(3);
    expect(await m.AssignedTask.count({ where: { clanId: standing.id, menteeId: mentee2.id } })).toBe(0);
  });

  it('shows what they did before, without counting it here', async () => {
    const [record] = await standingClanService.priorRecord(standing.id, lead2);
    expect(record.menteeId).toBe(mentee2.id);
    expect(record.priorClans[0]).toMatchObject({
      clanName: 'Cohort A', tasksAssigned: 3, tasksCompleted: 2, tasksUnfinished: 1,
    });
  });

  it('offers only the unfinished work for carrying forward', async () => {
    const open = await standingClanService.unfinishedPriorWork(standing.id, mentee2.id, lead2);
    expect(open).toHaveLength(1);
    expect(open[0].titleOverride).toBe('Task in_progress');
  });

  it('carries it forward as NEW work, leaving the original alone', async () => {
    const [open] = await standingClanService.unfinishedPriorWork(standing.id, mentee2.id, lead2);
    const [carried] = await standingClanService.carryForward(standing.id, mentee2.id, [open.id], lead2);

    expect(carried.id).not.toBe(open.id);
    expect(carried.clanId).toBe(standing.id);
    expect(carried.status).toBe('assigned');
    // The original is untouched, so the completed programme still reports it.
    await open.reload();
    expect(open.clanId).toBe(cohort.id);
    expect(open.status).toBe('in_progress');
  });

  it('does not assign the same thing twice', async () => {
    const [open] = await standingClanService.unfinishedPriorWork(standing.id, mentee2.id, lead2);
    await standingClanService.carryForward(standing.id, mentee2.id, [open.id], lead2);
    await standingClanService.carryForward(standing.id, mentee2.id, [open.id], lead2);
    expect(await m.AssignedTask.count({ where: { clanId: standing.id, menteeId: mentee2.id } })).toBe(1);
  });

  it('refuses to carry forward completed work', async () => {
    const done = await m.AssignedTask.findOne({ where: { clanId: cohort.id, status: 'completed' } });
    await expect(standingClanService.carryForward(standing.id, mentee2.id, [done.id], lead2))
      .rejects.toThrow(/unfinished work/i);
  });
});
