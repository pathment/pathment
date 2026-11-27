// Run using the isolated config below; no database modules may connect.
const { createHash } = require('crypto');
jest.mock('../../src/db', () => ({
  sequelize: { transaction: jest.fn(async fn => fn({ LOCK: { UPDATE: 'UPDATE' } })) },
  models: {
    Organization: { findOne: jest.fn() },
    OrganizationMembership: { findOne: jest.fn() },
    DomainHandoffToken: { findOne: jest.fn(), create: jest.fn(), destroy: jest.fn() },
    User: { findByPk: jest.fn() },
  },
}));
jest.mock('../../src/services/notificationOrchestrator', () => ({}));
jest.mock('../../src/utils/logger', () => ({}));
jest.mock('../../src/services/authzService', () => ({
  getAssignments: jest.fn(async () => []), getCapabilities: jest.fn(async () => []),
  getPermissionUnion: jest.fn(async () => []), hasAdminAccess: jest.fn(async () => false),
  // The login response asks this too; without it on the mock the whole
  // handoff throws "hasPoolAccess is not a function" before it is tested.
  hasPoolAccess: jest.fn(async () => false),
}));
jest.mock('../../src/utils/jwt', () => ({
  hashToken: value => require('crypto').createHash('sha256').update(value).digest('hex'),
  generateRandomToken: () => require('crypto').randomBytes(32).toString('hex'),
  generateAccessToken: () => 'access',
}));
const { models } = require('../../src/db');
const service = require('../../src/services/authService');
const { assertHandoffOrigin, verifyChallenge } = require('../../src/utils/domainHandoff');
const { authSchemas } = require('../../src/validations/authValidation');
const verifier = 'a'.repeat(43);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const org = { id: 'org', slug: 'acme' };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.MULTI_TENANT_WORKSPACES_ENABLED = 'true';
  models.Organization.findOne.mockResolvedValue(org);
  models.OrganizationMembership.findOne.mockResolvedValue({ id: 'member' });
  models.User.findByPk.mockResolvedValue({ id: 'user', status: 'active', emailVerified: true, toJSON: () => ({ id: 'user', passwordHash: 'secret' }) });
  service._issueRefreshToken = jest.fn(async () => ({ refreshToken: 'refresh' }));
});

test('PKCE rejects missing, malformed, and wrong proofs, including old unbound codes', () => {
  expect(() => verifyChallenge(verifier, challenge)).not.toThrow();
  for (const [v, c] of [[undefined, challenge], [verifier, null], ['b'.repeat(43), challenge], ['x', challenge]]) {
    expect(() => verifyChallenge(v, c)).toThrow();
  }
});

test('HTTP schemas require bound codes', () => {
  expect(authSchemas.domainHandoffCreate.validate({}).error).toBeTruthy();
  expect(authSchemas.domainHandoffCreate.validate({ codeChallenge: challenge }).error).toBeUndefined();
  expect(authSchemas.domainHandoffConsume.validate({ token: 'a'.repeat(64), workspace: 'acme' }).error).toBeTruthy();
  expect(authSchemas.domainHandoffConsume.validate({ token: 'a'.repeat(64), workspace: 'acme', codeVerifier: verifier }).error).toBeUndefined();
});

test('creation and redemption require exact trusted browser origins, even when CORS is permissive', () => {
  delete process.env.APP_URL;
  const req = origin => ({ headers: { origin }, organization: org });
  expect(() => assertHandoffOrigin(req('https://acme.pathment.me'))).not.toThrow();
  expect(() => assertHandoffOrigin(req('https://app.pathment.me'), true)).not.toThrow();
  for (const origin of [undefined, 'null', 'http://acme.pathment.me', 'https://acme.pathment.me.evil.test', 'https://other.pathment.me', 'https://app.pathment.me:444']) {
    expect(() => assertHandoffOrigin(req(origin))).toThrow();
    expect(() => assertHandoffOrigin(req(origin), true)).toThrow();
  }
  expect(() => assertHandoffOrigin(req('https://acme.pathment.me'), true)).toThrow();
});

test('creation stores challenge and digest, enforces active membership, leaves other transfers intact', async () => {
  const result = await service.createDomainHandoff({ id: 'user' }, org, { codeChallenge: challenge });
  const stored = models.DomainHandoffToken.create.mock.calls[0][0];
  expect(stored.codeChallenge).toBe(challenge);
  expect(stored.tokenHash).not.toBe(result.token);
  expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
  models.OrganizationMembership.findOne.mockResolvedValue(null);
  await expect(service.createDomainHandoff({ id: 'user' }, org, { codeChallenge: challenge })).rejects.toThrow();
  expect(models.DomainHandoffToken.create).toHaveBeenCalledTimes(1);
});

