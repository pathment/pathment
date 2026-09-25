'use strict';

/**
 * The admin's certificate review shows the whole round, over HTTP.
 *
 * `GET /certificates/templates/:id/verifications` reads the clan from
 * `req.query.clanId || portalOf(req).clanId`, and the browser was attaching the
 * MENTOR picker's clan to admin requests. An admin who also mentors a clan got
 * a verification queue holding only that clan, while the approval banner beside
 * it — which takes no clan — still summarised every clan in the fellowship.
 *
 * The page then contradicted itself: a clan card read "16 of 16 signed off · 3
 * changed" and the drawer behind it opened to "0 decisions", because those rows
 * had never been sent to the browser at all.
 *
 * This goes through the route, not the service, because the bug lived in the
 * wiring between them.
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const certificateService = require('../../src/services/certificateService');
const verification = require('../../src/services/certificateVerificationService');
const {
  cleanDb, createAdmin, createMentee, createProgram, authHeader
} = require('../helpers/seed');

describe('an admin sees every clan in the review round', () => {
  let admin, minePupil, otherPupil, program, myClan, otherClan, template;

  beforeEach(async () => {
    await cleanDb();
    await models.CertificateTemplate.destroy({ where: {}, force: true });

    // The admin who also mentors a clan — the account the bug needed.
    admin = await createAdmin({ email: 'dual-admin@test.com' });
    minePupil = await createMentee({ email: 'in-my-clan@test.com' });
    otherPupil = await createMentee({ email: 'in-another-clan@test.com' });

    program = await createProgram({ createdBy: admin.id });
    myClan = await models.Clan.create({
      programId: program.id, name: 'Viral Loop', leadMentorId: admin.id, createdBy: admin.id
    });
    otherClan = await models.Clan.create({
      programId: program.id, name: 'SkillFlow', leadMentorId: admin.id, createdBy: admin.id
    });
    await clanService.addMember(myClan.id, { userId: admin.id, role: 'lead_mentor' });
    await clanService.addMember(myClan.id, { userId: minePupil.id, role: 'mentee' });
    await clanService.addMember(otherClan.id, { userId: otherPupil.id, role: 'mentee' });

    template = await certificateService.createTemplate(
      {
        name: 'Fellowship',
        config: [],
        criteria: [
          { id: 'silver', name: 'Silver Certificate', priority: 2 },
          { id: 'participation', name: 'Participation Certificate', priority: 4 }
        ],
        programId: program.id
      },
      admin.id
    );

    await verification.open(template.id, [
      { mentee_id: minePupil.id, certificate_tier: 'participation', match_score: 60 },
      { mentee_id: otherPupil.id, certificate_tier: 'silver', match_score: 95 }
    ], { notify: false });
  });

  const url = () => `/api/certificates/templates/${template.id}/verifications`;

  it('returns every clan when no clan is asked for', async () => {
    const res = await request(app).get(url()).set('Authorization', authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.data.rows).toHaveLength(2);
    expect(res.body.data.clans.map((c) => c.clanName).sort()).toEqual(['SkillFlow', 'Viral Loop']);
  });

  /** The production failure, stated directly. */
  it('ignores the mentor picker riding along on an admin screen', async () => {
    const res = await request(app)
      .get(url())
      .set('Authorization', authHeader(admin))
      .set('X-Portal-Role', 'admin')
      .set('X-Active-Clan', myClan.id);

    expect(res.status).toBe(200);
    // Before the fix this came back with one row and one clan.
    expect(res.body.data.rows).toHaveLength(2);
    expect(res.body.data.clans.map((c) => c.clanName).sort()).toEqual(['SkillFlow', 'Viral Loop']);
    expect(res.body.data.rows.some((r) => r.menteeId === otherPupil.id)).toBe(true);
  });

  /**
   * The queue and the banner have to describe the same round. Two counts of one
   * thing is how the screen came to say a clan was both complete and empty.
   */
  it('agrees with the approval banner about how many decisions exist', async () => {
    const queue = await request(app)
      .get(url())
      .set('Authorization', authHeader(admin))
      .set('X-Portal-Role', 'admin')
      .set('X-Active-Clan', myClan.id);
    const banner = await request(app)
      .get(`/api/certificates/templates/${template.id}/verification-summary`)
      .set('Authorization', authHeader(admin));

    expect(queue.body.data.rows).toHaveLength(banner.body.data.total);
    for (const clan of banner.body.data.clans.filter((c) => c.clanId)) {
      const inQueue = queue.body.data.rows.filter((r) => r.clanId === clan.clanId);
      expect(inQueue).toHaveLength(clan.total);
    }
  });

  /** A mentor's own queue is still narrowed — that header has a real job. */
  it('still narrows when an admin asks for one clan on purpose', async () => {
    const res = await request(app)
      .get(`${url()}?clanId=${otherClan.id}`)
      .set('Authorization', authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.data.rows).toHaveLength(1);
    expect(res.body.data.rows[0].menteeId).toBe(otherPupil.id);
  });
});
