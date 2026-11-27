'use strict';

/**
 * A selection round as a clan: `kind = 'pool'`.
 *
 * The round reuses everything a clan already has — membership, mentors, work,
 * review — because rebuilding those is what left the old pool a separate
 * 10,000-line system with its own bugs. What it must NOT reuse is the
 * programme's accounting: nobody in a trial is a mentee of the programme until
 * they are selected and placed out of it.
 *
 * These pin that line. A pool clan behaves like a standing clan wherever the
 * question is "does this count towards the programme", and differs in one
 * deliberate place: a standing clan's members have a mentee profile (they
 * finished a programme), a candidate's does not exist yet.
 */

const { models } = require('../../src/db');
const seed = require('../helpers/seed');
const clanService = require('../../src/services/clanService');
const cohortService = require('../../src/services/cohortService');
const performanceService = require('../../src/services/performanceService');
const { isProgrammeClan, isPoolClan } = require('../../src/config/clanKinds');

let ctx;

const clanOfKind = async (kind, name) => models.Clan.create({
  programId: ctx.program.id, name, kind, createdBy: ctx.admin.id, leadMentorId: ctx.mentor.id,
});

beforeEach(async () => {
  await seed.cleanDb();
  const admin = await seed.createAdmin();
  const mentor = await seed.createMentor();
  const program = await seed.createProgram({ createdBy: admin.id, name: 'Fellowship' });
  ctx = { admin, mentor, program };
});

describe('a pool clan is a clan', () => {
  it('can be created, and carries its kind', async () => {
    const pool = await clanOfKind('pool', 'Spring round');
    expect(pool.kind).toBe('pool');
    expect(isPoolClan(pool)).toBe(true);
    expect(isProgrammeClan(pool)).toBe(false);
  });

  it('takes mentors, who can run it like any other clan', async () => {
    const pool = await clanOfKind('pool', 'Spring round');
    await clanService.addMember(pool.id, { userId: ctx.mentor.id, role: 'lead_mentor' });
    const membership = await models.ClanMembership.findOne({
      where: { clanId: pool.id, userId: ctx.mentor.id },
    });
    expect(membership.role).toBe('lead_mentor');
    expect(membership.status).toBe('active');
  });

  it('takes candidates as members', async () => {
    const pool = await clanOfKind('pool', 'Spring round');
    const candidate = await seed.createMentee({ email: 'cand@test.com' });
    await clanService.addMember(pool.id, { userId: candidate.id, role: 'mentee' });

    const membership = await models.ClanMembership.findOne({
      where: { clanId: pool.id, userId: candidate.id, role: 'mentee' },
    });
    expect(membership.status).toBe('active');
  });
});

describe('but a candidate is not a mentee of the programme', () => {
  /** Somebody who has only ever been in a selection round. */
  async function candidateIn(pool) {
    const user = await seed.createUser({ role: 'mentee', email: 'fresh@test.com' });
    await models.MenteeProfile.destroy({ where: { userId: user.id } });
    await clanService.addMember(pool.id, { userId: user.id, role: 'mentee' });
    return user;
  }

  it('gets no programme enrollment', async () => {
    const pool = await clanOfKind('pool', 'Spring round');
    const user = await candidateIn(pool);

    const enrollment = await models.Enrollment.findOne({ where: { menteeId: user.id } });
    expect(enrollment).toBeNull();

    const membership = await models.ClanMembership.findOne({ where: { clanId: pool.id, userId: user.id } });
    expect(membership.enrollmentId).toBeNull();
  });

  it('gets no mentee profile — that is what opens the whole learner portal', async () => {
    const pool = await clanOfKind('pool', 'Spring round');
    const user = await candidateIn(pool);

    // authzService.isPoolCandidateOnly reads exactly this. A profile here would
    // hand somebody the community, announcements and directory for applying.
    const profile = await models.MenteeProfile.findOne({ where: { userId: user.id } });
    expect(profile).toBeNull();
  });

  it('is enrolled, and given a profile, only once placed in a real clan', async () => {
    const pool = await clanOfKind('pool', 'Spring round');
    const user = await candidateIn(pool);
    const real = await clanOfKind('cohort', 'Clan One');

    await clanService.addMember(real.id, { userId: user.id, role: 'mentee' });

    const enrollment = await models.Enrollment.findOne({ where: { menteeId: user.id, programId: ctx.program.id } });
    expect(enrollment).toBeTruthy();
    expect(enrollment.status).toBe('active');
    expect(await models.MenteeProfile.findOne({ where: { userId: user.id } })).toBeTruthy();
  });
});

