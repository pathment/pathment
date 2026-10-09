'use strict';

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const { createAdmin, createMentee, cleanDb } = require('../helpers/seed');
const { generateAccessToken } = require('../../src/utils/jwt');
const { runWithRequestContext } = require('../../src/utils/auditContext');

beforeAll(() => { process.env.MULTI_TENANT_WORKSPACES_ENABLED = 'true'; });
afterAll(() => { delete process.env.MULTI_TENANT_WORKSPACES_ENABLED; });

describe('organization tenancy', () => {
  let primary;
  let secondary;
  let admin;
  let outsider;
  let token;
  let outsiderToken;

  beforeEach(async () => {
    await cleanDb();
    primary = await models.Organization.findOne({ where: { slug: process.env.TENANT_SLUG || 'devweekends' } });
    expect(primary).toBeTruthy();
    secondary = await models.Organization.create({
      name: `Second workspace ${Date.now()}`, slug: `second-${Date.now()}`, status: 'active', timezone: 'UTC',
    });
    const growth = await models.Plan.findOne({ where: { key: 'growth' } });
    await runWithRequestContext({ organizationId: secondary.id }, () =>
      models.OrganizationSubscription.create({ organizationId: secondary.id, planId: growth.id, status: 'active' }));
    admin = await createAdmin({ email: `tenant-admin-${Date.now()}@test.com` });
    outsider = await createMentee({ email: `tenant-outsider-${Date.now()}@test.com` });
    await runWithRequestContext({ organizationId: secondary.id }, () =>
      models.OrganizationMembership.create({
        organizationId: secondary.id, userId: admin.id, role: 'admin', status: 'active', joinedAt: new Date(),
      }));
    token = generateAccessToken({ id: admin.id, email: admin.email, role: admin.role });
    outsiderToken = generateAccessToken({ id: outsider.id, email: outsider.email, role: outsider.role });

    await runWithRequestContext({ organizationId: primary.id }, () => models.Program.create({
      organizationId: primary.id, createdBy: admin.id, name: 'Primary program', description: 'Primary',
      type: 'mentorship', status: 'draft', visibility: 'private', totalDurationWeeks: 4,
    }));
    await runWithRequestContext({ organizationId: secondary.id }, () => models.Program.create({
      organizationId: secondary.id, createdBy: admin.id, name: 'Secondary program', description: 'Secondary',
      type: 'mentorship', status: 'draft', visibility: 'private', totalDurationWeeks: 4,
    }));
  });

  afterAll(async () => { await cleanDb(); });

  it('selects a workspace and returns only its usage and subscription', async () => {
    const response = await request(app)
      .get('/api/organizations/current')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Pathment-Workspace', secondary.slug);

    expect(response.status).toBe(200);
    expect(response.body.data.organization.id).toBe(secondary.id);
    expect(response.body.data.usage.programs).toBe(1);
    expect(response.body.data.subscription.plan.key).toBe('growth');
    expect(response.body.data.organizations.map((item) => item.id)).toEqual(expect.arrayContaining([primary.id, secondary.id]));
  });

  it('rejects a valid account that is not a member of the selected workspace', async () => {
    const response = await request(app)
      .get('/api/organizations/current')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .set('X-Pathment-Workspace', secondary.slug);
    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/do not have access/i);
  });

  it('automatically scopes tenant-owned model reads to the request workspace', async () => {
    const primaryNames = await runWithRequestContext({ organizationId: primary.id }, async () =>
      (await models.Program.findAll({ attributes: ['name'] })).map((row) => row.name));
    const secondaryNames = await runWithRequestContext({ organizationId: secondary.id }, async () =>
      (await models.Program.findAll({ attributes: ['name'] })).map((row) => row.name));
    expect(primaryNames).toContain('Primary program');
    expect(primaryNames).not.toContain('Secondary program');
    expect(secondaryNames).toEqual(['Secondary program']);
  });

  it('keeps the global user directory out of a second workspace', async () => {
    const response = await request(app).get('/api/mentees')
      .set('Authorization', `Bearer ${token}`).set('X-Pathment-Workspace', secondary.slug);
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain(outsider.email);
    const members = await runWithRequestContext({ organizationId: secondary.id, userId: admin.id },
      () => models.User.findAll({ attributes: ['id'] }));
    expect(members.map(row => row.id)).toEqual([admin.id]);
  });

  it('stamps bulk inserts and denies explicit cross-workspace writes', async () => {
    await runWithRequestContext({ organizationId: secondary.id, userId: admin.id }, async () => {
      const [row] = await models.Notification.bulkCreate([{
        userId: admin.id, type: 'system', title: 'Scoped', message: 'Scoped notification',
      }]);
      expect(row.organizationId).toBe(secondary.id);
      await expect(models.Notification.create({ organizationId: primary.id,
        userId: admin.id, type: 'system', title: 'Wrong', message: 'Wrong workspace',
      })).rejects.toThrow(/another workspace/i);
    });
  });

  it('does not move existing records between workspaces', async () => {
    await runWithRequestContext({ organizationId: primary.id }, async () => {
      const program = await models.Program.findOne();
      await expect(program.update({ organizationId: secondary.id })).rejects.toThrow(/workspace/i);
      await expect(models.Program.update({ organizationId: secondary.id }, { where: { id: program.id } }))
        .rejects.toThrow(/workspace/i);
    });
  });

  it('rejects a related program from another workspace', async () => {
    const foreignProgram = await models.Program.findOne({ where: { organizationId: primary.id } });
    await runWithRequestContext({ organizationId: secondary.id, userId: admin.id }, async () => {
      await expect(models.Clan.create({ programId: foreignProgram.id, name: 'Wrong tenant clan', createdBy: admin.id }))
        .rejects.toThrow(/selected workspace/i);
    });
  });

  it('does not inherit account mentor/admin roles as a member of another workspace', async () => {
    const authz = require('../../src/services/authzService');
    await runWithRequestContext({ organizationId: secondary.id }, () =>
      models.OrganizationMembership.update({ role: 'member' }, {
        where: { organizationId: secondary.id, userId: admin.id },
      }));
    const capabilities = await runWithRequestContext({ organizationId: secondary.id, userId: admin.id },
      () => authz.getCapabilities(admin));
    expect(capabilities).not.toContain('admin');
    expect(capabilities).not.toContain('mentor');
  });

  it('lets an explicitly assigned organization super admin manage workspace settings', async () => {
    await runWithRequestContext({ organizationId: secondary.id }, async () => {
      await models.OrganizationMembership.update({ role: 'member' }, {
        where: { organizationId: secondary.id, userId: admin.id },
      });
      await models.RoleAssignment.create({
        organizationId: secondary.id,
        userId: admin.id,
        role: 'super_admin',
        scopeType: 'org',
        scopeId: null,
      });
    });

    const overview = await request(app)
      .get('/api/organizations/current')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Pathment-Workspace', secondary.slug);
    expect(overview.status).toBe(200);
    expect(overview.body.data.membership.role).toBe('member');
    expect(overview.body.data.canManageOrganization).toBe(true);

    const updated = await request(app)
      .patch('/api/organizations/current')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Pathment-Workspace', secondary.slug)
      .send({ name: 'Managed by assigned super admin', timezone: 'Asia/Karachi' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.organization).toMatchObject({
      name: 'Managed by assigned super admin',
      timezone: 'Asia/Karachi',
    });

    const removedLogo = await request(app)
      .delete('/api/organizations/current/logo')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Pathment-Workspace', secondary.slug);
    expect(removedLogo.status).toBe(200);

    const planRequest = await request(app)
      .post('/api/organizations/current/plan-request')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Pathment-Workspace', secondary.slug)
      .send({ planKey: 'scale' });
    expect(planRequest.status).toBe(200);
    expect(planRequest.body.data.subscription.requestedPlan.key).toBe('scale');
  });

  it('keeps organization settings read-only for a member without full workspace access', async () => {
    await runWithRequestContext({ organizationId: secondary.id }, () =>
      models.OrganizationMembership.create({
        organizationId: secondary.id,
        userId: outsider.id,
        role: 'member',
        status: 'active',
        joinedAt: new Date(),
      }));

    const overview = await request(app)
      .get('/api/organizations/current')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .set('X-Pathment-Workspace', secondary.slug);
    expect(overview.status).toBe(200);
    expect(overview.body.data.canManageOrganization).toBe(false);

    const update = await request(app)
      .patch('/api/organizations/current')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .set('X-Pathment-Workspace', secondary.slug)
      .send({ timezone: 'Asia/Karachi' });
    expect(update.status).toBe(403);

    const removeLogo = await request(app)
      .delete('/api/organizations/current/logo')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .set('X-Pathment-Workspace', secondary.slug);
    expect(removeLogo.status).toBe(403);
  });

  it('rejects invalid workspace headers instead of silently using DevWeekends', async () => {
    const response = await request(app).get('/api/organizations/current')
      .set('Authorization', `Bearer ${token}`).set('X-Pathment-Workspace', '../bad');
    expect(response.status).toBe(400);
  });

  it('keeps optional role profiles optional when reading the current user', async () => {
    for (const person of [admin, outsider]) {
      const response = await request(app).get('/api/auth/me')
        .set('Authorization', `Bearer ${generateAccessToken({ id: person.id, email: person.email, role: person.role })}`)
        .set('X-Pathment-Workspace', primary.slug);
      expect(response.status).toBe(200);
      expect(response.body.data.user.id).toBe(person.id);
    }
  });

  it('keeps additional workspaces closed until explicitly enabled', async () => {
    process.env.MULTI_TENANT_WORKSPACES_ENABLED = 'false';
    try {
      const denied = await request(app).get('/api/organizations/current')
        .set('Authorization', `Bearer ${token}`).set('X-Pathment-Workspace', secondary.slug);
      expect(denied.status).toBe(403);
      const original = await request(app).get('/api/organizations/current')
        .set('Authorization', `Bearer ${token}`).set('X-Pathment-Workspace', primary.slug);
      expect(original.status).toBe(200);
      const creation = await request(app).post('/api/organizations')
        .set('Authorization', `Bearer ${token}`).set('X-Pathment-Workspace', primary.slug)
        .send({ name: 'Must remain gated', slug: 'gated-workspace' });
      expect(creation.status).toBe(403);
      const catalog = await request(app).get('/api/organizations/plans');
      expect(catalog.status).toBe(200);
      expect(catalog.body.data.plans.length).toBeGreaterThan(0);
    } finally { process.env.MULTI_TENANT_WORKSPACES_ENABLED = 'true'; }
  });

  it('activates only the requested invoice plan and records operator evidence atomically', async () => {
    const billing = require('../../src/services/manualBillingService');
    const orgService = require('../../src/services/organizationService');
    await runWithRequestContext({ organizationId: secondary.id, userId: admin.id }, async () => {
      await orgService.requestPlan(admin, secondary.id, 'scale');
      const input = { workspace: secondary.slug, planKey: 'scale', invoiceReference: 'INV-TEST-1',
        operator: 'test-operator', periodEnd: new Date(Date.now() + 86400000).toISOString() };
      expect((await billing.activateRequestedPlan(input)).alreadyActivated).toBe(false);
      expect((await billing.activateRequestedPlan(input)).alreadyActivated).toBe(true);
      const subscription = await orgService.subscription(secondary.id);
      expect(subscription.plan.key).toBe('scale');
      expect(subscription.provider).toBe('manual_invoice');
      expect(subscription.requestedPlanId).toBeNull();
      await expect(billing.activateRequestedPlan({ ...input, planKey: 'growth' })).rejects.toThrow(/invoice/i);
    });
  });

  it('lets organization admins request a plan without activating it prematurely', async () => {
    const response = await request(app)
      .post('/api/organizations/current/plan-request')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Pathment-Workspace', secondary.slug)
      .send({ planKey: 'scale' });
    expect(response.status).toBe(200);
    expect(response.body.data.subscription.plan.key).toBe('growth');
    expect(response.body.data.subscription.requestedPlan.key).toBe('scale');
    const repeated = await request(app)
      .post('/api/organizations/current/plan-request')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Pathment-Workspace', secondary.slug)
      .send({ planKey: 'scale' });
    expect(repeated.status).toBe(200);
    expect(repeated.body.data.subscription.requestedAt)
      .toBe(response.body.data.subscription.requestedAt);
  });

  it('creates an isolated Starter workspace and makes its creator the owner', async () => {
    const slug = `created-${Date.now()}`;
    const created = await request(app)
      .post('/api/organizations')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Pathment-Workspace', primary.slug)
      .send({ name: 'Created workspace', slug, timezone: 'Asia/Karachi' });

    expect(created.status).toBe(201);
    expect(created.body.data.organization.membershipRole).toBe('owner');

    const selected = await request(app)
      .get('/api/organizations/current')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Pathment-Workspace', slug);
    expect(selected.status).toBe(200);
    expect(selected.body.data.subscription.plan.key).toBe('starter');
    expect(selected.body.data.usage).toEqual({ members: 1, programs: 0, clans: 0 });
  });

  it('enforces plan features on the server while allowing ordinary settings', async () => {
    const starter = await models.Plan.findOne({ where: { key: 'starter' } });
    await runWithRequestContext({ organizationId: secondary.id }, () =>
      models.OrganizationSubscription.update(
        { planId: starter.id },
        { where: { organizationId: secondary.id } },
      ));

    const branding = await request(app)
      .patch('/api/organizations/current')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Pathment-Workspace', secondary.slug)
      .send({ primaryColor: '#112233' });
    expect(branding.status).toBe(403);

    const ordinary = await request(app)
      .patch('/api/organizations/current')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Pathment-Workspace', secondary.slug)
      .send({ name: 'Renamed workspace' });
    expect(ordinary.status).toBe(200);
    expect(ordinary.body.data.organization.name).toBe('Renamed workspace');
  });
});
