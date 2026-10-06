'use strict';

/** Talks library: shared across mentors and admins, categories managed by admins, no duplicate links. */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const { cleanDb, createMentor, createMentee, createAdmin, createProgram, createClan, authHeader } = require('../helpers/seed');

const post = (user, path, body) =>
  request(app).post(`/api/talks${path}`).set('Authorization', authHeader(user)).send(body);
const get = (user, path = '') =>
  request(app).get(`/api/talks${path}`).set('Authorization', authHeader(user));

describe('talks library', () => {
  let admin, mentor, otherMentor, mentee, tech, mindset;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin({ email: 'admin@test.com' });
    mentor = await createMentor({ email: 'mentor@test.com' });
    otherMentor = await createMentor({ email: 'other@test.com' });
    mentee = await createMentee({ email: 'mentee@test.com' });

    const program = await createProgram({ createdBy: admin.id });
    await createClan({ programId: program.id, leadMentor: mentor, coMentors: [otherMentor] });

    tech = (await post(admin, '/categories', { name: 'Technology' })).body.data.category;
    mindset = (await post(admin, '/categories', { name: 'Mindset' })).body.data.category;
  });

  const addTalk = (user, overrides = {}) =>
    post(user, '', {
      title: 'Simple made easy',
      speaker: 'Rich Hickey',
      url: 'https://www.youtube.com/watch?v=SxdOUGdseq4',
      categoryIds: [tech.id],
      ...overrides,
    });

  it('lets a mentor add a talk that another mentor and an admin can see', async () => {
    const res = await addTalk(mentor);
    expect(res.status).toBe(201);
    expect(res.body.data.talk.uploaderName).toBeTruthy();

    for (const viewer of [otherMentor, admin]) {
      const list = await get(viewer);
      expect(list.status).toBe(200);
      expect(list.body.data.talks.map((t) => t.title)).toEqual(['Simple made easy']);
    }
  });

  it('lets an admin add a talk', async () => {
    expect((await addTalk(admin)).status).toBe(201);
  });

  it('refuses a mentee adding a talk', async () => {
    expect((await addTalk(mentee)).status).toBe(403);
  });

  it('rejects a duplicate link even with different casing, spacing or a fragment', async () => {
    expect((await addTalk(mentor)).status).toBe(201);
    const again = await addTalk(otherMentor, {
      title: 'Same talk',
      url: '  HTTPS://www.youtube.com/watch?v=SxdOUGdseq4#t=10  ',
    });
    expect(again.status).toBe(409);
    expect(await models.Talk.count()).toBe(1);
  });

  it('requires a valid http link, a title and at least one real category', async () => {
    expect((await addTalk(mentor, { url: 'not a link' })).status).toBe(400);
    expect((await addTalk(mentor, { url: 'javascript:alert(1)' })).status).toBe(400);
    expect((await addTalk(mentor, { title: '  ' })).status).toBe(400);
    expect((await addTalk(mentor, { categoryIds: [] })).status).toBe(400);
    expect((await addTalk(mentor, { categoryIds: ['8c0d2f0a-6f35-4a41-9c1d-000000000000'] })).status).toBe(400);
  });

  it('supports several categories per talk and filters by category', async () => {
    await addTalk(mentor, { categoryIds: [tech.id, mindset.id] });
    await addTalk(mentor, {
      title: 'Grit',
      url: 'https://www.youtube.com/watch?v=H14bBuluwB8',
      categoryIds: [mindset.id],
    });

    const techOnly = await get(mentor, `?categoryId=${tech.id}`);
    expect(techOnly.body.data.talks.map((t) => t.title)).toEqual(['Simple made easy']);
    expect(techOnly.body.data.talks[0].categories).toHaveLength(2);

    const mindsetOnly = await get(mentor, `?categoryId=${mindset.id}`);
    expect(mindsetOnly.body.data.pagination.totalItems).toBe(2);
  });

  it('searches title, speaker and description', async () => {
    await addTalk(mentor, { description: 'Complexity and design' });
    await addTalk(mentor, { title: 'Grit', speaker: 'Angela', url: 'https://example.com/grit' });

    const byTitle = await get(mentor, '?search=grit');
    expect(byTitle.body.data.talks.map((t) => t.title)).toEqual(['Grit']);
    const bySpeaker = await get(mentor, '?search=hickey');
    expect(bySpeaker.body.data.talks).toHaveLength(1);
    const byDescription = await get(mentor, '?search=complexity');
    expect(byDescription.body.data.talks).toHaveLength(1);
    const literal = await get(mentor, '?search=%25');
    expect(literal.body.data.talks).toHaveLength(0);
  });

  it('lets only the uploader or an admin edit and delete a talk', async () => {
    const { id } = (await addTalk(mentor)).body.data.talk;
    const patch = (user, body) =>
      request(app).patch(`/api/talks/${id}`).set('Authorization', authHeader(user)).send(body);
    const del = (user) => request(app).delete(`/api/talks/${id}`).set('Authorization', authHeader(user));

    expect((await patch(otherMentor, { title: 'Hijacked' })).status).toBe(403);
    expect((await del(otherMentor)).status).toBe(403);

    const mine = await patch(mentor, { title: 'Renamed', categoryIds: [mindset.id] });
    expect(mine.status).toBe(200);
    expect(mine.body.data.talk.title).toBe('Renamed');
    expect(mine.body.data.talk.categories.map((c) => c.name)).toEqual(['Mindset']);

    expect((await patch(admin, { speaker: 'Edited by admin' })).status).toBe(200);
    expect((await del(admin)).status).toBe(200);
    expect(await models.Talk.count()).toBe(0);
  });

  it('flags which talks the viewer may manage', async () => {
    await addTalk(mentor);
    expect((await get(mentor)).body.data.talks[0].canManage).toBe(true);
    expect((await get(otherMentor)).body.data.talks[0].canManage).toBe(false);
    expect((await get(admin)).body.data.talks[0].canManage).toBe(true);
  });

  describe('categories', () => {
    it('lets only an admin create, rename and delete categories', async () => {
      expect((await post(mentor, '/categories', { name: 'Career' })).status).toBe(403);

      const created = await post(admin, '/categories', { name: 'Career' });
      expect(created.status).toBe(201);
      const { id } = created.body.data.category;

      const asMentor = await request(app).patch(`/api/talks/categories/${id}`)
        .set('Authorization', authHeader(mentor)).send({ name: 'Jobs' });
      expect(asMentor.status).toBe(403);

      const renamed = await request(app).patch(`/api/talks/categories/${id}`)
        .set('Authorization', authHeader(admin)).send({ name: 'Jobs' });
      expect(renamed.body.data.category.name).toBe('Jobs');

      const removed = await request(app).delete(`/api/talks/categories/${id}`)
        .set('Authorization', authHeader(admin));
      expect(removed.status).toBe(200);
    });

    it('rejects a duplicate category name regardless of case', async () => {
      expect((await post(admin, '/categories', { name: 'technology' })).status).toBe(409);
    });

    it('lists categories with their talk counts for mentors', async () => {
      await addTalk(mentor);
      const res = await get(mentor, '/categories');
      expect(res.status).toBe(200);
      const counts = Object.fromEntries(res.body.data.categories.map((c) => [c.name, c.talkCount]));
      expect(counts).toEqual({ Mindset: 0, Technology: 1 });
    });

    it('blocks deleting a category that still has talks', async () => {
      await addTalk(mentor);
      const res = await request(app).delete(`/api/talks/categories/${tech.id}`)
        .set('Authorization', authHeader(admin));
      expect(res.status).toBe(409);
    });
  });
});
