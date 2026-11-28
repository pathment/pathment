'use strict';

/**
 * A selection round is a clan, so a candidate's work behaves like clan work.
 *
 * The round reuses the clan review UI, and that UI offers things the old pool
 * never did: a candidate can ask for more time, and whoever runs the round can
 * grant it, give somebody an extra piece of work, or take one back. None of
 * that is new machinery — it is the ordinary task machinery, which a round has
 * to be able to reach.
 *
 * Two things are easy to get wrong and are what these pin:
 *
 *   - a candidate is NOT a mentee of the programme (no enrollment, no mentee
 *     profile), so anything that assumes an enrollment refuses them;
 *   - round work carries a `clanId` and no enrollment, so anything that
 *     authorises by enrollment refuses the mentor too.
 *
 * Both failures look identical from the outside — "you do not have access" —
 * which is exactly the complaint this answers.
 */

const { models } = require('../../src/db');
const seed = require('../helpers/seed');
const clanService = require('../../src/services/clanService');
const poolClanService = require('../../src/services/poolClanService');
const submissionService = require('../../src/services/submissionService');
const taskService = require('../../src/services/taskService');

const PoolTask = () => models.AssignedTask.scope('withPoolWork');
const DAY = 24 * 60 * 60 * 1000;

let ctx;

async function roadmapWithStep(name, title, offset = 14) {
  const roadmap = await seed.createRoadmap({ programId: ctx.program.id, createdBy: ctx.admin.id, name });
  const step = await seed.createRoadmapTask({ roadmapId: roadmap.id, title });
  await step.update({ dueOffsetDays: offset });
  return roadmap;
}

/** A round with one level set to do one piece of work, and one candidate in it. */
async function roundWithCandidate() {
  const clan = await models.Clan.create({
    programId: ctx.program.id, name: 'Spring round', kind: 'pool',
    createdBy: ctx.admin.id, leadMentorId: ctx.mentor.id,
  });
  await clanService.addMember(clan.id, { userId: ctx.mentor.id, role: 'lead_mentor' });
  const roadmap = await roadmapWithStep('L1', 'Foundations');
  await poolClanService.setLevelRules(clan.id, [{ level: 'level-1', roadmapId: roadmap.id }], ctx.admin);

  const user = await seed.createUser({ role: 'mentee', email: 'ada@test.com' });
  await models.MenteeProfile.destroy({ where: { userId: user.id } });
  await clanService.addMember(clan.id, { userId: user.id, role: 'mentee', level: 'level-1' });

  const [task] = await PoolTask().findAll({ where: { menteeId: user.id, clanId: clan.id } });
  return { clan, user, task, roadmap };
}

beforeEach(async () => {
  await seed.cleanDb();
  jest.clearAllMocks();
  const admin = await seed.createAdmin();
  const mentor = await seed.createMentor();
  const program = await seed.createProgram({ createdBy: admin.id, name: 'Fellowship' });
  ctx = { admin, mentor, program };
});

describe('a candidate asking for more time', () => {
  it('can ask, on their own round work', async () => {
    const { user, task } = await roundWithCandidate();

    const submission = await submissionService.requestExtension(task.id, user.id, {
      reason: 'My laptop died and the replacement arrives Friday',
      days: 5,
    });

    expect(submission.extensionRequested).toBe(true);
    expect(submission.extensionStatus).toBe('pending');
    expect(submission.extensionDays).toBe(5);
  });

  it('cannot ask on somebody else\'s work', async () => {
    const { task } = await roundWithCandidate();
    const other = await seed.createUser({ role: 'mentee', email: 'eve@test.com' });

    await expect(submissionService.requestExtension(task.id, other.id, { reason: 'Mine now', days: 3 }))
      .rejects.toThrow(/not assigned to you/i);
  });

  it('cannot have two requests open at once', async () => {
    const { user, task } = await roundWithCandidate();
    await submissionService.requestExtension(task.id, user.id, { reason: 'First', days: 3 });

    await expect(submissionService.requestExtension(task.id, user.id, { reason: 'Second', days: 3 }))
      .rejects.toThrow(/already pending/i);
  });
});

describe('the round\'s mentor answering it', () => {
  it('grants it, and the deadline moves', async () => {
    const { user, task } = await roundWithCandidate();
    const before = new Date(task.dueDate).getTime();
    const submission = await submissionService.requestExtension(task.id, user.id, { reason: 'Laptop', days: 5 });

    await submissionService.handleExtensionRequest(submission.id, ctx.mentor.id, true);

    const after = await PoolTask().findByPk(task.id);
    expect(new Date(after.dueDate).getTime()).toBeGreaterThan(before);
    const resolved = await models.TaskSubmission.findByPk(submission.id);
    expect(resolved.extensionStatus).toBe('approved');
  });

  it('refuses it, and the deadline stays put', async () => {
    const { user, task } = await roundWithCandidate();
    const before = new Date(task.dueDate).getTime();
    const submission = await submissionService.requestExtension(task.id, user.id, { reason: 'Laptop', days: 5 });

    await submissionService.handleExtensionRequest(submission.id, ctx.mentor.id, false);

    const after = await PoolTask().findByPk(task.id);
    expect(new Date(after.dueDate).getTime()).toBe(before);
    const resolved = await models.TaskSubmission.findByPk(submission.id);
    expect(resolved.extensionStatus).toBe('rejected');
  });

  it('is not answerable by someone with nothing to do with the round', async () => {
    const { user, task } = await roundWithCandidate();
    const stranger = await seed.createMentor({ email: 'stranger@test.com' });
    const submission = await submissionService.requestExtension(task.id, user.id, { reason: 'Laptop', days: 5 });

    await expect(submissionService.handleExtensionRequest(submission.id, stranger.id, true))
      .rejects.toThrow(/permission/i);
  });
});

