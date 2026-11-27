'use strict';

/**
 * An intake feeds a selection round.
 *
 * Attach a round to an intake and its applicants arrive in it at the level
 * they were placed at, which decides the work they are given. The link is the
 * cohort's `poolClanId` — one round per intake, named on the intake itself,
 * rather than a list of cohort ids buried in the round's settings.
 *
 * Confirmation is the gate. The paper goes out on the review's answer so
 * nobody is blocked, but nobody is PLACED on an unexamined level — with one
 * exception that earns its keep: when the review lands on the same level the
 * applicant chose for themselves, two independent judgements already agree and
 * there is nothing for a human to adjudicate. Only disagreements queue.
 */

const { models } = require('../../src/db');
const seed = require('../helpers/seed');
const groqService = require('../../src/services/groqService');
const levelRules = require('../../src/services/levelRecommendationService');
const poolClanService = require('../../src/services/poolClanService');
const automation = require('../../src/services/poolAutomationService');

const LEVELS = [{ key: 'beginner', label: 'Beginner' }, { key: 'senior', label: 'Senior' }];
const RULES = {
  baseLevelKey: 'beginner',
  levels: [{
    levelKey: 'senior', minMet: 1,
    criteria: [{ key: 'ships_code', label: 'Has shipped real projects', how: 'Real repositories' }],
  }],
};

const PoolTask = () => models.AssignedTask.scope('withPoolWork');
let ctx;
let verdict;

async function roadmapWithStep(name, title, offset) {
  const roadmap = await seed.createRoadmap({ programId: ctx.program.id, createdBy: ctx.admin.id, name });
  const step = await seed.createRoadmapTask({ roadmapId: roadmap.id, title });
  await step.update({ dueOffsetDays: offset });
  return roadmap;
}

/** An intake with a round attached, each level doing different work. */
async function intakeWithRound() {
  const clan = await models.Clan.create({
    programId: ctx.program.id, name: 'Spring round', kind: 'pool',
    createdBy: ctx.admin.id, leadMentorId: ctx.mentor.id,
  });
  const beginnerWork = await roadmapWithStep('L1', 'Foundations', 14);
  const seniorWork = await roadmapWithStep('L2', 'Knowledge agent', 21);
  await poolClanService.setLevelRules(clan.id, [
    { level: 'beginner', roadmapId: beginnerWork.id },
    { level: 'senior', roadmapId: seniorWork.id },
  ], ctx.admin);

  const cohort = await models.Cohort.create({
    programId: ctx.program.id, name: 'Spring intake', status: 'open',
    levels: LEVELS, intakeFormSchema: [], poolClanId: clan.id,
  });
  await levelRules.setRules(cohort.id, RULES);
  await levelRules.setAutomation(cohort.id, { readGithub: false });
  return { clan, cohort };
}

const applicant = (cohort, level) => models.Application.create({
  cohortId: cohort.id, email: 'ada@test.com', firstName: 'Ada', lastName: 'L',
  level, selfSelectedLevel: level, levelSource: 'self', status: 'pending', source: 'public_link', responses: {},
});

const workTitles = async (userId) => {
  const tasks = await PoolTask().findAll({
    where: { menteeId: userId },
    include: [{ model: models.RoadmapTask, as: 'roadmapTask', attributes: ['title'] }],
  });
  return tasks.map((t) => t.roadmapTask?.title).sort();
};

beforeEach(async () => {
  await seed.cleanDb();
  jest.clearAllMocks();
  verdict = 'true';
  groqService.generateText = jest.fn(async () => JSON.stringify({
    criteria: [{ key: 'ships_code', verdict, quote: 'errand-api', note: 'real repo' }], coherence: '',
  }));
  const admin = await seed.createAdmin();
  const mentor = await seed.createMentor();
  const program = await seed.createProgram({ createdBy: admin.id, name: 'Fellowship' });
  ctx = { admin, mentor, program };
});
afterEach(() => { delete groqService.generateText; });

describe('a level both sides agree on needs nobody', () => {
  it('confirms itself when the review lands where the applicant put themselves', async () => {
    verdict = 'false';                        // clears nothing → stays beginner
    const { cohort } = await intakeWithRound();
    const application = await applicant(cohort, 'beginner');

    await automation.autoLevel(application.id);

    const after = await application.reload();
    expect(after.level).toBe('beginner');
    expect(after.levelConfirmedAt).toBeTruthy();
    // Nobody clicked: an agreement confirmed by itself, which is why there is
    // no confirming user on it.
    expect(after.levelConfirmedBy).toBeNull();
    expect(after.levelSource).toBe('ai');
  });

  it('leaves a disagreement for a human', async () => {
    const { cohort } = await intakeWithRound();       // review says senior
    const application = await applicant(cohort, 'beginner');

    await automation.autoLevel(application.id);

    const after = await application.reload();
    expect(after.level).toBe('senior');
    expect(after.levelConfirmedAt).toBeNull();
  });
});

