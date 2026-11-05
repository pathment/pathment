const jwt = require('jsonwebtoken');

describe('jitsiTokenService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env.JITSI_DOMAIN = 'meet.pathment.me';
    process.env.JITSI_APP_ID = 'pathment-test';
    process.env.JITSI_APP_SECRET = 'test-secret-that-is-long-enough-for-unit-tests';
    process.env.JITSI_TOKEN_TTL_SECONDS = '600';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const user = {
    id: '2ae25645-72cd-4304-957b-9daf1901e29b',
    firstName: 'Amina',
    lastName: 'Khan',
    email: 'amina@example.test',
    profilePictureUrl: 'https://images.example.test/amina.jpg',
  };

  test('binds an owner token to the exact room and meeting creator', () => {
    const { issueJitsiToken } = require('../../src/services/jitsiTokenService');
    const token = issueJitsiToken({ room: 'pathment-review-abc-123', user, moderator: true });
    const claims = jwt.verify(token, process.env.JITSI_APP_SECRET, {
      algorithms: ['HS256'], issuer: 'pathment-test', audience: 'pathment-test', subject: 'meet.pathment.me',
    });

    expect(claims.room).toBe('pathment-review-abc-123');
    expect(claims.context.user).toMatchObject({ id: user.id, name: 'Amina Khan', moderator: true, affiliation: 'owner' });
    expect(claims.exp - claims.iat).toBe(600);
  });

  test('issues ordinary attendees member affiliation, never owner', () => {
    const { issueJitsiToken } = require('../../src/services/jitsiTokenService');
    const token = issueJitsiToken({ room: 'pathment-admin-xyz', user, moderator: false });
    const claims = jwt.verify(token, process.env.JITSI_APP_SECRET);

    expect(claims.context.user.moderator).toBe(false);
    expect(claims.context.user.affiliation).toBe('member');
  });

  test('fails closed when the signing secret is missing', () => {
    delete process.env.JITSI_APP_SECRET;
    jest.resetModules();
    const { issueJitsiToken } = require('../../src/services/jitsiTokenService');

    expect(() => issueJitsiToken({ room: 'room', user })).toThrow('JITSI_APP_SECRET');
  });
});
