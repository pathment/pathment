'use strict';

/**
 * TC-M01  Register with valid invite token
 * TC-M02  Register with already-registered email
 * TC-M03  Register with weak password
 * TC-M04  Register with invalid email format
 * TC-M05  Register with all required fields empty
 */

const request = require('supertest');
const app = require('../../src/index');
const { cleanDb, createAdmin, createInviteToken } = require('../helpers/seed');
const { models } = require('../../src/db');

const BASE = '/api/auth/register';
let requestIp = 10;
const registerRequest = () => request(app).post(BASE)
  .set('X-Forwarded-For', `198.51.100.${requestIp}`);

describe('POST /api/auth/register — Registration', () => {
  let admin;
  let validToken;
  const targetEmail = 'awaisfatehali@gmail.com';

  beforeEach(async () => {
    requestIp += 1;
    await cleanDb();
    admin = await createAdmin();
    ({ rawToken: validToken } = await createInviteToken({ adminId: admin.id, role: 'mentee', email: targetEmail }));
  });

  it('creates an owner account and first organization without an invitation', async () => {
    const previous = process.env.MULTI_TENANT_WORKSPACES_ENABLED;
    process.env.MULTI_TENANT_WORKSPACES_ENABLED = 'true';
    try {
      const res = await registerRequest().send({
        firstName: 'Nadia',
        lastName: 'Khan',
        email: 'nadia@acme.com',
        password: 'Strong@1234',
        confirmPassword: 'Strong@1234',
        organization: { name: 'Acme Learning', slug: 'acme-learning', timezone: 'Asia/Karachi' },
      });

      expect(res.status).toBe(201);
      expect(res.body.data.requiresEmailVerification).toBe(true);
      expect(res.body.data.organization).toMatchObject({ name: 'Acme Learning', slug: 'acme-learning', membershipRole: 'owner' });
      expect(res.body.data.user).toMatchObject({ email: 'nadia@acme.com', role: 'admin', emailVerified: false });

      const user = await models.User.findOne({ where: { email: 'nadia@acme.com' } });
      const organization = await models.Organization.findOne({ where: { slug: 'acme-learning' }, skipOrganizationScope: true });
      const membership = await models.OrganizationMembership.findOne({
        where: { userId: user.id, organizationId: organization.id }, skipOrganizationScope: true,
      });
      expect(membership.role).toBe('owner');
      expect(await models.EmailVerificationToken.count({ where: { userId: user.id } })).toBe(1);
    } finally {
      if (previous === undefined) delete process.env.MULTI_TENANT_WORKSPACES_ENABLED;
      else process.env.MULTI_TENANT_WORKSPACES_ENABLED = previous;
    }
  });

  // TC-M01
  it('TC-M01: creates account and returns 201 with a valid invite token', async () => {
    const res = await registerRequest().send({
      firstName: 'Awais',
      lastName: 'Fateh Ali',
      email: targetEmail,
      password: 'Test@1234!',
      confirmPassword: 'Test@1234!',
      inviteToken: validToken,
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(targetEmail);
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  // TC-M02
  it('TC-M02: returns 409 when email is already registered', async () => {
    // First registration succeeds
    await registerRequest().send({
      firstName: 'Awais',
      lastName: 'Fateh Ali',
      email: targetEmail,
      password: 'Test@1234!',
      confirmPassword: 'Test@1234!',
      inviteToken: validToken,
    });

    // Second invite for the same email
    const { rawToken: secondToken } = await createInviteToken({
      adminId: admin.id,
      role: 'mentee',
      email: 'second@test.com',
    });

    // Try to re-register the already-used email with a fresh invite
    const { rawToken: freshToken } = await createInviteToken({
      adminId: admin.id,
      role: 'mentee',
      email: targetEmail,
    });

    const res = await registerRequest().send({
      firstName: 'Awais',
      lastName: 'Fateh Ali',
      email: targetEmail,
      password: 'Test@1234!',
      confirmPassword: 'Test@1234!',
      inviteToken: freshToken,
    });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message.toLowerCase()).toMatch(/already registered|already exists/i);
  });

  // TC-M03
  it('TC-M03: returns 400 when password is too weak', async () => {
    const { rawToken: token2 } = await createInviteToken({ adminId: admin.id, role: 'mentee', email: 'weak@test.com' });

    const res = await registerRequest().send({
      firstName: 'Weak',
      lastName: 'Pass',
      email: 'weak@test.com',
      password: '12345',
      confirmPassword: '12345',
      inviteToken: token2,
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message.toLowerCase()).toMatch(/password/i);
  });

  // TC-M04
  it('TC-M04: returns 400 for invalid email format', async () => {
    const res = await registerRequest().send({
      firstName: 'Awais',
      lastName: 'Test',
      email: 'awaisfatehali.edu',   // missing @
      password: 'Test@1234!',
      confirmPassword: 'Test@1234!',
      inviteToken: validToken,
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message.toLowerCase()).toMatch(/email/i);
  });

  // TC-M05
  it('TC-M05: returns 400 when all required fields are empty', async () => {
    const res = await registerRequest().send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
