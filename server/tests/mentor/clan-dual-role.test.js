'use strict';

/**
 * A person can be a MENTEE and a CO-MENTOR of the same clan (migration 075).
 *
 * `clan_memberships` used to be UNIQUE (clan_id, user_id), so `addMember` rewrote
 * the role in place: promoting a mentee to co-mentor deleted their mentee row.
 * They vanished from the clan roster and could no longer be assigned tasks —
 * every mentee-facing read filters on `role: 'mentee'`.
 *
 * These lock in the two roles coexisting, the mentor roles still being mutually
 * exclusive with each other, role-scoped removal, and the self-review guard the
 * dual role newly makes possible.
 */

const { models } = require('../../src/db');
const { PERMISSIONS } = require('../../src/config/permissions');
const clanService = require('../../src/services/clanService');
const authzService = require('../../src/services/authzService');
const taskService = require('../../src/services/taskService');
const { cleanDb, createMentor, createMentee, createProgram } = require('../helpers/seed');

const roleOf = (clanId, userId, role) =>
  models.ClanMembership.findOne({ where: { clanId, userId, role } });

describe('a mentee who also co-mentors their own clan', () => {
  let lead, dual, program, clan;

  beforeEach(async () => {
    await cleanDb();
    lead = await createMentor({ email: 'lead@test.com' });
    dual = await createMentee({ email: 'dual@test.com' });
    program = await createProgram({ createdBy: lead.id });
    clan = await models.Clan.create({ programId: program.id, name: 'Mighty Scripts', leadMentorId: lead.id, createdBy: lead.id });
    await clanService.addMember(clan.id, { userId: lead.id, role: 'lead_mentor' });

    // They join as a mentee, then get promoted to co-mentor of the same clan.
    await clanService.addMember(clan.id, { userId: dual.id, role: 'mentee' });
    await clanService.addMember(clan.id, { userId: dual.id, role: 'co_mentor' });
  });

  it('keeps the mentee membership when promoted to co-mentor', async () => {
    const asMentee = await roleOf(clan.id, dual.id, 'mentee');
    const asCoMentor = await roleOf(clan.id, dual.id, 'co_mentor');
    expect(asMentee?.status).toBe('active');
    expect(asCoMentor?.status).toBe('active');
    // The mentee row keeps the enrollment that placed them (their task home).
    expect(asMentee.enrollmentId).toBeTruthy();
  });

  it('shows them on the clan roster under BOTH roles', async () => {
    const detail = await clanService.getClanById(clan.id);
    const mine = detail.memberships.filter((m) => m.userId === dual.id).map((m) => m.role).sort();
    expect(mine).toEqual(['co_mentor', 'mentee']);
  });

  it('lets the lead mentor assign them tasks', async () => {
    await expect(taskService._isMentorForMentee(lead.id, dual.id)).resolves.toBe(true);
  });

  it('does not let them mentor — or review — themselves', async () => {
    await expect(taskService._isMentorForMentee(dual.id, dual.id)).resolves.toBe(false);

    const task = await models.AssignedTask.create(
      { menteeId: dual.id, mentorId: lead.id, status: 'submitted' },
      { validate: false }
    );
    await expect(authzService.canActOnTask(dual.id, task, PERMISSIONS.TASK_REVIEW)).resolves.toBe(false);
    await expect(authzService.canActOnTask(lead.id, task, PERMISSIONS.TASK_REVIEW)).resolves.toBe(true);
  });

  it('reports their mentor role — not "mentee" — for the clan-team view', async () => {
    const access = await clanService.getMyClanAccess(clan.id, dual);
    expect(access.role).toBe('co_mentor');
  });

  it('removes one role at a time', async () => {
    await clanService.removeMember(clan.id, dual.id, 'co_mentor');
    expect((await roleOf(clan.id, dual.id, 'co_mentor')).status).toBe('removed');
    expect((await roleOf(clan.id, dual.id, 'mentee')).status).toBe('active'); // still a mentee here

    // …and with no role, evicts them from the clan entirely.
    await clanService.removeMember(clan.id, dual.id);
    expect((await roleOf(clan.id, dual.id, 'mentee')).status).toBe('removed');
  });

  it('keeps them out of their own approvals queue', async () => {
    const submissionService = require('../../src/services/submissionService');
    const where = await submissionService._reviewableTaskWhere(dual.id);
    const clauses = Object.values(where).flat();
    const menteeClause = clauses.find((c) => c && c.menteeId);
    const scoped = menteeClause ? Object.values(menteeClause.menteeId)[0] : [];
    expect(scoped).not.toContain(dual.id);
  });
});

