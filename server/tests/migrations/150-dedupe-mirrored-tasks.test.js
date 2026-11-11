'use strict';

/**
 * Repair 150 cleans up the duplicate tasks the old mirror wrote: one row kept
 * per (clan, mentee, step, occurrence), the furthest-along one, the rest
 * cancelled with a backup, and a rollback that restores them exactly. A step a
 * mentor deliberately assigned twice by hand (no mirrored copy involved) is
 * left alone.
 */

const { Op } = require('sequelize');
const { models } = require('../../src/db');
const migration = require('../../scripts/migrations/150_dedupe_mirrored_tasks');
const { cleanDb, createMentor, createMentee, createProgram } = require('../helpers/seed');

describe('migration 150: dedupe mirrored tasks', () => {
  let mentor, mentee, program, cohort, standing, step, otherStep;

  beforeEach(async () => {
    await cleanDb();
    mentor = await createMentor({ email: 'm150-mentor@test.com' });
    mentee = await createMentee({ email: 'm150-mentee@test.com' });
    program = await createProgram({ createdBy: mentor.id });
    cohort = await models.Clan.create({ programId: program.id, name: 'C', kind: 'cohort', leadMentorId: mentor.id, createdBy: mentor.id });
    standing = await models.Clan.create({ programId: program.id, name: 'S', kind: 'standing', leadMentorId: mentor.id, createdBy: mentor.id });
    const roadmap = await models.Roadmap.create({ programId: program.id, name: 'R', createdBy: mentor.id });
    const mk = (title, order) => models.RoadmapTask.create({
      roadmapId: roadmap.id, title, type: 'assignment', taskOrder: order, description: 'x', difficulty: 'medium', deliverable: 'x',
    });
    step = await mk('Ship it', 1);
    otherStep = await mk('Write it up', 2);
  });

  const task = (over) => models.AssignedTask.create({
    menteeId: mentee.id, mentorId: mentor.id, roadmapTaskId: step.id, status: 'assigned',
    assignedAt: new Date('2026-05-01'), ...over,
  }, { validate: false });

  it('keeps the furthest-along copy, cancels the rest, and rolls back exactly', async () => {
    const original = await task({ clanId: cohort.id, status: 'completed' });
    const copyA = await task({ clanId: standing.id, status: 'completed', continuedFromTaskId: original.id });
    const copyB = await task({ clanId: standing.id, status: 'in_progress', continuedFromTaskId: copyA.id });
    // Deliberately assigned twice by hand, no copy involved: not a mirror duplicate.
    const handA = await task({ clanId: standing.id, roadmapTaskId: otherStep.id });
    const handB = await task({ clanId: standing.id, roadmapTaskId: otherStep.id });

    await migration.up();
    const status = async (row) => (await row.reload()).status;
    expect(await status(copyA)).toBe('completed');
    expect(await status(copyB)).toBe('cancelled');
    expect(await status(original)).toBe('completed'); // other clan: the cohort record is untouched
    expect(await status(handA)).toBe('assigned');
    expect(await status(handB)).toBe('assigned');

    // Idempotent.
    await migration.up();
    expect(await models.AssignedTask.count({ where: { clanId: standing.id, status: { [Op.ne]: 'cancelled' } } })).toBe(3);

    await migration.down();
    expect(await status(copyB)).toBe('in_progress');
    expect((await copyB.reload()).cancellationReason).toBeNull();
  });
});
