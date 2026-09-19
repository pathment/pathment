'use strict';

/**
 * The "Add member" picker must never make a person simply VANISH.
 *
 * The bug: `listAvailableMembers` (role = Mentee) dropped anyone already placed
 * as a mentee in another clan, and dropped platform admins. Silently omitting
 * them made the search look broken. Multi-clan mentees are additive: both admin
 * and mentor pickers return other-clan mentees annotated with where they already
 * are. Platform admins still only appear for callers who can reassign.
 */

const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const { cleanDb, createMentor, createMentee, createAdmin, createProgram } = require('../helpers/seed');

const find = (people, email) => people.find((p) => p.email === email);

describe('clan add-member picker (mentee role)', () => {
  let lead, program, clanA, clanB, placedMentee, freeMentee;

  beforeEach(async () => {
    await cleanDb();
    lead = await createMentor({ email: 'lead@test.com' });
    program = await createProgram({ createdBy: lead.id });
    clanA = await models.Clan.create({ programId: program.id, name: 'Core Team 2026', leadMentorId: lead.id, createdBy: lead.id });
    clanB = await models.Clan.create({ programId: program.id, name: 'Grumpy Node Clan 2026', leadMentorId: lead.id, createdBy: lead.id });
    await clanService.addMember(clanA.id, { userId: lead.id, role: 'lead_mentor' });

    placedMentee = await createMentee({ email: 'midhat@test.com', firstName: 'Midhat', lastName: 'Kazmi' });
    await clanService.addMember(clanB.id, { userId: placedMentee.id, role: 'mentee' });
    freeMentee = await createMentee({ email: 'free@test.com', firstName: 'Free', lastName: 'Agent' });
  });

  // ── what the admin sees ───────────────────────────────────────────────────
  it('finds someone already in another clan, and says where they are', async () => {
    const people = await clanService.listAvailableMembers({ q: 'midhat@test.com', clanId: clanA.id, includePlaced: true });
    const row = find(people, 'midhat@test.com');

    expect(row).toBeDefined();                       // used to be silently dropped
    expect(row.placedClanId).toBe(clanB.id);
    expect(row.placedClanName).toBe('Grumpy Node Clan 2026');
  });

  it('finds an unplaced person with no placement annotation', async () => {
    const people = await clanService.listAvailableMembers({ q: 'free@test.com', clanId: clanA.id, includePlaced: true });
    const row = find(people, 'free@test.com');
    expect(row).toBeDefined();
    expect(row.placedClanId).toBeNull();
    expect(row.blockedReason).toBeNull();
  });

  it('shows a platform admin with a reason instead of hiding them', async () => {
    await createAdmin({ email: 'boss@test.com' });
    const people = await clanService.listAvailableMembers({ q: 'boss@test.com', clanId: clanA.id, includePlaced: true });
    const row = find(people, 'boss@test.com');
    expect(row).toBeDefined();
    expect(row.blockedReason).toBe('admin');
  });

  it('omits someone already a mentee of THIS clan — nothing to offer', async () => {
    await clanService.addMember(clanA.id, { userId: freeMentee.id, role: 'mentee' });
    const people = await clanService.listAvailableMembers({ q: 'free@test.com', clanId: clanA.id, includePlaced: true });
    expect(find(people, 'free@test.com')).toBeUndefined();
  });

  it('matches on email as well as name', async () => {
    const byName = await clanService.listAvailableMembers({ q: 'Midhat', clanId: clanA.id, includePlaced: true });
    const byEmail = await clanService.listAvailableMembers({ q: 'midhat@test.com', clanId: clanA.id, includePlaced: true });
    expect(find(byName, 'midhat@test.com')).toBeDefined();
    expect(find(byEmail, 'midhat@test.com')).toBeDefined();
  });

  // ── what a mentor sees ────────────────────────────────────────────────────
  it('finds someone already in another clan so they can be added here too', async () => {
    const people = await clanService.listAvailableMembers({ q: 'midhat@test.com', clanId: clanA.id });
    const row = find(people, 'midhat@test.com');
    expect(row).toBeDefined();
    expect(row.placedClanId).toBe(clanB.id);
    // …and an unplaced person is still offered, exactly as before.
    const free = await clanService.listAvailableMembers({ q: 'free@test.com', clanId: clanA.id });
    expect(find(free, 'free@test.com')).toBeDefined();
  });

  it('lists other-clan mentees first so they are not lost to the unassigned cap', async () => {
    const people = await clanService.listAvailableMembers({ clanId: clanA.id });
    expect(people[0].email).toBe('midhat@test.com');
    expect(people[0].placedClanName).toBe('Grumpy Node Clan 2026');
  });

  it('hides platform admins from a caller who cannot reassign', async () => {
    await createAdmin({ email: 'boss@test.com' });
    const people = await clanService.listAvailableMembers({ q: 'boss@test.com', clanId: clanA.id });
    expect(find(people, 'boss@test.com')).toBeUndefined();
  });

  // ── the rule the picker exists to respect ─────────────────────────────────
  it('adds a second-clan membership without removing the first', async () => {
    await clanService.addMember(clanA.id, { userId: placedMentee.id, role: 'mentee' });
    const a = await models.ClanMembership.findOne({
      where: { userId: placedMentee.id, clanId: clanB.id, role: 'mentee', status: 'active' },
    });
    const b = await models.ClanMembership.findOne({
      where: { userId: placedMentee.id, clanId: clanA.id, role: 'mentee', status: 'active' },
    });
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
  });

  it('moves them cleanly via reassignMentee — the picker’s "Move here"', async () => {
    await clanService.reassignMentee(placedMentee.id, clanA.id, lead.id);

    const now = await models.ClanMembership.findOne({
      where: { userId: placedMentee.id, role: 'mentee', status: 'active' },
    });
    expect(now.clanId).toBe(clanA.id);
    const old = await models.ClanMembership.findOne({
      where: { userId: placedMentee.id, clanId: clanB.id, role: 'mentee' },
    });
    expect(old.status).toBe('removed');
  });
});
