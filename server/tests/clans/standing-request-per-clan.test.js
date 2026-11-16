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

    /**
     * Two clans in the programme, so there is a real choice to make — and the
     * error names them rather than just refusing.
     */
    it('asks which clan when the mentor runs more than one', async () => {
      await expect(standingClanService.request({
        programId: program.id, name: 'Programme-wide', description: '',
      }, mentor)).rejects.toThrow(/which clan this standing clan continues/i);
    });

    /**
     * ...but a mentor with ONE eligible clan has nothing to choose. Refusing
     * them was also what broke a frontend that predated the field: the client
     * and the API deploy separately, so the old UI was told to pick something
     * it never offered.
     */
    it('infers the clan when the mentor runs only one', async () => {
      const soloMentor = await createMentor({ email: 'solo-mentor@test.com' });
      await clanService.addMember(coreTeam.id, { userId: soloMentor.id, role: 'co_mentor' });

      const request = await standingClanService.request({
        programId: program.id, name: 'Core Team · Standing', description: '',
      }, soloMentor);
      expect(request.sourceClanId).toBe(coreTeam.id);
    });

    /**
     * The real-world case: the mentor runs two clans, the client has not been
     * redeployed with `sourceClanId`, and the banner they pressed was already
     * labelled with the clan they have selected. Asking them to choose is
     * asking about something on screen.
     */
    it('uses the clan selected in the sidebar when the form sends none', async () => {
      const request = await standingClanService.request({
        programId: program.id, activeClanId: viralLoop.id,
        name: 'Viral Loop Clan 2026 · Standing', description: '',
      }, mentor);
      expect(request.sourceClanId).toBe(viralLoop.id);
    });

    it('lets an explicit choice win over the sidebar', async () => {
      const request = await standingClanService.request({
        programId: program.id, sourceClanId: coreTeam.id, activeClanId: viralLoop.id,
        name: 'Core Team 2026 · Standing', description: '',
      }, mentor);
      expect(request.sourceClanId).toBe(coreTeam.id);
    });

    it('ignores a sidebar clan the mentor does not mentor', async () => {
      const strangerClan = await models.Clan.create({
        programId: program.id, name: 'Not mine', kind: 'cohort', createdBy: admin.id,
      });
      // Falls through to "ask", rather than silently using a clan they have
      // no claim on — the sidebar is a hint, never a grant.
      await expect(standingClanService.request({
        programId: program.id, activeClanId: strangerClan.id, name: 'Nope', description: '',
      }, mentor)).rejects.toThrow(/which clan this standing clan continues/i);
    });

    it('still refuses somebody who mentors no eligible clan', async () => {
      await expect(standingClanService.request({
        programId: program.id, name: 'Not mine', description: '',
      }, other)).rejects.toThrow(/clan you mentor/i);
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

  describe('whether an admin has to approve', () => {
    it('waits for an admin by default', async () => {
      expect(await standingClanService.requiresApproval()).toBe(true);
      const request = await ask(viralLoop, 'Viral Loop Clan 2026 · Standing');
      expect(request.status).toBe('pending');
    });

    it('switched off, the request approves itself and the clan opens with its mentees', async () => {
      const mentee = await (require('../helpers/seed').createMentee)({ email: 'learner@test.com' });
      await clanService.addMember(viralLoop.id, { userId: mentee.id, role: 'mentee' });
      await standingClanService.setRequiresApproval(false, admin);

      const request = await ask(viralLoop, 'Viral Loop Clan 2026 · Standing');
      expect(request.status).toBe('approved');
      expect(request.createdClanId).toBeTruthy();
      const clan = await models.Clan.findByPk(request.createdClanId);
      expect(clan.kind).toBe('standing');
      const seat = await models.ClanMembership.findOne({ where: { clanId: clan.id, userId: mentee.id, role: 'mentee' } });
      expect(seat).toBeTruthy();
    });

    it('only an admin can switch it', async () => {
      await expect(standingClanService.setRequiresApproval(false, mentor)).rejects.toThrow(/Only an admin/);
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
  const clanValidation = require('../../src/validations/clanValidation');
  let admin2, lead2, mentee2, program2, cohort, standing, roadmap;

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
    roadmap = await createRoadmap({ programId: program2.id, createdBy: admin2.id });
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

  it('accepts a roadmap-only continuation payload with an empty custom-task group', () => {
    const result = clanValidation.continueWorkBody.validate({
      roadmapIds: ['a656649f-0f3b-4000-84f1-ce2eb884c9fc'],
      taskIds: [],
    });
    expect(result.error).toBeUndefined();
  });

  it('rejects a continuation payload when both selection groups are empty', () => {
    const result = clanValidation.continueWorkBody.validate({ roadmapIds: [], taskIds: [] });
    expect(result.error?.message).toMatch(/select at least one/i);
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

  /**
   * An admin could approve a mentor's request for a standing clan and could
   * not make one themselves — the rule was written against the code path
   * rather than against authority, so the person who decides these was the
   * one person who could not act on the decision.
   */
  it('lets an ADMIN make one directly, without a request', async () => {
    const created = await clanService.createClan(
      { programId: program2.id, name: 'Admin made it', kind: 'standing', leadMentorId: lead2.id },
      admin2.id,
      { actor: admin2 },
    );
    expect(created.kind).toBe('standing');
    expect(created.maxMentees).toBeNull();
  });

  it('still refuses a non-admin asking for one directly', async () => {
    await expect(clanService.createClan(
      { programId: program2.id, name: 'Mentor made it', kind: 'standing', leadMentorId: lead2.id },
      lead2.id,
      { actor: lead2 },
    )).rejects.toThrow(/approving a mentor request/i);
  });

  it('still refuses when nobody is named at all', async () => {
    await expect(clanService.createClan(
      { programId: program2.id, name: 'Nobody made it', kind: 'standing' },
      admin2.id,
    )).rejects.toThrow(/approving a mentor request/i);
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

  it('previews a roadmap at its first unfinished step', async () => {
    const preview = await standingClanService.continuationPreview(standing.id, mentee2.id, lead2);

    expect(preview.roadmaps).toHaveLength(1);
    expect(preview.roadmaps[0]).toMatchObject({
      roadmapId: roadmap.id,
      totalSteps: 3,
      completedSteps: 2,
      resumeIndex: 2,
      resumeStep: { title: 'Task in_progress 3', previousStatus: 'in_progress' },
      sourceClanName: 'Cohort A',
    });
  });

  it('continues a roadmap with fresh progress and is safe to retry', async () => {
    const source = await m.AssignedTask.findOne({ where: { clanId: cohort.id, status: 'in_progress' } });
    const first = await standingClanService.continueWork(
      standing.id, mentee2.id, { roadmapIds: [roadmap.id] }, lead2,
    );
    const retry = await standingClanService.continueWork(
      standing.id, mentee2.id, { roadmapIds: [roadmap.id] }, lead2,
    );

    expect(first).toMatchObject({ createdCount: 1, reusedCount: 0 });
    expect(retry).toMatchObject({ createdCount: 0, reusedCount: 1 });
    const continued = await m.AssignedTask.findOne({
      where: { clanId: standing.id, menteeId: mentee2.id, continuedFromTaskId: source.id },
    });
    expect(continued).toMatchObject({ status: 'assigned', enrollmentId: null, roadmapTaskId: source.roadmapTaskId });
    expect(await m.AssignedTask.count({ where: { clanId: standing.id, menteeId: mentee2.id } })).toBe(1);
    expect(await m.RoadmapProgress.findOne({ where: { clanId: standing.id, menteeId: mentee2.id, roadmapId: roadmap.id } }))
      .toMatchObject({ currentStep: 2, completed: false, enrollmentId: null });
    expect(await source.reload()).toMatchObject({ clanId: cohort.id, status: 'in_progress' });
    // Once continued, the preview deliberately stops offering the same roadmap,
    // while an identical network retry safely returns the existing assignment.
    expect(await standingClanService.continuationPreview(standing.id, mentee2.id, lead2))
      .toMatchObject({ roadmaps: [] });
  });

  it('copies a custom task definition and resources without touching history', async () => {
    const template = await m.RoadmapTask.create({
      title: 'Original title', description: 'Original brief', type: 'project', difficulty: 'hard',
      taskOrder: 0, deliverable: 'Repository', acceptanceCriteria: ['Tests pass'], estimatedHours: 8,
      isMandatory: false, isCustomTask: true, pointsBase: 20,
    });
    await m.TaskResource.create({
      roadmapTaskId: template.id, title: 'Reference', resourceType: 'link', url: 'https://example.com', displayOrder: 0,
    });
    const source = await m.AssignedTask.create({
      clanId: cohort.id, menteeId: mentee2.id, mentorId: lead2.id, roadmapTaskId: template.id,
      isCustomTask: true, status: 'completed', titleOverride: 'Tailored title', pointsBase: 20,
    });

    const preview = await standingClanService.continuationPreview(standing.id, mentee2.id, lead2);
    expect(preview.customTasks.find((task) => task.sourceTaskId === source.id)).toMatchObject({
      title: 'Tailored title', status: 'completed', supported: true,
    });
    await standingClanService.continueWork(
      standing.id, mentee2.id, { taskIds: [source.id], dueDate: '2030-01-15' }, lead2,
    );

    const continued = await m.AssignedTask.findOne({
      where: { clanId: standing.id, menteeId: mentee2.id, continuedFromTaskId: source.id },
      include: [{ model: m.RoadmapTask, as: 'roadmapTask', include: [{ model: m.TaskResource, as: 'resources' }] }],
    });
    expect(continued.id).not.toBe(source.id);
    expect(continued.roadmapTaskId).not.toBe(template.id);
    expect(continued.roadmapTask).toMatchObject({ title: 'Tailored title', description: 'Original brief', isCustomTask: true });
    expect(continued.roadmapTask.resources).toHaveLength(1);
    expect(continued.roadmapTask.resources[0]).toMatchObject({ title: 'Reference', url: 'https://example.com' });
    expect(await source.reload()).toMatchObject({ clanId: cohort.id, status: 'completed', roadmapTaskId: template.id });
  });
});

/**
 * Joining a standing clan brings your work with you.
 *
 * The continuation machinery already existed behind a button the mentor had to
 * press, picking roadmaps and tasks by hand. "Carry their work over" is the
 * answer every time somebody joins a continuation clan, so adding them now does
 * it — resuming each roadmap at the step they had reached.
 *
 * The flag is the whole safety story: migration 126 opted every clan that
 * already existed OUT, so standing clans approved before this shipped keep
 * behaving exactly as they did.
 */
describe('work carries over automatically on join', () => {
  const { models: m } = require('../../src/db');
  const { createRoadmap, createRoadmapTask, createMentee } = require('../helpers/seed');
  let admin3, lead3, otherMentor, strangerMentor, joiner, program3, cohort3, standing3;

  /**
   * Unfinished roadmap work in the cohort, set by `mentor`.
   *
   * Who set it is the whole question for the automatic carry, so every test
   * here seeds through this and says which mentor it is naming.
   */
  const seedRoadmapWorkBy = async (mentor, label) => {
    const roadmap = await createRoadmap({ programId: program3.id, createdBy: admin3.id, name: `${label} roadmap` });
    for (const [i, status] of [['1', 'completed'], ['2', 'in_progress']]) {
      const step = await createRoadmapTask({ roadmapId: roadmap.id, title: `${label} step ${i}`, taskOrder: Number(i) });
      await m.AssignedTask.create({
        organizationId: cohort3.organizationId, clanId: cohort3.id, menteeId: joiner.id,
        mentorId: mentor.id, roadmapTaskId: step.id, status,
        assignedAt: new Date(), completedAt: status === 'completed' ? new Date() : null,
      });
    }
    return roadmap;
  };

  beforeEach(async () => {
    await cleanDb();
    admin3 = await createAdmin({ email: 'a3@test.com' });
    lead3 = await createMentor({ email: 'l3@test.com' });
    otherMentor = await createMentor({ email: 'other3@test.com' });
    strangerMentor = await createMentor({ email: 'stranger3@test.com' });
    joiner = await createMentee({ email: 'joiner@test.com' });

    program3 = await createProgram({ createdBy: admin3.id });
    await program3.update({ status: 'completed', closedAt: new Date() });

    cohort3 = await m.Clan.create({ programId: program3.id, name: 'Cohort C', kind: 'cohort', leadMentorId: lead3.id, createdBy: admin3.id });
    standing3 = await m.Clan.create({ programId: program3.id, name: 'Cohort C · Standing', kind: 'standing', leadMentorId: lead3.id, createdBy: admin3.id });
    await clanService.addMember(cohort3.id, { userId: lead3.id, role: 'lead_mentor' });
    await clanService.addMember(standing3.id, { userId: lead3.id, role: 'lead_mentor' });
    await clanService.addMember(cohort3.id, { userId: joiner.id, role: 'mentee' });
    // `otherMentor` came across with the mentee as a co-mentor, and a co-mentor
    // counts: the work they set is still being continued by the person who set
    // it. `strangerMentor` stays behind in the cohort.
    await clanService.addMember(cohort3.id, { userId: otherMentor.id, role: 'co_mentor' });
    await clanService.addMember(standing3.id, { userId: otherMentor.id, role: 'co_mentor' });
    await clanService.addMember(cohort3.id, { userId: strangerMentor.id, role: 'co_mentor' });

    await seedRoadmapWorkBy(otherMentor, 'Carried');
  });

  const carriedInto = (clanId) => m.AssignedTask.count({
    where: { clanId, menteeId: joiner.id, continuedFromTaskId: { [require('sequelize').Op.ne]: null } },
  });

  it('carries their work when the clan opts in', async () => {
    expect(standing3.autoContinueOnJoin).toBe(true);
    await standingClanService.addMenteesToStandingClan(standing3.id, [joiner.id], lead3);

    expect(await carriedInto(standing3.id)).toBeGreaterThan(0);
  });

  /**
   * `autoContinueOnJoin` no longer decides whether work comes across.
   *
   * It governed the old carry, which ASSIGNED the next roadmap step — new
   * work, so an opt-out made sense and migration 126 set it false on every
   * clan that already existed. Copying somebody's existing record into the
   * clan they are now in is not new work, and the opt-out is what left
   * production with 2,151 stranded tasks: the flag was false on every clan
   * whose roster was adopted, so nothing followed anybody.
   */
  it('carries their work even on a clan that never opted in', async () => {
    await standing3.update({ autoContinueOnJoin: false });
    await standingClanService.addMenteesToStandingClan(standing3.id, [joiner.id], lead3);

    expect(await carriedInto(standing3.id)).toBeGreaterThan(0);
    expect(await m.ClanMembership.count({
      where: { clanId: standing3.id, userId: joiner.id, role: 'mentee', status: 'active' },
    })).toBe(1);
  });

  it('keeps whoever originally set the work as its mentor', async () => {
    await standingClanService.addMenteesToStandingClan(standing3.id, [joiner.id], lead3);
    const carried = await m.AssignedTask.findAll({
      where: { clanId: standing3.id, menteeId: joiner.id, continuedFromTaskId: { [require('sequelize').Op.ne]: null } },
      attributes: ['mentorId'],
    });
    expect(carried.length).toBeGreaterThan(0);
    // Not lead3, who did the adding — otherMentor, who set the work.
    for (const row of carried) expect(row.mentorId).toBe(otherMentor.id);
  });

  it('still adds the mentee when nothing can be carried', async () => {
    const fresh = await createMentee({ email: 'nohistory@test.com' });
    await expect(
      standingClanService.addMenteesToStandingClan(standing3.id, [fresh.id], lead3),
    ).resolves.toBeTruthy();
    expect(await m.ClanMembership.count({
      where: { clanId: standing3.id, userId: fresh.id, role: 'mentee', status: 'active' },
    })).toBe(1);
  });

  it('does not duplicate work when the same mentee is added again', async () => {
    await standingClanService.addMenteesToStandingClan(standing3.id, [joiner.id], lead3);
    const first = await carriedInto(standing3.id);
    await standingClanService.addMenteesToStandingClan(standing3.id, [joiner.id], lead3);
    expect(await carriedInto(standing3.id)).toBe(first);
  });

  /**
   * The automatic carry is "the same mentor keeps going with the same mentee",
   * not "take everything". Work set by somebody who did not come across is a
   * judgement for a person: the new mentor has not read the submissions or the
   * feedback behind it. It stays available on the manual button, which is
   * exactly what `continuationPreview` still offering it means.
   */
  /**
   * Every mentor's work comes, not only the team's.
   *
   * This used to carry work ONLY when the mentor who set it had come across
   * too, and hold the rest behind a manual button for a person who might
   * never arrive. That was the right call while the carry meant "assign them
   * the next step" — somebody has to own new work. It is the wrong call for
   * a clan that is simply continuing: production ended up with 2,151 tasks
   * stranded in frozen cohort clans and 103 mentees looking at an empty
   * screen, because the gate held and nobody pressed the button.
   *
   * So everything comes. What the gate protected is kept in a different way:
   * a copy whose mentor did NOT come across is re-pointed at this clan's
   * lead, so it is still somebody's to review rather than belonging to a
   * stranger and appearing in nobody's queue.
   */
  describe('whose work comes across', () => {
    beforeEach(async () => {
      await seedRoadmapWorkBy(strangerMentor, 'Held');
    });

    it('carries the stranger\'s work too, re-pointed at the lead', async () => {
      await standingClanService.addMenteesToStandingClan(standing3.id, [joiner.id], lead3);
      const carried = await m.AssignedTask.findAll({
        where: { clanId: standing3.id, menteeId: joiner.id, continuedFromTaskId: { [require('sequelize').Op.ne]: null } },
        attributes: ['mentorId'],
      });
      expect(carried.length).toBeGreaterThan(0);
      // The stranger never joined, so none of it is left owned by them.
      expect(carried.some((row) => row.mentorId === strangerMentor.id)).toBe(false);
      // Their work is here, under the lead who is now responsible for it.
      expect(carried.some((row) => row.mentorId === lead3.id)).toBe(true);
      // And the team's own work keeps the mentor who set it.
      expect(carried.some((row) => row.mentorId === otherMentor.id)).toBe(true);
    });

    it('carries it even when no mentor came across at all', async () => {
      await m.AssignedTask.update(
        { mentorId: strangerMentor.id },
        { where: { clanId: cohort3.id, menteeId: joiner.id } },
      );
      await standingClanService.addMenteesToStandingClan(standing3.id, [joiner.id], lead3);

      expect(await carriedInto(standing3.id)).toBeGreaterThan(0);
      expect(await m.ClanMembership.count({
        where: { clanId: standing3.id, userId: joiner.id, role: 'mentee', status: 'active' },
      })).toBe(1);
    });

    it('keeps the mentor who set the work when they are on this team', async () => {
      await m.AssignedTask.update(
        { mentorId: lead3.id },
        { where: { clanId: cohort3.id, menteeId: joiner.id, mentorId: strangerMentor.id } },
      );
      await standingClanService.addMenteesToStandingClan(standing3.id, [joiner.id], lead3);

      const carried = await m.AssignedTask.findAll({
        where: { clanId: standing3.id, menteeId: joiner.id, continuedFromTaskId: { [require('sequelize').Op.ne]: null } },
        attributes: ['mentorId'],
      });
      const owners = [...new Set(carried.map((row) => row.mentorId))].sort();
      expect(owners).toEqual([lead3.id, otherMentor.id].sort());
    });
  });
});

/**
 * What an APPROVAL carries, as opposed to an ad-hoc join.
 *
 * Every test above adds one mentee by hand. Approval is the other door and
 * the one the issue is about: a mentor asks to continue their clan, an admin
 * says yes, and the whole roster arrives. The question nobody had written
 * down is what happens to the work those people were in the middle of.
 */
describe('approving a standing-clan request brings the unfinished work with it', () => {
  const { models: m } = require('../../src/db');
  const { Op } = require('sequelize');
  const { createRoadmap, createRoadmapTask, createMentee } = require('../helpers/seed');
  let admin4, lead4, stranger4, menteeA, program4, cohort4;

  const seedWorkBy = async (mentor, mentee, label) => {
    const roadmap = await createRoadmap({ programId: program4.id, createdBy: admin4.id, name: `${label} roadmap` });
    for (const [order, status] of [[1, 'completed'], [2, 'in_progress'], [3, 'assigned']]) {
      const step = await createRoadmapTask({ roadmapId: roadmap.id, title: `${label} ${order}`, taskOrder: order });
      await m.AssignedTask.create({
        organizationId: cohort4.organizationId, clanId: cohort4.id, menteeId: mentee.id,
        mentorId: mentor.id, roadmapTaskId: step.id, status,
        assignedAt: new Date(), completedAt: status === 'completed' ? new Date() : null,
      });
    }
    return roadmap;
  };

  beforeEach(async () => {
    await cleanDb();
    admin4 = await createAdmin({ email: 'a4@test.com' });
    lead4 = await createMentor({ email: 'l4@test.com' });
    stranger4 = await createMentor({ email: 's4@test.com' });
    menteeA = await createMentee({ email: 'm4a@test.com' });

    program4 = await createProgram({ createdBy: admin4.id });
    cohort4 = await m.Clan.create({
      programId: program4.id, name: 'Cohort D', kind: 'cohort',
      leadMentorId: lead4.id, createdBy: admin4.id,
    });
    await clanService.addMember(cohort4.id, { userId: lead4.id, role: 'lead_mentor' });
    await clanService.addMember(cohort4.id, { userId: stranger4.id, role: 'co_mentor' });
    await clanService.addMember(cohort4.id, { userId: menteeA.id, role: 'mentee' });
    await program4.update({ status: 'completed', closedAt: new Date() });
  });

  const approve = async () => {
    const request = await standingClanService.request({
      sourceClanId: cohort4.id, name: 'Cohort D · Standing', reason: 'carry on',
    }, lead4);
    return standingClanService.decide(request.id, 'approved', 'yes', admin4);
  };

  const carried = (clanId, menteeId) => m.AssignedTask.findAll({
    where: { clanId, menteeId, continuedFromTaskId: { [Op.ne]: null } },
    include: [{ model: m.RoadmapTask, as: 'roadmapTask', attributes: ['title'] }],
  });

  it('carries work the approving mentor set', async () => {
    await seedWorkBy(lead4, menteeA, 'Lead');
    const saved = await approve();

    const rows = await carried(saved.createdClanId, menteeA.id);
    expect(rows.length).toBeGreaterThan(0);
  });

  /**
   * The case the issue is actually about.
   *
   * Work set by a mentor who is NOT on the new team was held back for a
   * manual button — a deliberate rule for somebody added one at a time, where
   * handing a half-finished roadmap to a mentor who has not read the
   * submissions is a judgement. On an approval it is the wrong rule: the whole
   * clan is continuing, nothing is changing hands, and the mentee would arrive
   * with an empty plan and no way to finish what they had started.
   *
   * The mentor here has LEFT the source clan, which is the only way to be
   * genuinely absent from the new team — approval carries the source clan's
   * whole mentor team across, so a serving co-mentor is never a stranger. A
   * mentor who taught for a while and moved on, leaving open work behind, is
   * the realistic version of this.
   */
  it('carries work whose mentor has left, re-pointed at the lead', async () => {
    await seedWorkBy(stranger4, menteeA, 'Departed');
    await m.ClanMembership.update(
      { status: 'removed' },
      { where: { clanId: cohort4.id, userId: stranger4.id } },
    );

    const saved = await approve();

    const rows = await carried(saved.createdClanId, menteeA.id);
    expect(rows.length).toBeGreaterThan(0);
    // Keeping the departed mentor would leave the mentee able to submit work
    // that nobody in the clan can review.
    expect(rows.every((r) => r.mentorId === lead4.id)).toBe(true);
    expect(rows.some((r) => r.mentorId === stranger4.id)).toBe(false);
  });

  /**
   * ...and the rule it does NOT change: one mentee added by hand still only
   * gets the work whose mentor came with them.
   */
  /**
   * It used to be held back for a mentor who had left. Nobody arrives to
   * press the button, so the work simply stayed invisible; it comes across
   * now with the lead as its owner.
   */
  it('carries a departed mentor\'s work when one mentee is added by hand', async () => {
    await seedWorkBy(stranger4, menteeA, 'Departed');
    await m.ClanMembership.update(
      { status: 'removed' },
      { where: { clanId: cohort4.id, userId: stranger4.id } },
    );
    const standing = await m.Clan.create({
      programId: program4.id, name: 'Hand-made standing', kind: 'standing',
      leadMentorId: lead4.id, createdBy: admin4.id,
    });
    await clanService.addMember(standing.id, { userId: lead4.id, role: 'lead_mentor' });

    await standingClanService.addMenteesToStandingClan(standing.id, [menteeA.id], lead4);

    const rows = await carried(standing.id, menteeA.id);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.mentorId).toBe(lead4.id);
  });

  /**
   * The original is what matters here. A copy of completed work now appears
   * in the standing clan — that is the point, the mentee should see what
   * they did — but the row the finished programme's record and its
   * certificate read must still be sitting in the cohort clan, untouched.
   */
  it('leaves the completed work where it was earned, and copies it across', async () => {
    await seedWorkBy(lead4, menteeA, 'Lead');
    const saved = await approve();

    // The certificate for the finished programme reads these rows live.
    const stillThere = await m.AssignedTask.count({
      where: { clanId: cohort4.id, menteeId: menteeA.id, status: 'completed' },
    });
    expect(stillThere).toBe(1);
    const movedCompleted = await m.AssignedTask.count({
      where: { clanId: saved.createdClanId, menteeId: menteeA.id, status: 'completed' },
    });
    expect(movedCompleted).toBe(1);
  });

  it('gives the mentee something they can actually submit', async () => {
    await seedWorkBy(lead4, menteeA, 'Lead');
    const saved = await approve();

    const rows = await carried(saved.createdClanId, menteeA.id);
    // Every copy is stamped with this clan and owned by this mentee…
    expect(rows.every((r) => r.clanId === saved.createdClanId)).toBe(true);
    expect(rows.every((r) => r.menteeId === menteeA.id)).toBe(true);
    // …and the unfinished ones arrive live, not as a read-only trace. The
    // finished ones keep the status they earned, which is the whole point of
    // copying rather than re-assigning.
    const live = rows.filter((r) => r.status !== 'completed');
    expect(live.length).toBeGreaterThan(0);
    expect(live.every((r) => ['assigned', 'in_progress'].includes(r.status))).toBe(true);
  });

  /**
   * And submitting it actually works.
   *
   * The structural check above would pass on a task the mentee can see and
   * cannot touch, which is the failure worth guarding: the source programme
   * is CLOSED, carried rows are created with no enrolment, and either of
   * those is the sort of thing a writability check keys on. Carried work that
   * cannot be submitted is the same dead end as work that never came.
   */
  it('and the mentee can submit it, and the mentor can see it waiting', async () => {
    await seedWorkBy(lead4, menteeA, 'Lead');
    const saved = await approve();
    // The unfinished one — a completed copy is not meant to be submittable.
    const task = (await carried(saved.createdClanId, menteeA.id))
      .find((r) => r.status !== 'completed');
    expect(task).toBeTruthy();

    const taskService = require('../../src/services/taskService');
    await taskService.submitTask(task.id, menteeA.id, {
      submissionText: 'Finished this in the continuation',
      submissionUrls: ['https://github.com/example/pr/1'],
    });

    const after = await m.AssignedTask.findByPk(task.id);
    expect(after.status).toBe('submitted');
    expect(after.clanId).toBe(saved.createdClanId);
    // It has to land in a queue somebody here owns, or nobody reviews it.
    expect([lead4.id, admin4.id]).toContain(after.mentorId);
  });
});
