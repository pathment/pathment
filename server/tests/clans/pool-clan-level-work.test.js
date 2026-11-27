'use strict';

/**
 * Level decides the work, and joining starts the clock.
 *
 * A selection round sets out, per level, what that level does. Somebody who
 * joins at level 1 gets level 1's steps and nothing else; the deadline on each
 * is counted from the moment they joined, using the step's own
 * `dueOffsetDays`, so "two weeks to do this" means two weeks from THEIR start
 * rather than a date fixed when the round was written.
 *
 * The silent cases matter as much as the loud one. A candidate with no level,
 * or a level the round has no rule for, gets nothing — and hears nothing. The
 * bug this replaces mailed every level's course to every candidate.
 */

const { models } = require('../../src/db');
const seed = require('../helpers/seed');
const clanService = require('../../src/services/clanService');
const poolClanService = require('../../src/services/poolClanService');
const notificationOrchestrator = require('../../src/services/notificationOrchestrator');

const PoolTask = () => models.AssignedTask.scope('withPoolWork');
const DAY = 24 * 60 * 60 * 1000;

let ctx;

/** A roadmap whose single step is due `offset` days after it is handed out. */
async function roadmapWithStep(name, title, offset) {
  const roadmap = await seed.createRoadmap({ programId: ctx.program.id, createdBy: ctx.admin.id, name });
  const step = await seed.createRoadmapTask({ roadmapId: roadmap.id, title });
  await step.update({ dueOffsetDays: offset });
  return { roadmap, step };
}

async function poolClan(name = 'Spring round') {
  const clan = await models.Clan.create({
    programId: ctx.program.id, name, kind: 'pool', createdBy: ctx.admin.id, leadMentorId: ctx.mentor.id,
  });
  await clanService.addMember(clan.id, { userId: ctx.mentor.id, role: 'lead_mentor' });
  return clan;
}

/** Somebody who has only ever been a candidate. */
async function candidate(email) {
  const user = await seed.createUser({ role: 'mentee', email });
  await models.MenteeProfile.destroy({ where: { userId: user.id } });
  return user;
}

const titlesFor = async (userId) => {
  const tasks = await PoolTask().findAll({
    where: { menteeId: userId },
    include: [{ model: models.RoadmapTask, as: 'roadmapTask', attributes: ['title'] }],
  });
  return tasks.map((t) => t.roadmapTask?.title).sort();
};

beforeEach(async () => {
  await seed.cleanDb();
  jest.clearAllMocks();
  const admin = await seed.createAdmin();
  const mentor = await seed.createMentor();
  const program = await seed.createProgram({ createdBy: admin.id, name: 'Fellowship' });
  ctx = { admin, mentor, program };
});

describe('what a level is set to do', () => {
  it('is saved on the round, per level', async () => {
    const clan = await poolClan();
    const one = await roadmapWithStep('L1', 'Foundations', 14);

    await poolClanService.setLevelRules(clan.id, [{ level: 'level-1', roadmapId: one.roadmap.id }], ctx.admin);

    const rules = await poolClanService.levelRules(await clan.reload());
    expect(rules).toEqual([expect.objectContaining({ level: 'level-1', roadmapId: one.roadmap.id })]);
  });

  it('refuses a rule for a roadmap that does not exist', async () => {
    const clan = await poolClan();
    await expect(poolClanService.setLevelRules(
      clan.id, [{ level: 'level-1', roadmapId: '11111111-1111-4111-8111-111111111111' }], ctx.admin,
    )).rejects.toThrow();
  });

  it('refuses level rules on a clan that is not a round', async () => {
    const real = await models.Clan.create({
      programId: ctx.program.id, name: 'Clan One', kind: 'cohort', createdBy: ctx.admin.id,
    });
    const one = await roadmapWithStep('L1', 'Foundations', 14);
    await expect(poolClanService.setLevelRules(
      real.id, [{ level: 'level-1', roadmapId: one.roadmap.id }], ctx.admin,
    )).rejects.toThrow();
  });
});

