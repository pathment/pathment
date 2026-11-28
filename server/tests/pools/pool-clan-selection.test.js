'use strict';

/**
 * Selection, on the round itself.
 *
 * Phase 4. A selection round is a clan now, so the ranking must be built from
 * what the clan actually holds: its level rules say what each level is set to
 * do, and the assigned tasks under the clan say how far each candidate got.
 * The old round read a JSON list of work items hung off a `CandidatePool` row;
 * nothing of that shape survives here.
 *
 * What does survive, deliberately, is the SELECTION RECORD. `PoolMember` is
 * where a decision, its reason, the confirmed score and the rank are written,
 * and where placement is tracked afterwards — none of which a clan membership
 * has any business carrying. So the record stays and simply points at the
 * round and the membership instead of at a pool.
 *
 * The rules being pinned here:
 *
 *   - joining a round opens exactly one selection record, replay or not;
 *   - a candidate is scored against THEIR level's work and no one else's, so
 *     a beginner is never ranked against a total they were never allowed to
 *     reach;
 *   - required work handed in and not yet reviewed stops a shortlist being
 *     confirmed — nobody is ranked on unreviewed work;
 *   - confirming writes the decision onto the selection record, and refuses
 *     outright if anything moved since the shortlist was generated.
 */

const { models } = require('../../src/db');
const seed = require('../helpers/seed');
const clanService = require('../../src/services/clanService');
const poolClanService = require('../../src/services/poolClanService');
const selection = require('../../src/services/poolClanSelectionService');

const PoolTask = () => models.AssignedTask.scope('withPoolWork');

let ctx;

/** A roadmap of one step, at a chosen difficulty — which is what it is worth. */
async function work(name, title, difficulty = 'medium') {
  const roadmap = await seed.createRoadmap({ programId: ctx.program.id, createdBy: ctx.admin.id, name });
  const step = await seed.createRoadmapTask({ roadmapId: roadmap.id, title });
  await step.update({ difficulty, dueOffsetDays: 14 });
  return { roadmap, step };
}

/** A round with its lead mentor, a quota, and work set per level. */
async function round({ quota = 1, rules = [] } = {}) {
  const clan = await models.Clan.create({
    programId: ctx.program.id, name: 'Spring round', kind: 'pool',
    createdBy: ctx.admin.id, leadMentorId: ctx.mentor.id,
  });
  await clanService.addMember(clan.id, { userId: ctx.mentor.id, role: 'lead_mentor' });
  if (rules.length) await poolClanService.setLevelRules(clan.id, rules, ctx.admin);
  await poolClanService.setSelectionSettings(clan.id, { quota, waitlistSize: 0 }, ctx.admin);
  return clan.reload();
}

/** Somebody who has only ever been a candidate, joined at a level. */
async function candidate(clan, email, level) {
  const user = await seed.createUser({ role: 'mentee', email });
  await models.MenteeProfile.destroy({ where: { userId: user.id } });
  await clanService.addMember(clan.id, { userId: user.id, role: 'mentee', level });
  return user;
}

/** Hand the work in and have it reviewed at `rating` out of 5. */
async function reviewed(user, rating) {
  const [task] = await PoolTask().findAll({ where: { menteeId: user.id } });
  await task.update({ status: 'completed' });
  const submission = await models.TaskSubmission.create({
    assignedTaskId: task.id, version: 1, submissionText: 'Here it is',
    status: 'approved', submittedAt: new Date(),
  }, { validate: false });
  await models.TaskFeedback.create({
    assignedTaskId: task.id, submissionId: submission.id, mentorId: ctx.mentor.id,
    feedbackText: 'Good work', rating, isApproved: true,
  }, { validate: false });
  return task;
}

/** Handed in, nobody has looked at it yet. */
async function awaitingReview(user) {
  const [task] = await PoolTask().findAll({ where: { menteeId: user.id } });
  await task.update({ status: 'submitted' });
  return task;
}

const rowFor = (scores, user) => scores.rows.find((r) => r.email === user.email);
// The work actually set for this candidate's level. The columns of the other
// levels stay on the row, marked `not_targeted`, so one stored shortlist is
// still readable as a table years later.
const theirWork = (row) => row.components.filter((c) => c.status !== 'not_targeted').map((c) => c.label);

beforeEach(async () => {
  await seed.cleanDb();
  jest.clearAllMocks();
  const admin = await seed.createAdmin();
  const mentor = await seed.createMentor();
  const program = await seed.createProgram({ createdBy: admin.id, name: 'Fellowship' });
  ctx = { admin, mentor, program };
});