describe('a confirmed applicant lands in the round at their level', () => {
  it('joins, and gets that level\'s work and no other', async () => {
    verdict = 'false';
    const { clan, cohort } = await intakeWithRound();
    const application = await applicant(cohort, 'beginner');
    const user = await seed.createUser({ role: 'mentee', email: 'ada@test.com' });
    await models.MenteeProfile.destroy({ where: { userId: user.id } });

    await automation.autoLevel(application.id);        // agrees → confirmed
    await automation.placeIntoPoolClan(application.id);

    const membership = await models.ClanMembership.findOne({ where: { clanId: clan.id, userId: user.id } });
    expect(membership).toBeTruthy();
    expect(membership.level).toBe('beginner');
    expect(await workTitles(user.id)).toEqual(['Foundations']);
    // A candidate is not a mentee of the programme until they are selected.
    expect(await models.Enrollment.findOne({ where: { menteeId: user.id } })).toBeNull();
  });

  it('does not place an applicant whose level nobody has confirmed', async () => {
    const { clan, cohort } = await intakeWithRound();   // review says senior, disagreeing
    const application = await applicant(cohort, 'beginner');
    const user = await seed.createUser({ role: 'mentee', email: 'ada@test.com' });

    await automation.autoLevel(application.id);
    await automation.placeIntoPoolClan(application.id);

    expect(await models.ClanMembership.findOne({ where: { clanId: clan.id, userId: user.id } })).toBeNull();
  });

  it('places them once a human confirms, at the confirmed level', async () => {
    const { clan, cohort } = await intakeWithRound();
    const application = await applicant(cohort, 'beginner');
    const user = await seed.createUser({ role: 'mentee', email: 'ada@test.com' });
    await models.MenteeProfile.destroy({ where: { userId: user.id } });

    await automation.autoLevel(application.id);
    await levelRules.confirmLevel(application.id, 'senior', ctx.admin.id);
    await automation.placeIntoPoolClan(application.id);

    const membership = await models.ClanMembership.findOne({ where: { clanId: clan.id, userId: user.id } });
    expect(membership.level).toBe('senior');
    expect(await workTitles(user.id)).toEqual(['Knowledge agent']);
  });

  it('is safe to replay: one membership, one set of work', async () => {
    verdict = 'false';
    const { clan, cohort } = await intakeWithRound();
    const application = await applicant(cohort, 'beginner');
    const user = await seed.createUser({ role: 'mentee', email: 'ada@test.com' });
    await models.MenteeProfile.destroy({ where: { userId: user.id } });

    await automation.autoLevel(application.id);
    await automation.placeIntoPoolClan(application.id);
    await automation.placeIntoPoolClan(application.id);

    const memberships = await models.ClanMembership.findAll({ where: { clanId: clan.id, userId: user.id } });
    expect(memberships).toHaveLength(1);
    expect(await workTitles(user.id)).toEqual(['Foundations']);
  });

  it('waits for an account: an applicant who has never registered is not placed', async () => {
    verdict = 'false';
    const { clan, cohort } = await intakeWithRound();
    const application = await applicant(cohort, 'beginner');   // no user for this email

    await automation.autoLevel(application.id);
    await automation.placeIntoPoolClan(application.id);

    expect(await models.ClanMembership.findAll({ where: { clanId: clan.id } }))
      .toEqual(expect.arrayContaining([]));
    const mentees = await models.ClanMembership.findAll({ where: { clanId: clan.id, role: 'mentee' } });
    expect(mentees).toHaveLength(0);
  });

  it('does nothing when the intake has no round attached', async () => {
    verdict = 'false';
    const cohort = await models.Cohort.create({
      programId: ctx.program.id, name: 'Plain intake', status: 'open', levels: LEVELS, intakeFormSchema: [],
    });
    await levelRules.setRules(cohort.id, RULES);
    const application = await applicant(cohort, 'beginner');

    await automation.autoLevel(application.id);
    await expect(automation.placeIntoPoolClan(application.id)).resolves.toMatchObject({ placed: false });
  });
});
