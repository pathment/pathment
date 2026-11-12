'use strict';

/**
 * A mentee added to a clan is told how to join its group chat.
 *
 * The link was already collected — mentors set it on their own clan, admins on
 * any clan — and somebody INVITED from scratch already received it in their
 * registration email. The person who fell through was the one who already had
 * an account: `addMember` sent nothing at all, so being placed in a clan was
 * silent and the group everybody talks in was whatever a human remembered to
 * paste to them.
 *
 * The two that would hurt most to get wrong:
 *   - the email's button goes to WHATSAPP, not to a Pathment page. The whole
 *     point is one tap from the inbox into the group;
 *   - a clan with no link sends nothing, rather than an empty invitation.
 */

const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const notificationOrchestrator = require('../../src/services/notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../../src/config/notificationMatrix');
const { safeLink } = require('../../src/services/clanGroupChat');
const {
  cleanDb, createAdmin, createMentor, createMentee, createProgram, createClan,
} = require('../helpers/seed');

const LINK = 'https://chat.whatsapp.com/KmQw1example';

/** The clan-group-chat dispatch, if one happened. */
const invite = () => notificationOrchestrator.dispatch.mock.calls
  .map(([args]) => args)
  .find((a) => a.eventKey === NOTIFICATION_EVENTS.CLAN_GROUP_CHAT);

describe('the clan group-chat invite', () => {
  let admin, mentor, mentee, program, clan;

  beforeEach(async () => {
    await cleanDb();
    notificationOrchestrator.dispatch.mockClear();
    admin = await createAdmin({ email: `gc-admin-${Date.now()}@test.com` });
    mentor = await createMentor({ email: `gc-mentor-${Date.now()}@test.com` });
    mentee = await createMentee({ email: `gc-mentee-${Date.now()}@test.com` });
    program = await createProgram({ createdBy: admin.id, name: 'Full Stack' });
    clan = await createClan({ programId: program.id, leadMentor: mentor, name: 'Dawn Clan' });
  });

  it('sends it to the mentee who was just added, with the clan named', async () => {
    await clan.update({ whatsappGroupLink: LINK });

    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' }, admin);

    const sent = invite();
    expect(sent).toBeTruthy();
    expect(sent.recipients.map((r) => r.userId)).toEqual([mentee.id]);
    expect(sent.payload.title).toContain('Dawn Clan');
    expect(sent.payload.emailSubject).toContain('Dawn Clan');
  });

  it('points the email button straight at WhatsApp, not at Pathment', async () => {
    await clan.update({ whatsappGroupLink: LINK });

    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' }, admin);

    const { payload } = invite();
    // The button, the body link and the plain-text copy all carry the group.
    expect(payload.emailActionUrl).toBe(LINK);
    expect(payload.emailBodyHtml).toContain(LINK);
    expect(payload.emailPlainBody).toContain(LINK);
    // In-app still goes to their clan page, where the same link now lives.
    expect(payload.actionUrl).toBe('/mentee/clan');
  });

  it('says nothing when the clan has no group link', async () => {
    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' }, admin);
    expect(invite()).toBeUndefined();
  });

  it('does not send it to a mentor joining the clan', async () => {
    await clan.update({ whatsappGroupLink: LINK });
    const second = await createMentor({ email: `gc-co-${Date.now()}@test.com` });

    await clanService.addMember(clan.id, { userId: second.id, role: 'co_mentor' }, admin);

    expect(invite()).toBeUndefined();
  });

  it('sends it for a standing clan too, which joins by a different path', async () => {
    const standing = await createClan({ programId: program.id, leadMentor: mentor, name: 'Alumni Guild' });
    await standing.update({ kind: 'standing', whatsappGroupLink: LINK });

    await clanService.addMember(standing.id, { userId: mentee.id, role: 'mentee' }, admin);

    const sent = invite();
    expect(sent).toBeTruthy();
    expect(sent.payload.emailActionUrl).toBe(LINK);
  });

  it('never fails the placement when the invite cannot be sent', async () => {
    await clan.update({ whatsappGroupLink: LINK });
    notificationOrchestrator.dispatch.mockRejectedValueOnce(new Error('mail is down'));

    await expect(clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' }, admin))
      .resolves.toBeTruthy();

    const membership = await models.ClanMembership.findOne({
      where: { clanId: clan.id, userId: mentee.id, role: 'mentee' },
    });
    expect(membership.status).toBe('active');
  });
});

describe('what counts as a link worth emailing', () => {
  it('takes http and https', () => {
    expect(safeLink('https://chat.whatsapp.com/x')).toBe('https://chat.whatsapp.com/x');
    expect(safeLink('http://chat.whatsapp.com/x')).toBe('http://chat.whatsapp.com/x');
  });

  it('refuses anything that is not a web link', () => {
    // Whatever ends up in that column, an email must never carry a script URL
    // to somebody and ask them to tap it.
    expect(safeLink('javascript:alert(1)')).toBeNull();
    expect(safeLink('data:text/html,<script>')).toBeNull();
    expect(safeLink('chat.whatsapp.com/no-scheme')).toBeNull();
    expect(safeLink('')).toBeNull();
    expect(safeLink(null)).toBeNull();
  });
});
