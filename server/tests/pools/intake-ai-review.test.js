'use strict';

/**
 * Intake AI review → selection pool, end to end.
 *
 *   apply → Pathment AI reviews the form (and their public GitHub) against the
 *   intake's per-level criteria → sets their level → they join the attached
 *   pool AT that level → the level's work is theirs.
 *
 * GitHub is faked at the HTTP boundary; the AI by its one text call.
 */

const { Op } = require('sequelize');
const { models } = require('../../src/db');
const seed = require('../helpers/seed');
const poolService = require('../../src/services/poolService');
const levelRecommendationService = require('../../src/services/levelRecommendationService');
const automation = require('../../src/services/poolAutomationService');
const groqService = require('../../src/services/groqService');
const { findUsername, _cache } = require('../../src/utils/githubProfile');

const LEVELS = [{ key: 'beginner', label: 'Beginner' }, { key: 'senior', label: 'Senior' }];
const RULES = {
  baseLevelKey: 'beginner',
  levels: [{ levelKey: 'senior', minMet: 1, criteria: [{ key: 'ships_code', label: 'Has shipped real projects', how: 'Real repositories with recent pushes' }] }],
};

// ── fake GitHub ─────────────────────────────────────────────────────────────
const realFetch = global.fetch;
let githubCalls;
function fakeFetch(input, init) {
  const url = String(input);
  if (!url.startsWith('https://api.github.com/')) return realFetch(input, init);
  githubCalls.push(url);
  const json = (body, status = 200) => Promise.resolve({ ok: status < 300, status, json: async () => body });
  if (/\/users\/adadev\/repos/.test(url)) {
    return json([{ name: 'errand-api', language: 'TypeScript', stargazers_count: 12, fork: false, pushed_at: new Date().toISOString(), description: 'Deployed REST API' }]);
  }
  if (/\/users\/adadev$/.test(url)) {
    return json({ login: 'adadev', name: 'Ada', created_at: '2021-01-01T00:00:00Z', public_repos: 9, followers: 4 });
  }
  return json({ message: 'Not Found' }, 404);
}

let ctx;
let prompts;
beforeAll(() => { global.fetch = fakeFetch; });
afterAll(() => { global.fetch = realFetch; });

beforeEach(async () => {
  await seed.cleanDb();
  githubCalls = [];
  prompts = [];
  _cache.clear();
  // The AI confirms the criterion — the rule engine then decides "senior".
  // groqService is a global test mock without generateText; give it one.
  groqService.generateText = jest.fn(async ({ prompt }) => {
    prompts.push(prompt);
    return JSON.stringify({ criteria: [{ key: 'ships_code', verdict: 'true', quote: 'errand-api [TypeScript], 12 stars', note: 'real repo' }], coherence: '' });
  });
  const admin = await seed.createAdmin();
  const program = await seed.createProgram({ createdBy: admin.id, name: 'Fellowship' });
  const cohort = await models.Cohort.create({
    programId: program.id, name: 'Spring intake', status: 'open', levels: LEVELS,
    intakeFormSchema: [{ key: 'gh', label: 'GitHub profile', type: 'text' }],
  });
  await levelRecommendationService.setRules(cohort.id, RULES);
  const pool = await poolService.createPool({
    programId: program.id, name: 'Spring pool', selectionQuota: 5, settings: { autoAddFromCohortIds: [cohort.id] },
  }, admin);
  await poolService.setStatus(pool.id, 'open', admin);
  ctx = { admin, program, cohort, pool };
});
afterEach(() => { delete groqService.generateText; });

const apply = (responses = { gh: 'https://github.com/adadev' }) => models.Application.create({
  cohortId: ctx.cohort.id, email: 'ada@test.com', firstName: 'Ada', lastName: 'L', level: 'beginner',
  status: 'pending', source: 'public_link', responses,
});
const memberOf = () => models.PoolMember.findOne({ where: { poolId: ctx.pool.id, email: 'ada@test.com' } });

