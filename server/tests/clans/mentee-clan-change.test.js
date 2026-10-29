'use strict';

/**
 * A mentee asks to change clan; an admin decides and the move actually happens.
 *
 * The table and the admin queue already existed, and the queue's empty state
 * even promised this ("when a mentee asks to move..."), but there was no way
 * for a mentee to ask: no surface, no notification, and `to_clan_id` was NOT
 * NULL so a mentee could not have said "I need to move, you choose where".
 *
 * What these cover, in rough order of how much it would hurt to get wrong:
 *   - the move really happens, and the mentee's work comes with them;
 *   - a mentee can only ever move THEMSELVES, and only inside their own
 *     programme (the POST that queued a move for any mentee to any clan);
 *   - an open-ended ask cannot be approved without a destination, and a no
 *     cannot be given without a reason;
 *   - the programme's admins hear about it, and admins of other programmes
 *     do not.
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const {
  cleanDb, createMentor, createMentee, createAdmin, createProgram, createClan, authHeader,
} = require('../helpers/seed');
// Globally mocked in tests/setup.js, so these assert on what was dispatched
// rather than on rows: nothing writes a Notification under test.
const notificationOrchestrator = require('../../src/services/notificationOrchestrator');

const api = (user) => ({
  options: () => request(app).get('/api/clan-requests/my-move').set('Authorization', authHeader(user)),
  ask: (body) => request(app).post('/api/clan-requests/my-move').set('Authorization', authHeader(user)).send(body),
  cancel: (id) => request(app).post(`/api/clan-requests/my-move/${id}/cancel`).set('Authorization', authHeader(user)),
  queue: () => request(app).get('/api/clan-requests').set('Authorization', authHeader(user)),
  resolve: (id, body) => request(app).patch(`/api/clan-requests/requests/${id}/resolve`).set('Authorization', authHeader(user)).send(body),
  raise: (body) => request(app).post('/api/clan-requests/requests').set('Authorization', authHeader(user)).send(body),
});

const GOOD = { reasonCode: 'timezone', note: 'The 7am review is 3am where I live and I keep missing it.' };

describe('mentee clan change requests', () => {
  let admin, mentorA, mentorB, mentee, other, program, clanA, clanB;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin({ email: 'admin@test.com' });
    mentorA = await createMentor({ email: 'a@test.com' });
    mentorB = await createMentor({ email: 'b@test.com' });
    mentee = await createMentee({ email: 'mentee@test.com', firstName: 'Maya', lastName: 'Patel' });
    other = await createMentee({ email: 'other@test.com' });

    program = await createProgram({ createdBy: admin.id });
    clanA = await createClan({ programId: program.id, leadMentor: mentorA, mentees: [mentee], name: 'Dawn Clan' });
    clanB = await createClan({ programId: program.id, leadMentor: mentorB, mentees: [other], name: 'Dusk Clan' });
  });

  const membership = (userId, clanId) => models.ClanMembership.findOne({
    where: { userId, clanId, role: 'mentee' },
  });

  // ── what the mentee's page is built from ──────────────────────────────────

  describe('the options read', () => {
    it('offers the sibling clans of their own program, never their own clan', async () => {
      const res = await api(mentee).options();
      expect(res.status).toBe(200);
      expect(res.body.data.clans).toHaveLength(1);

      const mine = res.body.data.clans[0];
      expect(mine.id).toBe(clanA.id);
      expect(mine.programName).toBe(program.name);
      expect(mine.options.map((c) => c.id)).toEqual([clanB.id]);
      expect(mine.canRequest).toBe(true);
      expect(mine.standing).toBe(false);
      expect(mine.options[0].mentor).toContain(mentorB.firstName);
      expect(mine.options[0].mentees).toBe(1);
      // The mentee is choosing a sentence about themselves, so the form must
      // offer it in the first person.
      expect(res.body.data.reasons.length).toBeGreaterThan(0);
      expect(res.body.data.reasons.map((r) => r.label)).toContain('The pace is wrong for me');
      expect(res.body.data.reasons.every((r) => !/ them\b|for them/.test(r.label))).toBe(true);
    });

    it('never offers another program’s clan', async () => {
      const otherProgram = await createProgram({ createdBy: admin.id, name: 'Other Program' });
      const outside = await createClan({
        programId: otherProgram.id, leadMentor: mentorB, name: 'Outside Clan',
      });

      const res = await api(mentee).options();
      const ids = res.body.data.clans[0].options.map((c) => c.id);
      expect(ids).toContain(clanB.id);
      expect(ids).not.toContain(outside.id);
    });

    /*
     * A standing clan belongs to a programme - `clans.program_id` is NOT NULL
     * and it inherits the one it continues - so it is NOT filtered out by
     * programme. It is excluded from the ask because `reassignMentee` closes
     * only cohort memberships, so "moving" out of one would leave the mentee
     * in both places.
     */
    it('shows a standing clan rather than claiming they have no clan', async () => {
      const standing = await createClan({
        programId: program.id, leadMentor: mentorA, mentees: [other], name: 'Alumni Guild',
      });
      await standing.update({ kind: 'standing' });

      const res = await api(other).options();
      expect(res.status).toBe(200);
      const names = res.body.data.clans.map((c) => c.name);
      expect(names).toContain('Alumni Guild');

      const row = res.body.data.clans.find((c) => c.name === 'Alumni Guild');
      expect(row.standing).toBe(true);
      expect(row.canRequest).toBe(false);
      // It still carries its programme, which is the point of this test.
      expect(row.programId).toBe(program.id);
      // And offers no destinations, so no dead picker.
      expect(row.options).toEqual([]);
    });

    it('never offers a standing clan as a destination', async () => {
      const standing = await createClan({
        programId: program.id, leadMentor: mentorA, name: 'Alumni Guild',
      });
      await standing.update({ kind: 'standing' });

      const res = await api(mentee).options();
      const own = res.body.data.clans.find((c) => c.id === clanA.id);
      expect(own.canRequest).toBe(true);
      expect(own.options.map((c) => c.id)).toEqual([clanB.id]);
    });

    it('refuses an ask raised from a standing clan', async () => {
      const standing = await createClan({
        programId: program.id, leadMentor: mentorA, mentees: [other], name: 'Alumni Guild',
      });
      await standing.update({ kind: 'standing' });

      const res = await api(other).ask({ ...GOOD, fromClanId: standing.id });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/standing clans are not moved between/i);
      expect(await models.ClanChangeRequest.count()).toBe(0);
    });

    it('marks their own clan closed, so the page does not offer a dead button', async () => {
      await clanA.update({ frozenAt: new Date() });
      const res = await api(mentee).options();
      expect(res.body.data.clans[0].closed).toBe(true);
      expect(res.body.data.clans[0].canRequest).toBe(false);
      // And asking really is refused, which is what `closed` is warning about.
      expect((await api(mentee).ask(GOOD)).status).toBe(409);
    });

    it('omits a frozen clan, which is taking nobody', async () => {
      await clanB.update({ frozenAt: new Date() });
      const res = await api(mentee).options();
      expect(res.body.data.clans[0].options).toEqual([]);
    });
  });

  // ── asking ────────────────────────────────────────────────────────────────

  describe('asking to move', () => {
    it('records the ask with no destination, leaving the choice to the admin', async () => {
      const res = await api(mentee).ask(GOOD);
      expect(res.status).toBe(201);
      expect(res.body.data.request.status).toBe('pending');
      expect(res.body.data.request.toClan).toBeNull();

      const row = await models.ClanChangeRequest.findOne({ where: { menteeId: mentee.id } });
      expect(row.origin).toBe('mentee');
      expect(row.fromClanId).toBe(clanA.id);
      expect(row.toClanId).toBeNull();
      // Both halves of the reason: the category an admin triages on, and the
      // mentee's own words that decide it.
      // ...while the stored reason, which only an admin reads, is third person.
      expect(row.reason).toContain('hours do not work for them');
      expect(row.reason).toContain('3am where I live');
    });

    it('records a named clan as a preference', async () => {
      const res = await api(mentee).ask({ ...GOOD, toClanId: clanB.id });
      expect(res.status).toBe(201);
      expect(res.body.data.request.toClan).toBe('Dusk Clan');
    });

    it('refuses a clan in another program', async () => {
      const otherProgram = await createProgram({ createdBy: admin.id, name: 'Other Program' });
      const outside = await createClan({ programId: otherProgram.id, leadMentor: mentorB, name: 'Outside' });

      const res = await api(mentee).ask({ ...GOOD, toClanId: outside.id });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/within your own program/i);
      expect(await models.ClanChangeRequest.count()).toBe(0);
    });

    it('refuses the clan they are already in', async () => {
      const res = await api(mentee).ask({ ...GOOD, toClanId: clanA.id });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already in/i);
    });

    it('refuses a frozen destination', async () => {
      await clanB.update({ frozenAt: new Date() });
      const res = await api(mentee).ask({ ...GOOD, toClanId: clanB.id });
      expect(res.status).toBe(400);
    });

    it('requires a reason and more than a shrug', async () => {
      expect((await api(mentee).ask({ note: GOOD.note })).status).toBe(400);
      expect((await api(mentee).ask({ reasonCode: 'nonsense', note: GOOD.note })).status).toBe(400);
      expect((await api(mentee).ask({ reasonCode: 'pace', note: 'no' })).status).toBe(400);
      expect(await models.ClanChangeRequest.count()).toBe(0);
    });

    it('allows only one open ask per clan', async () => {
      expect((await api(mentee).ask(GOOD)).status).toBe(201);
      const again = await api(mentee).ask(GOOD);
      expect(again.status).toBe(400);
      expect(again.body.message).toMatch(/already have a request/i);
      expect(await models.ClanChangeRequest.count()).toBe(1);
    });

    it('lets them ask again once the first was decided', async () => {
      const first = (await api(mentee).ask(GOOD)).body.data.request;
      await api(admin).resolve(first.id, { status: 'denied', note: 'Stay for now.' });
      expect((await api(mentee).ask(GOOD)).status).toBe(201);
    });

    it('refuses a mentee whose clan has closed', async () => {
      await clanA.update({ frozenAt: new Date() });
      const res = await api(mentee).ask(GOOD);
      // ClanFrozenError - a conflict with the clan's state, not a permission.
      expect(res.status).toBe(409);
    });

    it('refuses somebody who is in no clan at all', async () => {
      const loose = await createMentee({ email: 'loose@test.com' });
      const res = await api(loose).ask(GOOD);
      expect(res.status).toBe(400);
    });
  });

  // ── the privilege hole this closed ────────────────────────────────────────

  describe('a mentee can only move themselves', () => {
    it('ignores a menteeId in the body and moves the caller', async () => {
      await api(mentee).ask({ ...GOOD, menteeId: other.id, origin: 'admin' });
      const row = await models.ClanChangeRequest.findOne({});
      expect(row.menteeId).toBe(mentee.id);
      expect(row.origin).toBe('mentee');
    });

    it('refuses a mentee the admin route that queues a move for anyone', async () => {
      const res = await api(mentee).raise({ menteeId: other.id, toClanId: clanA.id });
      expect(res.status).toBe(403);
      expect(await models.ClanChangeRequest.count()).toBe(0);
    });

    it('refuses a mentee the admin queue', async () => {
      expect((await api(mentee).queue()).status).toBe(403);
    });

    it('refuses a mentee resolving their own request', async () => {
      const req = (await api(mentee).ask(GOOD)).body.data.request;
      const res = await api(mentee).resolve(req.id, { status: 'approved', toClanId: clanB.id });
      expect(res.status).toBe(403);
      expect((await models.ClanChangeRequest.findByPk(req.id)).status).toBe('pending');
    });
  });

  // ── deciding ──────────────────────────────────────────────────────────────

  describe('the admin decision', () => {
    it('will not approve an open-ended ask without naming a clan', async () => {
      const req = (await api(mentee).ask(GOOD)).body.data.request;
      const res = await api(admin).resolve(req.id, { status: 'approved' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/choose the clan/i);
      expect((await models.ClanChangeRequest.findByPk(req.id)).status).toBe('pending');
    });

    it('moves the mentee and records where they landed', async () => {
      const req = (await api(mentee).ask(GOOD)).body.data.request;
      const res = await api(admin).resolve(req.id, { status: 'approved', toClanId: clanB.id });
      expect(res.status).toBe(200);

      // The decision.
      const row = await models.ClanChangeRequest.findByPk(req.id);
      expect(row.status).toBe('approved');
      expect(row.toClanId).toBe(clanB.id);
      expect(row.resolvedBy).toBe(admin.id);

      // The move itself - the part that matters to the mentee.
      expect((await membership(mentee.id, clanB.id)).status).toBe('active');
      expect((await membership(mentee.id, clanA.id)).status).toBe('removed');
    });

    it('may override the clan the mentee asked for', async () => {
      const clanC = await createClan({ programId: program.id, leadMentor: mentorB, name: 'Noon Clan' });
      const req = (await api(mentee).ask({ ...GOOD, toClanId: clanB.id })).body.data.request;

      await api(admin).resolve(req.id, { status: 'approved', toClanId: clanC.id, note: 'Dusk is full.' });

      expect((await models.ClanChangeRequest.findByPk(req.id)).toClanId).toBe(clanC.id);
      expect((await membership(mentee.id, clanC.id)).status).toBe('active');
      expect(await membership(mentee.id, clanB.id)).toBeNull();
    });

    it('refuses to redirect a request that named its own target', async () => {
      // Not a mentee's preference - a mentor asked ONE clan, and answering a
      // different question is not a decision on the one that was asked.
      const row = await models.ClanChangeRequest.create({
        menteeId: mentee.id, fromClanId: clanA.id, toClanId: clanB.id, origin: 'mentor', createdBy: mentorA.id,
      });
      const res = await api(admin).resolve(row.id, { status: 'approved', toClanId: clanA.id });
      expect(res.status).toBe(400);
    });

    it('will not say no without saying why', async () => {
      const req = (await api(mentee).ask(GOOD)).body.data.request;
      const bare = await api(admin).resolve(req.id, { status: 'denied' });
      expect(bare.status).toBe(400);
      expect((await models.ClanChangeRequest.findByPk(req.id)).status).toBe('pending');

      const withReason = await api(admin).resolve(req.id, {
        status: 'denied', note: 'Your mentor is moving the review to 9am instead.',
      });
      expect(withReason.status).toBe(200);
      const row = await models.ClanChangeRequest.findByPk(req.id);
      expect(row.status).toBe('denied');
      expect(row.resolutionNote).toMatch(/9am/);
      // A denial never moves anybody.
      expect((await membership(mentee.id, clanA.id)).status).toBe('active');
    });

    it('decides a request only once', async () => {
      const req = (await api(mentee).ask(GOOD)).body.data.request;
      await api(admin).resolve(req.id, { status: 'approved', toClanId: clanB.id });
      const again = await api(admin).resolve(req.id, { status: 'denied', note: 'changed my mind' });
      expect(again.status).toBe(400);
    });

    it('shows the ask in the admin queue, marked as the mentee’s own', async () => {
      await api(mentee).ask(GOOD);
      const res = await api(admin).queue();
      expect(res.status).toBe(200);
      const row = res.body.data.requests.find((r) => r.origin === 'mentee');
      expect(row).toBeTruthy();
      expect(row.mentee).toBe('Maya Patel');
      expect(row.fromClan).toBe('Dawn Clan');
      expect(row.toClan).toBeNull();
      // The programme must travel with it or the admin's scope filter hides it.
      expect(row.programId).toBe(program.id);
    });
  });

  // ── withdrawing ───────────────────────────────────────────────────────────

  describe('withdrawing', () => {
    it('lets the mentee withdraw while it is still open', async () => {
      const req = (await api(mentee).ask(GOOD)).body.data.request;
      const res = await api(mentee).cancel(req.id);
      expect(res.status).toBe(200);
      expect((await models.ClanChangeRequest.findByPk(req.id)).status).toBe('cancelled');
      // And they are free to ask again.
      expect((await api(mentee).ask(GOOD)).status).toBe(201);
    });

    it('refuses to withdraw somebody else’s request', async () => {
      const req = (await api(mentee).ask(GOOD)).body.data.request;
      const res = await api(other).cancel(req.id);
      expect(res.status).toBe(403);
      expect((await models.ClanChangeRequest.findByPk(req.id)).status).toBe('pending');
    });

    it('refuses to withdraw one already decided', async () => {
      const req = (await api(mentee).ask(GOOD)).body.data.request;
      await api(admin).resolve(req.id, { status: 'approved', toClanId: clanB.id });
      expect((await api(mentee).cancel(req.id)).status).toBe(400);
    });
  });

  // ── being told ──────────────────────────────────────────────────────────────

  describe('notifications', () => {
    /** The recipients of the last dispatch of one event, as user ids. */
    const recipientsOf = (eventKey) => {
      const call = notificationOrchestrator.dispatch.mock.calls
        .map(([arg]) => arg)
        .reverse()
        .find((arg) => arg.eventKey === eventKey);
      return call ? { ids: call.recipients.map((r) => r.userId), payload: call.payload } : null;
    };

    beforeEach(() => notificationOrchestrator.dispatch.mockClear());

    it('tells the admin, with a link into the queue', async () => {
      await api(mentee).ask(GOOD);
      const sent = recipientsOf('clan_change_requested');
      expect(sent).toBeTruthy();
      expect(sent.ids).toContain(admin.id);
      expect(sent.payload.message).toContain('Maya Patel');
      expect(sent.payload.message).toContain('Dawn Clan');
      // It says the choice is open, which is the whole point of the row.
      expect(sent.payload.message).toMatch(/choice is yours/i);
      expect(sent.payload.actionUrl).toContain('/admin/requests');
    });

    it('names the clan when the mentee named one', async () => {
      await api(mentee).ask({ ...GOOD, toClanId: clanB.id });
      expect(recipientsOf('clan_change_requested').payload.message).toContain('Dusk Clan');
    });

    it('tells the mentee the answer, approved or denied', async () => {
      const first = (await api(mentee).ask(GOOD)).body.data.request;
      await api(admin).resolve(first.id, { status: 'approved', toClanId: clanB.id });

      const approved = recipientsOf('clan_change_decided');
      expect(approved.ids).toEqual([mentee.id]);
      expect(approved.payload.title).toMatch(/approved/i);
      expect(approved.payload.message).toContain('Dusk Clan');
      expect(approved.payload.actionUrl).toBe('/mentee/clan');

      const second = (await api(mentee).ask(GOOD)).body.data.request;
      await api(admin).resolve(second.id, { status: 'denied', note: 'Not this month.' });
      const denied = recipientsOf('clan_change_decided');
      expect(denied.payload.title).toMatch(/not approved/i);
      expect(denied.payload.message).toContain('Not this month.');
    });

    it('tells the receiving mentors, who did nothing to cause it', async () => {
      const req = (await api(mentee).ask(GOOD)).body.data.request;
      notificationOrchestrator.dispatch.mockClear();
      await api(admin).resolve(req.id, { status: 'approved', toClanId: clanB.id });

      const arrival = recipientsOf('new_mentee_in_clan');
      expect(arrival).toBeTruthy();
      expect(arrival.ids).toContain(mentorB.id);
      expect(arrival.payload.message).toContain('Maya Patel');
      expect(arrival.payload.message).toContain('Dusk Clan');
    });

    it('does not tell the mentor they are leaving', async () => {
      // A mentee citing mentor fit must be able to say so to an admin without
      // it being forwarded to the person they are talking about.
      const req = (await api(mentee).ask({ ...GOOD, reasonCode: 'mentor_fit' })).body.data.request;
      notificationOrchestrator.dispatch.mockClear();
      await api(admin).resolve(req.id, { status: 'approved', toClanId: clanB.id });

      const everyone = notificationOrchestrator.dispatch.mock.calls
        .flatMap(([arg]) => arg.recipients.map((r) => r.userId));
      expect(everyone).not.toContain(mentorA.id);
    });

    it('tells nobody new when the request is denied', async () => {
      const req = (await api(mentee).ask(GOOD)).body.data.request;
      notificationOrchestrator.dispatch.mockClear();
      await api(admin).resolve(req.id, { status: 'denied', note: 'Not this month.' });
      expect(recipientsOf('new_mentee_in_clan')).toBeNull();
    });

    it('does not tell an admin scoped to a different program', async () => {
      // A programme admin hears about their own programme only. This is the
      // scope leak that has had to be closed six times elsewhere.
      const outsider = await createAdmin({ email: 'outsider@test.com' });
      const otherProgram = await createProgram({ createdBy: admin.id, name: 'Other Program' });
      const orgMembership = await models.OrganizationMembership.findOne({ where: { userId: outsider.id } });
      await orgMembership.update({ role: 'member' });
      await models.RoleAssignment.create({
        userId: outsider.id, role: 'program_admin', scopeType: 'program', scopeId: otherProgram.id,
        organizationId: orgMembership.organizationId,
      });

      await api(mentee).ask(GOOD);
      expect(recipientsOf('clan_change_requested').ids).not.toContain(outsider.id);
    });

    it('tells an admin scoped to this program, whom the org-tier list omits', async () => {
      const programAdmin = await createAdmin({ email: 'pa@test.com' });
      const orgMembership = await models.OrganizationMembership.findOne({ where: { userId: programAdmin.id } });
      await orgMembership.update({ role: 'member' });
      await models.RoleAssignment.create({
        userId: programAdmin.id, role: 'program_admin', scopeType: 'program', scopeId: program.id,
        organizationId: orgMembership.organizationId,
      });

      await api(mentee).ask(GOOD);
      expect(recipientsOf('clan_change_requested').ids).toContain(programAdmin.id);
    });
  });
});
