'use strict';

/**
 * Public API v1, phase 2 (read): programmes, clans, mentees and progress, over
 * HTTP — scopes, the shapes, the progress numbers, pagination, filters, and
 * that one workspace's key never sees another's people.
 */
const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const seed = require('../helpers/seed');
const apiKeys = require('../../src/integrations/apiKeyService');
const linear = require('../../src/services/linearRoadmapService');
const { runWithRequestContext } = require('../../src/utils/auditContext');

const bearer = (key) => ({ Authorization: `Bearer ${key}` });
const get = (key, path) => request(app).get(`/api/v1${path}`).set(bearer(key));
let ctx;

beforeEach(async () => {
  await seed.cleanDb();
  const admin = await seed.createAdmin();
  const mentor = await seed.createMentor({ email: 'lead.mentor@test.com', firstName: 'Lena', lastName: 'Mentor' });
  const ada = await seed.createMentee({ email: 'ada@test.com', firstName: 'Ada', lastName: 'L' });
  const bo = await seed.createMentee({ email: 'bo@test.com', firstName: 'Bo', lastName: 'K' });
  const program = await seed.createProgram({ createdBy: admin.id, name: 'Qantara Fellowship' });
  const clan = await seed.createClan({ programId: program.id, createdBy: admin.id, leadMentor: mentor, mentees: [ada, bo], name: 'MERN Fellows' });

  // Ada: a roadmap of 4 steps, 2 approved, 1 submitted, 1 overdue in progress.
  const roadmap = await linear.createOrgRoadmap(admin.id, {
    name: 'Month 1', programId: program.id,
    steps: ['A', 'B', 'C', 'D'].map((t) => ({ title: `Step ${t}`, type: 'project', difficulty: 'medium', deliverable: 'x', criteria: ['y'] })),
  });
  await linear.assignToMentee(mentor.id, roadmap.id, ada.id, 0, null, null, [0, 1, 2, 3], null, clan.id);
  const steps = await linear.getSteps(roadmap.id);
  const taskOf = (i) => models.AssignedTask.findOne({ where: { roadmapTaskId: steps[i].id, menteeId: ada.id } });
  await (await taskOf(0)).update({ status: 'completed' });
  await (await taskOf(1)).update({ status: 'completed' });
  await (await taskOf(2)).update({ status: 'submitted' });
  await (await taskOf(3)).update({ status: 'in_progress', dueDate: new Date(Date.now() - 86400000) });
  await models.RoadmapProgress.update({ currentStep: 2 }, { where: { roadmapId: roadmap.id, menteeId: ada.id } });

  // Attendance: 2 sessions — present, absent.
  for (const attendance of ['present', 'absent']) {
    const s = await models.CohortReviewSession.create({ mentorId: mentor.id, clanId: clan.id, sessionDate: '2026-11-10' });
    await models.CohortReviewEntry.create({ sessionId: s.id, menteeId: ada.id, attendance });
  }
  // A certificate for this programme.
  const template = await models.CertificateTemplate.create({ name: 'Completion', config: {}, createdBy: admin.id, programId: program.id });
  await models.CertificateInstance.create({ templateId: template.id, menteeId: ada.id, issuedBy: admin.id, certificateNumber: 'PM-TEST-0001', tier: 'completion' });

  // Ada came in through a sync: her partner ID links back.
  const cohort = await models.Cohort.create({ programId: program.id, name: 'Intake', status: 'open' });
  const appRow = await models.Application.create({ cohortId: cohort.id, email: 'ada@test.com', status: 'accepted', source: 'api', responses: {}, userId: ada.id });
  await models.ExternalIdentity.create({ sourceKey: `api:${cohort.id}`, externalId: 'crm-42', applicationId: appRow.id, lastValues: {} });

  const all = await apiKeys.create(admin, { name: 'All', scopes: ['programmes:read', 'mentees:read', 'progress:read'] });
  const progressOnly = await apiKeys.create(admin, { name: 'Progress', scopes: ['progress:read'] });
  ctx = { admin, mentor, ada, bo, program, clan, roadmap, key: all.key, progressKey: progressOnly.key };
});

describe('programmes and clans', () => {
  it('lists programmes with their counts, and retrieves one', async () => {
    const res = await get(ctx.key, '/programmes');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([expect.objectContaining({ id: ctx.program.id, name: 'Qantara Fellowship', clanCount: 1, menteeCount: 2 })]);
    const one = await get(ctx.key, `/programmes/${ctx.program.id}`);
    expect(one.body).toMatchObject({ id: ctx.program.id, type: 'mentorship' });
    const missing = await get(ctx.key, '/programmes/00000000-0000-4000-8000-000000000000');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('programme_not_found');
  });

  it('lists clans with the lead mentor and the mentee count', async () => {
    const res = await get(ctx.key, `/clans?programmeId=${ctx.program.id}`);
    expect(res.body.data).toEqual([expect.objectContaining({
      id: ctx.clan.id, name: 'MERN Fellows', programmeId: ctx.program.id, menteeCount: 2,
      leadMentor: { id: ctx.mentor.id, name: 'Lena Mentor' },
    })]);
    const bad = await get(ctx.key, '/clans?programmeId=nope');
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatchObject({ code: 'validation_failed', field: 'programmeId' });
  });
});

