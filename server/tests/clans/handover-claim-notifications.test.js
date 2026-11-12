'use strict';

/**
 * Placing a mentee from the handover pool tells everyone it changes things for.
 *
 * On production the receiving clan's mentors heard nothing in 54 of 54 claims:
 * only the mentee and the person who offered them were notified, so when an
 * admin placed somebody the clan they joined found out by accident.
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const {
  cleanDb, createMentor, createMentee, createAdmin, createProgram, createClan, authHeader,
} = require('../helpers/seed');
const orchestrator = require('../../src/services/notificationOrchestrator');

const post = (user, url, body) => request(app).post(url).set('Authorization', authHeader(user)).send(body);
const sent = () => orchestrator.dispatch.mock.calls.map(([c]) => c);
const to = (calls) => calls.flatMap((c) => c.recipients.map((r) => r.userId)).sort();

describe('handover claim notifications', () => {
  let admin, oldLead, oldCo, newLead, newCo, mentee, closing, joining;

  beforeEach(async () => {
    await cleanDb();
    await models.HandoverPoolEntry.destroy({ where: {}, force: true });
    admin = await createAdmin({ email: 'admin@test.com' });
    oldLead = await createMentor({ email: 'old-lead@test.com' });
    oldCo = await createMentor({ email: 'old-co@test.com' });
    newLead = await createMentor({ email: 'new-lead@test.com', firstName: 'Nadia', lastName: 'Lead' });
    newCo = await createMentor({ email: 'new-co@test.com' });
    mentee = await createMentee({ email: 'ada@test.com', firstName: 'Ada', lastName: 'L' });
    const program = await createProgram({ createdBy: admin.id });
    closing = await createClan({ programId: program.id, leadMentor: oldLead, coMentors: [oldCo], mentees: [mentee], name: 'Closing' });
    joining = await createClan({ programId: program.id, leadMentor: newLead, coMentors: [newCo], name: 'Joining' });
  });

  async function offer(by) {
    const res = await post(by, '/api/handover-pool/push', {
      menteeId: mentee.id, clanId: closing.id, reason: 'mentor_leaving', handoverNote: 'Strong on React, stuck on testing',
    });
    expect([200, 201]).toContain(res.status);
    return res.body.data.entry.id;
  }

  it('an admin placement tells the mentee, the new clan and the old clan', async () => {
    const entryId = await offer(oldLead);
    orchestrator.dispatch.mockClear();
    expect((await post(admin, `/api/handover-pool/${entryId}/claim`, { toClanId: joining.id })).status).toBe(200);

    const calls = sent();
    const forMentee = calls.filter((c) => c.payload.relatedEntityType === 'handover_claim_mentee');
    const forNew = calls.filter((c) => c.payload.relatedEntityType === 'handover_claim_new_clan');
    const forOld = calls.filter((c) => c.payload.relatedEntityType === 'handover_claim_old_clan');

    expect(to(forMentee)).toEqual([mentee.id]);
    expect(forMentee[0].payload.message).toMatch(/Nadia Lead as your mentor/);

    expect(to(forNew)).toEqual([newLead.id, newCo.id].sort());
    expect(forNew[0].eventKey).toBe('new_mentee_in_clan');
    expect(forNew[0].payload.message).toMatch(/from Closing/);
    expect(forNew[0].payload.message).toMatch(/Strong on React/);

    expect(to(forOld)).toEqual([oldLead.id, oldCo.id].sort());

    // Keyed on the handover, so a later handover of the same person is news again.
    for (const c of [...forMentee, ...forNew, ...forOld]) expect(c.payload.relatedEntityId).toBe(entryId);
  });

  it('a mentor taking someone into their own clan is not told about their own action', async () => {
    const entryId = await offer(oldLead);
    orchestrator.dispatch.mockClear();
    expect((await post(newLead, `/api/handover-pool/${entryId}/claim`, { toClanId: joining.id })).status).toBe(200);

    const everyone = to(sent());
    expect(everyone).not.toContain(newLead.id);
    expect(everyone).toContain(newCo.id);
    expect(everyone).toContain(mentee.id);
  });

  it('place-all sends the same notices for every mentee it moves', async () => {
    const entryId = await offer(oldLead);
    orchestrator.dispatch.mockClear();
    const res = await post(admin, '/api/handover-pool/claim-many', { placements: [{ entryId, toClanId: joining.id }] });
    expect(res.body.data.placed).toBe(1);
    expect(sent().some((c) => c.payload.relatedEntityType === 'handover_claim_new_clan')).toBe(true);
  });
});
