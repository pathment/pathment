'use strict';

/**
 * Public clan joining link — service-level coverage for Phase 3.
 * HTTP routes are thin; authorization and lifecycle live in clanPublicJoinService.
 */

const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const clanPublicJoinService = require('../../src/services/clanPublicJoinService');
const authService = require('../../src/services/authService');
const {
  ForbiddenError,
  NotFoundError,
  ConflictError
} = require('../../src/utils/errors/errorTypes');
const {
  cleanDb,
  createAdmin,
  createMentor,
  createMentee,
  createProgram
} = require('../helpers/seed');

async function setupClan() {
  const admin = await createAdmin({ email: `admin-${Date.now()}@test.com` });
  const lead = await createMentor({ email: `lead-${Date.now()}@test.com` });
  const co = await createMentor({ email: `co-${Date.now()}@test.com` });
  const program = await createProgram({ createdBy: admin.id });
  const clan = await models.Clan.create({
    programId: program.id,
    name: 'Public Join Clan',
    leadMentorId: lead.id,
    createdBy: admin.id,
    maxMentees: 25
  });
  await clanService.addMember(clan.id, { userId: lead.id, role: 'lead_mentor' });
  await clanService.addMember(clan.id, { userId: co.id, role: 'co_mentor' });
  await clan.reload();
  return { admin, lead, co, program, clan };
}

