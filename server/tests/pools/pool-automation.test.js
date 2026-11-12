'use strict';

/**
 * The hands-off pipeline, end to end:
 *   apply → joins the selection pool by itself → level set → level work
 *   (guided labs) handed out, swapped if the level changes → Edorax progress
 *   past the threshold selects them → a clan that serves their level is
 *   suggested for one-click placement.
 */

const { Op } = require('sequelize');
const { models } = require('../../src/db');
const seed = require('../helpers/seed');
const emailService = require('../../src/services/emailService');
const authService = require('../../src/services/authService');
const poolService = require('../../src/services/poolService');
const poolTaskService = require('../../src/services/poolTaskService');
const poolPlacementService = require('../../src/services/poolPlacementService');
const automation = require('../../src/services/poolAutomationService');
const orchestrator = require('../../src/services/notificationOrchestrator');

const PoolTask = () => models.AssignedTask.scope('withPoolWork');
const openWork = (member) => PoolTask().findAll({ where: { poolMemberId: member.id, status: { [Op.ne]: 'cancelled' } } });
const LEVELS = [{ key: 'beginner', label: 'Beginner' }, { key: 'senior', label: 'Senior' }];

let ctx;

beforeEach(async () => {
  await seed.cleanDb();
  emailService.enqueue.mockClear();
  orchestrator.dispatch.mockClear();
  const admin = await seed.createAdmin();
  const program = await seed.createProgram({ createdBy: admin.id, name: 'Fellowship' });
  const cohort = await models.Cohort.create({ programId: program.id, name: 'Spring intake', status: 'open', levels: LEVELS });
  const pool = await poolService.createPool({
    programId: program.id, name: 'Spring pool', selectionQuota: 5, cohortId: cohort.id,
    settings: { autoAddFromCohortIds: [cohort.id], autoSelectAtProgress: 80 },
  }, admin);
  await poolService.setStatus(pool.id, 'open', admin);
  ctx = { admin, program, cohort, pool };
});

const apply = (email, level) => models.Application.create({
  cohortId: ctx.cohort.id, email, firstName: 'Ada', lastName: 'L', level, status: 'pending', source: 'public_link', responses: {},
});

/** Accept the pool invitation the way a candidate would. */
async function activate(email) {
  const calls = emailService.enqueue.mock.calls.filter(([m]) => m.to === email);
  const text = calls[calls.length - 1]?.[0]?.text || '';
  const match = text.match(/invite=([^\s&]+)/) || text.match(/\/i\/[^/\s]+\/([^\s/]+)/);
  await authService.register({ firstName: 'Ada', lastName: 'L', email, password: 'Test@12345', inviteToken: decodeURIComponent(match[1]) });
  return models.PoolMember.findOne({ where: { poolId: ctx.pool.id, email } });
}

const work = (title, levels) => poolTaskService.createAssignment(ctx.pool.id, {
  kind: 'task', title, description: 'x', difficulty: 'hard', levels, assignTo: 'all',
}, ctx.admin);

describe('intake → pool', () => {
  it('an applicant joins the pool by themselves, with their level', async () => {
    await automation.onApplication(await apply('ada@test.com', 'beginner'));
    const member = await models.PoolMember.findOne({ where: { poolId: ctx.pool.id, email: 'ada@test.com' } });
    expect(member).toMatchObject({ level: 'beginner', status: 'invited' });
    expect(member.details.source).toBe('application');
  });

  it('linking an intake later brings in everyone who already applied', async () => {
    await apply('early@test.com', 'senior');
    await automation.backfillCohort(ctx.pool, ctx.cohort.id);
    expect(await models.PoolMember.count({ where: { poolId: ctx.pool.id, email: 'early@test.com' } })).toBe(1);
  });

  it('ignores intakes the pool did not opt in to', async () => {
    const other = await models.Cohort.create({ programId: ctx.program.id, name: 'Other', status: 'open' });
    await automation.onApplication(await models.Application.create({
      cohortId: other.id, email: 'x@test.com', status: 'pending', source: 'public_link', responses: {},
    }));
    expect(await models.PoolMember.count({ where: { poolId: ctx.pool.id } })).toBe(0);
  });
});

describe('level → the right work', () => {
  it('hands out the level\'s work, and swaps it when the level changes', async () => {
    await work('Beginner lab', ['beginner']);
    await work('Senior lab', ['senior']);
    await automation.onApplication(await apply('ada@test.com', 'beginner'));
    const member = await activate('ada@test.com');
    expect((await openWork(member)).length).toBe(1);

    const { cancelled, assigned } = await automation.setMemberLevel(member, 'senior', ctx.admin);
    expect({ cancelled, assigned }).toEqual({ cancelled: 1, assigned: 1 });
    const live = await openWork(member);
    expect(live).toHaveLength(1);
    const step = await models.RoadmapTask.findByPk(live[0].roadmapTaskId);
    expect(step.title).toBe('Senior lab');
  });

  it('the AI level on the application flows to the pool member', async () => {
    await work('Beginner lab', ['beginner']);
    await work('Senior lab', ['senior']);
    const application = await apply('ada@test.com', 'beginner');
    await automation.onApplication(application);
    const member = await activate('ada@test.com');
    await application.update({ level: 'senior' });
    await automation.syncLevelFromApplication(application.id);
    expect((await member.reload()).level).toBe('senior');
  });

  it('refuses a level the round does not have', async () => {
    await automation.onApplication(await apply('ada@test.com', 'beginner'));
    const member = await activate('ada@test.com');
    await expect(automation.setMemberLevel(member, 'wizard', ctx.admin)).rejects.toThrow(/levels/);
  });
});

