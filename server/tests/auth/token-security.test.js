'use strict';

/**
 * Regression tests for two auth defects that shipped because nothing exercised
 * the HTTP layer at the right point:
 *
 *  1. The 5-minute `temp: true` token minted between password and 2FA was
 *     accepted by authenticate(), so the second factor was effectively optional
 *     for anyone who stopped after step one.
 *
 *  2. `rememberMe` was declared nowhere in the login Joi schema, and validate()
 *     runs with stripUnknown, so it was deleted before the controller read it —
 *     pinning every session to the 1-day TTL. The existing remember-me test
 *     called authService.login() directly, which is exactly the layer that was
 *     never broken; only a request through the router shows the bug.
 *
 * Also covers refresh-token rotation, which the two above made necessary.
 */

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const { generateAccessToken } = require('../../src/utils/jwt');
const { cleanDb, createUser } = require('../helpers/seed');

const DAY = 24 * 60 * 60 * 1000;
const ttlMs = (token) => (jwt.decode(token).exp * 1000) - Date.now();

// Each test that logs in over HTTP consumes the shared login rate-limit bucket,
// which is per-process and not reset between files. Unique emails keep the
// records isolated; the bucket only counts FAILED logins, and we make none.
let seq = 0;
const uniqueEmail = () => `tok-sec-${Date.now()}-${seq++}@test.com`;