describe('joining hands out that level, and only that level', () => {
  it('gives a level 1 joiner level 1 work, not level 2 or 3', async () => {
    const clan = await poolClan();
    const one = await roadmapWithStep('L1', 'Foundations', 14);
    const two = await roadmapWithStep('L2', 'Portfolio', 21);
    const three = await roadmapWithStep('L3', 'Knowledge agent', 28);
    await poolClanService.setLevelRules(clan.id, [
      { level: 'level-1', roadmapId: one.roadmap.id },
      { level: 'level-2', roadmapId: two.roadmap.id },
      { level: 'level-3', roadmapId: three.roadmap.id },
    ], ctx.admin);

    const user = await candidate('one@test.com');
    await clanService.addMember(clan.id, { userId: user.id, role: 'mentee', level: 'level-1' });

    expect(await titlesFor(user.id)).toEqual(['Foundations']);
  });

  it('counts the deadline from the day they joined, not a date fixed in advance', async () => {
    const clan = await poolClan();
    const one = await roadmapWithStep('L1', 'Foundations', 14);
    await poolClanService.setLevelRules(clan.id, [{ level: 'level-1', roadmapId: one.roadmap.id }], ctx.admin);

    const joinedAt = Date.now();
    const user = await candidate('one@test.com');
    await clanService.addMember(clan.id, { userId: user.id, role: 'mentee', level: 'level-1' });

    const [task] = await PoolTask().findAll({ where: { menteeId: user.id } });
    const days = (new Date(task.dueDate).getTime() - joinedAt) / DAY;
    expect(days).toBeGreaterThan(13);
    expect(days).toBeLessThan(15);
  });

  it('carries the level onto the membership so the round can see it', async () => {
    const clan = await poolClan();
    const user = await candidate('one@test.com');
    await clanService.addMember(clan.id, { userId: user.id, role: 'mentee', level: 'level-2' });

    const membership = await models.ClanMembership.findOne({ where: { clanId: clan.id, userId: user.id } });
    expect(membership.level).toBe('level-2');
  });
});

describe('and when nothing matches, nothing happens', () => {
  it('gives a candidate with no level nothing, and tells them nothing', async () => {
    const clan = await poolClan();
    const one = await roadmapWithStep('L1', 'Foundations', 14);
    await poolClanService.setLevelRules(clan.id, [{ level: 'level-1', roadmapId: one.roadmap.id }], ctx.admin);

    const user = await candidate('nolevel@test.com');
    await clanService.addMember(clan.id, { userId: user.id, role: 'mentee' });

    expect(await titlesFor(user.id)).toEqual([]);
    expect(notificationOrchestrator.dispatch).not.toHaveBeenCalled();
  });

  it('gives a candidate whose level has no rule nothing, and tells them nothing', async () => {
    const clan = await poolClan();
    const one = await roadmapWithStep('L1', 'Foundations', 14);
    await poolClanService.setLevelRules(clan.id, [{ level: 'level-1', roadmapId: one.roadmap.id }], ctx.admin);

    const user = await candidate('four@test.com');
    await clanService.addMember(clan.id, { userId: user.id, role: 'mentee', level: 'level-4' });

    expect(await titlesFor(user.id)).toEqual([]);
    expect(notificationOrchestrator.dispatch).not.toHaveBeenCalled();
  });

  it('hands the work out once, however many times the join is replayed', async () => {
    const clan = await poolClan();
    const one = await roadmapWithStep('L1', 'Foundations', 14);
    await poolClanService.setLevelRules(clan.id, [{ level: 'level-1', roadmapId: one.roadmap.id }], ctx.admin);

    const user = await candidate('one@test.com');
    await clanService.addMember(clan.id, { userId: user.id, role: 'mentee', level: 'level-1' });
    await poolClanService.assignLevelWork(clan.id, user.id);
    await poolClanService.assignLevelWork(clan.id, user.id);

    expect(await titlesFor(user.id)).toEqual(['Foundations']);
  });

  it('leaves a real clan\'s placement completely alone', async () => {
    // The hook must only fire for a round. A cohort clan still enrols and
    // assigns through its own path.
    const real = await models.Clan.create({
      programId: ctx.program.id, name: 'Clan One', kind: 'cohort', createdBy: ctx.admin.id,
    });
    const user = await candidate('real@test.com');
    await clanService.addMember(real.id, { userId: user.id, role: 'mentee', level: 'level-1' });

    expect(await titlesFor(user.id)).toEqual([]);
    expect(await models.Enrollment.findOne({ where: { menteeId: user.id } })).toBeTruthy();
  });
});