describe('Edorax progress → selected', () => {
  async function withProgress(email, pct) {
    await automation.onApplication(await apply(email, 'beginner'));
    const member = await activate(email);
    const task = await PoolTask().create({
      poolMemberId: member.id, menteeId: member.userId, mentorId: ctx.admin.id, roadmapTaskId: null,
      status: 'in_progress', assignedAt: new Date(),
    }, { validate: false });
    await models.CourseEnrollment.create({
      assignedTaskId: task.id, courseId: 'c1', courseTitle: 'Guided lab', learnerEmail: email,
      lifecycle: 'ACTIVE', overallProgress: pct,
    }, { validate: false });
    return member;
  }

  it('selects at the threshold and tells the candidate and the admins', async () => {
    const member = await withProgress('ada@test.com', 85);
    const result = await automation.checkAutoSelect(member.id);
    expect(result).toMatchObject({ progress: 85, selected: true });
    await member.reload();
    expect(member.decision).toBe('selected');
    expect(member.decisionReason).toMatch(/85%/);
    const events = orchestrator.dispatch.mock.calls.map(([c]) => c.eventKey);
    expect(events).toEqual(expect.arrayContaining(['pool_outcome', 'pool_attention']));
  });

  it('leaves someone below the threshold undecided', async () => {
    const member = await withProgress('ada@test.com', 60);
    expect(await automation.checkAutoSelect(member.id)).toMatchObject({ progress: 60, selected: false });
    expect((await member.reload()).decision).toBeNull();
  });

  it('never overrides a decision an admin already made', async () => {
    const member = await withProgress('ada@test.com', 95);
    await member.update({ decision: 'not_selected' });
    expect(await automation.checkAutoSelect(member.id)).toBeNull();
    expect((await member.reload()).decision).toBe('not_selected');
  });

  it('does nothing when the pool has no threshold', async () => {
    await ctx.pool.update({ settings: { ...ctx.pool.settings, autoSelectAtProgress: null } });
    const member = await withProgress('ada@test.com', 100);
    expect(await automation.checkAutoSelect(member.id)).toBeNull();
  });
});

describe('selected → a clan for their level, one click away', () => {
  it('suggests a clan that serves their level before a clan for another level', async () => {
    const mentorA = await seed.createMentor({ email: 'a@test.com' });
    const mentorB = await seed.createMentor({ email: 'b@test.com' });
    const beginners = await seed.createClan({ programId: ctx.program.id, leadMentor: mentorA, name: 'Beginners' });
    const seniors = await seed.createClan({ programId: ctx.program.id, leadMentor: mentorB, name: 'Seniors' });
    await beginners.update({ levels: ['beginner'] });
    await seniors.update({ levels: ['senior'] });

    await automation.onApplication(await apply('ada@test.com', 'senior'));
    const member = await activate('ada@test.com');
    await member.update({ decision: 'selected', placement: { status: 'pending' } });

    const preview = await poolPlacementService.preview(ctx.pool.id);
    const row = preview.rows.find((r) => r.memberId === member.id);
    expect(row.proposedClanName).toBe('Seniors');
    expect(row.reason).toMatch(/Serves senior/);
  });

  it('tells the suggested clan\'s mentors who is coming, and nobody else', async () => {
    const lead = await seed.createMentor({ email: 'lead@test.com' });
    const co = await seed.createMentor({ email: 'co@test.com' });
    const other = await seed.createMentor({ email: 'other@test.com' });
    const seniors = await seed.createClan({ programId: ctx.program.id, leadMentor: lead, coMentors: [co], name: 'Seniors' });
    const beginners = await seed.createClan({ programId: ctx.program.id, leadMentor: other, name: 'Beginners' });
    await seniors.update({ levels: ['senior'] });
    await beginners.update({ levels: ['beginner'] });

    await automation.onApplication(await apply('ada@test.com', 'senior'));
    const member = await activate('ada@test.com');
    await member.update({ decision: 'selected', placement: { status: 'pending' } });
    orchestrator.dispatch.mockClear();

    await require('../../src/services/poolScoringService')._notifyOutcomes(ctx.pool, { selected: [member.id] });
    const notice = orchestrator.dispatch.mock.calls.map(([c]) => c).find((c) => c.eventKey === 'pool_incoming_mentees');
    expect(notice).toBeTruthy();
    expect(notice.recipients.map((r) => r.userId).sort()).toEqual([lead.id, co.id].sort());
    expect(notice.payload.title).toMatch(/headed to Seniors/);
  });
});
