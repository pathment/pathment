'use strict';

/**
 * Removing an applicant from an intake — at any stage — undoes what the
 * application started, and keeps who did it and why:
 *   - their pool place is withdrawn (open pool work cancelled);
 *   - an unused sign-up invitation is revoked;
 *   - if they already joined the programme: out of its clans, open work
 *     cancelled, enrollment dropped;
 *   - the application is kept, marked removed, and can't come back by itself.
 */

const { Op } = require('sequelize');
const { models } = require('../../src/db');
const seed = require('../helpers/seed');
const emailService = require('../../src/services/emailService');
const authService = require('../../src/services/authService');
const poolService = require('../../src/services/poolService');
const poolTaskService = require('../../src/services/poolTaskService');
const automation = require('../../src/services/poolAutomationService');
const applicationService = require('../../src/services/applicationService');
const removal = require('../../src/services/applicationRemovalService');

const PoolTask = () => models.AssignedTask.scope('withPoolWork');
const LEVELS = [{ key: 'beginner', label: 'Beginner' }, { key: 'senior', label: 'Senior' }];

let ctx;

beforeEach(async () => {
  await seed.cleanDb();
  emailService.enqueue.mockClear();
  const admin = await seed.createAdmin();
  const program = await seed.createProgram({ createdBy: admin.id, name: 'Fellowship' });
  const cohort = await models.Cohort.create({ programId: program.id, name: 'Spring intake', status: 'open', levels: LEVELS });
  const pool = await poolService.createPool({
    programId: program.id, name: 'Spring pool', selectionQuota: 5, cohortId: cohort.id,
    settings: { autoAddFromCohortIds: [cohort.id] },
  }, admin);
  await poolService.setStatus(pool.id, 'open', admin);
  ctx = { admin, program, cohort, pool };
});

const apply = (email, level = 'beginner') => models.Application.create({
  cohortId: ctx.cohort.id, email, firstName: 'Ada', lastName: 'L', level, status: 'pending', source: 'public_link', responses: {},
});

async function activate(email) {
  const calls = emailService.enqueue.mock.calls.filter(([m]) => m.to === email);
  const text = calls[calls.length - 1]?.[0]?.text || '';
  const match = text.match(/invite=([^\s&]+)/) || text.match(/\/i\/[^/\s]+\/([^\s/]+)/);
  await authService.register({ firstName: 'Ada', lastName: 'L', email, password: 'Test@12345', inviteToken: decodeURIComponent(match[1]) });
  return models.PoolMember.findOne({ where: { poolId: ctx.pool.id, email } });
}