describe('finding their GitHub', () => {
  it('reads a link anywhere, or a bare name under a GitHub question', () => {
    expect(findUsername(['Portfolio: see https://github.com/adadev/errand-api'])).toBe('adadev');
    expect(findUsername(['GitHub username: @adadev'])).toBe('adadev');
    expect(findUsername(['Tell us about you: I like github'])).toBeNull();
  });
});

describe('the review', () => {
  it('reads their public GitHub as evidence and the rules set the level', async () => {
    const application = await apply();
    const out = await levelRecommendationService.recommendForApplication(application.id, null);
    expect(out.recommendedLevel).toBe('senior');
    expect(githubCalls.some((u) => u.endsWith('/users/adadev'))).toBe(true);
    expect(prompts[0]).toMatch(/GITHUB \(fetched/);
    expect(prompts[0]).toMatch(/errand-api \[TypeScript\]/);
    expect(out.evidence.github).toEqual({ username: 'adadev', read: true });
  });

  it('leaves GitHub alone when the intake turns it off', async () => {
    await levelRecommendationService.setAutomation(ctx.cohort.id, { readGithub: false });
    const application = await apply();
    await levelRecommendationService.recommendForApplication(application.id, null);
    expect(githubCalls).toHaveLength(0);
    expect(prompts[0]).toMatch(/\(no GitHub given\)/);
  });

  it('keeps the switches when the criteria are edited', async () => {
    await levelRecommendationService.setAutomation(ctx.cohort.id, { autoReview: false });
    await levelRecommendationService.setRules(ctx.cohort.id, RULES);
    expect((await levelRecommendationService.getRules(ctx.cohort.id)).autoReview).toBe(false);
  });
});

describe('apply → reviewed → in the pool at that level', () => {
  it('reviews first, so they join the pool at the REVIEWED level, not the one they picked', async () => {
    const application = await apply();
    await automation.processApplication(application.id, { review: true });
    expect((await application.reload()).level).toBe('senior');
    expect((await memberOf()).level).toBe('senior');
  });

  it('with the automatic review off, they join at their own level and nothing is reviewed', async () => {
    await levelRecommendationService.setAutomation(ctx.cohort.id, { autoReview: false });
    const application = await apply();
    await automation.processApplication(application.id, { review: true });
    expect(groqService.generateText).not.toHaveBeenCalled();
    expect((await memberOf()).level).toBe('beginner');
  });
});

describe('pools attached from the intake', () => {
  const request = require('supertest');
  const app = require('../../src/index');
  const auth = () => ({ Authorization: seed.authHeader(ctx.admin) });

  it('lists the programme\'s pools with which ones are attached, and detaches / attaches', async () => {
    const listed = await request(app).get(`/api/intake/cohorts/${ctx.cohort.id}/pools`).set(auth());
    expect(listed.status).toBe(200);
    expect(listed.body.data.pools).toEqual([expect.objectContaining({ id: ctx.pool.id, attached: true })]);

    const off = await request(app).put(`/api/intake/cohorts/${ctx.cohort.id}/pools/${ctx.pool.id}`).set(auth()).send({ attached: false });
    expect(off.status).toBe(200);
    expect((await poolService.getPool(ctx.pool.id)).settings.autoAddFromCohortIds).not.toContain(ctx.cohort.id);

    await request(app).put(`/api/intake/cohorts/${ctx.cohort.id}/pools/${ctx.pool.id}`).set(auth()).send({ attached: true });
    expect((await poolService.getPool(ctx.pool.id)).settings.autoAddFromCohortIds).toContain(ctx.cohort.id);
  });

  it('the review switches can be changed over the API', async () => {
    const res = await request(app).put(`/api/intake/cohorts/${ctx.cohort.id}/review-automation`).set(auth()).send({ autoReview: false, readGithub: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ autoReview: false, readGithub: false });
  });
});