describe('a round is not somewhere you move a mentee to', () => {
  /*
   * Every destination check asked "is this standing, or is its programme still
   * open?". A pool clan is not standing and its programme IS open, so it
   * passed — and would have been offered beside real clans as a place to move
   * somebody into, or to hand them over to. A trial is somewhere you are
   * invited, not somewhere you are moved.
   */
  const clanDestinations = require('../../src/services/clanDestinationService');
  const handover = require('../../src/services/handoverPoolService');

  it('is left out of the destinations offered for a clan change', async () => {
    const pool = await clanOfKind('pool', 'Spring round');
    const real = await clanOfKind('cohort', 'Clan One');
    const standing = await clanOfKind('standing', 'Alumni');

    const offered = await clanDestinations.list({ programIds: [ctx.program.id] });

    const ids = offered.map((c) => c.id);
    expect(ids).toContain(real.id);
    expect(ids).toContain(standing.id);
    expect(ids).not.toContain(pool.id);
  });

  it('counts as a join, not a move, if one is ever named', () => {
    const from = { kind: 'cohort', programId: 'p', frozenAt: null };
    expect(clanDestinations.effectOf(from, { kind: 'pool', programId: 'p' })).toBe('join');
    expect(clanDestinations.effectOf(from, { kind: 'standing', programId: 'p' })).toBe('join');
    expect(clanDestinations.effectOf(from, { kind: 'cohort', programId: 'p' })).toBe('move');
  });

  it('is refused outright as a handover target, even when named directly', async () => {
    const pool = await clanOfKind('pool', 'Spring round');
    // A real-looking entry id: the target is refused on its own account, before
    // anything is loaded, so the refusal cannot be an accident of a bad id.
    await expect(handover.claim(ctx.admin, {
      entryId: '11111111-1111-4111-8111-111111111111', toClanId: pool.id,
    })).rejects.toThrow(/selection round/i);
  });
});

describe('the round is scoped by its clan, never by the programme', () => {
  it('scopes its work by clanId alone, exactly as a standing clan does', async () => {
    const pool = await clanOfKind('pool', 'Spring round');
    const standing = await clanOfKind('standing', 'Alumni');
    const cohort = await clanOfKind('cohort', 'Clan One');

    expect(await cohortService.workScopeForClan(pool.id)).toEqual({ clanId: pool.id, standing: true });
    expect(await cohortService.workScopeForClan(standing.id)).toEqual({ clanId: standing.id, standing: true });
    expect(await cohortService.workScopeForClan(cohort.id)).toEqual({ clanId: cohort.id, programId: ctx.program.id });
  });

  it('keeps its work out of programme task filters', async () => {
    const pool = await clanOfKind('pool', 'Spring round');
    const scope = await cohortService.workScopeForClan(pool.id);
    // A programme filter would carry programId; this carries the clan only.
    expect(cohortService.taskFilterForScope(scope)).toEqual({ clanId: pool.id });
  });

  it('places nobody on a programme ladder', async () => {
    const pool = await clanOfKind('pool', 'Spring round');
    const cohort = await clanOfKind('cohort', 'Clan One');

    // A trial has no position among the programme's clans; a real clan does.
    expect(await performanceService.clanStanding(pool.id))
      .toEqual({ average: null, band: null, rank: null, outOf: 0, ranked: 0 });
    expect(await performanceService.clanStanding(cohort.id)).toHaveProperty('outOf');
  });
});
