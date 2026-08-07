'use strict';

/**
 * Row-level scoping on blockers and delay events.
 *
 * `GET /blockers` used to fall through to `where = {}` whenever the caller named
 * no menteeId — so any authenticated user got EVERY blocker in the database —
 * and `resolve` had no ownership check at all. These lock the scoping down at
 * the service layer, where every entry point shares it.
 *
 * The subtle cases are the ones keyed off the base `role` column: a mentee-based
 * co-mentor mentors a clan, and a co-mentor whose `mentee.view` was revoked must
 * disappear from the LIST as well as from the per-record check.
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const { PERMISSIONS } = require('../../src/config/permissions');
const clanService = require('../../src/services/clanService');
const frictionService = require('../../src/services/frictionService');
const { cleanDb, createMentor, createMentee, createAdmin, createProgram, authHeader } = require('../helpers/seed');

const logBlocker = (menteeId, title) =>
  models.Blocker.create({ menteeId, title, category: 'technical', severity: 'medium', status: 'open' });

const titlesFor = async (user, menteeId) =>
  (await frictionService.listBlockers({ menteeId, user })).map((b) => b.title).sort();

describe('friction record scoping', () => {
  let lead, otherLead, admin, mine, theirs, clan, otherClan;

  beforeEach(async () => {
    await cleanDb();
    lead = await createMentor({ email: 'lead@test.com' });
    otherLead = await createMentor({ email: 'other@test.com' });
    admin = await createAdmin({ email: 'boss@test.com' });
    mine = await createMentee({ email: 'mine@test.com' });
    theirs = await createMentee({ email: 'theirs@test.com' });

    const program = await createProgram({ createdBy: lead.id });
    clan = await models.Clan.create({ programId: program.id, name: 'Mine', leadMentorId: lead.id, createdBy: lead.id });
    otherClan = await models.Clan.create({ programId: program.id, name: 'Theirs', leadMentorId: otherLead.id, createdBy: otherLead.id });
    await clanService.addMember(clan.id, { userId: lead.id, role: 'lead_mentor' });
    await clanService.addMember(otherClan.id, { userId: otherLead.id, role: 'lead_mentor' });
    await clanService.addMember(clan.id, { userId: mine.id, role: 'mentee' });
    await clanService.addMember(otherClan.id, { userId: theirs.id, role: 'mentee' });

    await logBlocker(mine.id, 'my blocker');
    await logBlocker(theirs.id, 'their blocker');
  });

  it('shows a mentee only their own records when they name no mentee', async () => {
    expect(await titlesFor(mine)).toEqual(['my blocker']);
  });

  it('refuses a mentee reaching for another mentee by id', async () => {
    await expect(frictionService.listBlockers({ menteeId: theirs.id, user: mine }))
      .rejects.toThrow(/not authorized/i);
  });

  it('scopes an unfiltered mentor list to their own clans — not the whole table', async () => {
    expect(await titlesFor(lead)).toEqual(['my blocker']);
    expect(await titlesFor(otherLead)).toEqual(['their blocker']);
  });

  it('still lets an admin see everything', async () => {
    expect(await titlesFor(admin)).toEqual(['my blocker', 'their blocker']);
  });

  it('returns nothing for a mentor who mentors nobody', async () => {
    const idle = await createMentor({ email: 'idle@test.com' });
    expect(await titlesFor(idle)).toEqual([]);
  });

  it('blocks resolve/delete of a blocker outside the caller\'s scope', async () => {
    const target = await models.Blocker.findOne({ where: { menteeId: theirs.id } });
    await expect(frictionService.resolveBlocker(target.id, lead)).rejects.toThrow(/not authorized/i);
    await expect(frictionService.deleteBlocker(target.id, mine)).rejects.toThrow(/not authorized/i);
    // …while the mentor who owns that clan still can.
    await expect(frictionService.resolveBlocker(target.id, otherLead)).resolves.toBeTruthy();
  });
});

describe('friction scoping does not key off the base role column', () => {
  let lead, dual, peer, clan;

  beforeEach(async () => {
    await cleanDb();
    lead = await createMentor({ email: 'lead@test.com' });
    dual = await createMentee({ email: 'dual@test.com' });   // a mentee who co-mentors their clan
    peer = await createMentee({ email: 'peer@test.com' });

    const program = await createProgram({ createdBy: lead.id });
    clan = await models.Clan.create({ programId: program.id, name: 'Dual', leadMentorId: lead.id, createdBy: lead.id });
    await clanService.addMember(clan.id, { userId: lead.id, role: 'lead_mentor' });
    await clanService.addMember(clan.id, { userId: peer.id, role: 'mentee' });
    await clanService.addMember(clan.id, { userId: dual.id, role: 'mentee' });
    await clanService.addMember(clan.id, { userId: dual.id, role: 'co_mentor' });

    await logBlocker(dual.id, 'mine');
    await logBlocker(peer.id, 'peers');
  });

  it('gives a mentee-based co-mentor their clan AND their own record', async () => {
    expect(await titlesFor(dual)).toEqual(['mine', 'peers']);
  });

  it('drops a co-mentor whose mentee.view was revoked out of the LIST, not just the by-id check', async () => {
    // A mentor-account co-mentor, so the only thing standing between them and
    // the clan's records is the permission itself.
    const co = await createMentor({ email: 'co@test.com' });
    await clanService.addMember(clan.id, { userId: co.id, role: 'co_mentor' });
    expect(await titlesFor(co)).toEqual(['mine', 'peers']); // full access by default

    await models.ClanMemberPermission.create({
      clanId: clan.id, userId: co.id, denied: [PERMISSIONS.MENTEE_VIEW], updatedBy: lead.id
    });

    expect(await titlesFor(co)).toEqual([]);
    await expect(frictionService.listBlockers({ menteeId: peer.id, user: co }))
      .rejects.toThrow(/not authorized/i);
  });

  it('keeps a revoked co-mentor\'s OWN record visible — that is self-access, not a clan grant', async () => {
    await models.ClanMemberPermission.create({
      clanId: clan.id, userId: dual.id, denied: [PERMISSIONS.MENTEE_VIEW], updatedBy: lead.id
    });
    expect(await titlesFor(dual)).toEqual(['mine']);
  });

  it('will not let them accept their own delay', async () => {
    const own = await models.DelayEvent.create({ menteeId: dual.id, reason: 'internet died', kind: 'other', days: 2 });
    await expect(frictionService.acceptDelay(own.id, { accepted: true }, dual)).rejects.toThrow(/your own delay/i);
    await expect(frictionService.rejectDelay(own.id, dual)).rejects.toThrow(/your own delay/i);
    // Their lead reviews it instead.
    await expect(frictionService.acceptDelay(own.id, { accepted: true }, lead)).resolves.toBeTruthy();
  });
});

describe('logging friction as the mentee themselves (over HTTP)', () => {
  let mentee, lead, clan;

  beforeEach(async () => {
    await cleanDb();
    lead = await createMentor({ email: 'lead@test.com' });
    mentee = await createMentee({ email: 'mentee@test.com' });
    const program = await createProgram({ createdBy: lead.id });
    clan = await models.Clan.create({ programId: program.id, name: 'C', leadMentorId: lead.id, createdBy: lead.id });
    await clanService.addMember(clan.id, { userId: lead.id, role: 'lead_mentor' });
    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' });
  });

  // The blocker form posts { title, category, severity } and the delay form
  // posts { reason, kind, days } — neither sends a menteeId, because the client
  // has no reason to know it. The controller defaults it to the caller. This is
  // the regression that would 400 every mentee logging friction.
  it('accepts a blocker with no menteeId in the body', async () => {
    const res = await request(app)
      .post('/api/blockers')
      .set('Authorization', authHeader(mentee))
      .send({ title: 'stuck on auth', category: 'technical', severity: 'high' });

    expect(res.status).toBe(201);
    expect(res.body.data.blocker.menteeId).toBe(mentee.id);
  });

  it('accepts a delay with no menteeId in the body', async () => {
    const res = await request(app)
      .post('/api/delays')
      .set('Authorization', authHeader(mentee))
      .send({ reason: 'sick all week', kind: 'other', days: 3 });

    expect(res.status).toBe(201);
    expect(res.body.data.delay.menteeId).toBe(mentee.id);
    expect(res.body.data.delay.accepted).toBe(false);
  });

  it('lists their own blockers with no query params', async () => {
    await logBlocker(mentee.id, 'mine');
    const other = await createMentee({ email: 'other@test.com' });
    await logBlocker(other.id, 'not mine');

    const res = await request(app).get('/api/blockers').set('Authorization', authHeader(mentee));
    expect(res.status).toBe(200);
    expect(res.body.data.blockers.map((b) => b.title)).toEqual(['mine']);
  });

  it('403s a mentee asking for another mentee by id', async () => {
    const other = await createMentee({ email: 'other@test.com' });
    await logBlocker(other.id, 'not mine');

    const res = await request(app)
      .get('/api/blockers').query({ menteeId: other.id })
      .set('Authorization', authHeader(mentee));
    expect(res.status).toBe(403);
  });

  it('refuses a blocker logged against someone else', async () => {
    const outsider = await createMentee({ email: 'out@test.com' });
    await expect(frictionService.createBlocker({ menteeId: outsider.id, title: 'not mine' }, mentee.id, mentee))
      .rejects.toThrow(/not authorized/i);
  });

  it('still rejects a create with no mentee at all', async () => {
    await expect(frictionService.createBlocker({ title: 'orphan' }, mentee.id, mentee))
      .rejects.toThrow(/menteeId is required/);
  });

  it('lets their mentor log one for them', async () => {
    const blocker = await frictionService.createBlocker(
      { menteeId: mentee.id, title: 'observed in review' }, lead.id, lead
    );
    expect(blocker.createdBy).toBe(lead.id);
  });
});
