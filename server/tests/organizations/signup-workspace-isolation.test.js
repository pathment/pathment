'use strict';

/**
 * Creating your own workspace must not hand you anybody else's.
 *
 * On production, everyone who signed up through "create a workspace" was also
 * made an ADMIN of DevWeekends (the default tenant): the sign-up request carried
 * no workspace, and the new-user hook joined the account to whatever workspace
 * the request resolved to. They saw DevWeekends in their workspace list and
 * could open it as an admin.
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const { cleanDb, createAdmin, createInviteToken } = require('../helpers/seed');
const { generateAccessToken } = require('../../src/utils/jwt');
const { runWithRequestContext } = require('../../src/utils/auditContext');

let ip = 40;
const register = (body, workspace) => {
  const req = request(app).post('/api/auth/register').set('X-Forwarded-For', `198.51.100.${ip += 1}`);
  if (workspace) req.set('X-Pathment-Workspace', workspace);
  return req.send({ password: 'Strong@1234', confirmPassword: 'Strong@1234', ...body });
};
const tokenFor = (user) => `Bearer ${generateAccessToken({ id: user.id, email: user.email, role: user.role })}`;
const memberships = (userId) => models.OrganizationMembership.findAll({
  where: { userId }, include: [{ model: models.Organization, as: 'organization' }], skipOrganizationScope: true,
});

describe('a new workspace is its owner\'s only workspace', () => {
  let defaultOrg;

  beforeEach(async () => {
    await cleanDb();
    defaultOrg = await models.Organization.findOne({ where: { slug: process.env.TENANT_SLUG || 'devweekends' }, skipOrganizationScope: true });
    await createAdmin({ email: `dw-admin-${Date.now()}@test.com` });
  });

  afterAll(async () => { await cleanDb(); });

  it('sign-up creates exactly one membership: owner of the new workspace', async () => {
    const res = await register({
      firstName: 'Tania', lastName: 'Shah', email: 'tania@else.com',
      organization: { name: 'Tania Learning', slug: 'tania-learning', timezone: 'UTC' },
    });
    expect(res.status).toBe(201);

    const user = await models.User.findOne({ where: { email: 'tania@else.com' } });
    const rows = await memberships(user.id);
    expect(rows.map((m) => [m.organization.slug, m.role])).toEqual([['tania-learning', 'owner']]);
    await user.update({ emailVerified: true }); // they verify, then sign in

    // Their workspace list shows only their own.
    const me = await request(app).get('/api/organizations/me').set('Authorization', tokenFor(user));
    expect(me.status).toBe(200);
    const listed = (me.body.data.organizations || me.body.data).map((o) => o.slug);
    expect(listed).toEqual(['tania-learning']);

    // And the default workspace refuses them, named or by fallback.
    for (const req of [
      request(app).get('/api/organizations/current').set('Authorization', tokenFor(user)).set('X-Pathment-Workspace', defaultOrg.slug),
      // No header falls back to the default workspace; membership still decides.
      request(app).get('/api/programs/00000000-0000-4000-8000-000000000000/completion').set('Authorization', tokenFor(user)),
    ]) {
      expect((await req).status).toBe(403);
    }
  });

  it('the same holds when the sign-up request names the default workspace', async () => {
    const res = await register({
      firstName: 'Lara', lastName: 'Malik', email: 'learning@else.com',
      organization: { name: 'Learning Co', slug: 'learning-co', timezone: 'UTC' },
    }, defaultOrg.slug);
    expect(res.status).toBe(201);
    const user = await models.User.findOne({ where: { email: 'learning@else.com' } });
    expect((await memberships(user.id)).map((m) => m.organization.slug)).toEqual(['learning-co']);
  });

  it('an invite joins its own workspace and nothing else', async () => {
    const other = await models.Organization.create({
      name: 'Other', slug: `other-${Date.now()}`, status: 'active', timezone: 'UTC',
      settings: { onboardingSource: 'public_signup' },
    }, { skipOrganizationScope: true });
    const starter = await models.Plan.findOne({ where: { key: 'starter' } }) || await models.Plan.findOne({ where: { key: 'growth' } });
    const inviter = await createAdmin({ email: `other-admin-${Date.now()}@test.com` });
    let rawToken;
    await runWithRequestContext({ organizationId: other.id, organizationSlug: other.slug }, async () => {
      await models.OrganizationSubscription.create({ organizationId: other.id, planId: starter.id, status: 'active' });
      await models.OrganizationMembership.create({ organizationId: other.id, userId: inviter.id, role: 'admin', status: 'active', joinedAt: new Date() });
      ({ rawToken } = await createInviteToken({ adminId: inviter.id, role: 'mentee', email: 'invitee@else.com' }));
    });

    const res = await register({ firstName: 'Iman', lastName: 'Noor', email: 'invitee@else.com', inviteToken: rawToken }, other.slug);
    expect(res.status).toBe(201);
    const user = await models.User.findOne({ where: { email: 'invitee@else.com' } });
    expect((await memberships(user.id)).map((m) => m.organization.slug)).toEqual([other.slug]);
  });
});