describe('auth token security', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  describe('2FA temporary token', () => {
    it('is rejected by protected routes', async () => {
      const user = await createUser({ email: uniqueEmail(), role: 'mentee' });

      // Exactly what authService mints between password and second factor.
      const temporaryToken = generateAccessToken(
        { id: user.id, email: user.email, role: user.role, temp: true },
        '5m'
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${temporaryToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('still works for the 2FA completion route it was issued for', async () => {
      const user = await createUser({ email: uniqueEmail(), role: 'mentee' });
      const temporaryToken = generateAccessToken(
        { id: user.id, email: user.email, role: user.role, temp: true },
        '5m'
      );

      // A wrong code, so we assert on "the token was ACCEPTED and the code was
      // checked" (401/400 about the code) rather than "no token provided".
      const res = await request(app)
        .post('/api/auth/verify-2fa-login')
        .set('Authorization', `Bearer ${temporaryToken}`)
        .send({ code: '000000' });

      // Whatever the outcome, it must not be the middleware refusing the token.
      expect(res.body.message).not.toMatch(/no token provided/i);
      expect(res.body.message).not.toMatch(/two-factor verification is not complete/i);
    });

    it('rejects a full access token on the 2FA completion route', async () => {
      const user = await createUser({ email: uniqueEmail(), role: 'mentee' });
      const realToken = generateAccessToken({ id: user.id, email: user.email, role: user.role });

      const res = await request(app)
        .post('/api/auth/verify-2fa-login')
        .set('Authorization', `Bearer ${realToken}`)
        .send({ code: '000000' });

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/temporary two-factor token/i);
    });
  });

  describe('rememberMe over HTTP', () => {
    it('rememberMe:true yields a ~30-day refresh token', async () => {
      const email = uniqueEmail();
      await createUser({ email, password: 'Secret@123', role: 'mentee' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'Secret@123', rememberMe: true });

      expect(res.status).toBe(200);
      const { refreshToken } = res.body.data.tokens;
      expect(ttlMs(refreshToken)).toBeGreaterThan(29 * DAY);

      const row = await models.RefreshToken.findOne({ where: { token: refreshToken } });
      expect(new Date(row.expiresAt).getTime() - Date.now()).toBeGreaterThan(29 * DAY);
    });

    it('rememberMe omitted yields a ~1-day refresh token', async () => {
      const email = uniqueEmail();
      await createUser({ email, password: 'Secret@123', role: 'mentee' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'Secret@123' });

      expect(res.status).toBe(200);
      expect(ttlMs(res.body.data.tokens.refreshToken)).toBeLessThan(1.5 * DAY);
    });

    it('a native client gets the long session without asking', async () => {
      const email = uniqueEmail();
      await createUser({ email, password: 'Secret@123', role: 'mentee' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'Secret@123', client: 'ios' });

      expect(res.status).toBe(200);
      expect(ttlMs(res.body.data.tokens.refreshToken)).toBeGreaterThan(29 * DAY);

      const row = await models.RefreshToken.findOne({
        where: { token: res.body.data.tokens.refreshToken }
      });
      expect(row.client).toBe('ios');
    });
  });

  describe('refresh-token rotation', () => {
    const login = async () => {
      const email = uniqueEmail();
      await createUser({ email, password: 'Secret@123', role: 'mentee' });
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'Secret@123', rememberMe: true });
      return res.body.data.tokens;
    };

    it('returns a NEW refresh token and revokes the old one', async () => {
      const { refreshToken } = await login();

      const res = await request(app).post('/api/auth/refresh').send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.refreshToken).toBeTruthy();
      expect(res.body.data.refreshToken).not.toBe(refreshToken);

      const old = await models.RefreshToken.findOne({ where: { token: refreshToken } });
      expect(old.revokedAt).toBeTruthy();
      expect(old.revokedReason).toBe('rotated');
      expect(old.replacedByToken).toBe(res.body.data.refreshToken);
    });

    const refresh = (refreshToken) => request(app).post('/api/auth/refresh').send({ refreshToken });
    const age = (token, ms) => models.RefreshToken.update(
      { revokedAt: new Date(Date.now() - ms) }, { where: { token } },
    );

    it('every refresh token fits the 255-character column it is stored in', async () => {
      // A longer token is a 500 on sign-in, for everyone. The session facts the
      // token carries (ss, sl, n) are sized to stay under it.
      const { refreshToken } = await login();
      const rotated = (await refresh(refreshToken)).body.data.refreshToken;
      expect(refreshToken.length).toBeLessThan(255);
      expect(rotated.length).toBeLessThan(255);
    });

    it('a remembered session slides: using it keeps it alive for another 30 days', async () => {
      const { refreshToken } = await login();
      // Pretend the session is near its end: the stored row and the token say so.
      await models.RefreshToken.update({ expiresAt: new Date(Date.now() + DAY) }, { where: { token: refreshToken } });

      const res = await refresh(refreshToken);
      expect(res.status).toBe(200);
      expect(ttlMs(res.body.data.refreshToken)).toBeGreaterThan(29.9 * DAY);
      const row = await models.RefreshToken.findOne({ where: { token: res.body.data.refreshToken } });
      expect(new Date(row.expiresAt).getTime() - Date.now()).toBeGreaterThan(29.9 * DAY);
    });

    it('however much it is used, a session ends 90 days after the sign-in', async () => {
      const email = uniqueEmail();
      const user = await createUser({ email, password: 'Secret@123', role: 'mentee' });
      const { generateRefreshToken } = require('../../src/utils/jwt');
      const startedSecs = Math.floor((Date.now() - 89 * DAY) / 1000);
      const old = generateRefreshToken({ id: user.id, ss: startedSecs, sl: 30 * 86400, n: 'abc123' }, '20d');
      await models.RefreshToken.create({ userId: user.id, token: old, expiresAt: new Date(Date.now() + 20 * DAY), client: 'web', lastUsedAt: new Date() });

      const res = await refresh(old);
      expect(res.status).toBe(200);
      // One day left of the 90, not another 30.
      expect(ttlMs(res.body.data.refreshToken)).toBeLessThanOrEqual(DAY + 5000);
    });

    it('a one-day session (remember me off) keeps its fixed end', async () => {
      const email = uniqueEmail();
      await createUser({ email, password: 'Secret@123', role: 'mentee' });
      const loginRes = await request(app).post('/api/auth/login').send({ email, password: 'Secret@123' });
      const { refreshToken } = loginRes.body.data.tokens;
      const before = ttlMs(refreshToken);

      const res = await refresh(refreshToken);
      expect(ttlMs(res.body.data.refreshToken)).toBeLessThanOrEqual(before + 1000);
    });

    it('answers an immediate retry with the same successor instead of signing out', async () => {
      const { refreshToken } = await login();

      const first = await refresh(refreshToken);
      // The same token again, straight away — a dropped response, or two tabs.
      const retry = await refresh(refreshToken);

      expect(retry.status).toBe(200);
      expect(retry.body.data.refreshToken).toBe(first.body.data.refreshToken);
    });

    it('a reply that never arrived is recovered however late, without signing anyone out', async () => {
      // Production: the page reloaded / the laptop slept after the server had
      // rotated, so the browser kept the spent token and came back with it
      // minutes or hours later. That used to end every session the person had.
      const { refreshToken } = await login();
      const first = await refresh(refreshToken);
      const successor = first.body.data.refreshToken;
      await age(refreshToken, 3 * 60 * 60 * 1000);

      const late = await refresh(refreshToken);
      expect(late.status).toBe(200);
      expect(late.body.data.refreshToken).toBe(successor);
      const row = await models.RefreshToken.findOne({ where: { token: successor } });
      expect(row.revokedAt).toBeNull();
    });

    it('two tabs racing past a rotation get the live end of the chain', async () => {
      const { refreshToken } = await login();
      const second = (await refresh(refreshToken)).body.data.refreshToken;
      const third = (await refresh(second)).body.data.refreshToken;

      const racing = await refresh(refreshToken);
      expect(racing.status).toBe(200);
      expect(racing.body.data.refreshToken).toBe(third);
    });

    it('a real duplicate ends THAT session only; their other devices stay signed in', async () => {
      const email = uniqueEmail();
      await createUser({ email, password: 'Secret@123', role: 'mentee' });
      const signIn = () => request(app).post('/api/auth/login').send({ email, password: 'Secret@123', rememberMe: true })
        .then((r) => r.body.data.tokens.refreshToken);
      const laptop = await signIn();
      const phone = await signIn();

      // The laptop session moves on twice; then its first token is replayed.
      const second = (await refresh(laptop)).body.data.refreshToken;
      const third = (await refresh(second)).body.data.refreshToken;
      await age(laptop, 5 * 60 * 1000);
      await age(second, 5 * 60 * 1000);

      const replay = await refresh(laptop);
      expect(replay.status).toBe(401);
      const thirdRow = await models.RefreshToken.findOne({ where: { token: third } });
      expect(thirdRow.revokedReason).toBe('reuse_detected');

      // The phone was never part of it.
      const phoneRow = await models.RefreshToken.findOne({ where: { token: phone } });
      expect(phoneRow.revokedAt).toBeNull();
      expect((await refresh(phone)).status).toBe(200);
    });
  });

  describe('logout', () => {
    it('revokes the refresh token even with no valid access token', async () => {
      const email = uniqueEmail();
      await createUser({ email, password: 'Secret@123', role: 'mentee' });
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'Secret@123' });
      const { refreshToken } = login.body.data.tokens;

      // No Authorization header at all — the app has been closed for an hour and
      // the 15-minute access token is long dead.
      const res = await request(app).post('/api/auth/logout').send({ refreshToken });

      expect(res.status).toBe(200);
      const row = await models.RefreshToken.findOne({ where: { token: refreshToken } });
      expect(row.revokedAt).toBeTruthy();

      // And the revoked token can no longer buy an access token.
      const refresh = await request(app).post('/api/auth/refresh').send({ refreshToken });
      expect(refresh.status).toBe(401);
    });
  });
});