describe('giving a candidate work, and taking it back', () => {
  it('hands one person an extra piece, inside the round', async () => {
    const { clan, user } = await roundWithCandidate();

    const task = await taskService.createCustomTask({
      menteeId: user.id,
      clanId: clan.id,
      title: 'A second look at your API',
      description: 'Show me the error handling',
      dueDate: new Date(Date.now() + 7 * DAY),
    }, ctx.mentor.id);

    expect(task.clanId).toBe(clan.id);
    // A candidate holds no enrollment, so the work cannot hang off one.
    expect(task.enrollmentId).toBeNull();
    const held = await PoolTask().findAll({ where: { menteeId: user.id, clanId: clan.id } });
    expect(held).toHaveLength(2);
  });

  it('takes a piece back', async () => {
    const { user, task } = await roundWithCandidate();

    await taskService.unassignTask(task.id, ctx.mentor.id, 'mentor');

    const gone = await PoolTask().findByPk(task.id);
    expect(gone === null || gone.status === 'cancelled').toBe(true);
  });
});

describe('the candidate\'s own view of a round', () => {
  const poolCandidateService = require('../../src/services/poolCandidateService');

  it('lists the round they are in, with how far along they are', async () => {
    const { clan, user } = await roundWithCandidate();

    const rounds = await poolCandidateService.myPools(user.id);

    expect(rounds).toHaveLength(1);
    expect(rounds[0].pool).toMatchObject({ id: clan.id, name: 'Spring round' });
    expect(rounds[0].progress).toMatchObject({ total: 1, completed: 0 });
  });

  it('lists their round work', async () => {
    const { user } = await roundWithCandidate();

    const tasks = await poolCandidateService.myTasks(user.id);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Foundations');
  });

  it('opens one piece of it, with its submissions and feedback', async () => {
    const { user, task } = await roundWithCandidate();

    const detail = await poolCandidateService.myTask(user.id, task.id);

    expect(detail.id).toBe(task.id);
    expect(Array.isArray(detail.submissions)).toBe(true);
  });

  it('refuses somebody else\'s round work', async () => {
    const { task } = await roundWithCandidate();
    const other = await seed.createUser({ role: 'mentee', email: 'eve@test.com' });

    await expect(poolCandidateService.myTask(other.id, task.id)).rejects.toThrow(/not found/i);
  });

  it('keeps the round out of their clan list — it is a round, not a clan', async () => {
    // A candidate holds no enrollment, and the clan home asks about one. A
    // round belongs in the round scope, which is built for exactly that.
    const { clan, user } = await roundWithCandidate();

    const memberships = await clanService.getMembershipsForUser(user.id);

    expect(memberships.map((m) => m.clanId)).not.toContain(clan.id);
  });
});

