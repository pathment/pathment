'use strict';

/**
 * Accepted-but-unplaced applicants must always be recoverable from the
 * "Assign to clans" screen.
 *
 * The bug: `previewAssignment` treated `application.status === 'accepted'` as
 * proof of placement and marked the row "Already accepted", blocking assignment.
 * `previewUnassigned` only looked at applications with a `user_id`, i.e. people
 * who had registered. So an applicant who was accepted but never registered
 * (invite expired, or never delivered) appeared on NEITHER tab: unassignable on
 * one, invisible on the other, with no clan shown and no invite to find.
 *
 * These lock in: real membership is what blocks, the clan is named, a stuck
 * applicant stays assignable, and committing actually re-issues their invite.
 */

const { models } = require('../../src/db');
const clanAssignmentService = require('../../src/services/clanAssignmentService');
const clanService = require('../../src/services/clanService');
const { cleanDb, createMentor, createMentee, createProgram } = require('../helpers/seed');

const makeCohort = (programId, createdBy) => models.Cohort.create({
  programId, name: 'Test intake', status: 'open', createdBy,
});

const makeApplication = (cohortId, over = {}) => models.Application.create({
  cohortId, firstName: 'Amna', lastName: 'Naveed', email: 'amna@test.com',
  status: 'accepted', responses: { gender: 'female' }, ...over,
});

const rowFor = (plan, applicationId) => plan.rows.find((r) => r.applicationId === applicationId);

describe('recovering accepted-but-unplaced applicants', () => {
  let lead, program, cohort, clan;

  beforeEach(async () => {
    await cleanDb();
    lead = await createMentor({ email: 'lead@test.com' });
    program = await createProgram({ createdBy: lead.id });
    cohort = await makeCohort(program.id, lead.id);
    clan = await models.Clan.create({ programId: program.id, name: 'Crispy Cache', leadMentorId: lead.id, createdBy: lead.id });
    await clanService.addMember(clan.id, { userId: lead.id, role: 'lead_mentor' });
  });

  it('keeps an accepted applicant who never registered ASSIGNABLE', async () => {
    const app = await makeApplication(cohort.id); // accepted, no userId, no invite
    const plan = await clanAssignmentService.previewAssignment(cohort.id, [app.id], {});
    const row = rowFor(plan, app.id);

    expect(row.status).not.toBe('already_placed');
    expect(row.clanId).toBe(clan.id); // a clan was actually proposed
    // …and it says WHY they're stuck rather than a bare "Already accepted".
    expect(row.note).toMatch(/no invite found/i);
  });

  it('explains an expired invite instead of hiding it', async () => {
    const app = await makeApplication(cohort.id);
    await models.RegistrationInvite.create({
      email: 'amna@test.com', role: 'mentee', tokenHash: 'expired-hash',
      programId: program.id, cohortId: cohort.id,
      expiresAt: new Date(Date.now() - 86_400_000), invitedBy: lead.id,
    });

    const plan = await clanAssignmentService.previewAssignment(cohort.id, [app.id], {});
    const row = rowFor(plan, app.id);
    expect(row.status).not.toBe('already_placed');
    expect(row.note).toMatch(/expired/i);
  });

  it('still blocks — and NAMES the clan — for someone genuinely placed', async () => {
    const mentee = await createMentee({ email: 'amna@test.com' });
    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' });
    const app = await makeApplication(cohort.id, { userId: mentee.id });

    const plan = await clanAssignmentService.previewAssignment(cohort.id, [app.id], {});
    const row = rowFor(plan, app.id);

    expect(row.status).toBe('already_placed');
    expect(row.clanName).toBe('Crispy Cache');       // the admin can see WHERE
    expect(row.reason).toMatch(/Already in Crispy Cache/);
  });

  it('matches an applicant to their account by email when user_id was never linked', async () => {
    const mentee = await createMentee({ email: 'amna@test.com' });
    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' });
    const app = await makeApplication(cohort.id); // userId deliberately null

    const plan = await clanAssignmentService.previewAssignment(cohort.id, [app.id], {});
    expect(rowFor(plan, app.id).status).toBe('already_placed');
  });

  it('lists a never-registered applicant on the Unplaced tab', async () => {
    const app = await makeApplication(cohort.id);
    const plan = await clanAssignmentService.previewUnassigned(cohort.id, {});
    const row = rowFor(plan, app.id);

    expect(row).toBeDefined();       // used to be filtered out entirely
    expect(row.userId).toBeNull();
    expect(row.clanId).toBe(clan.id);
  });

  it('drops a placed mentee off the Unplaced tab', async () => {
    const mentee = await createMentee({ email: 'amna@test.com' });
    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' });
    await makeApplication(cohort.id, { userId: mentee.id });

    const plan = await clanAssignmentService.previewUnassigned(cohort.id, {});
    expect(plan.rows).toHaveLength(0);
  });

  it('re-issues a clan-stamped invite when placing someone with no account', async () => {
    const app = await makeApplication(cohort.id);

    const result = await clanAssignmentService.commitPlacement(
      cohort.id,
      [{ userId: null, applicationId: app.id, clanId: clan.id }],
      lead.id,
    );

    expect(result.invited).toBe(1);
    expect(result.skipped).toHaveLength(0);

    // A live invite now exists, carrying the clan — registering lands them in it.
    const invite = await models.RegistrationInvite.findOne({
      where: { email: 'amna@test.com', role: 'mentee' },
      order: [['createdAt', 'DESC']],
    });
    expect(invite).toBeTruthy();
    expect(invite.clanId).toBe(clan.id);
    expect(invite.usedAt).toBeNull();
    expect(new Date(invite.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('still places a registered mentee directly, without an invite', async () => {
    const mentee = await createMentee({ email: 'amna@test.com' });
    const app = await makeApplication(cohort.id, { userId: mentee.id });

    const result = await clanAssignmentService.commitPlacement(
      cohort.id,
      [{ userId: mentee.id, applicationId: app.id, clanId: clan.id }],
      lead.id,
    );

    expect(result.placed).toBe(1);
    expect(result.invited).toBe(0);
    const membership = await models.ClanMembership.findOne({
      where: { userId: mentee.id, clanId: clan.id, role: 'mentee', status: 'active' },
    });
    expect(membership).toBeTruthy();
  });
});
