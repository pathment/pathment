'use strict';

/**
 * The handover pool: a mentee offered out of one clan, taken into another.
 *
 * Two things carry this feature, and both are the kind that look fine in a
 * demo and fail in production:
 *
 *   EXACTLY ONE puller wins. The pool is most useful at the moment a cohort
 *   closes and several mentors are shopping at once, so two claims landing
 *   together is the normal case, not the edge. There is a real test below that
 *   fires concurrent claims at one row and asserts one winner — not a mocked
 *   one, because what is being tested is whether Postgres serialises the
 *   conditional UPDATE, and a mock cannot answer that.
 *
 *   THE WORK COMES TOO. A transfer that loses somebody's history is why
 *   mentors avoid transfers, and why they would avoid this.
 *
 * The rest pin the decisions that were deliberate: a push is an offer and
 * changes nothing until claimed, a frozen clan may still push (that is the
 * commonest reason to), and a cross-programme claim is a clean start rather
 * than a mirror of work from a different roadmap.
 */

const { models, sequelize } = require('../../src/db');
const pool = require('../../src/services/handoverPoolService');
const clanService = require('../../src/services/clanService');
const {
  cleanDb, createAdmin, createMentor, createMentee, createProgram, createEnrollment,
  createRoadmap, createRoadmapTask, createAssignedTask,
} = require('../helpers/seed');

const seatsIn = (clanId) => models.ClanMembership.count({
  where: { clanId, role: 'mentee', status: ['active', 'paused'] },
});