describe('what the round\'s screens offer, per candidate', () => {
  it('shows one candidate\'s work and what they are waiting on', async () => {
    const { clan, user, task } = await roundWithCandidate();
    await submissionService.requestExtension(task.id, user.id, { reason: 'Laptop', days: 5 });

    const view = await poolClanService.candidateWork(clan.id, user.id);

    expect(view.work).toHaveLength(1);
    expect(view.work[0]).toMatchObject({ id: task.id, title: 'Foundations' });
    expect(view.extensions).toHaveLength(1);
    expect(view.extensions[0]).toMatchObject({ days: 5, status: 'pending' });
  });

  it('gives one candidate a roadmap\'s work, on top of their level\'s', async () => {
    const { clan, user } = await roundWithCandidate();
    const extra = await roadmapWithStep('Extra', 'A harder brief', 10);

    const out = await poolClanService.giveWork(clan.id, user.id, { roadmapId: extra.id }, ctx.mentor);

    expect(out.assigned).toBe(1);
    const titles = (await PoolTask().findAll({
      where: { menteeId: user.id, clanId: clan.id },
      include: [{ model: models.RoadmapTask, as: 'roadmapTask', attributes: ['title'] }],
    })).map((t) => t.roadmapTask?.title).sort();
    expect(titles).toEqual(['A harder brief', 'Foundations']);
  });

  it('does not hand the same work out twice', async () => {
    const { clan, user } = await roundWithCandidate();
    const extra = await roadmapWithStep('Extra', 'A harder brief', 10);

    await poolClanService.giveWork(clan.id, user.id, { roadmapId: extra.id }, ctx.mentor);
    const again = await poolClanService.giveWork(clan.id, user.id, { roadmapId: extra.id }, ctx.mentor);

    expect(again.assigned).toBe(0);
    const held = await PoolTask().count({ where: { menteeId: user.id, clanId: clan.id } });
    expect(held).toBe(2);
  });

  it('takes a piece back', async () => {
    const { clan, user, task } = await roundWithCandidate();

    await poolClanService.takeWorkBack(clan.id, task.id, ctx.mentor);

    const after = await PoolTask().findByPk(task.id);
    expect(after === null || after.status === 'cancelled').toBe(true);
  });

  it('will not take back work from another round', async () => {
    const { user } = await roundWithCandidate();
    const other = await models.Clan.create({
      programId: ctx.program.id, name: 'Other round', kind: 'pool', createdBy: ctx.admin.id, leadMentorId: ctx.mentor.id,
    });
    const [task] = await PoolTask().findAll({ where: { menteeId: user.id } });

    await expect(poolClanService.takeWorkBack(other.id, task.id, ctx.mentor)).rejects.toThrow();
  });

  it('lists every request for more time that is still open', async () => {
    const { clan, user, task } = await roundWithCandidate();
    await submissionService.requestExtension(task.id, user.id, { reason: 'Laptop', days: 5 });

    const waiting = await poolClanService.openExtensions(clan.id);

    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({ days: 5, candidate: expect.objectContaining({ email: 'ada@test.com' }) });
  });
});

describe('answering a request for more time from the round', () => {
  it('lets whoever runs the round grant it', async () => {
    const { clan, user, task } = await roundWithCandidate();
    const before = new Date(task.dueDate).getTime();
    const request = await submissionService.requestExtension(task.id, user.id, { reason: 'Laptop', days: 5 });

    await poolClanService.answerExtension(clan.id, request.id, { approved: true }, ctx.admin);

    const after = await PoolTask().findByPk(task.id);
    expect(new Date(after.dueDate).getTime()).toBeGreaterThan(before);
    expect((await models.TaskSubmission.findByPk(request.id)).extensionStatus).toBe('approved');
    expect(await poolClanService.openExtensions(clan.id)).toHaveLength(0);
  });

  it('refuses a request that belongs to another round', async () => {
    const { user, task } = await roundWithCandidate();
    const other = await models.Clan.create({
      programId: ctx.program.id, name: 'Other round', kind: 'pool', createdBy: ctx.admin.id, leadMentorId: ctx.mentor.id,
    });
    const request = await submissionService.requestExtension(task.id, user.id, { reason: 'Laptop', days: 5 });

    await expect(poolClanService.answerExtension(other.id, request.id, { approved: true }, ctx.admin))
      .rejects.toThrow(/not part of this round/i);
  });
});

describe('a round that has moved is not two rounds', () => {
  const poolCandidateService = require('../../src/services/poolCandidateService');
  const poolService = require('../../src/services/poolService');

  /** The old `CandidatePool` row, marked as having moved to a clan. */
  async function movedPool(clan, user) {
    const pool = await models.CandidatePool.create({
      programId: ctx.program.id, name: clan.name, status: 'open', selectionQuota: 1,
      createdById: ctx.admin.id, settings: { migratedToClanId: clan.id },
    }, { validate: false });
    // The migration does not make a second record: the one that exists gains a
    // clan alongside the pool it came from. Mirroring that is the whole point.
    await models.PoolMember.update({ poolId: pool.id }, { where: { clanId: clan.id, userId: user.id } });
    return pool;
  }

  it('disappears from the candidate\'s own list once its work has moved', async () => {
    const { clan, user } = await roundWithCandidate();
    await movedPool(clan, user);

    const mine = await poolCandidateService.myPools(user.id);

    // One round, the one holding their work — not the husk beside it.
    expect(mine).toHaveLength(1);
    expect(mine[0].pool.id).toBe(clan.id);
    expect(mine[0].progress.total).toBe(1);
  });

  it('disappears from the operator\'s list too', async () => {
    const { clan, user } = await roundWithCandidate();
    const pool = await movedPool(clan, user);

    const listed = await poolService.listPools({});

    expect(listed.map((p) => p.id)).not.toContain(pool.id);
  });

  it('leaves a pool that has not moved exactly where it is', async () => {
    const { user } = await roundWithCandidate();
    const pool = await models.CandidatePool.create({
      programId: ctx.program.id, name: 'Still a pool', status: 'open', selectionQuota: 1, createdById: ctx.admin.id,
    }, { validate: false });
    await models.PoolMember.create({ poolId: pool.id, userId: user.id, email: user.email, status: 'active' });

    expect((await poolService.listPools({})).map((p) => p.id)).toContain(pool.id);
    expect((await poolCandidateService.myPools(user.id)).map((r) => r.pool.id)).toContain(pool.id);
  });
});