describe('removing an applicant from the intake', () => {
  it('confirms the pipeline: an applicant joins the linked pool at their level and gets that level\'s work', async () => {
    await poolTaskService.createAssignment(ctx.pool.id, { kind: 'task', title: 'Beginner lab', description: 'x', difficulty: 'hard', levels: ['beginner'], assignTo: 'all' }, ctx.admin);
    await poolTaskService.createAssignment(ctx.pool.id, { kind: 'task', title: 'Senior lab', description: 'x', difficulty: 'hard', levels: ['senior'], assignTo: 'all' }, ctx.admin);
    const app = await apply('ada@test.com', 'beginner');
    await automation.processApplication(app.id, { review: false });
    const member = await activate('ada@test.com');
    expect(member).toMatchObject({ level: 'beginner', applicationId: app.id });
    const tasks = await PoolTask().findAll({ where: { poolMemberId: member.id, status: { [Op.ne]: 'cancelled' } }, include: [{ model: models.RoadmapTask, as: 'roadmapTask', attributes: ['title'] }] });
    expect(tasks.map((t) => t.roadmapTask?.title)).toEqual(['Beginner lab']);
  });

  it('previews, then withdraws the pool place, cancels its work, revokes the invite and keeps who and why', async () => {
    await poolTaskService.createAssignment(ctx.pool.id, { kind: 'task', title: 'Lab', description: 'x', difficulty: 'hard', levels: [], assignTo: 'all' }, ctx.admin);
    const app = await apply('ada@test.com');
    await automation.processApplication(app.id, { review: false });
    const member = await activate('ada@test.com');

    const preview = await removal.preview(app.id);
    expect(preview.pools).toEqual([expect.objectContaining({ poolName: 'Spring pool', openTasks: 1, placed: false })]);

    await expect(removal.remove(app.id, { reason: '  ' }, ctx.admin)).rejects.toThrow(/Say why/);
    const out = await removal.remove(app.id, { reason: 'Duplicate application' }, ctx.admin);
    expect(out.undone).toMatchObject({ pools: [expect.objectContaining({ poolName: 'Spring pool', tasksCancelled: 1 })] });

    await member.reload();
    expect(member.decision).toBe('withdrawn');
    expect(await PoolTask().count({ where: { poolMemberId: member.id, status: { [Op.ne]: 'cancelled' } } })).toBe(0);
    expect((await app.reload()).status).toBe('removed');

    const detail = await applicationService.getApplication(app.id);
    expect(detail.removal).toMatchObject({ reason: 'Duplicate application', by: expect.any(String) });

    // Settled: no second removal, no accepting, no way back into a pool.
    await expect(removal.remove(app.id, { reason: 'again' }, ctx.admin)).rejects.toThrow(/already been removed/);
    await expect(applicationService.acceptApplication(app.id, {}, ctx.admin.id)).rejects.toThrow(/removed from the intake/);
    await member.destroy();
    await automation.processApplication(app.id, { review: false });
    expect(await models.PoolMember.count({ where: { applicationId: app.id } })).toBe(0);
  });

  it('revokes the sign-up invitation of someone accepted who hasn\'t joined yet', async () => {
    const app = await apply('accepted@test.com');
    await applicationService.acceptApplication(app.id, {}, ctx.admin.id);
    await app.reload();
    expect((await removal.preview(app.id)).invite).toBeTruthy();
    const out = await removal.remove(app.id, { reason: 'Declined the offer by email' }, ctx.admin);
    expect(out.undone.invite).toBe(true);
    expect((await models.RegistrationInvite.findByPk(app.inviteId)).revokedAt).not.toBeNull();
  });

  it('takes someone who already joined the programme out of its clans, cancels their work and drops the enrollment', async () => {
    const mentee = await seed.createMentee({ email: 'joined@test.com' });
    const mentor = await seed.createMentor({ email: 'lead@test.com' });
    const clan = await models.Clan.create({ programId: ctx.program.id, name: 'Clan A', leadMentorId: mentor.id, createdBy: ctx.admin.id });
    await models.ClanMembership.create({ clanId: clan.id, userId: mentee.id, role: 'mentee', status: 'active' });
    const enrollment = await models.Enrollment.create({ menteeId: mentee.id, programId: ctx.program.id, status: 'active' }, { validate: false });
    const task = await models.AssignedTask.create({ menteeId: mentee.id, mentorId: mentor.id, clanId: clan.id, status: 'in_progress' }, { validate: false });
    const done = await models.AssignedTask.create({ menteeId: mentee.id, mentorId: mentor.id, clanId: clan.id, status: 'completed' }, { validate: false });
    const app = await models.Application.create({
      cohortId: ctx.cohort.id, email: 'joined@test.com', firstName: 'Jo', status: 'accepted', source: 'manual', userId: mentee.id,
    });

    const preview = await removal.preview(app.id);
    expect(preview.programme).toMatchObject({ clans: [{ id: clan.id, name: 'Clan A' }], openTasks: 1, enrollments: [{ id: enrollment.id, status: 'active' }] });

    const out = await removal.remove(app.id, { reason: 'Left the country' }, ctx.admin);
    expect(out.undone).toMatchObject({ clans: ['Clan A'], tasksCancelled: 1, enrollmentsDropped: 1 });
    expect((await task.reload()).status).toBe('cancelled');
    expect((await done.reload()).status).toBe('completed'); // finished work is a record
    expect((await enrollment.reload()).status).toBe('dropped');
    const m = await models.ClanMembership.findOne({ where: { clanId: clan.id, userId: mentee.id } });
    expect(m.status).toBe('removed');
  });
});