describe('handover pool', () => {
  let admin, giver, taker, other, program, fromClan, toClan, otherClan, mentee;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin({ email: `hp-admin-${Date.now()}@test.com` });
    giver = await createMentor({ email: `hp-giver-${Date.now()}@test.com` });
    taker = await createMentor({ email: `hp-taker-${Date.now()}@test.com` });
    other = await createMentor({ email: `hp-other-${Date.now()}@test.com` });
    program = await createProgram({ createdBy: admin.id, name: 'Full Stack' });

    fromClan = await models.Clan.create({
      programId: program.id, name: 'Leaving', leadMentorId: giver.id, createdBy: admin.id,
    });
    toClan = await models.Clan.create({
      programId: program.id, name: 'Taking', leadMentorId: taker.id, createdBy: admin.id,
    });
    otherClan = await models.Clan.create({
      programId: program.id, name: 'Also taking', leadMentorId: other.id, createdBy: admin.id,
    });
    await clanService.addMember(fromClan.id, { userId: giver.id, role: 'lead_mentor' });
    await clanService.addMember(toClan.id, { userId: taker.id, role: 'lead_mentor' });
    await clanService.addMember(otherClan.id, { userId: other.id, role: 'lead_mentor' });

    mentee = await createMentee({ email: `hp-mentee-${Date.now()}@test.com` });
    await createEnrollment({ menteeId: mentee.id, programId: program.id, status: 'active' });
    await clanService.addMember(fromClan.id, { userId: mentee.id, role: 'mentee' });
  });

  // ── a push is an offer ───────────────────────────────────────────────────

  describe('pushing', () => {
    it('offers the mentee without moving them anywhere', async () => {
      const { entry } = await pool.push(giver, { menteeId: mentee.id, clanId: fromClan.id, reason: 'mentor_leaving' });

      expect(entry.status).toBe('open');
      // The whole safety argument: nothing has happened to them yet.
      const seat = await models.ClanMembership.findOne({
        where: { clanId: fromClan.id, userId: mentee.id, role: 'mentee' },
      });
      expect(seat.status).toBe('active');
    });

    it('refuses a mentor who does not run the clan', async () => {
      await expect(pool.push(taker, { menteeId: mentee.id, clanId: fromClan.id }))
        .rejects.toThrow(/permission/i);
    });

    it('refuses somebody who is not in that clan', async () => {
      const stranger = await createMentee({ email: `hp-stranger-${Date.now()}@test.com` });
      await expect(pool.push(giver, { menteeId: stranger.id, clanId: fromClan.id }))
        .rejects.toThrow(/not in this clan/i);
    });

    /** Two co-mentors both reaching for it is normal, not an error. */
    it('treats a second push of the same mentee as the same offer', async () => {
      const first = await pool.push(giver, { menteeId: mentee.id, clanId: fromClan.id });
      const again = await pool.push(giver, { menteeId: mentee.id, clanId: fromClan.id, handoverNote: 'Stuck on async' });

      expect(again.alreadyOpen).toBe(true);
      expect(again.entry.id).toBe(first.entry.id);
      expect(again.entry.handoverNote).toBe('Stuck on async');
      expect(await models.HandoverPoolEntry.count({ where: { menteeId: mentee.id } })).toBe(1);
    });

    /**
     * The case the feature exists for. A frozen clan is the commonest reason
     * to push, so gating the push on clan writability would disable it exactly
     * where it is needed.
     */
    it('still works when the clan is frozen, which is usually why', async () => {
      await fromClan.update({ frozenAt: new Date() });
      const { entry } = await pool.push(giver, { menteeId: mentee.id, clanId: fromClan.id, reason: 'program_closed' });
      expect(entry.status).toBe('open');
    });

    it('offers a whole closing clan in one go', async () => {
      const second = await createMentee({ email: `hp-second-${Date.now()}@test.com` });
      await createEnrollment({ menteeId: second.id, programId: program.id, status: 'active' });
      await clanService.addMember(fromClan.id, { userId: second.id, role: 'mentee' });

      const result = await pool.pushClan(giver, { clanId: fromClan.id, reason: 'program_closed' });

      expect(result.total).toBe(2);
      expect(result.pushed).toBe(2);
    });

    it('rejects a reason that is not one of the listed ones', async () => {
      await expect(pool.push(giver, { menteeId: mentee.id, clanId: fromClan.id, reason: 'because' }))
        .rejects.toThrow(/reason must be one of/i);
    });
  });

  // ── claiming ─────────────────────────────────────────────────────────────

  describe('claiming', () => {
    let entryId;
    beforeEach(async () => {
      ({ entry: { id: entryId } } = await pool.push(giver, {
        menteeId: mentee.id, clanId: fromClan.id, reason: 'mentor_leaving',
      }));
    });

    it('moves them out of the old clan and into the new one', async () => {
      await pool.claim(taker, { entryId, toClanId: toClan.id });

      const [old, now] = await Promise.all([
        models.ClanMembership.findOne({ where: { clanId: fromClan.id, userId: mentee.id, role: 'mentee' } }),
        models.ClanMembership.findOne({ where: { clanId: toClan.id, userId: mentee.id, role: 'mentee' } }),
      ]);
      expect(old.status).toBe('removed');
      expect(now.status).toBe('active');
    });

    it('records who took them and when', async () => {
      await pool.claim(taker, { entryId, toClanId: toClan.id });
      const entry = await models.HandoverPoolEntry.findByPk(entryId);
      expect(entry.status).toBe('claimed');
      expect(entry.claimedBy).toBe(taker.id);
      expect(entry.claimedClanId).toBe(toClan.id);
      expect(entry.claimedAt).toBeTruthy();
    });

    it('refuses a mentor claiming into a clan they do not run', async () => {
      await expect(pool.claim(taker, { entryId, toClanId: otherClan.id }))
        .rejects.toThrow(/permission/i);
    });

    it('refuses a second claim of a settled entry', async () => {
      await pool.claim(taker, { entryId, toClanId: toClan.id });
      await expect(pool.claim(other, { entryId, toClanId: otherClan.id }))
        .rejects.toThrow(/already/i);
    });

    /**
     * A standing clan carries no programme, so a claim into one would come out
     * as a "fresh start" and quietly drop the work the pool exists to carry.
     * Better to refuse than to lose it.
     */
    it('refuses a standing clan as the target', async () => {
      const standing = await models.Clan.create({
        programId: program.id, kind: 'standing', name: 'Alumni', leadMentorId: taker.id, createdBy: admin.id,
      });
      // The membership row directly: clanService.addMember runs capability and
      // org-membership machinery that is not what this test is about.
      await models.ClanMembership.create({
        clanId: standing.id, userId: taker.id, role: 'lead_mentor', status: 'active', joinedAt: new Date(),
      });

      await expect(pool.claim(taker, { entryId, toClanId: standing.id }))
        .rejects.toThrow(/standing clan/i);
      expect((await models.HandoverPoolEntry.findByPk(entryId)).status).toBe('open');
    });

    it('places into a standing clan after the programme closes', async () => {
      const standing = await models.Clan.create({
        programId: program.id, kind: 'standing', name: 'Alumni', leadMentorId: taker.id, createdBy: admin.id,
      });
      await models.ClanMembership.create({
        clanId: standing.id, userId: taker.id, role: 'lead_mentor', status: 'active', joinedAt: new Date(),
      });
      await program.update({ status: 'completed', closedAt: new Date() });

      const result = await pool.claim(taker, { entryId, toClanId: standing.id });

      expect(result.freshStart).toBe(false);
      const seat = await models.ClanMembership.findOne({
        where: { clanId: standing.id, userId: mentee.id, role: 'mentee', status: 'active' },
      });
      expect(seat).toBeTruthy();
      expect(seat.enrollmentId).toBeNull();
    });

    it('will not seat them past the clan limit', async () => {
      await toClan.update({ maxMentees: 1 });
      const filler = await createMentee({ email: `hp-filler-${Date.now()}@test.com` });
      await createEnrollment({ menteeId: filler.id, programId: program.id, status: 'active' });
      await clanService.addMember(toClan.id, { userId: filler.id, role: 'mentee' });

      await expect(pool.claim(taker, { entryId, toClanId: toClan.id })).rejects.toThrow(/full/i);

      // And the offer is still there for somebody with room.
      const entry = await models.HandoverPoolEntry.findByPk(entryId);
      expect(entry.status).toBe('open');
    });

    /**
     * The rollback that matters: a claim that fails late must put the mentee
     * back, not leave them half-moved with no clan.
     */
    it('leaves the mentee exactly where they were when a claim fails', async () => {
      await toClan.update({ maxMentees: 1 });
      const filler = await createMentee({ email: `hp-rb-${Date.now()}@test.com` });
      await createEnrollment({ menteeId: filler.id, programId: program.id, status: 'active' });
      await clanService.addMember(toClan.id, { userId: filler.id, role: 'mentee' });

      await expect(pool.claim(taker, { entryId, toClanId: toClan.id })).rejects.toThrow();

      const seat = await models.ClanMembership.findOne({
        where: { clanId: fromClan.id, userId: mentee.id, role: 'mentee' },
      });
      expect(seat.status).toBe('active');
      expect(await seatsIn(toClan.id)).toBe(1); // the filler, and nobody else
    });
  });

  // ── the race ─────────────────────────────────────────────────────────────

  describe('two mentors claiming at once', () => {
    /**
     * The real thing, not a simulation of it. Both claims are started without
     * awaiting the first, so they are in flight together and the database
     * decides. Exactly one must win and the loser must be told plainly.
     *
     * If the claim were a read-then-write instead of a conditional UPDATE both
     * would succeed here, the mentee would be seated in two clans, and the
     * entry would record only the second claimer — which is precisely the
     * failure this shape exists to prevent.
     */
    it('gives the mentee to exactly one of them', async () => {
      const { entry } = await pool.push(giver, { menteeId: mentee.id, clanId: fromClan.id });

      const results = await Promise.allSettled([
        pool.claim(taker, { entryId: entry.id, toClanId: toClan.id }),
        pool.claim(other, { entryId: entry.id, toClanId: otherClan.id }),
      ]);

      const won = results.filter((r) => r.status === 'fulfilled');
      const lost = results.filter((r) => r.status === 'rejected');
      expect(won).toHaveLength(1);
      expect(lost).toHaveLength(1);
      expect(lost[0].reason.message).toMatch(/already (taken|been taken)|somebody else/i);

      // One seat, in one clan.
      const seats = await models.ClanMembership.count({
        where: { userId: mentee.id, role: 'mentee', status: ['active', 'paused'] },
      });
      expect(seats).toBe(1);

      // And the record agrees with whoever actually got them.
      const settled = await models.HandoverPoolEntry.findByPk(entry.id);
      const winningClan = await models.ClanMembership.findOne({
        where: { userId: mentee.id, role: 'mentee', status: 'active' }, attributes: ['clanId'],
      });
      expect(settled.claimedClanId).toBe(winningClan.clanId);
    });

    it('does not let one mentee be offered twice in a programme', async () => {
      await pool.push(giver, { menteeId: mentee.id, clanId: fromClan.id });
      // Straight at the index, bypassing the service's own check.
      await expect(models.HandoverPoolEntry.create({
        menteeId: mentee.id, programId: program.id, pushedBy: giver.id,
        fromClanId: fromClan.id, status: 'open',
      })).rejects.toThrow();
    });
  });

  // ── the work comes too ───────────────────────────────────────────────────

  describe('the work that comes with them', () => {
    it('carries their tasks across with their statuses intact', async () => {
      const roadmap = await createRoadmap({ programId: program.id, createdBy: admin.id });
      const rt = await createRoadmapTask({ roadmapId: roadmap.id });
      const enrollment = await models.Enrollment.findOne({ where: { menteeId: mentee.id, programId: program.id } });
      const done = await createAssignedTask({
        menteeId: mentee.id, mentorId: giver.id, roadmapTaskId: rt.id,
        enrollmentId: enrollment.id, status: 'completed',
      });
      await done.update({ clanId: fromClan.id });

      const { entry } = await pool.push(giver, { menteeId: mentee.id, clanId: fromClan.id });
      const result = await pool.claim(taker, { entryId: entry.id, toClanId: toClan.id });

      expect(result.carried.tasks).toBe(1);
      const copy = await models.AssignedTask.findOne({
        where: { clanId: toClan.id, menteeId: mentee.id, continuedFromTaskId: done.id },
      });
      expect(copy).toBeTruthy();
      expect(copy.status).toBe('completed');
      // Cohort work must hang off the TARGET's enrolment, or half the product
      // cannot see it.
      expect(copy.enrollmentId).toBeTruthy();
    });

    it('leaves the old clan\'s record untouched — it copies, never moves', async () => {
      const roadmap = await createRoadmap({ programId: program.id, createdBy: admin.id });
      const rt = await createRoadmapTask({ roadmapId: roadmap.id });
      const enrollment = await models.Enrollment.findOne({ where: { menteeId: mentee.id, programId: program.id } });
      const task = await createAssignedTask({
        menteeId: mentee.id, mentorId: giver.id, roadmapTaskId: rt.id,
        enrollmentId: enrollment.id, status: 'completed',
      });
      await task.update({ clanId: fromClan.id });

      const { entry } = await pool.push(giver, { menteeId: mentee.id, clanId: fromClan.id });
      await pool.claim(taker, { entryId: entry.id, toClanId: toClan.id });

      await task.reload();
      expect(task.clanId).toBe(fromClan.id);
      expect(task.status).toBe('completed');
    });

    it('is a clean start across programmes, where copied work would be meaningless', async () => {
      const otherProgram = await createProgram({ createdBy: admin.id, name: 'Data' });
      const elsewhere = await models.Clan.create({
        programId: otherProgram.id, name: 'Different programme', leadMentorId: taker.id, createdBy: admin.id,
      });
      await clanService.addMember(elsewhere.id, { userId: taker.id, role: 'lead_mentor' });

      const { entry } = await pool.push(giver, { menteeId: mentee.id, clanId: fromClan.id });
      const result = await pool.claim(taker, { entryId: entry.id, toClanId: elsewhere.id });

      expect(result.freshStart).toBe(true);
      expect(result.carried.tasks).toBe(0);
    });
  });

  // ── reads and withdrawal ─────────────────────────────────────────────────

  describe('reading the pool', () => {
    it('shows a mentor offers in a programme they mentor', async () => {
      await pool.push(giver, { menteeId: mentee.id, clanId: fromClan.id });
      const { entries } = await pool.list(taker, {});
      expect(entries.map((e) => e.menteeId)).toContain(mentee.id);
      expect(entries[0].mentee.name).toBeTruthy();
      expect(entries[0].fromClan.name).toBe('Leaving');
    });

    it('lets a pool viewer inspect the rich profile before taking the mentee', async () => {
      const { entry } = await pool.push(giver, { menteeId: mentee.id, clanId: fromClan.id });

      const result = await pool.profile(taker, entry.id);

      expect(result.profile.id).toBe(mentee.id);
      expect(result.profile.email).toBe(mentee.email);
      expect(result.profile.tasksByStatus).toBeTruthy();
    });

    /** The pool is other people's mentees; it must not be a staff directory. */
    it('shows nothing to a mentor with no clan in that programme', async () => {
      const outsider = await createMentor({ email: `hp-out-${Date.now()}@test.com` });
      await pool.push(giver, { menteeId: mentee.id, clanId: fromClan.id });
      const { entries } = await pool.list(outsider, {});
      expect(entries).toEqual([]);
    });

    it('does not reveal a pool profile outside the viewer programme scope', async () => {
      const outsider = await createMentor({ email: `hp-profile-out-${Date.now()}@test.com` });
      const { entry } = await pool.push(giver, { menteeId: mentee.id, clanId: fromClan.id });

      await expect(pool.profile(outsider, entry.id)).rejects.toThrow(/not found/i);
    });

    it('puts the longest-waiting first and says how long', async () => {
      await pool.push(giver, { menteeId: mentee.id, clanId: fromClan.id });
      // Raw: Sequelize drops createdAt from an update, so backdating the row
      // has to go round the model.
      await sequelize.query(
        "UPDATE handover_pool_entries SET created_at = NOW() - INTERVAL '9 days' WHERE mentee_id = :menteeId",
        { replacements: { menteeId: mentee.id } },
      );
      const view = await pool.overview(admin, {});
      expect(view.open).toBe(1);
      expect(view.oldestDays).toBeGreaterThanOrEqual(9);
      expect(view.waitingTooLong).toBe(1);
    });

    it('tells a puller what they would inherit', async () => {
      const roadmap = await createRoadmap({ programId: program.id, createdBy: admin.id, name: 'Backend foundations' });
      const rt = await createRoadmapTask({ roadmapId: roadmap.id, title: 'Build an API' });
      const enrollment = await models.Enrollment.findOne({ where: { menteeId: mentee.id, programId: program.id } });
      const t = await createAssignedTask({
        menteeId: mentee.id, mentorId: giver.id, roadmapTaskId: rt.id,
        enrollmentId: enrollment.id, status: 'completed',
      });
      await t.update({ clanId: fromClan.id });

      await pool.push(giver, { menteeId: mentee.id, clanId: fromClan.id });
      const { entries } = await pool.list(taker, {});
      expect(entries[0].work.tasks).toBe(1);
      expect(entries[0].work.completed).toBe(1);
      expect(entries[0].work.roadmaps).toEqual([expect.objectContaining({
        id: roadmap.id, name: 'Backend foundations', tasks: 1, completed: 1,
        recentTasks: [expect.objectContaining({ title: 'Build an API', status: 'completed' })],
      })]);
    });

    it('offers the claimer only clans they can actually pull into', async () => {
      const clans = await pool.claimableClans(taker);
      expect(clans.map((c) => c.id)).toEqual([toClan.id]);
      expect(clans[0].seated).toBe(0);
      expect(clans[0].available).toBe(true);
    });

    it('switches a closed programme from cohort clans to standing clans', async () => {
      const standing = await models.Clan.create({
        programId: program.id, kind: 'standing', name: 'Alumni', leadMentorId: taker.id, createdBy: admin.id,
      });
      await models.ClanMembership.create({
        clanId: standing.id, userId: taker.id, role: 'lead_mentor', status: 'active', joinedAt: new Date(),
      });
      await program.update({ status: 'completed', closedAt: new Date() });

      const clans = await pool.claimableClans(taker);
      expect(clans.find((c) => c.id === standing.id)).toEqual(expect.objectContaining({
        available: true, kind: 'standing', programStatus: 'completed',
      }));
      expect(clans.find((c) => c.id === toClan.id)).toEqual(expect.objectContaining({
        available: false, kind: 'cohort',
      }));
    });
  });

  describe('withdrawing', () => {
    it('lets whoever pushed take it back', async () => {
      const { entry } = await pool.push(giver, { menteeId: mentee.id, clanId: fromClan.id });
      const out = await pool.withdraw(giver, entry.id);
      expect(out.status).toBe('withdrawn');
    });

    it('refuses an unrelated mentor', async () => {
      const { entry } = await pool.push(giver, { menteeId: mentee.id, clanId: fromClan.id });
      await expect(pool.withdraw(other, entry.id)).rejects.toThrow(/permission/i);
    });

    it('cannot undo a claim', async () => {
      const { entry } = await pool.push(giver, { menteeId: mentee.id, clanId: fromClan.id });
      await pool.claim(taker, { entryId: entry.id, toClanId: toClan.id });
      await expect(pool.withdraw(giver, entry.id)).rejects.toThrow(/already been taken/i);
    });

    it('frees the mentee to be offered again later', async () => {
      const { entry } = await pool.push(giver, { menteeId: mentee.id, clanId: fromClan.id });
      await pool.withdraw(giver, entry.id);
      const again = await pool.push(giver, { menteeId: mentee.id, clanId: fromClan.id });
      expect(again.alreadyOpen).toBe(false);
      expect(again.entry.id).not.toBe(entry.id);
    });
  });

  // ── a chosen set, which may span clans ───────────────────────────────────

  /**
   * The selection on a mentor's screen is whatever they ticked, and the clan
   * picker above it can say "All clans". So the batch is a list of
   * (mentee, clan) pairs, every one of which has to be judged on its own clan
   * rather than on the first one in the list.
   */
  describe('pushing a chosen set', () => {
    let second, third;

    beforeEach(async () => {
      second = await createMentee({ email: `hp-two-${Date.now()}@test.com` });
      third = await createMentee({ email: `hp-three-${Date.now()}@test.com` });
      await createEnrollment({ menteeId: second.id, programId: program.id, status: 'active' });
      await createEnrollment({ menteeId: third.id, programId: program.id, status: 'active' });
      await clanService.addMember(fromClan.id, { userId: second.id, role: 'mentee' });
      // This one sits in a clan the giver does not run.
      await clanService.addMember(otherClan.id, { userId: third.id, role: 'mentee' });
    });

    it('offers everybody that was chosen', async () => {
      const result = await pool.pushMany(giver, {
        mentees: [
          { menteeId: mentee.id, clanId: fromClan.id },
          { menteeId: second.id, clanId: fromClan.id },
        ],
        reason: 'program_closed',
      });
      expect(result.pushed).toBe(2);
      expect(result.failed).toBe(0);
      const open = await models.HandoverPoolEntry.count({ where: { status: 'open' } });
      expect(open).toBe(2);
    });

    /** Nothing has moved: a batch offer is still only an offer. */
    it('leaves every one of them in their clan', async () => {
      await pool.pushMany(giver, {
        mentees: [{ menteeId: mentee.id, clanId: fromClan.id }, { menteeId: second.id, clanId: fromClan.id }],
      });
      expect(await seatsIn(fromClan.id)).toBe(2);
    });

    /**
     * The one that matters. A clan the caller cannot hand over from must cost
     * that clan's mentees and nobody else's - not the whole batch, and not
     * nothing.
     */
    it('refuses only the clan it may not touch, and offers the rest', async () => {
      const result = await pool.pushMany(giver, {
        mentees: [
          { menteeId: mentee.id, clanId: fromClan.id },
          { menteeId: third.id, clanId: otherClan.id },
        ],
      });
      expect(result.pushed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.failures[0].menteeId).toBe(third.id);

      const offered = await models.HandoverPoolEntry.findAll({ where: { status: 'open' } });
      expect(offered.map((e) => e.menteeId)).toEqual([mentee.id]);
    });

    /** Already in the pool is not a failure; it is the state they asked for. */
    it('counts somebody already offered apart from a failure', async () => {
      await pool.push(giver, { menteeId: mentee.id, clanId: fromClan.id });
      const result = await pool.pushMany(giver, {
        mentees: [
          { menteeId: mentee.id, clanId: fromClan.id },
          { menteeId: second.id, clanId: fromClan.id },
        ],
      });
      expect(result.pushed).toBe(1);
      expect(result.alreadyOffered).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('refuses an empty selection rather than reporting a successful nothing', async () => {
      await expect(pool.pushMany(giver, { mentees: [] }))
        .rejects.toThrow(/at least one mentee/i);
    });

    it('ignores an item with no clan, which cannot be judged', async () => {
      const result = await pool.pushMany(giver, {
        mentees: [{ menteeId: mentee.id, clanId: fromClan.id }, { menteeId: second.id }],
      });
      expect(result.total).toBe(1);
      expect(result.pushed).toBe(1);
    });
  });
});
