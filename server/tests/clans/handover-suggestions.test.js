'use strict';

/**
 * Handover-pool suggestions and inactive clans.
 *
 * An admin opening the pool gets a proposed clan for every waiting mentee and
 * accepts the lot in one click. The proposal is the active clan with the
 * fewest ACTIVE (non-paused) mentees, spread across the batch, and never an
 * inactive clan. An inactive clan otherwise works: a person chosen for it by
 * hand still lands there.
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const {
  cleanDb, createMentor, createMentee, createAdmin, createProgram, createClan, authHeader,
} = require('../helpers/seed');

const api = (user) => ({
  push: (body) => request(app).post('/api/handover-pool/push').set('Authorization', authHeader(user)).send(body),
  suggestions: () => request(app).get('/api/handover-pool/suggestions').set('Authorization', authHeader(user)),
  claimMany: (placements) => request(app).post('/api/handover-pool/claim-many').set('Authorization', authHeader(user)).send({ placements }),
  claimable: () => request(app).get('/api/handover-pool/claimable-clans').set('Authorization', authHeader(user)),
  claim: (entryId, toClanId) => request(app).post(`/api/handover-pool/${entryId}/claim`).set('Authorization', authHeader(user)).send({ toClanId }),
});

const seat = (userId, clanId) => models.ClanMembership.findOne({ where: { userId, clanId, role: 'mentee', status: 'active' } });

describe('handover pool suggestions', () => {
  let admin, program, closing, busy, light, quiet, leaving;

  beforeEach(async () => {
    await cleanDb();
    await models.HandoverPoolEntry.destroy({ where: {}, force: true });
    admin = await createAdmin({ email: 'admin@test.com' });
    const [m1, m2, m3, m4] = await Promise.all(['m1', 'm2', 'm3', 'm4'].map((n) => createMentor({ email: `${n}@test.com` })));
    program = await createProgram({ createdBy: admin.id });

    leaving = await Promise.all([1, 2, 3, 4].map((i) => createMentee({ email: `leaving${i}@test.com`, firstName: `Leaving${i}` })));
    const busyMentees = await Promise.all([1, 2, 3, 4].map((i) => createMentee({ email: `busy${i}@test.com` })));
    const lightMentees = await Promise.all([1, 2, 3, 4, 5].map((i) => createMentee({ email: `light${i}@test.com` })));

    closing = await createClan({ programId: program.id, leadMentor: m1, mentees: leaving, name: 'Closing' });
    busy = await createClan({ programId: program.id, leadMentor: m2, mentees: busyMentees, name: 'Busy' });
    // Five seated, but four of them paused: only one person is actually attending.
    light = await createClan({ programId: program.id, leadMentor: m3, mentees: lightMentees, name: 'Light' });
    await models.ClanMembership.update({ status: 'paused' }, {
      where: { clanId: light.id, role: 'mentee', userId: lightMentees.slice(1).map((m) => m.id) },
    });
    // Empty, but marked inactive: must never be proposed.
    quiet = await createClan({ programId: program.id, leadMentor: m4, name: 'Quiet' });
    await quiet.update({ status: 'inactive' });

    for (const mentee of leaving) {
      const res = await api(admin).push({ menteeId: mentee.id, clanId: closing.id, reason: 'mentor_leaving' });
      expect([200, 201]).toContain(res.status);
    }
  });

  test('proposes the fewest-active clan, spreads the batch, and never an inactive clan', async () => {
    const res = await api(admin).suggestions();
    expect(res.status).toBe(200);
    const { suggestions, unplaced } = res.body.data;
    expect(unplaced).toHaveLength(0);
    expect(suggestions).toHaveLength(4);

    const targets = suggestions.map((s) => s.toClanName);
    expect(targets).not.toContain('Quiet');
    expect(targets).not.toContain('Closing');
    // Light has 1 active vs Busy's 4, so Light takes the first three (load
    // 1→2→3→4). Then both carry 4 and the tie goes to room: Busy has 4 seats
    // taken, Light 5 + 3 planned, so Busy takes the fourth.
    expect(targets.filter((t) => t === 'Light')).toHaveLength(3);
    expect(targets.filter((t) => t === 'Busy')).toHaveLength(1);
    expect(suggestions[0].reason).toMatch(/Fewest active mentees/);
  });

  test('place-all applies every suggestion in one call, with each mentee moved', async () => {
    const { suggestions } = (await api(admin).suggestions()).body.data;
    const res = await api(admin).claimMany(suggestions.map((s) => ({ entryId: s.entryId, toClanId: s.toClanId })));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ placed: 4, failed: 0, total: 4 });

    for (const s of suggestions) {
      expect(await seat(s.menteeId, s.toClanId)).not.toBeNull();
      expect(await seat(s.menteeId, closing.id)).toBeNull();
    }
    const after = (await api(admin).suggestions()).body.data;
    expect(after.suggestions).toHaveLength(0);
  });

  test('one failed placement does not stop the rest', async () => {
    const { suggestions } = (await api(admin).suggestions()).body.data;
    // A mentor grabs the first one by hand a moment before the admin clicks.
    await api(admin).claim(suggestions[0].entryId, busy.id);
    const res = await api(admin).claimMany(suggestions.map((s) => ({ entryId: s.entryId, toClanId: s.toClanId })));
    expect(res.body.data).toMatchObject({ placed: 3, failed: 1 });
  });

  test('an inactive clan is flagged but still takes someone chosen by hand', async () => {
    const clans = (await api(admin).claimable()).body.data.clans;
    const q = clans.find((c) => c.id === quiet.id);
    expect(q).toMatchObject({ inactive: true, available: true, status: 'inactive' });
    const l = clans.find((c) => c.id === light.id);
    expect(l).toMatchObject({ activeMentees: 1, pausedMentees: 4, seated: 5, inactive: false });

    const { suggestions } = (await api(admin).suggestions()).body.data;
    const res = await api(admin).claim(suggestions[0].entryId, quiet.id);
    expect(res.status).toBe(200);
    expect(await seat(suggestions[0].menteeId, quiet.id)).not.toBeNull();
  });

  test('an archived clan takes nobody', async () => {
    await quiet.update({ status: 'archived' });
    const { suggestions } = (await api(admin).suggestions()).body.data;
    const res = await api(admin).claim(suggestions[0].entryId, quiet.id);
    expect(res.status).toBe(400);
  });

  test('says why nobody can be suggested when every clan is inactive', async () => {
    await models.Clan.update({ status: 'inactive' }, { where: { id: [busy.id, light.id] } });
    const { suggestions, unplaced } = (await api(admin).suggestions()).body.data;
    expect(suggestions).toHaveLength(0);
    expect(unplaced).toHaveLength(4);
    expect(unplaced[0].reason).toMatch(/No active clan/);
  });
});
