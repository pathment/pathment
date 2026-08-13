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

    it('the successor inherits the original expiry rather than extending it', async () => {
      const { refreshToken } = await login();
      const originalExpiry = ttlMs(refreshToken);

      const res = await request(app).post('/api/auth/refresh').send({ refreshToken });

      // Same session length, minus the moment that just elapsed — NOT a fresh 30 days.
      expect(ttlMs(res.body.data.refreshToken)).toBeLessThanOrEqual(originalExpiry + 1000);
    });

    it('answers an immediate retry with the same successor instead of signing out', async () => {
      const { refreshToken } = await login();

      const first = await request(app).post('/api/auth/refresh').send({ refreshToken });
      // The same token again, straight away — a dropped response, or two tabs.
      const retry = await request(app).post('/api/auth/refresh').send({ refreshToken });

      expect(retry.status).toBe(200);
      expect(retry.body.data.refreshToken).toBe(first.body.data.refreshToken);
    });

    it('treats a replay outside the grace window as theft and ends every session', async () => {
      const { refreshToken } = await login();
      const first = await request(app).post('/api/auth/refresh').send({ refreshToken });
      const successor = first.body.data.refreshToken;

      // Age the rotation past the retry window.
      await models.RefreshToken.update(
        { revokedAt: new Date(Date.now() - 5 * 60 * 1000) },
        { where: { token: refreshToken } }
      );

      const replay = await request(app).post('/api/auth/refresh').send({ refreshToken });
      expect(replay.status).toBe(401);

      // The successor the legitimate device holds is revoked too — that is the
      // point: we cannot tell which side is the thief, so both must re-auth.
      const successorRow = await models.RefreshToken.findOne({ where: { token: successor } });
      expect(successorRow.revokedAt).toBeTruthy();
      expect(successorRow.revokedReason).toBe('reuse_detected');
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