describe('the selection record', () => {
  it('is opened by joining, and points at the round and the membership', async () => {
    const clan = await round();
    const user = await candidate(clan, 'ada@test.com', 'level-1');

    const record = await models.PoolMember.findOne({ where: { clanId: clan.id, userId: user.id } });
    expect(record).toBeTruthy();
    expect(record.poolId).toBeNull();
    expect(record.email).toBe('ada@test.com');
    expect(record.level).toBe('level-1');
    expect(record.decision).toBeNull();

    const membership = await models.ClanMembership.findOne({ where: { clanId: clan.id, userId: user.id } });
    expect(record.clanMembershipId).toBe(membership.id);
  });

  it('stays one record however many times the join is replayed', async () => {
    const clan = await round();
    const user = await candidate(clan, 'ada@test.com', 'level-1');
    await poolClanService.afterJoin(clan.id, user.id);
    await poolClanService.afterJoin(clan.id, user.id);

    const records = await models.PoolMember.findAll({ where: { clanId: clan.id, userId: user.id } });
    expect(records).toHaveLength(1);
  });

  it('follows a level change, so the ranking reads the level they are actually at', async () => {
    const clan = await round();
    const user = await candidate(clan, 'ada@test.com', 'level-1');

    await poolClanService.setMemberLevel(clan.id, user.id, 'level-2', ctx.admin);

    const record = await models.PoolMember.findOne({ where: { clanId: clan.id, userId: user.id } });
    expect(record.level).toBe('level-2');
  });

  it('is not opened for a mentor', async () => {
    const clan = await round();
    const records = await models.PoolMember.findAll({ where: { clanId: clan.id, userId: ctx.mentor.id } });
    expect(records).toHaveLength(0);
  });
});

describe('a score is built from the round\'s own work', () => {
  it('is the work\'s points scaled by its rating', async () => {
    const one = await work('L1', 'Foundations', 'hard');            // 20 points
    const clan = await round({ rules: [{ level: 'level-1', roadmapId: one.roadmap.id }] });
    const user = await candidate(clan, 'ada@test.com', 'level-1');
    await reviewed(user, 4);                                        // 20 × 4/5 = 16

    const scores = await selection.liveScores(clan.id);
    const row = rowFor(scores, user);
    expect(row.total).toBe(16);
    expect(row.possible).toBe(20);
    expect(row.components).toEqual([expect.objectContaining({ label: 'Foundations', points: 20, earned: 16, status: 'scored' })]);
  });

  it('ranks each candidate against their own level, not the whole round', async () => {
    const one = await work('L1', 'Foundations', 'easy');            // 5 points
    const two = await work('L2', 'Knowledge agent', 'expert');      // 40 points
    const clan = await round({
      quota: 1,
      rules: [
        { level: 'level-1', roadmapId: one.roadmap.id },
        { level: 'level-2', roadmapId: two.roadmap.id },
      ],
    });
    const junior = await candidate(clan, 'junior@test.com', 'level-1');
    const senior = await candidate(clan, 'senior@test.com', 'level-2');

    const scores = await selection.liveScores(clan.id);
    const juniorRow = rowFor(scores, junior);
    const seniorRow = rowFor(scores, senior);

    // Each sees only their own level's work, so neither is marked down for
    // work that was never theirs to do.
    expect(juniorRow.possible).toBe(5);
    expect(seniorRow.possible).toBe(40);
    expect(theirWork(juniorRow)).toEqual(['Foundations']);
    expect(theirWork(seniorRow)).toEqual(['Knowledge agent']);
  });

  it('gives nothing to work that was never handed in', async () => {
    const one = await work('L1', 'Foundations');
    const clan = await round({ rules: [{ level: 'level-1', roadmapId: one.roadmap.id }] });
    const user = await candidate(clan, 'ada@test.com', 'level-1');

    const scores = await selection.liveScores(clan.id);
    const row = rowFor(scores, user);
    expect(row.total).toBe(0);
    expect(row.components[0].status).toBe('missing');
    expect(scores.warnings.map((w) => w.code)).toContain('missing_work');
  });

  it('leaves a candidate with no level with nothing to be ranked on', async () => {
    const one = await work('L1', 'Foundations');
    const clan = await round({ rules: [{ level: 'level-1', roadmapId: one.roadmap.id }] });
    const user = await candidate(clan, 'nolevel@test.com', null);

    const scores = await selection.liveScores(clan.id);
    const row = rowFor(scores, user);
    expect(row.possible).toBe(0);
    expect(theirWork(row)).toEqual([]);
    expect(row.total).toBe(0);
  });
});

