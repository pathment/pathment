'use strict';

jest.mock('../../src/utils/cloudinaryUpload', () => {
  const actual = jest.requireActual('../../src/utils/cloudinaryUpload');
  return {
    ...actual,
    uploadToCloudinary: jest.fn(),
    deleteFromCloudinary: jest.fn().mockResolvedValue({ result: 'ok' }),
  };
});

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const cloudinaryUpload = require('../../src/utils/cloudinaryUpload');
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
    await models.OrganizationSubscription.create({ organizationId: secondary.id, planId: growth.id, status: 'active' });
    admin = await createAdmin({ email: `tenant-admin-${Date.now()}@test.com` });
    outsider = await createMentee({ email: `tenant-outsider-${Date.now()}@test.com` });
    await models.OrganizationMembership.create({
      organizationId: secondary.id, userId: admin.id, role: 'admin', status: 'active', joinedAt: new Date(),
    });
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

  it('does not cache a stale logo from a read already in flight during update', async () => {
    const organizationService = require('../../src/services/organizationService');
    const oldLogoUrl = 'https://example.com/old-logo.png';
    const newLogoUrl = 'https://example.com/new-logo.png';
    const context = { organizationId: secondary.id, userId: admin.id };
    await runWithRequestContext(context, () => organizationService.update(admin.id, secondary.id, { logoUrl: oldLogoUrl }));

    let markReadStarted;
    const readStarted = new Promise((resolve) => { markReadStarted = resolve; });
    let releaseRead;
    const continueRead = new Promise((resolve) => { releaseRead = resolve; });
    const originalFindByPk = models.Organization.findByPk.bind(models.Organization);
    let pauseNextRead = true;
    const findByPk = jest.spyOn(models.Organization, 'findByPk').mockImplementation(async (...args) => {
      const organization = await originalFindByPk(...args);
      if (args[0] === secondary.id && pauseNextRead) {
        pauseNextRead = false;
        markReadStarted();
        await continueRead;
      }
      return organization;
    });

    try {
      const staleRead = runWithRequestContext(context, () => organizationService.currentForUser(admin.id, secondary.id));
      await readStarted;
      await runWithRequestContext(context, () => organizationService.update(admin.id, secondary.id, { logoUrl: newLogoUrl }));
      releaseRead();

      const inFlightResult = await staleRead;
      expect(inFlightResult.organization.logoUrl).toBe(oldLogoUrl);
      const nextRead = await runWithRequestContext(context, () => organizationService.currentForUser(admin.id, secondary.id));
      expect(nextRead.organization.logoUrl).toBe(newLogoUrl);
    } finally {
      releaseRead();
      findByPk.mockRestore();
    }
  });

  it('lets workspace admins upload and remove a logo', async () => {
    const headers = {
      Authorization: `Bearer ${token}`,
      'X-Pathment-Workspace': secondary.slug,
    };
    const empty = await request(app).get('/api/organizations/current').set(headers);
    expect(empty.status).toBe(200);
    expect(empty.body.data.organization.logoUrl).toBeNull();

    const findByPk = jest.spyOn(models.Organization, 'findByPk');
    const cachedRead = await request(app).get('/api/organizations/current').set(headers);
    expect(cachedRead.status).toBe(200);
    expect(cachedRead.body.data.organization.logoUrl).toBeNull();
    expect(findByPk).toHaveBeenCalledWith(secondary.id, {
      attributes: { exclude: ['logoUrl'] },
    });
    findByPk.mockRestore();

    const logoUrl = 'https://res.cloudinary.com/test/image/upload/v123/pathment/organization-logos/brand.png';
    cloudinaryUpload.uploadToCloudinary.mockResolvedValueOnce({
      secure_url: logoUrl,
      public_id: 'pathment/organization-logos/brand',
    });

    const uploaded = await request(app)
      .post('/api/organizations/current/logo')
      .set(headers)
      .attach('file', Buffer.from('image-bytes'), { filename: 'brand.png', contentType: 'image/png' });
    expect(uploaded.status).toBe(200);
    expect(uploaded.body.data.organization.logoUrl).toBe(logoUrl);
    expect(cloudinaryUpload.uploadToCloudinary).toHaveBeenCalledWith(
      expect.any(Buffer), 'pathment/organization-logos', 'image',
    );
    const afterUpload = await request(app).get('/api/organizations/current').set(headers);
    expect(afterUpload.body.data.organization.logoUrl).toBe(logoUrl);

    const removed = await request(app)
      .delete('/api/organizations/current/logo')
      .set(headers);
    expect(removed.status).toBe(200);
    expect(removed.body.data.organization.logoUrl).toBeNull();
    expect(cloudinaryUpload.deleteFromCloudinary).toHaveBeenCalledWith(
      'pathment/organization-logos/brand', 'image',
    );
    const afterRemove = await request(app).get('/api/organizations/current').set(headers);
    expect(afterRemove.body.data.organization.logoUrl).toBeNull();

    const replacementLogoUrl = 'https://example.com/workspace-logo.png';
    const updated = await request(app)
      .patch('/api/organizations/current')
      .set(headers)
      .send({ logoUrl: replacementLogoUrl });
    expect(updated.status).toBe(200);
    const afterUpdate = await request(app).get('/api/organizations/current').set(headers);
    expect(afterUpdate.body.data.organization.logoUrl).toBe(replacementLogoUrl);
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
    await models.OrganizationMembership.update({ role: 'member' }, {
      where: { organizationId: secondary.id, userId: admin.id },
    });
    const capabilities = await runWithRequestContext({ organizationId: secondary.id, userId: admin.id },
      () => authz.getCapabilities(admin));
    expect(capabilities).not.toContain('admin');
    expect(capabilities).not.toContain('mentor');
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
    await orgService.requestPlan(admin.id, secondary.id, 'scale');
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
    await models.OrganizationSubscription.update(
      { planId: starter.id },
      { where: { organizationId: secondary.id } },
    );

    const branding = await request(app)
      .patch('/api/organizations/current')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Pathment-Workspace', secondary.slug)
      .send({ primaryColor: '#112233' });
    expect(branding.status).toBe(403);

    cloudinaryUpload.uploadToCloudinary.mockClear();
    const logo = await request(app)
      .post('/api/organizations/current/logo')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Pathment-Workspace', secondary.slug)
      .attach('file', Buffer.from('image-bytes'), { filename: 'brand.png', contentType: 'image/png' });
    expect(logo.status).toBe(403);
    expect(cloudinaryUpload.uploadToCloudinary).not.toHaveBeenCalled();

    const ordinary = await request(app)
      .patch('/api/organizations/current')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Pathment-Workspace', secondary.slug)
      .send({ name: 'Renamed workspace' });
    expect(ordinary.status).toBe(200);
    expect(ordinary.body.data.organization.name).toBe('Renamed workspace');
  });
});