test('selected workspace must exist and match before code lookup', async () => {
  await expect(service.consumeDomainHandoff('token', 'acme', null, verifier)).rejects.toThrow();
  await expect(service.consumeDomainHandoff('token', 'acme', { id: 'other' }, verifier)).rejects.toThrow();
  expect(models.DomainHandoffToken.findOne).not.toHaveBeenCalled();
});

test('wrong proof does not spend code or mint a session', async () => {
  const update = jest.fn();
  models.DomainHandoffToken.findOne.mockResolvedValue({ codeChallenge: challenge, update });
  await expect(service.consumeDomainHandoff('token', 'acme', org, 'b'.repeat(43))).rejects.toThrow();
  expect(update).not.toHaveBeenCalled();
  expect(service._issueRefreshToken).not.toHaveBeenCalled();
});

test('missing/expired/spent codes fail closed; lookup uses row lock and expiration', async () => {
  models.DomainHandoffToken.findOne.mockResolvedValue(null);
  await expect(service.consumeDomainHandoff('token', 'acme', org, verifier)).rejects.toThrow();
  const query = models.DomainHandoffToken.findOne.mock.calls[0][0];
  expect(query.lock).toBe('UPDATE');
  expect(query.where.usedAt).toBeNull();
  expect(query.where.expiresAt).toBeDefined();
  expect(service._issueRefreshToken).not.toHaveBeenCalled();
});

test('removed member and disabled user cannot consume a valid proof', async () => {
  const update = jest.fn();
  models.DomainHandoffToken.findOne.mockResolvedValue({ codeChallenge: challenge, userId: 'user', update });
  models.OrganizationMembership.findOne.mockResolvedValue(null);
  await expect(service.consumeDomainHandoff('token', 'acme', org, verifier)).rejects.toThrow();
  models.OrganizationMembership.findOne.mockResolvedValue({ id: 'member' });
  models.User.findByPk.mockResolvedValue({ status: 'disabled' });
  await expect(service.consumeDomainHandoff('token', 'acme', org, verifier)).rejects.toThrow();
  expect(update).not.toHaveBeenCalled();
});

test('valid redemption spends code and issues refresh token inside the same transaction', async () => {
  const update = jest.fn();
  models.DomainHandoffToken.findOne.mockResolvedValue({ codeChallenge: challenge, userId: 'user', rememberSession: true, update });
  const result = await service.consumeDomainHandoff('token', 'acme', org, verifier);
  expect(update).toHaveBeenCalledTimes(1);
  expect(update.mock.calls[0][1].transaction).toBe(service._issueRefreshToken.mock.calls[0][1].transaction);
  expect(result.refreshToken).toBe('refresh');
  expect(result.user.passwordHash).toBeUndefined();
});

test('response preparation failure does not spend the code', async () => {
  const update = jest.fn();
  models.DomainHandoffToken.findOne.mockResolvedValue({ codeChallenge: challenge, userId: 'user', update });
  require('../../src/services/authzService').getAssignments.mockRejectedValueOnce(new Error('temporary failure'));
  await expect(service.consumeDomainHandoff('token', 'acme', org, verifier)).rejects.toThrow('temporary failure');
  expect(update).not.toHaveBeenCalled();
  expect(service._issueRefreshToken).not.toHaveBeenCalled();
});


test('public redemption enforces workspace rollout availability independently of context', async () => {
  process.env.MULTI_TENANT_WORKSPACES_ENABLED = 'false';
  process.env.DEFAULT_WORKSPACE_SLUG = 'devweekends';
  await expect(service.consumeDomainHandoff('token', 'acme', org, verifier)).rejects.toThrow('Additional workspaces');
  expect(models.DomainHandoffToken.findOne).not.toHaveBeenCalled();
  expect(service._issueRefreshToken).not.toHaveBeenCalled();
});

test('unavailable workspace cannot issue or redeem a handoff', async () => {
  for (const status of ['suspended', 'archived']) {
    const unavailable = { ...org, status };
    models.Organization.findOne.mockResolvedValue(unavailable);
    await expect(service.consumeDomainHandoff('token', 'acme', unavailable, verifier)).rejects.toThrow('unavailable');
    await expect(service.createDomainHandoff({ id: 'user' }, unavailable, { codeChallenge: challenge })).rejects.toThrow('unavailable');
  }
  expect(models.DomainHandoffToken.findOne).not.toHaveBeenCalled();
  expect(models.DomainHandoffToken.create).not.toHaveBeenCalled();
});