describe('what stops a shortlist', () => {
  it('blocks while required work is waiting for review', async () => {
    const one = await work('L1', 'Foundations');
    const clan = await round({ rules: [{ level: 'level-1', roadmapId: one.roadmap.id }] });
    const user = await candidate(clan, 'ada@test.com', 'level-1');
    await awaitingReview(user);

    const scores = await selection.liveScores(clan.id);
    expect(scores.blockers.map((b) => b.code)).toContain('reviews_outstanding');
  });

  it('blocks a round that has set no work at all', async () => {
    const clan = await round();
    await candidate(clan, 'ada@test.com', 'level-1');

    const scores = await selection.liveScores(clan.id);
    expect(scores.blockers.map((b) => b.code)).toContain('no_work');
  });
});

describe('generating and confirming', () => {
  async function readyRound() {
    const one = await work('L1', 'Foundations', 'hard');
    const clan = await round({ quota: 1, rules: [{ level: 'level-1', roadmapId: one.roadmap.id }] });
    const first = await candidate(clan, 'first@test.com', 'level-1');
    const second = await candidate(clan, 'second@test.com', 'level-1');
    await reviewed(first, 5);
    await reviewed(second, 2);
    return { clan, first, second };
  }

  it('ranks the shortlist and proposes the quota', async () => {
    const { clan, first, second } = await readyRound();

    const { shortlist } = await selection.generate(clan.id, ctx.admin);

    expect(shortlist.version).toBe(1);
    const byEmail = new Map(shortlist.entries.map((e) => [e.member.email, e]));
    expect(byEmail.get(first.email).rank).toBe(1);
    expect(byEmail.get(first.email).proposedOutcome).toBe('selected');
    expect(byEmail.get(second.email).proposedOutcome).toBe('not_selected');
  });

  it('is recorded against the round itself', async () => {
    const { clan } = await readyRound();
    await selection.generate(clan.id, ctx.admin);

    const logs = await models.AuditLog.findAll({
      where: { entityType: 'Clan', entityId: clan.id, action: 'POOL_SHORTLIST_GENERATED' },
    });
    expect(logs).toHaveLength(1);
  });

  it('returns the same version when nothing has moved', async () => {
    const { clan } = await readyRound();
    const first = await selection.generate(clan.id, ctx.admin);
    const again = await selection.generate(clan.id, ctx.admin);

    expect(again.reused).toBe(true);
    expect(again.shortlist.id).toBe(first.shortlist.id);
    expect(again.shortlist.version).toBe(1);
  });

  it('writes the decision, the score and the rank onto the selection record', async () => {
    const { clan, first, second } = await readyRound();
    const { shortlist } = await selection.generate(clan.id, ctx.admin);

    await selection.confirm(clan.id, shortlist.id, {}, ctx.admin);

    const won = await models.PoolMember.findOne({ where: { clanId: clan.id, userId: first.id } });
    const lost = await models.PoolMember.findOne({ where: { clanId: clan.id, userId: second.id } });
    expect(won.decision).toBe('selected');
    expect(Number(won.totalScore)).toBe(20);
    expect(won.rank).toBe(1);
    expect(won.decidedById).toBe(ctx.admin.id);
    expect(lost.decision).toBe('not_selected');
  });

  it('refuses to confirm a shortlist the scores have moved under', async () => {
    const { clan, second } = await readyRound();
    const { shortlist } = await selection.generate(clan.id, ctx.admin);

    // A reviewer raises a mark after the shortlist was drawn up.
    const [task] = await PoolTask().findAll({ where: { menteeId: second.id } });
    const feedback = await models.TaskFeedback.findOne({ where: { assignedTaskId: task.id } });
    await feedback.update({ rating: 5 });

    await expect(selection.confirm(clan.id, shortlist.id, {}, ctx.admin))
      .rejects.toThrow(/generate it again/i);
  });

  it('will not confirm while required work is unreviewed', async () => {
    const one = await work('L1', 'Foundations');
    const clan = await round({ rules: [{ level: 'level-1', roadmapId: one.roadmap.id }] });
    const user = await candidate(clan, 'ada@test.com', 'level-1');
    await awaitingReview(user);

    const { shortlist } = await selection.generate(clan.id, ctx.admin);
    await expect(selection.confirm(clan.id, shortlist.id, {}, ctx.admin))
      .rejects.toThrow(/waiting for review/i);
  });
});