describe('mentor roles remain mutually exclusive', () => {
  let lead, program, clan, person;

  beforeEach(async () => {
    await cleanDb();
    lead = await createMentor({ email: 'lead2@test.com' });
    person = await createMentor({ email: 'co@test.com' });
    program = await createProgram({ createdBy: lead.id });
    clan = await models.Clan.create({ programId: program.id, name: 'Solo', leadMentorId: lead.id, createdBy: lead.id });
  });

  it('swaps co_mentor → lead_mentor in place rather than stacking both', async () => {
    await clanService.addMember(clan.id, { userId: person.id, role: 'co_mentor' });
    await clanService.addMember(clan.id, { userId: person.id, role: 'lead_mentor' });

    const rows = await models.ClanMembership.findAll({ where: { clanId: clan.id, userId: person.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('lead_mentor');
  });

  it('re-adding a removed mentee reactivates their row instead of duplicating it', async () => {
    const mentee = await createMentee({ email: 'back@test.com' });
    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' });
    await clanService.removeMember(clan.id, mentee.id, 'mentee');
    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' });

    const rows = await models.ClanMembership.findAll({ where: { clanId: clan.id, userId: mentee.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('active');
  });
});

describe('adding a mentor as a mentee of another clan', () => {
  let leadA, leadB, clanA, clanB, mentorPerson;

  beforeEach(async () => {
    await cleanDb();
    leadA = await createMentor({ email: 'leadA@test.com' });
    leadB = await createMentor({ email: 'leadB@test.com' });
    const progA = await createProgram({ createdBy: leadA.id, name: 'Prog A' });
    const progB = await createProgram({ createdBy: leadB.id, name: 'Prog B' });
    clanA = await models.Clan.create({ programId: progA.id, name: 'A', leadMentorId: leadA.id, createdBy: leadA.id });
    clanB = await models.Clan.create({ programId: progB.id, name: 'B', leadMentorId: leadB.id, createdBy: leadB.id });

    // mentorPerson leads clan A.
    mentorPerson = await createMentor({ email: 'wearer@test.com' });
    await clanService.addMember(clanA.id, { userId: mentorPerson.id, role: 'lead_mentor' });
  });

  it('lists a mentor (not just base-role mentees) as available', async () => {
    const pool = await clanService.listAvailableMembers({ q: 'wearer' });
    const hit = pool.find((p) => p.id === mentorPerson.id);
    expect(hit).toBeTruthy();
    expect(hit.role).toBe('mentor'); // surfaced so the lead sees they're pulling in a mentor
  });

  it('adds the mentor as a mentee of clan B while they still lead clan A', async () => {
    await clanService.addMember(clanB.id, { userId: mentorPerson.id, role: 'mentee' });

    const asLeadOfA = await models.ClanMembership.findOne({ where: { clanId: clanA.id, userId: mentorPerson.id, role: 'lead_mentor', status: 'active' } });
    const asMenteeOfB = await models.ClanMembership.findOne({ where: { clanId: clanB.id, userId: mentorPerson.id, role: 'mentee', status: 'active' } });
    expect(asLeadOfA).toBeTruthy();
    expect(asMenteeOfB).toBeTruthy();
    // Placing them as a mentee gives them a live enrollment in clan B's program.
    expect(asMenteeOfB.enrollmentId).toBeTruthy();
  });

  it('still lists them for another clan after they are a mentee elsewhere', async () => {
    await clanService.addMember(clanB.id, { userId: mentorPerson.id, role: 'mentee' });
    const forA = await clanService.listAvailableMembers({ q: 'wearer', clanId: clanA.id });
    const hit = forA.find((p) => p.id === mentorPerson.id);
    expect(hit).toBeTruthy();
    expect(hit.placedClanId).toBe(clanB.id);
    const forB = await clanService.listAvailableMembers({ q: 'wearer', clanId: clanB.id });
    expect(forB.find((p) => p.id === mentorPerson.id)).toBeFalsy();
  });

  it('never lists a platform admin as an available mentee', async () => {
    const { createAdmin } = require('../helpers/seed');
    const admin = await createAdmin({ email: 'boss@test.com' });
    const pool = await clanService.listAvailableMembers({ q: 'boss' });
    expect(pool.find((p) => p.id === admin.id)).toBeFalsy();
  });
});

describe('single mentee placement is enforced with a clear message', () => {
  let clanA, clanB, person;

  beforeEach(async () => {
    await cleanDb();
    const leadA = await createMentor({ email: 'la@test.com' });
    const leadB = await createMentor({ email: 'lb@test.com' });
    const progA = await createProgram({ createdBy: leadA.id, name: 'Alpha' });
    const progB = await createProgram({ createdBy: leadB.id, name: 'Beta' });
    clanA = await models.Clan.create({ programId: progA.id, name: 'Alpha', createdBy: leadA.id });
    clanB = await models.Clan.create({ programId: progB.id, name: 'Beta', createdBy: leadB.id });
    person = await createMentee({ email: 'p@test.com', firstName: 'Pat', lastName: 'Lee' });
  });

  it('lets the same person be a mentee of two clans at once', async () => {
    await clanService.addMember(clanA.id, { userId: person.id, role: 'mentee' });
    await expect(clanService.addMember(clanB.id, { userId: person.id, role: 'mentee' })).resolves.toBeTruthy();
    const a = await models.ClanMembership.findOne({ where: { userId: person.id, clanId: clanA.id, role: 'mentee' } });
    const b = await models.ClanMembership.findOne({ where: { userId: person.id, clanId: clanB.id, role: 'mentee' } });
    expect(a.status).toBe('active');
    expect(b.status).toBe('active');
  });

  it('refuses to re-add someone already a mentee of THIS clan', async () => {
    await clanService.addMember(clanA.id, { userId: person.id, role: 'mentee' });
    await expect(clanService.addMember(clanA.id, { userId: person.id, role: 'mentee' }))
      .rejects.toThrow(/already a mentee of this clan/);
  });

  it('still lets you re-add a REMOVED mentee', async () => {
    await clanService.addMember(clanA.id, { userId: person.id, role: 'mentee' });
    await clanService.removeMember(clanA.id, person.id, 'mentee');
    await expect(clanService.addMember(clanA.id, { userId: person.id, role: 'mentee' })).resolves.toBeTruthy();
  });

  it('does not block a MENTOR grant just because they mentor elsewhere', async () => {
    // The guard is mentee-only — a person can lead/co-mentor any number of clans.
    await clanService.addMember(clanA.id, { userId: person.id, role: 'co_mentor' });
    await expect(clanService.addMember(clanB.id, { userId: person.id, role: 'co_mentor' })).resolves.toBeTruthy();
  });
});

describe('who is allowed to add a mentee (actor authorization)', () => {
  let clan, lead, co, mentee;

  beforeEach(async () => {
    await cleanDb();
    lead = await createMentor({ email: 'lead@test.com' });
    co = await createMentor({ email: 'co@test.com' });
    const program = await createProgram({ createdBy: lead.id });
    clan = await models.Clan.create({ programId: program.id, name: 'C', leadMentorId: lead.id, createdBy: lead.id });
    await clanService.addMember(clan.id, { userId: lead.id, role: 'lead_mentor' });
    await clanService.addMember(clan.id, { userId: co.id, role: 'co_mentor' });
    mentee = await createMentee({ email: 'new@test.com' });
  });

  it('a lead mentor can add a mentee', async () => {
    await expect(clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' }, lead)).resolves.toBeTruthy();
  });

  it('a co-mentor (holds mentee.add by default) can add a mentee', async () => {
    await expect(clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' }, co)).resolves.toBeTruthy();
  });

  it('a plain mentee cannot add anyone', async () => {
    const outsider = await createMentee({ email: 'rando@test.com' });
    await expect(clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' }, outsider))
      .rejects.toThrow(/permission/i);
  });
});
