'use strict';

/**
 * Qualifying work aimed at a level.
 *
 * Intake asks an applicant which level they are at; the pool now carries that
 * answer, so a round that selects beginners and seniors together can set each
 * group different work instead of one list for everybody.
 *
 * The rule the tests pin down is narrow on purpose:
 *   - work with no levels reaches everyone, exactly as before
 *   - targeted work reaches only those levels, and skips the rest with a
 *     reason an operator can read
 *   - a candidate with no level is never swept into work aimed at one
 *   - and, the part that actually decides a selection: work a candidate was
 *     never meant to get is not counted against them, and does not inflate
 *     the total they are measured against
 */

const { Op } = require('sequelize');
const { models } = require('../../src/db');
const seed = require('../helpers/seed');
const emailService = require('../../src/services/emailService');
const authService = require('../../src/services/authService');
const poolService = require('../../src/services/poolService');
const poolMemberService = require('../../src/services/poolMemberService');
const poolTaskService = require('../../src/services/poolTaskService');
const poolScoringService = require('../../src/services/poolScoringService');

const PoolTask = () => models.AssignedTask.scope('withPoolWork');

let ctx;

async function world() {
  await seed.cleanDb();
  emailService.enqueue.mockClear();
  const admin = await seed.createAdmin();
  const program = await seed.createProgram({ createdBy: admin.id, name: 'Fellowship' });
  const pool = await poolService.createPool({
    programId: program.id,
    name: 'Spring pool',
    selectionQuota: 1,
    scoringPolicy: { difficultyPoints: { easy: 5, medium: 10, hard: 20, expert: 40 } },
  }, admin);
  await poolService.setStatus(pool.id, 'open', admin);
  return { admin, program, pool };
}

/** A candidate who has activated, optionally carrying a level. */
async function candidate(email, level = null) {
  await poolMemberService.importMembers(ctx.pool.id, [{ email, firstName: 'C', lastName: 'One', level }], ctx.admin);
  const calls = emailService.enqueue.mock.calls.filter(([m]) => m.to === email);
  const text = calls[calls.length - 1]?.[0]?.text || '';
  const match = text.match(/invite=([^\s&]+)/) || text.match(/\/i\/[^/\s]+\/([^\s/]+)/);
  await authService.register({
    firstName: 'C', lastName: 'One', email, password: 'Test@12345', inviteToken: decodeURIComponent(match[1]),
  });
  return models.PoolMember.findOne({ where: { poolId: ctx.pool.id, email } });
}

/** One piece of work worth 20 points, optionally aimed at levels. */
const work = (title, levels = []) => poolTaskService.createAssignment(ctx.pool.id, {
  kind: 'task', title, description: 'x', difficulty: 'hard', levels, assignTo: 'all',
}, ctx.admin);

const taskCount = (member) => PoolTask().count({ where: { poolMemberId: member.id, status: { [Op.ne]: 'cancelled' } } });
const rowFor = (rows, email) => rows.find((r) => r.email === email);

beforeEach(async () => { ctx = await world(); });

describe('the level comes with the candidate', () => {
  it('keeps the level an import supplies', async () => {
    const member = await candidate('beg@test.com', 'beginner');
    expect(member.level).toBe('beginner');
  });

  it('copies the level from the application a candidate was added from', async () => {
    const cohort = await models.Cohort.create({
      programId: ctx.program.id, name: 'Intake 1', status: 'open',
      levels: [{ key: 'beginner', label: 'Beginner' }, { key: 'senior', label: 'Senior' }],
    });
    const application = await models.Application.create({
      cohortId: cohort.id, email: 'app@test.com', firstName: 'App', lastName: 'Licant', level: 'senior', status: 'pending',
    });
    await poolMemberService.addFromApplications(ctx.pool.id, [application.id], ctx.admin);

    const member = await models.PoolMember.findOne({ where: { poolId: ctx.pool.id, email: 'app@test.com' } });
    expect(member.level).toBe('senior');
  });

  it('offers the cohort\'s levels and any level the candidates actually hold', async () => {
    await candidate('odd@test.com', 'returning');
    const { levels } = await poolService.dashboard(ctx.pool.id);
    expect(levels.map((l) => l.key)).toContain('returning');
  });
});

