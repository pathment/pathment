'use strict';

/**
 * Mentees were seeing the same task twice in their standing clan.
 *
 * Every copy points back at its source, so one piece of work is a chain:
 * cohort original → standing copy → copy of that copy. The mirror used to ask
 * only "has THIS row been copied here?", so the second time somebody's work was
 * mirrored the original and its earlier copy both looked new and both came
 * across. On production that was ~200 doubled tasks across ~38 mentees. These
 * lock in one row per chain per clan, whatever order people move in.
 */

const { sequelize, models } = require('../../src/db');
const { mirrorPriorWork } = require('../../src/services/standingWorkMirror');
const { cleanDb, createMentor, createMentee, createProgram } = require('../helpers/seed');

describe('mirroring never duplicates a task inside a clan', () => {
  let mentor, mentee, program, cohort, standingA, standingB, step;

  const clan = (name, kind) => models.Clan.create({
    programId: program.id, name, kind, leadMentorId: mentor.id, createdBy: mentor.id,
  });

  beforeEach(async () => {
    await cleanDb();
    mentor = await createMentor({ email: 'dup-mentor@test.com' });
    mentee = await createMentee({ email: 'dup-mentee@test.com' });
    program = await createProgram({ createdBy: mentor.id });
    cohort = await clan('Cohort', 'cohort');
    standingA = await clan('Standing A', 'standing');
    standingB = await clan('Standing B', 'standing');
    const roadmap = await models.Roadmap.create({ programId: program.id, name: 'R', createdBy: mentor.id });
    step = await models.RoadmapTask.create({
      roadmapId: roadmap.id, title: 'Ship it', type: 'assignment', taskOrder: 1,
      description: 'Build it', difficulty: 'medium', deliverable: 'A repo',
    });
    await models.AssignedTask.create({
      menteeId: mentee.id, mentorId: mentor.id, clanId: cohort.id, roadmapTaskId: step.id,
      status: 'in_progress', assignedAt: new Date('2026-05-01'),
    }, { validate: false });
  });

  const mirror = (clanId) => mirrorPriorWork(sequelize, { clanId, menteeId: mentee.id });
  const live = (clanId) => models.AssignedTask.count({ where: { clanId, status: { [require('sequelize').Op.ne]: 'cancelled' } } });

  it('a second mirror into another clan brings one copy, not the original and its copy', async () => {
    await mirror(standingA.id);
    await expect(mirror(standingB.id)).resolves.toMatchObject({ tasks: 1 });
    await expect(live(standingB.id)).resolves.toBe(1);
  });

  it('coming back to a clan does not copy their own task back into it', async () => {
    await mirror(standingA.id);
    await mirror(standingB.id);
    await expect(mirror(standingA.id)).resolves.toMatchObject({ tasks: 0 });
    await expect(live(standingA.id)).resolves.toBe(1);
  });

  it('the copy carries the newest state of the chain', async () => {
    await mirror(standingA.id);
    // Work moved on in Standing A after the first copy.
    await models.AssignedTask.update({ status: 'submitted' }, { where: { clanId: standingA.id } });
    await mirror(standingB.id);
    const [copy] = await models.AssignedTask.findAll({ where: { clanId: standingB.id } });
    expect(copy.status).toBe('submitted');
  });

  it('does not copy a step the target clan already has, assigned there separately', async () => {
    await models.AssignedTask.create({
      menteeId: mentee.id, mentorId: mentor.id, clanId: standingA.id, roadmapTaskId: step.id,
      status: 'assigned', assignedAt: new Date('2026-06-01'),
    }, { validate: false });
    await expect(mirror(standingA.id)).resolves.toMatchObject({ tasks: 0 });
    await expect(live(standingA.id)).resolves.toBe(1);
  });

  it('re-running is still a no-op', async () => {
    await mirror(standingA.id);
    await expect(mirror(standingA.id)).resolves.toMatchObject({ tasks: 0 });
    await expect(live(standingA.id)).resolves.toBe(1);
  });
});