describe('mentees', () => {
  it('lists mentees with clans, enrollments and their partner ID', async () => {
    const res = await get(ctx.key, '/mentees');
    expect(res.status).toBe(200);
    expect(res.body.data.map((m) => m.email).sort()).toEqual(['ada@test.com', 'bo@test.com']);
    const ada = res.body.data.find((m) => m.email === 'ada@test.com');
    expect(ada).toMatchObject({
      id: ctx.ada.id, firstName: 'Ada', externalId: 'crm-42',
      clans: [{ id: ctx.clan.id, name: 'MERN Fellows', programmeId: ctx.program.id, membership: 'active' }],
    });
    expect(ada.enrollments[0]).toMatchObject({ programmeId: ctx.program.id });
    // Not a mentee (the mentor) is not listed and can't be fetched.
    expect(res.body.data.some((m) => m.id === ctx.mentor.id)).toBe(false);
    expect((await get(ctx.key, `/mentees/${ctx.mentor.id}`)).status).toBe(404);
  });

  it('filters by email and by their partner ID, and pages', async () => {
    expect((await get(ctx.key, '/mentees?email=BO@test.com')).body.data.map((m) => m.id)).toEqual([ctx.bo.id]);
    expect((await get(ctx.key, '/mentees?externalId=crm-42')).body.data.map((m) => m.id)).toEqual([ctx.ada.id]);
    const first = await get(ctx.key, '/mentees?limit=1');
    expect(first.body.hasMore).toBe(true);
    const second = await get(ctx.key, `/mentees?limit=1&cursor=${first.body.nextCursor}`);
    expect(second.body.hasMore).toBe(false);
    expect(second.body.data[0].id).not.toBe(first.body.data[0].id);
  });

  it('needs mentees:read — progress alone has no names', async () => {
    const res = await get(ctx.progressKey, '/mentees');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('insufficient_scope');
  });
});

describe('progress', () => {
  it('adds up a mentee\'s work, roadmap, attendance and certificates', async () => {
    const res = await get(ctx.progressKey, `/mentees/${ctx.ada.id}/progress`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const p = res.body.data[0];
    expect(p).toMatchObject({
      menteeId: ctx.ada.id,
      programme: { id: ctx.program.id, name: 'Qantara Fellowship' },
      clan: { id: ctx.clan.id, name: 'MERN Fellows' },
      completionPercent: 50,
      tasks: { total: 4, open: 1, submitted: 1, completed: 2, revisionNeeded: 0, overdue: 1 },
      roadmaps: [{ id: ctx.roadmap.id, name: 'Month 1', currentStep: 2, totalSteps: 4, completed: false }],
      attendance: { sessions: 2, present: 1, absent: 1, excused: 0, rate: 0.5 },
    });
    expect(p.certificates).toEqual([expect.objectContaining({
      number: 'PM-TEST-0001', tier: 'completion', verifyUrl: 'https://app.pathment.me/verify/PM-TEST-0001',
    })]);
    expect(JSON.stringify(p)).not.toContain('ada@test.com');
  });

  it('pages through a programme\'s progress', async () => {
    const first = await get(ctx.progressKey, `/programmes/${ctx.program.id}/progress?limit=1`);
    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(1);
    expect(first.body.hasMore).toBe(true);
    const second = await get(ctx.progressKey, `/programmes/${ctx.program.id}/progress?limit=1&cursor=${first.body.nextCursor}`);
    expect(second.body.hasMore).toBe(false);
    expect([first.body.data[0].menteeId, second.body.data[0].menteeId].sort()).toEqual([ctx.ada.id, ctx.bo.id].sort());
    const bo = [first.body.data[0], second.body.data[0]].find((p) => p.menteeId === ctx.bo.id);
    expect(bo).toMatchObject({ completionPercent: 0, tasks: { total: 0 }, attendance: { sessions: 0, rate: null }, certificates: [] });
  });

  it('refuses someone who is not a mentee here', async () => {
    const res = await get(ctx.progressKey, `/mentees/${ctx.mentor.id}/progress`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('mentee_not_found');
  });
});

describe('workspace isolation', () => {
  it('another workspace\'s key sees none of it', async () => {
    process.env.MULTI_TENANT_WORKSPACES_ENABLED = 'true';
    try {
      const other = await models.Organization.create({ name: `Other ${Date.now()}`, slug: `other-${Date.now()}`, status: 'active', timezone: 'UTC' });
      const plan = await models.Plan.findOne({ where: { key: 'growth' } });
      let key;
      await runWithRequestContext({ organizationId: other.id }, async () => {
        if (plan) await models.OrganizationSubscription.create({ organizationId: other.id, planId: plan.id, status: 'active' });
        key = (await apiKeys.create(ctx.admin, { name: 'Theirs', scopes: ['programmes:read', 'mentees:read', 'progress:read'] })).key;
      });
      expect((await get(key, '/programmes')).body.data).toEqual([]);
      expect((await get(key, '/mentees')).body.data).toEqual([]);
      expect((await get(key, `/mentees/${ctx.ada.id}`)).status).toBe(404);
      expect((await get(key, `/mentees/${ctx.ada.id}/progress`)).status).toBe(404);
      expect((await get(key, `/programmes/${ctx.program.id}/progress`)).status).toBe(404);
    } finally {
      delete process.env.MULTI_TENANT_WORKSPACES_ENABLED;
    }
  });
});