describe('work reaches the levels it is aimed at', () => {
  it('reaches everyone when no level is chosen, as it always did', async () => {
    const beginner = await candidate('beg@test.com', 'beginner');
    const senior = await candidate('sen@test.com', 'senior');
    const none = await candidate('none@test.com');

    const { assigned } = await work('For all');
    expect(assigned.summary.assigned).toBe(3);
    expect(await taskCount(beginner)).toBe(1);
    expect(await taskCount(senior)).toBe(1);
    expect(await taskCount(none)).toBe(1);
  });

  it('reaches only the chosen levels, and says why it skipped the rest', async () => {
    const beginner = await candidate('beg@test.com', 'beginner');
    const senior = await candidate('sen@test.com', 'senior');

    const { assigned } = await work('Senior only', ['senior']);
    expect(assigned.summary).toMatchObject({ assigned: 1, skipped: 1 });
    expect(await taskCount(senior)).toBe(1);
    expect(await taskCount(beginner)).toBe(0);

    const skip = assigned.results.find((r) => r.memberId === beginner.id);
    expect(skip.reason).toMatch(/for senior/i);
    expect(skip.reason).toMatch(/applied at beginner/i);
  });

  it('never sweeps a candidate with no level into work aimed at one', async () => {
    const none = await candidate('none@test.com');
    const { assigned } = await work('Senior only', ['senior']);
    expect(assigned.summary).toMatchObject({ assigned: 0, skipped: 1 });
    expect(assigned.results[0].reason).toMatch(/no level/i);
    expect(await taskCount(none)).toBe(0);
  });

  it('can aim one piece of work at two levels at once', async () => {
    const beginner = await candidate('beg@test.com', 'beginner');
    const mid = await candidate('mid@test.com', 'intermediate');
    const senior = await candidate('sen@test.com', 'senior');

    const { assigned } = await work('Lower two', ['beginner', 'intermediate']);
    expect(assigned.summary.assigned).toBe(2);
    expect(await taskCount(beginner)).toBe(1);
    expect(await taskCount(mid)).toBe(1);
    expect(await taskCount(senior)).toBe(0);
  });
});

describe('a candidate is only measured on work meant for them', () => {
  it('does not count another level\'s work against them, nor inflate their total', async () => {
    await candidate('beg@test.com', 'beginner');
    await candidate('sen@test.com', 'senior');
    await work('Beginner task', ['beginner']);   // 20 pts
    await work('Senior task', ['senior']);       // 20 pts

    const { rows } = await poolScoringService.compute(ctx.pool.id);
    const beg = rowFor(rows, 'beg@test.com');
    const sen = rowFor(rows, 'sen@test.com');

    // Each is measured against their own 20-point round, not the pool's 40.
    expect(beg.possible).toBe(20);
    expect(sen.possible).toBe(20);

    const begSenior = beg.components.find((c) => c.label === 'Senior task');
    expect(begSenior).toMatchObject({ status: 'not_targeted', earned: 0 });
    const begOwn = beg.components.find((c) => c.label === 'Beginner task');
    expect(begOwn.status).toBe('missing');
  });

  it('does not warn that work was never given when it was aimed elsewhere', async () => {
    await candidate('beg@test.com', 'beginner');
    await work('Senior task', ['senior']);

    const live = await poolScoringService.liveScores(ctx.pool.id);
    const codes = [...live.warnings, ...live.blockers].map((w) => w.code);
    expect(codes).not.toContain('work_not_given');
  });

  it('ranks two levels against each other on what each actually earned', async () => {
    await candidate('beg@test.com', 'beginner');
    await candidate('sen@test.com', 'senior');
    await work('Beginner task', ['beginner']);
    await work('Senior task', ['senior']);

    const { rows } = await poolScoringService.compute(ctx.pool.id);
    // Nobody has done anything, so nobody leads on points and both are
    // incomplete — the point is that neither is penalised for the other's work.
    expect(rowFor(rows, 'beg@test.com').total).toBe(0);
    expect(rowFor(rows, 'sen@test.com').total).toBe(0);
    expect(rowFor(rows, 'beg@test.com').complete).toBe(false);
    expect(rowFor(rows, 'sen@test.com').complete).toBe(false);
  });
});
