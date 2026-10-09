const { models, sequelize } = require('../../src/db');
const { cleanDb, createAdmin, createMentor, createMentee, createProgram } = require('../helpers/seed');
const { runWithRequestContext } = require('../../src/utils/auditContext');
const lifecycle = require('../../src/services/programLifecycleService');
const standing = require('../../src/services/standingClanService');
const clans = require('../../src/services/clanService');
const tasks = require('../../src/services/taskService');
const performance = require('../../src/services/performanceService');
const community = require('../../src/services/communityService');

describe('formal completion and independent standing clans', () => {
  let organization, admin, mentor, sara, bilal, alpha, beta, cohort, original, other, template;
  const within = fn => runWithRequestContext({ organizationId: organization.id, workspaceJob: true }, fn);
  beforeEach(async () => {
    await cleanDb();
    organization = await models.Organization.findOne({ where: { slug: process.env.TENANT_SLUG || 'devweekends' } });
    await within(async () => {
      admin = await createAdmin({ email: 'admin-completion@test.com' });
      mentor = await createMentor({ email: 'mentor-completion@test.com' });
      sara = await createMentee({ email: 'sara-completion@test.com' });
      bilal = await createMentee({ email: 'bilal-completion@test.com' });
      alpha = await createProgram({ createdBy: admin.id, name: 'Alpha' });
      await alpha.update({ startDate: '2020-01-01', endDate: '2020-02-01' });
      beta = await createProgram({ createdBy: admin.id, name: 'Beta' });
      cohort = await models.Cohort.create({ programId: alpha.id, name: 'Alpha cohort', status: 'running', createdBy: admin.id });
      original = await clans.createClan({ programId: alpha.id, name: 'Original', leadMentorId: mentor.id }, admin.id);
      other = await clans.createClan({ programId: beta.id, name: 'Other', leadMentorId: mentor.id }, admin.id);
      const saraMembership = await clans.addMember(original.id, { userId: sara.id, role: 'mentee' });
      await models.Enrollment.update({ cohortId: cohort.id }, { where: { id: saraMembership.enrollmentId } });
      await clans.addMember(other.id, { userId: bilal.id, role: 'mentee' });
      template = await models.CertificateTemplate.create({ name: 'Alpha certificate', config: {}, programId: alpha.id, createdBy: admin.id, criteria: [{ id: 'gold', name: 'Gold' }] });
      await models.CertificateVerification.create({ templateId: template.id, menteeId: sara.id, clanId: original.id,
        decision: 'award', finalTier: 'gold', status: 'verified', verifiedBy: mentor.id, verifiedAt: new Date() });
    });
  });
  afterAll(() => sequelize.close());

  it('lets an admin close early while preserving the close snapshot', () => within(async () => {
    await alpha.update({ endDate: '2099-01-01' });
    await models.CertificateVerification.update({ status: 'pending' }, { where: { templateId: template.id } });
    const preview = await lifecycle.preview(alpha.id, admin);
    expect(preview).toMatchObject({ started: true, ended: false, canClose: true, earliestCloseDate: '2020-01-01', scheduledEndDate: '2099-01-01' });
    await expect(lifecycle.closeProgram(alpha.id, admin)).resolves.toBeTruthy();
    expect((await alpha.reload()).closedAt).toBeTruthy();
  }));

  it('allows a custom historical close date after start and rejects dates before start', () => within(async () => {
    await alpha.update({ startDate: '2020-01-10', endDate: '2099-01-01' });
    await expect(lifecycle.closeProgram(alpha.id, admin, { closedAt: '2020-01-09' }))
      .rejects.toThrow(/before the program start date/);
    await expect(lifecycle.closeProgram(alpha.id, admin, { closedAt: '2020-02-15' })).resolves.toBeTruthy();
    expect((await alpha.reload()).closedAt.toISOString().slice(0, 10)).toBe('2020-02-15');
  }));

  it('does not allow closure before the program has started', () => within(async () => {
    await alpha.update({ startDate: '2099-01-01', endDate: '2099-06-01' });
    await expect(lifecycle.preview(alpha.id, admin)).resolves.toMatchObject({ started: false, ended: false, canClose: false });
    await expect(lifecycle.closeProgram(alpha.id, admin)).rejects.toThrow(/before the program start date/);
  }));

  it('closes exactly once, freezes cohort clans, and exposes final results from enrollments', () => within(async () => {
    const historicalTask = await tasks.createCustomTask({ menteeId: sara.id, clanId: original.id, title: 'Before close', type: 'exercise' }, mentor.id);
    const historicalPost = await community.createPost(sara, { scopeType: 'clan', scopeId: original.id, body: 'Before close' });
    const historicalSchedule = await require('../../src/services/reviewScheduleService').createSchedule(mentor.id, {
      clanId: original.id, title: 'Before close', dayOfWeek: new Date().getUTCDay(), timeLocal: '23:59',
      timezone: 'UTC', startsOn: new Date().toISOString().slice(0, 10),
    });
    const [a, b] = await Promise.all([lifecycle.closeProgram(alpha.id, admin), lifecycle.closeProgram(alpha.id, admin)]);
    expect(a.id).toBe(b.id);
    expect((await alpha.reload()).closedAt).toBeTruthy();
    expect((await cohort.reload()).status).toBe('completed');
    expect((await original.reload()).frozenAt).toBeTruthy();
    expect((await historicalSchedule.reload()).active).toBe(false);
    const enrollment = await models.Enrollment.findOne({ where: { menteeId: sara.id, programId: alpha.id } });
    expect(enrollment.status).toBe('program_completed');
    expect(enrollment.completedAt).toBeTruthy();
    const results = await lifecycle.results(alpha.id, admin);
    expect(results.closed).toBe(true);
    const row = results.snapshots.find(s => s.menteeId === sara.id);
    expect(row.outcome).toBe('certified');
    expect(row.tier).toBe('gold');
    expect(row.performance.parts).toBeDefined();
    await expect(clans.addMember(original.id, { userId: bilal.id, role: 'mentee' })).rejects.toThrow(/historical/);
    await expect(tasks.createCustomTask({ menteeId: sara.id, clanId: original.id, title: 'After close', type: 'exercise' }, mentor.id))
      .rejects.toMatchObject({ code: 'CLAN_FROZEN' });
    await expect(require('../../src/services/submissionService').submitTaskWithFiles(historicalTask.id, sara.id, { submissionText: 'After close' }))
      .rejects.toMatchObject({ code: 'CLAN_FROZEN' });
    await expect(require('../../src/services/taskProgressService').log(sara.id, historicalTask.id, { note: 'After close', minutesSpent: 10 }))
      .rejects.toMatchObject({ code: 'CLAN_FROZEN' });
    await expect(community.createPost(sara, { scopeType: 'clan', scopeId: original.id, body: 'After close' }))
      .rejects.toMatchObject({ code: 'CLAN_FROZEN' });
    await expect(community.listComments(sara, historicalPost.id)).resolves.toEqual([]);
    await expect(community.addComment(sara, historicalPost.id, { body: 'After close' }))
      .rejects.toMatchObject({ code: 'CLAN_FROZEN' });
    await expect(require('../../src/services/frictionService').createBlocker({ menteeId: sara.id, clanId: original.id, title: 'After close' }, sara.id, sara))
      .rejects.toMatchObject({ code: 'CLAN_FROZEN' });
    await expect(require('../../src/services/dailyLogService').upsert(sara.id, { clanId: original.id, dateKey: '2026-10-04', note: 'After close' }))
      .rejects.toMatchObject({ code: 'CLAN_FROZEN' });
    await expect(community.createPost(sara, { scopeType: 'program', scopeId: alpha.id, body: 'Still open' })).resolves.toBeTruthy();
  }));

  it('approves one fresh empty clan and adds cross-program mentees without transfers or enrollments', () => within(async () => {
    await lifecycle.closeProgram(alpha.id, admin);
    const request = await standing.request({ programId: alpha.id, name: 'Ongoing mentoring' }, mentor);
    const [first, retry] = await Promise.all([standing.decide(request.id, 'approved', '', admin), standing.decide(request.id, 'approved', '', admin)]);
    expect(first.createdClanId).toBe(retry.createdClanId);
    expect(first.createdClanId).not.toBe(original.id);
    const fresh = await models.Clan.findByPk(first.createdClanId);
    expect(fresh.kind).toBe('standing');
    expect(fresh.frozenAt).toBeNull();
    expect(await models.ClanMembership.count({ where: { clanId: fresh.id, role: 'mentee' } })).toBe(0);
    const enrollmentCount = await models.Enrollment.count();
    await standing.addMenteesToStandingClan(fresh.id, [sara.id, bilal.id], mentor);
    await standing.addMenteesToStandingClan(fresh.id, [sara.id], mentor);
    expect(await models.Enrollment.count()).toBe(enrollmentCount);
    const memberships = await models.ClanMembership.findAll({ where: { clanId: fresh.id, role: 'mentee' } });
    expect(memberships).toHaveLength(2);
    expect(memberships.every(m => m.enrollmentId === null && m.joinedAt)).toBe(true);
    expect(await models.ClanMembership.count({ where: { userId: bilal.id, clanId: other.id, status: 'active' } })).toBe(1);
    const enrollmentBefore = (await models.Enrollment.findOne({ where: { menteeId: sara.id, programId: alpha.id } })).toJSON();
    const betaBefore = (await models.Enrollment.findOne({ where: { menteeId: bilal.id, programId: beta.id } })).toJSON();
    const task = await tasks.createCustomTask({ menteeId: bilal.id, clanId: fresh.id, title: 'Independent task', type: 'exercise' }, mentor.id);
    expect(task.enrollmentId).toBeNull();
    await models.AssignedTask.update({ status: 'completed', completedAt: new Date() }, { where: { id: task.id } });
    const betaAfter = (await models.Enrollment.findOne({ where: { menteeId: bilal.id, programId: beta.id } })).toJSON();
    expect(betaAfter).toEqual(betaBefore);
    expect((await models.Enrollment.findOne({ where: { menteeId: sara.id, programId: alpha.id } })).toJSON()).toEqual(enrollmentBefore);
    const report = await standing.activity(fresh.id, { period: 'joined' }, mentor);
    expect(report.mentees.find(m => m.id === bilal.id).tasksCompleted).toBe(1);
    const scores = await performance.scoreMentees([bilal.id], { programId: beta.id });
    expect(scores.mentees[0].evidence.tasksCompleted).toBe(0);
  }));

  it('rejects without creating a clan, and rejects non-admin decisions', () => within(async () => {
    await lifecycle.closeProgram(alpha.id, admin);
    const request = await standing.request({ programId: alpha.id, name: 'Rejected' }, mentor);
    await expect(standing.decide(request.id, 'approved', '', mentor)).rejects.toThrow(/Only an admin/);
    await standing.decide(request.id, 'rejected', 'Please clarify the proposed mentoring work.', admin);
    expect(await models.Clan.count({ where: { kind: 'standing' } })).toBe(0);
    expect((await standing.list(mentor))[0].status).toBe('rejected');
  }));

  it('keeps recurring tasks, reviews, logs and blockers working in their actual clan', () => within(async () => {
    const existingLog = await models.DailyLogEntry.create({ menteeId: bilal.id, clanId: other.id, dateKey: new Date().toISOString().slice(0, 10), note: 'Beta history' });
    await models.ClanMembership.update({ status: 'paused' }, { where: { clanId: other.id, userId: bilal.id } });
    await lifecycle.closeProgram(alpha.id, admin);
    const request = await standing.request({ programId: alpha.id, name: 'Ongoing' }, mentor);
    const approved = await standing.decide(request.id, 'approved', '', admin);
    const clanId = approved.createdClanId;
    await standing.addMenteesToStandingClan(clanId, [sara.id, bilal.id], mentor);
    const task = await tasks.createCustomTask({ menteeId: bilal.id, clanId, title: 'Keep learning', type: 'exercise' }, mentor.id);
    await require('../../src/services/taskProgressService').log(bilal.id, task.id, { note: 'Worked on a solution', minutesSpent: 15 });
    expect((await existingLog.reload()).note).toBe('Beta history');
    expect(await models.DailyLogEntry.count({ where: { clanId, menteeId: bilal.id } })).toBe(1);
    const blocker = await require('../../src/services/frictionService').createBlocker({ menteeId: bilal.id, clanId, title: 'Need feedback', assignedTaskId: task.id }, bilal.id, bilal);
    expect(blocker.clanId).toBe(clanId);
    const today = new Date().toISOString().slice(0, 10);
    const recurrence = { title: 'Weekly practice', type: 'exercise', dayOfWeek: new Date().getUTCDay(), timeLocal: '23:59', timezone: 'UTC', startsOn: today };
    const materializer = require('../../src/services/recurringSlotMaterializer');
    const first = await materializer._processSlotForMentee(bilal.id, mentor.id, 'standing-weekly', recurrence, clanId);
    expect(first.createdForSlot).toBeGreaterThan(0);
    const retry = await materializer._processSlotForMentee(bilal.id, mentor.id, 'standing-weekly', recurrence, clanId);
    expect(retry.createdForSlot).toBe(0);
    expect((await materializer._processSlotForMentee(sara.id, mentor.id, 'historical-weekly', recurrence, original.id)).createdForSlot).toBe(0);
    const reviews = require('../../src/services/reviewScheduleService');
    const schedule = await reviews.createSchedule(mentor.id, { ...recurrence, clanId });
    const session = await models.CohortReviewSession.findOne({ where: { reviewScheduleId: schedule.id } });
    expect(session).toBeTruthy();
    await models.CohortReviewEntry.create({ sessionId: session.id, menteeId: bilal.id, attendance: 'present' });
    await require('../../src/services/mentorshipPauseService').autoResumeIfPaused(bilal.id, 'joined a review', clanId);
    expect((await models.ClanMembership.findOne({ where: { clanId: other.id, userId: bilal.id } })).status).toBe('paused');
    const report = await standing.activity(clanId, { period: 'joined' }, mentor);
    expect(report.mentees.find(m => m.id === bilal.id)).toMatchObject({ dailyLogs: 1, blockersRaised: 1 });
    expect((await performance.scoreMentees([bilal.id], { programId: beta.id })).mentees[0].evidence.tasksCompleted).toBe(0);
    await expect(reviews.createSchedule(mentor.id, { ...recurrence, clanId: original.id }))
      .rejects.toMatchObject({ code: 'CLAN_FROZEN' });
  }));

  it('retains a recorded dropped outcome for enrollments already marked dropped', () => within(async () => {
    await models.Enrollment.update({ status: 'dropped', droppedAt: new Date() }, { where: { menteeId: sara.id, programId: alpha.id } });
    await models.CertificateVerification.update({ decision: 'no_certificate', finalTier: null, overrideReason: 'Inactive during the program' }, { where: { templateId: template.id } });
    await tasks.createCustomTask({ menteeId: sara.id, clanId: original.id, title: 'Historical work', type: 'exercise' }, mentor.id);
    await lifecycle.closeProgram(alpha.id, admin);
    const results = await lifecycle.results(alpha.id, admin);
    expect(results.snapshots.find(s => s.menteeId === sara.id).outcome).toBe('dropped');
    await expect(standing.addMenteesToStandingClan(original.id, [bilal.id], mentor)).rejects.toThrow(/only for standing/);
  }));

  it('reopens and recloses without snapshot tables, leaving the standing clan intact', () => within(async () => {
    await lifecycle.closeProgram(alpha.id, admin);
    const firstClosedAt = (await alpha.reload()).closedAt;
    const request = await standing.request({ programId: alpha.id, name: 'Independent' }, mentor);
    const approved = await standing.decide(request.id, 'approved', '', admin);
    await standing.addMenteesToStandingClan(approved.createdClanId, [sara.id], mentor);
    await lifecycle.reopenProgram(alpha.id, 'Correct attendance after appeal', admin);
    expect((await original.reload()).frozenAt).toBeNull();
    expect((await alpha.reload()).closedAt).toBeNull();
    await models.CertificateVerification.update({ decision: 'no_certificate', finalTier: null, overrideReason: 'Requirements not met after correction' }, { where: { templateId: template.id } });
    await lifecycle.closeProgram(alpha.id, admin);
    const results = await lifecycle.results(alpha.id, admin);
    expect(results.snapshots.find(s => s.menteeId === sara.id).outcome).toBe('completed_uncertified');
    expect((await alpha.reload()).closedAt).toBeTruthy();
    expect((await alpha.reload()).closedAt.getTime()).not.toBe(firstClosedAt.getTime());
    expect((await models.Clan.findByPk(approved.createdClanId)).frozenAt).toBeNull();
    expect(await models.ClanMembership.count({ where: { clanId: approved.createdClanId, userId: sara.id, status: 'active' } })).toBe(1);
  }));
});
