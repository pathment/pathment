'use strict';

/**
 * Chained org roadmaps reach the copies mentors actually assign.
 *
 * An admin chains org roadmaps once (Month 1 -> Month 2). Mentors import their
 * own copies and assign those, and an import does not copy links, so finishing
 * a copy must follow the org roadmap's chain: to the mentor's copy of the next
 * month if they imported it, otherwise to the org roadmap itself. A copy that
 * has its own links keeps them, and roadmaps with no chain behave as before.
 */

const { models } = require('../../src/db');
const seed = require('../helpers/seed');
const svc = require('../../src/services/linearRoadmapService');

let ctx;

const step = (title) => ({ title, description: `<p>${title}</p>`, type: 'project', difficulty: 'medium', dueOffsetDays: 3, deliverable: 'A link', criteria: ['Done'] });

/** Approve every step of `roadmapId` for the mentee, in order, as a mentor would. */
async function finish(roadmapId, menteeId) {
  const steps = await svc.getSteps(roadmapId);
  let result = null;
  for (const s of steps) {
    const task = await models.AssignedTask.findOne({ where: { roadmapTaskId: s.id, menteeId } });
    expect(task).toBeTruthy();
    await task.update({ status: 'completed', completedAt: new Date() });
    result = await svc.advanceOnApproval(menteeId, s.id);
  }
  return result;
}

const firstStepAssigned = async (roadmapId, menteeId) => {
  const [first] = await svc.getSteps(roadmapId);
  return models.AssignedTask.findOne({ where: { roadmapTaskId: first.id, menteeId } });
};

beforeEach(async () => {
  await seed.cleanDb();
  const admin = await seed.createAdmin();
  const mentor = await seed.createMentor();
  const mentee = await seed.createMentee();
  const program = await seed.createProgram({ createdBy: admin.id, name: 'Fellowship' });
  const clan = await seed.createClan({ programId: program.id, createdBy: admin.id, leadMentor: mentor, mentees: [mentee] });
  const month1 = await svc.createOrgRoadmap(admin.id, { name: 'Month 1', programId: program.id, steps: [step('Week 1'), step('Week 2')] });
  const month2 = await svc.createOrgRoadmap(admin.id, { name: 'Month 2', programId: program.id, steps: [step('Week 5'), step('Week 6')] });
  await svc.setNextLinks(admin.id, month1.id, [month2.id]);
  ctx = { admin, mentor, mentee, program, clan, month1, month2 };
});

describe('finishing a mentor\'s copy of a chained org roadmap', () => {
  it('assigns the mentor\'s own copy of the next month', async () => {
    const copy1 = await svc.importOrgRoadmap(ctx.mentor.id, ctx.month1.id);
    const copy2 = await svc.importOrgRoadmap(ctx.mentor.id, ctx.month2.id);
    await svc.assignToMentee(ctx.mentor.id, copy1.id, ctx.mentee.id, 0, null, null, null, null, ctx.clan.id);

    const result = await finish(copy1.id, ctx.mentee.id);

    expect(result).toEqual({ completed: true, chainedTo: copy2.id });
    const next = await firstStepAssigned(copy2.id, ctx.mentee.id);
    expect(next).toMatchObject({ status: 'assigned', mentorId: ctx.mentor.id, clanId: ctx.clan.id });
    expect(await firstStepAssigned(ctx.month2.id, ctx.mentee.id)).toBeNull();
  });

  it('assigns the org roadmap when nobody on the clan team imported the next month', async () => {
    const copy1 = await svc.importOrgRoadmap(ctx.mentor.id, ctx.month1.id);
    // Another mentor's copy, outside this clan team, is not used.
    const stranger = await seed.createMentor({ email: 'stranger-mentor@test.com' });
    await svc.importOrgRoadmap(stranger.id, ctx.month2.id);
    await svc.assignToMentee(ctx.mentor.id, copy1.id, ctx.mentee.id, 0, null, null, null, null, ctx.clan.id);

    const result = await finish(copy1.id, ctx.mentee.id);

    expect(result).toEqual({ completed: true, chainedTo: ctx.month2.id });
    expect(await firstStepAssigned(ctx.month2.id, ctx.mentee.id)).toMatchObject({ status: 'assigned', clanId: ctx.clan.id });
  });

  it('keeps the copy\'s own links when the mentor set them', async () => {
    const copy1 = await svc.importOrgRoadmap(ctx.mentor.id, ctx.month1.id);
    const other = await svc.createRoadmap(ctx.mentor.id, { name: 'Detour', programId: ctx.program.id, steps: [step('Detour')] });
    await svc.setNextLinks(ctx.mentor.id, copy1.id, [other.id]);
    await svc.assignToMentee(ctx.mentor.id, copy1.id, ctx.mentee.id, 0, null, null, null, null, ctx.clan.id);

    const result = await finish(copy1.id, ctx.mentee.id);

    expect(result).toEqual({ completed: true, chainedTo: other.id });
    expect(await firstStepAssigned(ctx.month2.id, ctx.mentee.id)).toBeNull();
  });

  it('still chains the org roadmaps themselves, and leaves unchained roadmaps alone', async () => {
    await svc.assignToMentee(ctx.mentor.id, ctx.month1.id, ctx.mentee.id, 0, null, null, null, null, ctx.clan.id);
    expect(await finish(ctx.month1.id, ctx.mentee.id)).toEqual({ completed: true, chainedTo: ctx.month2.id });
    // Month 2 is the end of the chain.
    expect(await finish(ctx.month2.id, ctx.mentee.id)).toEqual({ completed: true });

    // An imported copy of an unchained org roadmap finishes with nothing next.
    const lone = await svc.createOrgRoadmap(ctx.admin.id, { name: 'Standalone', programId: ctx.program.id, steps: [step('Only')] });
    const loneCopy = await svc.importOrgRoadmap(ctx.mentor.id, lone.id);
    await svc.assignToMentee(ctx.mentor.id, loneCopy.id, ctx.mentee.id, 0, null, null, null, null, ctx.clan.id);
    expect(await finish(loneCopy.id, ctx.mentee.id)).toEqual({ completed: true });
  });
});
