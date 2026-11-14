'use strict';

/**
 * A public apply link must open for a stranger.
 *
 * On production the copied link was `app.pathment.me/apply/<slug>`. Someone
 * with no workspace cookie (incognito, a new applicant) was sent to the
 * account chooser and then to log in, a dead end for a form that needs no
 * account. Links now carry `/w/<workspace>`, and older bare links still resolve
 * because the cohort's slug says which workspace it belongs to.
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const { createAdmin, cleanDb } = require('../helpers/seed');
const { runWithRequestContext } = require('../../src/utils/auditContext');
const cohortIntakeService = require('../../src/services/cohortIntakeService');
const publicIntakeService = require('../../src/services/publicIntakeService');

beforeAll(() => { process.env.MULTI_TENANT_WORKSPACES_ENABLED = 'true'; });
afterAll(() => { delete process.env.MULTI_TENANT_WORKSPACES_ENABLED; });

describe('public apply link and its workspace', () => {
  let secondary;
  let cohort;

  beforeEach(async () => {
    await cleanDb();
    secondary = await models.Organization.create({
      name: `Second ${Date.now()}`, slug: `second-${Date.now()}`, status: 'active', timezone: 'UTC',
      settings: { onboardingSource: 'public_signup' },
    });
    const growth = await models.Plan.findOne({ where: { key: 'growth' } });
    const admin = await createAdmin({ email: `apply-admin-${Date.now()}@test.com` });
    await runWithRequestContext({ organizationId: secondary.id, organizationSlug: secondary.slug }, async () => {
      await models.OrganizationSubscription.create({ organizationId: secondary.id, planId: growth.id, status: 'active' });
      await models.OrganizationMembership.create({
        organizationId: secondary.id, userId: admin.id, role: 'admin', status: 'active', joinedAt: new Date(),
      });
      const program = await models.Program.create({
        organizationId: secondary.id, createdBy: admin.id, name: 'Fellowship', description: 'x',
        type: 'mentorship', status: 'published', visibility: 'public', totalDurationWeeks: 4,
      });
      cohort = await models.Cohort.create({
        organizationId: secondary.id, programId: program.id, name: 'Intake', status: 'open',
        createdBy: admin.id, publicEnabled: true, publicSlug: `slug${Date.now()}`,
      });
    });
  });

  afterAll(async () => { await cleanDb(); });

  it('a bare link with no workspace still finds the cohort in its own workspace', async () => {
    const res = await request(app).get(`/api/public/cohorts/${cohort.publicSlug}`);
    expect(res.status).toBe(200);
    expect(res.body.data.cohort.id).toBe(cohort.id);
    // The page uses this to move itself onto /w/<workspace>/apply/….
    expect(res.body.data.workspace).toBe(secondary.slug);
  });

  it('an explicit workspace is still respected', async () => {
    const res = await request(app).get(`/api/public/cohorts/${cohort.publicSlug}`).set('X-Pathment-Workspace', 'devweekends');
    expect(res.status).toBe(404);
  });

  it('unknown slugs are still not found', async () => {
    expect((await request(app).get('/api/public/cohorts/nope-not-real')).status).toBe(404);
  });

  it('links the server builds carry the workspace', async () => {
    await runWithRequestContext({ organizationId: secondary.id, organizationSlug: secondary.slug }, async () => {
      expect(cohortIntakeService.buildApplyUrl('abc')).toMatch(new RegExp(`/w/${secondary.slug}/apply/abc$`));
      expect(publicIntakeService.buildStatusUrl('tok')).toMatch(new RegExp(`/w/${secondary.slug}/apply/status/tok$`));
    });
  });
});
