'use strict';

/**
 * Reusable clan invite link: enable/disable, public preview, join, and
 * self-serve registration-invite request.
 */

const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const { NotFoundError, ValidationError, ConflictError } = require('../../src/utils/errors/errorTypes');
const { cleanDb, createMentor, createMentee, createProgram } = require('../helpers/seed');

describe('clan invite link', () => {
  let lead, mentee, program, clan;

  beforeEach(async () => {
    await cleanDb();
    lead = await createMentor({ email: 'lead-link@test.com' });
    mentee = await createMentee({ email: 'joiner@test.com' });
    program = await createProgram({ createdBy: lead.id });
    clan = await models.Clan.create({
      programId: program.id,
      name: 'Invite Clan',
      leadMentorId: lead.id,
      createdBy: lead.id,
      maxMentees: 25,
    });
    await clanService.addMember(clan.id, { userId: lead.id, role: 'lead_mentor' });
  });

  it('mints a slug on first enable and keeps it after disable', async () => {
    const enabled = await clanService.enableInviteLink(clan.id);
    expect(enabled.enabled).toBe(true);
    expect(enabled.slug).toBeTruthy();
    expect(enabled.joinUrl).toContain(`/join/${enabled.slug}`);

    const disabled = await clanService.disableInviteLink(clan.id);
    expect(disabled.enabled).toBe(false);
    expect(disabled.slug).toBe(enabled.slug);

    const again = await clanService.enableInviteLink(clan.id);
    expect(again.slug).toBe(enabled.slug);
    expect(again.enabled).toBe(true);
  });

  it('does not advertise the slug on a generic clan fetch', async () => {
    await clanService.enableInviteLink(clan.id);
    const detail = await clanService.getClanById(clan.id);
    expect(detail.inviteSlug).toBeUndefined();
    expect(detail.inviteEnabled).toBeUndefined();
  });

  it('lets a logged-in mentee join, and is idempotent', async () => {
    const { slug } = await clanService.enableInviteLink(clan.id);
    const first = await clanService.joinViaInviteLink(slug, mentee);
    expect(first.alreadyMember).toBe(false);
    const row = await models.ClanMembership.findOne({
      where: { clanId: clan.id, userId: mentee.id, role: 'mentee', status: 'active' },
    });
    expect(row).toBeTruthy();

    const second = await clanService.joinViaInviteLink(slug, mentee);
    expect(second.alreadyMember).toBe(true);
  });

  it('rejects joins when the link is disabled', async () => {
    const { slug } = await clanService.enableInviteLink(clan.id);
    await clanService.disableInviteLink(clan.id);
    await expect(clanService.joinViaInviteLink(slug, mentee)).rejects.toBeInstanceOf(ValidationError);
  });

  it('hides a disabled or unknown slug from the public preview', async () => {
    await expect(clanService.getPublicInviteInfo('no-such-slug')).rejects.toBeInstanceOf(NotFoundError);

    const { slug } = await clanService.enableInviteLink(clan.id);
    const open = await clanService.getPublicInviteInfo(slug);
    expect(open.open).toBe(true);
    expect(open.clan.name).toBe('Invite Clan');

    await clanService.disableInviteLink(clan.id);
    const closed = await clanService.getPublicInviteInfo(slug);
    expect(closed.open).toBe(false);
    expect(closed.reasons).toContain('disabled');
  });

  it('requests a clan-scoped registration invite for a new email', async () => {
    const { slug } = await clanService.enableInviteLink(clan.id);
    const invite = await clanService.requestInviteViaLink(slug, 'newcomer@test.com');
    expect(invite.email).toBe('newcomer@test.com');
    expect(invite.clanId).toBe(clan.id);
    expect(invite.programId).toBe(program.id);
    expect(invite.role).toBe('mentee');
  });

  it('refuses a second active invite for the same email', async () => {
    const { slug } = await clanService.enableInviteLink(clan.id);
    await clanService.requestInviteViaLink(slug, 'once@test.com');
    await expect(clanService.requestInviteViaLink(slug, 'once@test.com')).rejects.toBeInstanceOf(ConflictError);
  });
});