describe('clan public join — admin access & lead link', () => {
  let admin, lead, co, clan;

  beforeEach(async () => {
    await cleanDb();
    ({ admin, lead, co, clan } = await setupClan());
  });

  it('defaults public joining to not allowed / not enabled / no slug', () => {
    expect(clan.publicJoinAllowed).toBe(false);
    expect(clan.publicJoinEnabled).toBe(false);
    expect(clan.publicJoinSlug).toBeNull();
  });

  it('lets an admin grant and remove per-clan access', async () => {
    const granted = await clanPublicJoinService.setPublicJoinAccess(clan.id, true, admin);
    expect(granted.publicJoinAllowed).toBe(true);
    expect(granted.publicJoinEnabled).toBe(false);

    await clan.reload();
    expect(clan.publicJoinAllowed).toBe(true);

    const removed = await clanPublicJoinService.setPublicJoinAccess(clan.id, false, admin);
    expect(removed.publicJoinAllowed).toBe(false);
    expect(removed.publicJoinEnabled).toBe(false);
  });

  it('forbids the lead mentor from granting access', async () => {
    await expect(
      clanPublicJoinService.setPublicJoinAccess(clan.id, true, lead)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('forbids generating a link before admin grants access', async () => {
    await expect(
      clanPublicJoinService.generateOrEnableLink(clan.id, lead)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lets the lead generate, disable, and regenerate after access is granted', async () => {
    await clanPublicJoinService.setPublicJoinAccess(clan.id, true, admin);

    const enabled = await clanPublicJoinService.generateOrEnableLink(clan.id, lead);
    expect(enabled.publicJoinEnabled).toBe(true);
    expect(enabled.publicJoinLinkExists).toBe(true);
    expect(enabled.publicJoinUrl).toContain('/clan/join/');
    const firstSlug = (await clan.reload()).publicJoinSlug;

    await clanPublicJoinService.disableLink(clan.id, lead);
    await clan.reload();
    expect(clan.publicJoinEnabled).toBe(false);
    expect(clan.publicJoinSlug).toBe(firstSlug);

    const regenerated = await clanPublicJoinService.regenerateLink(clan.id, lead);
    await clan.reload();
    expect(clan.publicJoinSlug).not.toBe(firstSlug);
    expect(clan.publicJoinEnabled).toBe(true);
    expect(regenerated.publicJoinUrl).toContain(clan.publicJoinSlug);

    await expect(
      clanPublicJoinService.getPublicClanInfo(firstSlug)
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('forbids co-mentors from managing the link or requests', async () => {
    await clanPublicJoinService.setPublicJoinAccess(clan.id, true, admin);
    await expect(
      clanPublicJoinService.generateOrEnableLink(clan.id, co)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('invalidates the public page when admin removes access', async () => {
    await clanPublicJoinService.setPublicJoinAccess(clan.id, true, admin);
    await clanPublicJoinService.generateOrEnableLink(clan.id, lead);
    const slug = (await clan.reload()).publicJoinSlug;

    await clanPublicJoinService.setPublicJoinAccess(clan.id, false, admin);
    await expect(
      clanPublicJoinService.getPublicClanInfo(slug)
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('clan public join — requests & approval', () => {
  let admin, lead, co, clan, slug;

  beforeEach(async () => {
    await cleanDb();
    ({ admin, lead, co, clan } = await setupClan());
    await clanPublicJoinService.setPublicJoinAccess(clan.id, true, admin);
    await clanPublicJoinService.generateOrEnableLink(clan.id, lead);
    slug = (await clan.reload()).publicJoinSlug;
  });

  it('creates a pending request for an eligible authenticated user', async () => {
    const mentee = await createMentee({ email: `join-${Date.now()}@test.com` });
    const request = await clanPublicJoinService.createJoinRequest(slug, mentee);
    expect(request.status).toBe('pending');
    expect(request.source).toBe('public_link');

    await expect(
      clanPublicJoinService.createJoinRequest(slug, mentee)
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects request creation when the link is disabled', async () => {
    const mentee = await createMentee({ email: `disabled-${Date.now()}@test.com` });
    await clanPublicJoinService.disableLink(clan.id, lead);
    await expect(
      clanPublicJoinService.createJoinRequest(slug, mentee)
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lets the lead approve a pending request into membership', async () => {
    const mentee = await createMentee({ email: `approve-${Date.now()}@test.com` });
    const request = await clanPublicJoinService.createJoinRequest(slug, mentee);

    const result = await clanPublicJoinService.approveJoinRequest(clan.id, request.id, lead);
    expect(result.request.status).toBe('approved');
    expect(result.alreadyMember).toBe(false);

    const membership = await models.ClanMembership.findOne({
      where: { clanId: clan.id, userId: mentee.id, role: 'mentee', status: 'active' }
    });
    expect(membership).toBeTruthy();
  });

  it('forbids co-mentors from approving', async () => {
    const mentee = await createMentee({ email: `co-approve-${Date.now()}@test.com` });
    const request = await clanPublicJoinService.createJoinRequest(slug, mentee);
    await expect(
      clanPublicJoinService.approveJoinRequest(clan.id, request.id, co)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows approval after admin removes public-join access', async () => {
    const mentee = await createMentee({ email: `after-revoke-${Date.now()}@test.com` });
    const request = await clanPublicJoinService.createJoinRequest(slug, mentee);
    await clanPublicJoinService.setPublicJoinAccess(clan.id, false, admin);

    const result = await clanPublicJoinService.approveJoinRequest(clan.id, request.id, lead);
    expect(result.request.status).toBe('approved');
  });

  it('lets the lead reject and allows a later re-request', async () => {
    const mentee = await createMentee({ email: `reject-${Date.now()}@test.com` });
    const request = await clanPublicJoinService.createJoinRequest(slug, mentee);
    await clanPublicJoinService.rejectJoinRequest(clan.id, request.id, lead, { note: 'Not a fit' });

    const again = await clanPublicJoinService.createJoinRequest(slug, mentee);
    expect(again.status).toBe('pending');
    expect(again.id).not.toBe(request.id);
  });

  it('lets users who are already mentees elsewhere request to join this clan', async () => {
    const mentee = await createMentee({ email: `elsewhere-${Date.now()}@test.com` });
    const other = await models.Clan.create({
      programId: clan.programId,
      name: 'Other Clan',
      leadMentorId: lead.id,
      createdBy: admin.id
    });
    await clanService.addMember(other.id, { userId: mentee.id, role: 'mentee' });

    const request = await clanPublicJoinService.createJoinRequest(slug, mentee);
    expect(request.status).toBe('pending');
  });

  it('moves lead authority when the lead mentor changes', async () => {
    const mentee = await createMentee({ email: `newlead-${Date.now()}@test.com` });
    const request = await clanPublicJoinService.createJoinRequest(slug, mentee);

    const newLead = await createMentor({ email: `new-lead-${Date.now()}@test.com` });
    await clanService.addMember(clan.id, { userId: newLead.id, role: 'lead_mentor' }, admin);
    await clan.reload();
    expect(clan.leadMentorId).toBe(newLead.id);

    await expect(
      clanPublicJoinService.approveJoinRequest(clan.id, request.id, lead)
    ).rejects.toBeInstanceOf(ForbiddenError);

    const result = await clanPublicJoinService.approveJoinRequest(clan.id, request.id, newLead);
    expect(result.request.status).toBe('approved');
  });
});

describe('clan public join — registration via slug', () => {
  let admin, lead, clan, slug;

  beforeEach(async () => {
    await cleanDb();
    ({ admin, lead, clan } = await setupClan());
    await clanPublicJoinService.setPublicJoinAccess(clan.id, true, admin);
    await clanPublicJoinService.generateOrEnableLink(clan.id, lead);
    slug = (await clan.reload()).publicJoinSlug;
  });

  it('registers a mentee without granting membership', async () => {
    const result = await authService.register({
      firstName: 'Maya',
      lastName: 'Join',
      email: `maya-join-${Date.now()}@test.com`,
      password: 'Test@1234',
      confirmPassword: 'Test@1234',
      clanJoinSlug: slug
    });

    expect(result.user.role).toBe('mentee');
    expect(result.clanJoin.joinPath).toBe(`/clan/join/${slug}`);

    const membership = await models.ClanMembership.findOne({
      where: { clanId: clan.id, userId: result.user.id }
    });
    expect(membership).toBeNull();

    const enrollment = await models.Enrollment.findOne({
      where: { menteeId: result.user.id, programId: clan.programId }
    });
    expect(enrollment?.status).toBe('pending_match');
  });

  it('rejects registration when the slug is no longer usable', async () => {
    await clanPublicJoinService.setPublicJoinAccess(clan.id, false, admin);
    await expect(
      authService.register({
        firstName: 'No',
        lastName: 'Access',
        email: `no-access-${Date.now()}@test.com`,
        password: 'Test@1234',
        confirmPassword: 'Test@1234',
        clanJoinSlug: slug
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
