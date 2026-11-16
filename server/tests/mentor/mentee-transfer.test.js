'use strict';

/**
 * Mentor-to-mentor mentee transfers.
 *
 * A mentor asks another clan to take one of their mentees; that clan's lead (or
 * a co-mentor who still holds `mentee.transfer`) accepts or declines. Nothing
 * moves until the receiving side agrees — that consent is the whole point, so
 * these lock in both the handshake and who is allowed to be part of it.
 *
 * The feature ships behind a date gate, so every test forces it on; one test
 * deliberately turns it back off to prove the gate refuses writes.
 */

const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const { cleanDb, createMentor, createMentee, createProgram } = require('../helpers/seed');

// Force the release gate open for the flow tests (see the gate test for OFF).
process.env.MENTEE_TRANSFER_ENABLED = 'true';
const transferService = require('../../src/services/menteeTransferService');

const menteeClanId = async (userId) => {
  const m = await models.ClanMembership.findOne({ where: { userId, role: 'mentee', status: 'active' } });
  return m ? m.clanId : null;
};

describe('mentee transfers between clans', () => {
  let fromLead, toLead, toCoMentor, outsider, mentee, program, fromClan, toClan;

  beforeEach(async () => {
    process.env.MENTEE_TRANSFER_ENABLED = 'true';
    await cleanDb();

    fromLead = await createMentor({ email: 'from-lead@test.com', firstName: 'Ada' });
    toLead = await createMentor({ email: 'to-lead@test.com', firstName: 'Grace' });
    toCoMentor = await createMentor({ email: 'to-co@test.com', firstName: 'Linus' });
    outsider = await createMentor({ email: 'outsider@test.com', firstName: 'Nobody' });
    mentee = await createMentee({ email: 'mentee@test.com', firstName: 'Sam' });
    program = await createProgram({ createdBy: fromLead.id });

    fromClan = await models.Clan.create({ programId: program.id, name: 'Frontend Falcons', leadMentorId: fromLead.id, createdBy: fromLead.id });
    toClan = await models.Clan.create({ programId: program.id, name: 'Backend Bears', leadMentorId: toLead.id, createdBy: toLead.id });

    await clanService.addMember(fromClan.id, { userId: fromLead.id, role: 'lead_mentor' });
    await clanService.addMember(toClan.id, { userId: toLead.id, role: 'lead_mentor' });
    await clanService.addMember(toClan.id, { userId: toCoMentor.id, role: 'co_mentor' });
    await clanService.addMember(fromClan.id, { userId: mentee.id, role: 'mentee' });
  });

  // ── the happy path ────────────────────────────────────────────────────────
  it('sends a request without moving the mentee yet', async () => {
    const request = await transferService.request(fromLead, {
      menteeId: mentee.id, toClanId: toClan.id, reason: 'Sam is moving into backend work',
    });

    expect(request.status).toBe('pending');
    expect(request.toClan.name).toBe('Backend Bears');
    // Still exactly where they were — a request is not a move.
    await expect(menteeClanId(mentee.id)).resolves.toBe(fromClan.id);
  });

  it('shows the request to the receiving clan, not the sending one', async () => {
    await transferService.request(fromLead, { menteeId: mentee.id, toClanId: toClan.id });

    await expect(transferService.incoming(toLead)).resolves.toHaveLength(1);
    await expect(transferService.incoming(toCoMentor)).resolves.toHaveLength(1);
    await expect(transferService.incoming(fromLead)).resolves.toHaveLength(0);
    await expect(transferService.incoming(outsider)).resolves.toHaveLength(0);
  });

  it('moves the mentee when the receiving lead accepts', async () => {
    const request = await transferService.request(fromLead, { menteeId: mentee.id, toClanId: toClan.id });
    const resolved = await transferService.respond(toLead, request.id, { accept: true, note: 'Happy to take Sam' });

    expect(resolved.status).toBe('approved');
    await expect(menteeClanId(mentee.id)).resolves.toBe(toClan.id);
    // The old placement is closed out, not left dangling as a second active clan.
    const old = await models.ClanMembership.findOne({ where: { userId: mentee.id, clanId: fromClan.id, role: 'mentee' } });
    expect(old.status).toBe('removed');
    // And the queue is empty afterwards.
    await expect(transferService.incoming(toLead)).resolves.toHaveLength(0);
  });

  it('lets a co-mentor of the receiving clan accept too', async () => {
    const request = await transferService.request(fromLead, { menteeId: mentee.id, toClanId: toClan.id });
    await transferService.respond(toCoMentor, request.id, { accept: true });
    await expect(menteeClanId(mentee.id)).resolves.toBe(toClan.id);
  });

  it('keeps the mentee put when the request is declined', async () => {
    const request = await transferService.request(fromLead, { menteeId: mentee.id, toClanId: toClan.id });
    const resolved = await transferService.respond(toLead, request.id, { accept: false, note: 'We are full this cohort' });

    expect(resolved.status).toBe('denied');
    expect(resolved.resolutionNote).toBe('We are full this cohort');
    await expect(menteeClanId(mentee.id)).resolves.toBe(fromClan.id);
  });

  it('refuses to decline without a reason', async () => {
    const request = await transferService.request(fromLead, { menteeId: mentee.id, toClanId: toClan.id });
    await expect(transferService.respond(toLead, request.id, { accept: false }))
      .rejects.toThrow(/reason/i);
    // Still pending, so the other mentor isn't left with a silent rejection.
    const row = await models.ClanChangeRequest.findByPk(request.id);
    expect(row.status).toBe('pending');
  });

  // ── who may do what ───────────────────────────────────────────────────────
  it('does not let a mentor request a move for someone else’s mentee', async () => {
    await expect(transferService.request(outsider, { menteeId: mentee.id, toClanId: toClan.id }))
      .rejects.toThrow(/permission/i);
  });

  it('does not let the requesting side decide their own request', async () => {
    const request = await transferService.request(fromLead, { menteeId: mentee.id, toClanId: toClan.id });
    await expect(transferService.respond(fromLead, request.id, { accept: true }))
      .rejects.toThrow(/permission/i);
    await expect(menteeClanId(mentee.id)).resolves.toBe(fromClan.id);
  });

  it('excludes a co-mentor whose lead revoked the transfer permission', async () => {
    await clanService.setMemberPermissions(toClan.id, toCoMentor.id, ['mentee.transfer'], toLead.id);
    const request = await transferService.request(fromLead, { menteeId: mentee.id, toClanId: toClan.id });

    // They neither see it nor can act on it; the lead is unaffected.
    await expect(transferService.incoming(toCoMentor)).resolves.toHaveLength(0);
    await expect(transferService.respond(toCoMentor, request.id, { accept: true }))
      .rejects.toThrow(/permission/i);
    await expect(transferService.incoming(toLead)).resolves.toHaveLength(1);
  });

  // ── guard rails ───────────────────────────────────────────────────────────
  it('allows only one pending request per mentee', async () => {
    const third = await models.Clan.create({ programId: program.id, name: 'Data Dolphins', leadMentorId: toLead.id, createdBy: toLead.id });
    await transferService.request(fromLead, { menteeId: mentee.id, toClanId: toClan.id });
    await expect(transferService.request(fromLead, { menteeId: mentee.id, toClanId: third.id }))
      .rejects.toThrow(/already a pending/i);
  });

  it('refuses a move into the clan they are already in', async () => {
    await expect(transferService.request(fromLead, { menteeId: mentee.id, toClanId: fromClan.id }))
      .rejects.toThrow(/already in this clan/i);
  });

  it('lets the requester withdraw, freeing them to ask elsewhere', async () => {
    const request = await transferService.request(fromLead, { menteeId: mentee.id, toClanId: toClan.id });
    await expect(transferService.cancel(toLead, request.id)).rejects.toThrow(/only the mentor/i);

    await transferService.cancel(fromLead, request.id);
    await expect(transferService.incoming(toLead)).resolves.toHaveLength(0);
    // No longer blocked by the withdrawn one.
    await expect(transferService.request(fromLead, { menteeId: mentee.id, toClanId: toClan.id }))
      .resolves.toMatchObject({ status: 'pending' });
  });

  it('lists what the requester sent, with the outcome', async () => {
    const request = await transferService.request(fromLead, { menteeId: mentee.id, toClanId: toClan.id });
    await transferService.respond(toLead, request.id, { accept: false, note: 'Not this cohort' });

    const [sent] = await transferService.outgoing(fromLead);
    expect(sent).toMatchObject({ status: 'denied', resolutionNote: 'Not this cohort' });
    expect(sent.resolver.name).toContain('Grace');
  });

  // ── the release gate ──────────────────────────────────────────────────────
  it('refuses every write while the feature is still unreleased', async () => {
    process.env.MENTEE_TRANSFER_ENABLED = 'false';

    expect(transferService.config()).toMatchObject({ enabled: false, comingSoon: true });
    await expect(transferService.request(fromLead, { menteeId: mentee.id, toClanId: toClan.id }))
      .rejects.toThrow(/isn’t available yet/i);
  });

  describe('where a mentor can send them', () => {
    const closedProgramWithStanding = async () => {
      const closed = await createProgram({ createdBy: fromLead.id, name: 'Finished Fellowship' });
      const frozen = await models.Clan.create({ programId: closed.id, name: 'Old Cohort', leadMentorId: toLead.id, createdBy: toLead.id });
      const standing = await models.Clan.create({ programId: closed.id, name: 'Old Cohort · Standing', kind: 'standing', leadMentorId: toLead.id, createdBy: toLead.id });
      await clanService.addMember(standing.id, { userId: toLead.id, role: 'lead_mentor' });
      await frozen.update({ frozenAt: new Date() });
      await closed.update({ closedAt: new Date() });
      return { frozen, standing };
    };

    it('lists only clans taking people: a finished program’s standing clan, never its frozen ones', async () => {
      const { frozen, standing } = await closedProgramWithStanding();
      const { clans } = await transferService.targets(fromLead, mentee.id);
      const ids = clans.map((c) => c.id);
      expect(ids).toContain(standing.id);
      expect(ids).toContain(toClan.id);
      expect(ids).not.toContain(frozen.id);
      expect(clans.find((c) => c.id === standing.id)).toMatchObject({ kind: 'standing', crossProgram: false, effect: 'join' });
    });

    it('puts clans whose mentors hold the weekly review first, marked suggested', async () => {
      const busy = await models.Clan.create({ programId: program.id, name: 'Zebra Busy', leadMentorId: toLead.id, createdBy: toLead.id });
      for (const days of [1, 8, 15]) {
        await models.CohortReviewSession.create({ mentorId: toLead.id, clanId: busy.id, sessionDate: new Date(Date.now() - days * 86400000), status: 'finished' });
      }
      const { clans } = await transferService.targets(fromLead, mentee.id);
      expect(clans[0]).toMatchObject({ id: busy.id, suggested: true, activity: 'regular', reviewWeeks: 3 });
    });

    it('refuses a frozen clan, and accepting into a standing clan joins it', async () => {
      const { frozen, standing } = await closedProgramWithStanding();
      await expect(transferService.request(fromLead, { menteeId: mentee.id, toClanId: frozen.id }))
        .rejects.toThrow(/isn’t taking people/);

      const request = await transferService.request(fromLead, { menteeId: mentee.id, toClanId: standing.id });
      await transferService.respond(toLead, request.id, { accept: true });
      const joined = await models.ClanMembership.findOne({ where: { userId: mentee.id, clanId: standing.id, role: 'mentee' } });
      expect(joined).toBeTruthy();
      // Their clan is not ended by joining a standing clan.
      expect((await models.ClanMembership.findOne({ where: { userId: mentee.id, clanId: fromClan.id, role: 'mentee' } })).status).toBe('active');
    });
  });
});
