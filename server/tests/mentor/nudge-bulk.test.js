'use strict';

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const { cleanDb, createMentor, createMentee, createProgram, authHeader } = require('../helpers/seed');

const postBulkNudge = (user, body) =>
  request(app).post('/api/mentor/nudge/bulk').set('Authorization', authHeader(user)).send(body);

describe('POST /api/mentor/nudge/bulk', () => {
  let lead, otherLead, mine, theirs, clan, otherClan;

  beforeEach(async () => {
    await cleanDb();
    lead = await createMentor({ email: 'lead-nudge@test.com' });
    otherLead = await createMentor({ email: 'other-nudge@test.com' });
    mine = await createMentee({ email: 'mine-nudge@test.com' });
    theirs = await createMentee({ email: 'theirs-nudge@test.com' });

    const program = await createProgram({ createdBy: lead.id });
    clan = await models.Clan.create({ programId: program.id, name: 'Mine', leadMentorId: lead.id, createdBy: lead.id });
    otherClan = await models.Clan.create({ programId: program.id, name: 'Theirs', leadMentorId: otherLead.id, createdBy: otherLead.id });
    await clanService.addMember(clan.id, { userId: lead.id, role: 'lead_mentor' });
    await clanService.addMember(otherClan.id, { userId: otherLead.id, role: 'lead_mentor' });
    await clanService.addMember(clan.id, { userId: mine.id, role: 'mentee' });
    await clanService.addMember(otherClan.id, { userId: theirs.id, role: 'mentee' });
  });

  it('returns 400 when menteeIds is empty', async () => {
    const res = await postBulkNudge(lead, { menteeIds: [] });
    expect(res.status).toBe(400);
  });

  it('sends to mentees in the mentor cohort and skips outsiders', async () => {
    const res = await postBulkNudge(lead, {
      menteeIds: [mine.id, theirs.id],
      message: 'Checking in on your progress',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.sent).toBe(1);
    expect(res.body.data.failed).toBe(1);
    expect(res.body.data.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ menteeId: mine.id, sent: true }),
        expect.objectContaining({ menteeId: theirs.id, sent: false }),
      ]),
    );

    const notifications = await models.Notification.findAll({ where: { userId: mine.id }, order: [['createdAt', 'DESC']] });
    expect(notifications.length).toBeGreaterThanOrEqual(1);
    expect(notifications[0].message).toContain('Checking in on your progress');

    const second = await postBulkNudge(lead, { menteeIds: [mine.id], message: 'Follow-up nudge text' });
    expect(second.status).toBe(200);
    expect(second.body.data.sent).toBe(1);

    const afterSecond = await models.Notification.findAll({ where: { userId: mine.id }, order: [['createdAt', 'DESC']] });
    expect(afterSecond.length).toBeGreaterThanOrEqual(2);
    expect(afterSecond[0].message).toBe('Follow-up nudge text');
  });
});
