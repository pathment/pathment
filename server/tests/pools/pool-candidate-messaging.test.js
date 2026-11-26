'use strict';

/**
 * A selection-pool candidate's messages.
 *
 * A candidate has no mentor, no clan and no enrollment, so they hold none of
 * the three portal capabilities. That left them shut out of messaging twice
 * over: the route is role-gated, so every call came back 403 before anything
 * looked at it, and the directory is built from clans and matches, so even
 * past the gate they would have had nobody to write to — while being handed
 * work they might well have a question about.
 *
 * What they get is deliberately narrow: the workspace's admins and the admins
 * of the programme their round belongs to. Not each other.
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const seed = require('../helpers/seed');
const emailService = require('../../src/services/emailService');
const authService = require('../../src/services/authService');
const poolService = require('../../src/services/poolService');
const poolMemberService = require('../../src/services/poolMemberService');

let ctx;

/** A candidate who has activated their account — no profile, no clan. */
async function candidate(email) {
  await poolMemberService.importMembers(ctx.pool.id, [{ email, firstName: 'C', lastName: 'One' }], ctx.admin);
  const calls = emailService.enqueue.mock.calls.filter(([m]) => m.to === email);
  const text = calls[calls.length - 1]?.[0]?.text || '';
  const match = text.match(/invite=([^\s&]+)/) || text.match(/\/i\/[^/\s]+\/([^\s/]+)/);
  await authService.register({
    firstName: 'C', lastName: 'One', email, password: 'Test@12345', inviteToken: decodeURIComponent(match[1]),
  });
  return models.User.findOne({ where: { email } });
}

beforeEach(async () => {
  await seed.cleanDb();
  emailService.enqueue.mockClear();
  const admin = await seed.createAdmin();
  const program = await seed.createProgram({ createdBy: admin.id, name: 'Fellowship' });
  const pool = await poolService.createPool({ programId: program.id, name: 'Spring pool', selectionQuota: 1 }, admin);
  await poolService.setStatus(pool.id, 'open', admin);
  ctx = { admin, program, pool };
});

const asUser = (user) => ({ Authorization: seed.authHeader(user) });

describe('a candidate can reach the people running their round', () => {
  it('is let into messaging at all', async () => {
    const me = await candidate('cand@test.com');
    // The capability a pool candidate actually holds — not admin/mentor/mentee.
    const res = await request(app).get('/api/messaging/conversations').set(asUser(me));
    expect(res.status).toBe(200);
  });

  it('finds the admin in the directory, and no other candidate', async () => {
    const me = await candidate('cand@test.com');
    const other = await candidate('other@test.com');

    const res = await request(app).get('/api/messaging/users/search?q=').set(asUser(me));

    expect(res.status).toBe(200);
    const ids = (res.body.data?.users || res.body.data || []).map((u) => u.id);
    expect(ids).toContain(ctx.admin.id);
    expect(ids).not.toContain(other.id);
    expect(ids).not.toContain(me.id);
  });

  it('can open a thread with the admin and be heard', async () => {
    const me = await candidate('cand@test.com');

    const opened = await request(app)
      .post('/api/messaging/conversations/direct')
      .set(asUser(me))
      .send({ participantId: ctx.admin.id });
    expect([200, 201]).toContain(opened.status);

    const conversationId = opened.body.data?.conversation?.id || opened.body.data?.id;
    const sent = await request(app)
      .post('/api/messaging/messages')
      .set(asUser(me))
      .send({ conversationId, messageText: 'Is the Level 2 course the right one for me?' });
    expect([200, 201]).toContain(sent.status);
  });

  it('cannot open a thread with another candidate', async () => {
    const me = await candidate('cand@test.com');
    const other = await candidate('other@test.com');

    const res = await request(app)
      .post('/api/messaging/conversations/direct')
      .set(asUser(me))
      .send({ participantId: other.id });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
