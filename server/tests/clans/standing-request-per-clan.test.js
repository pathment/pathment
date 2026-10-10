'use strict';

/**
 * A standing clan continues a CLAN, not a programme.
 *
 * The request was keyed on (mentor, programme) with a unique index allowing one
 * pending row per mentor per programme. That assumed a mentor runs one clan in
 * a programme, and they often do not: lead mentor of "Viral Loop Clan 2026" and
 * co-mentor of "Core Team 2026", both inside "Full Stack AI Engineering".
 *
 * So a request raised from Core Team made Viral Loop's banner read "Standing
 * clan requested" too, and the unique index meant Viral Loop could never get a
 * standing clan of its own. Two separate groups of people, two continuations.
 */

const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const standingClanService = require('../../src/services/standingClanService');
const { cleanDb, createAdmin, createMentor, createProgram } = require('../helpers/seed');

describe('standing clan requests are per clan', () => {
  let admin, mentor, other, program, viralLoop, coreTeam;

  beforeEach(async () => {
    await cleanDb();
    await models.StandingClanRequest.destroy({ where: {}, force: true });

    admin = await createAdmin({ email: 'admin@test.com' });
    mentor = await createMentor({ email: 'mentor@test.com' });
    other = await createMentor({ email: 'other@test.com' });

    program = await createProgram({ createdBy: admin.id });
    // The programme is closed — that is what makes a continuation possible.
    await program.update({ status: 'completed', closedAt: new Date() });

    viralLoop = await models.Clan.create({
      programId: program.id, name: 'Viral Loop Clan 2026', kind: 'cohort',
      leadMentorId: mentor.id, createdBy: admin.id,
    });
    coreTeam = await models.Clan.create({
      programId: program.id, name: 'Core Team 2026', kind: 'cohort', createdBy: admin.id,
    });
    // Lead of one, co-mentor of the other — the shape that broke.
    await clanService.addMember(viralLoop.id, { userId: mentor.id, role: 'lead_mentor' });
    await clanService.addMember(coreTeam.id, { userId: mentor.id, role: 'co_mentor' });
  });

  const ask = (clan, name) => standingClanService.request({
    programId: program.id, sourceClanId: clan.id, name, description: 'Keep going',
  }, mentor);

  describe('eligibility is listed per clan', () => {
    it('offers both clans the mentor runs in the closed programme', async () => {
      const eligible = await standingClanService.eligibleClans(mentor);
      expect(eligible.map((c) => c.clanName).sort())
        .toEqual(['Core Team 2026', 'Viral Loop Clan 2026']);
      for (const entry of eligible) expect(entry.program.id).toBe(program.id);
    });

    it('offers nothing to a mentor who runs neither', async () => {
      expect(await standingClanService.eligibleClans(other)).toEqual([]);
    });

    it('offers nothing while the programme is still open', async () => {
      await program.update({ status: 'published', closedAt: null });
      expect(await standingClanService.eligibleClans(mentor)).toEqual([]);
    });
  });

  describe('one request does not speak for the other clan', () => {
    it('records which clan it came from', async () => {
      const request = await ask(coreTeam, 'Core Team 2026 · Standing');
      expect(request.sourceClanId).toBe(coreTeam.id);
      expect(request.programId).toBe(program.id);
    });

    it('lets the SECOND clan request too — the bug', async () => {
      await ask(coreTeam, 'Core Team 2026 · Standing');
      const second = await ask(viralLoop, 'Viral Loop Clan 2026 · Standing');

      expect(second.sourceClanId).toBe(viralLoop.id);
      const open = await models.StandingClanRequest.findAll({
        where: { mentorId: mentor.id, status: 'pending' },
      });
      expect(open).toHaveLength(2);
      expect(open.map((r) => r.sourceClanId).sort()).toEqual([coreTeam.id, viralLoop.id].sort());
    });

    it('still refuses a SECOND request for the SAME clan', async () => {
      const first = await ask(coreTeam, 'Core Team 2026 · Standing');
      const again = await ask(coreTeam, 'Core Team again');
      // Idempotent rather than an error: a retry gets the pending request back.
      expect(again.id).toBe(first.id);
      expect(await models.StandingClanRequest.count({ where: { mentorId: mentor.id } })).toBe(1);
    });

    it('carries the source clan through the list, so a client can scope it', async () => {
      await ask(coreTeam, 'Core Team 2026 · Standing');
      const [row] = await standingClanService.list(mentor);
      expect(row.sourceClanId).toBe(coreTeam.id);
      expect(row.sourceClan?.name).toBe('Core Team 2026');
    });
  });

  describe('it is still a clan they mentor', () => {
    it('refuses a clan the mentor has nothing to do with', async () => {
      await expect(standingClanService.request({
        programId: program.id, sourceClanId: coreTeam.id, name: 'Not mine', description: '',
      }, other)).rejects.toThrow(/clan you mentor/i);
    });

    it('refuses with no clan at all, rather than falling back to the programme', async () => {
      await expect(standingClanService.request({
        programId: program.id, name: 'Programme-wide', description: '',
      }, mentor)).rejects.toThrow(/which clan/i);
    });

    it('refuses when the clan is not in the programme given', async () => {
      const otherProgram = await createProgram({ createdBy: admin.id, name: 'Other' });
      await expect(standingClanService.request({
        programId: otherProgram.id, sourceClanId: coreTeam.id, name: 'Mismatch', description: '',
      }, mentor)).rejects.toThrow();
    });

    it('refuses a name that is blank', async () => {
      await expect(ask(coreTeam, '   ')).rejects.toThrow(/1–150 characters/i);
    });
  });
});
