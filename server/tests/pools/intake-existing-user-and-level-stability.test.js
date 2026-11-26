'use strict';

/**
 * Two intake defects, end to end.
 *
 * 1. Someone who ALREADY has a Pathment account could not use the public apply
 *    form — the whole form was filled in and then refused at the last step —
 *    and accepting them failed with "User already exists for this email".
 *    They now apply like anyone else, and accepting them emails "you're in,
 *    sign in and join" instead of an invitation to create an account.
 *
 * 2. The automatic level review overwrote the applicant's own pick with its own
 *    answer and then read that answer back as "what they picked" on the next
 *    run, so a re-review could land on a different level each time. Every move
 *    swapped the candidate's level-targeted work and emailed them about it —
 *    one course assigned, an email for every level.
 */

const { models } = require('../../src/db');
const seed = require('../helpers/seed');
const publicIntakeService = require('../../src/services/publicIntakeService');
const applicationService = require('../../src/services/applicationService');
const levelRecommendationService = require('../../src/services/levelRecommendationService');
const automation = require('../../src/services/poolAutomationService');
const groqService = require('../../src/services/groqService');
const notificationOrchestrator = require('../../src/services/notificationOrchestrator');

const LEVELS = [{ key: 'beginner', label: 'Beginner' }, { key: 'senior', label: 'Senior' }];
const RULES = {
  baseLevelKey: 'beginner',
  levels: [{ levelKey: 'senior', minMet: 1, criteria: [{ key: 'ships_code', label: 'Has shipped real projects', how: 'Real repositories' }] }],
};

let ctx;
// What the AI reports back; flipped per test to stand in for a model that is
// not perfectly deterministic.
let verdict;

beforeEach(async () => {
  await seed.cleanDb();
  // The notification mocks are global and shared; each test asserts on which
  // of the two emails went out, so the counts must start at zero.
  jest.clearAllMocks();
  verdict = 'true';
  groqService.generateText = jest.fn(async () => JSON.stringify({
    criteria: [{ key: 'ships_code', verdict, quote: 'errand-api', note: 'real repo' }], coherence: '',
  }));
  const admin = await seed.createAdmin();
  const program = await seed.createProgram({ createdBy: admin.id, name: 'Fellowship' });
  const cohort = await models.Cohort.create({
    programId: program.id, name: 'Spring intake', status: 'open', publicEnabled: true,
    publicSlug: 'spring', levels: LEVELS, intakeFormSchema: [],
  });
  await levelRecommendationService.setRules(cohort.id, RULES);
  // Nothing in these tests needs GitHub; the review must not reach the network.
  await levelRecommendationService.setAutomation(cohort.id, { readGithub: false });
  ctx = { admin, program, cohort };
});
afterEach(() => { delete groqService.generateText; });

const applyPublicly = (email, level = 'beginner') => publicIntakeService.submitApplication('spring', {
  firstName: 'Maha', lastName: 'Khawar', email, level, responses: {},
});

describe('an applicant who already has a Pathment account', () => {
  it('can apply through the public link instead of being refused at the end', async () => {
    await seed.createMentee({ email: 'maha@test.com' });

    const out = await applyPublicly('maha@test.com');

    expect(out.accessToken).toBeTruthy();
    const application = await models.Application.findOne({ where: { email: 'maha@test.com' } });
    expect(application).toBeTruthy();
    expect(application.status).not.toBe('rejected');
  });

  it('is accepted, and is emailed "sign in and join" rather than "set up your account"', async () => {
    const user = await seed.createMentee({ email: 'maha@test.com' });
    await applyPublicly('maha@test.com');
    const application = await models.Application.findOne({ where: { email: 'maha@test.com' } });

    const result = await applicationService.acceptApplication(application.id, {}, ctx.admin.id);

    expect(result.existingAccount).toBe(true);
    expect(result.invite).toBeTruthy();
    expect(notificationOrchestrator.sendProgramAcceptedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'maha@test.com', programName: 'Fellowship', firstName: user.firstName })
    );
    expect(notificationOrchestrator.sendRegistrationInviteEmail).not.toHaveBeenCalled();
    expect((await application.reload()).status).toBe('accepted');
  });

  it('still gets the ordinary invitation when there is no account for the address', async () => {
    await applyPublicly('nobody@test.com');
    const application = await models.Application.findOne({ where: { email: 'nobody@test.com' } });

    const result = await applicationService.acceptApplication(application.id, {}, ctx.admin.id);

    expect(result.existingAccount).toBe(false);
    expect(notificationOrchestrator.sendRegistrationInviteEmail).toHaveBeenCalled();
    expect(notificationOrchestrator.sendProgramAcceptedEmail).not.toHaveBeenCalled();
  });
});

describe('the automatic level review', () => {
  const applicationFor = () => models.Application.findOne({ where: { email: 'ada@test.com' } });

  it('keeps the applicant\'s own pick when it overwrites their level', async () => {
    await applyPublicly('ada@test.com', 'beginner');
    const application = await applicationFor();

    await automation.autoLevel(application.id);

    const after = await application.reload();
    expect(after.level).toBe('senior');            // the review decided
    expect(after.selfSelectedLevel).toBe('beginner'); // what they actually picked
    expect(after.levelEvidence.selfSelected).toBe('beginner');
  });

  it('reads their own pick on a re-review, not the level it last decided', async () => {
    await applyPublicly('ada@test.com', 'beginner');
    const application = await applicationFor();
    await automation.autoLevel(application.id);

    await automation.autoLevel(application.id, { force: true });

    const prompt = groqService.generateText.mock.calls.at(-1)[0].prompt;
    expect(prompt).toContain('APPLICANT SELF-SELECTED: Beginner');
    expect((await application.reload()).selfSelectedLevel).toBe('beginner');
  });

  it('leaves the level alone when nothing new has happened, so no work is swapped', async () => {
    await applyPublicly('ada@test.com', 'beginner');
    const application = await applicationFor();
    await automation.autoLevel(application.id);
    expect((await application.reload()).level).toBe('senior');

    // The model answers differently this time; there is nothing new to judge,
    // so it is never asked and the level does not move.
    verdict = 'false';
    const calls = groqService.generateText.mock.calls.length;
    const out = await automation.autoLevel(application.id);

    expect(out).toEqual(expect.objectContaining({ recommended: false, reason: 'nothing_new_to_review' }));
    expect(groqService.generateText.mock.calls.length).toBe(calls);
    expect((await application.reload()).level).toBe('senior');
  });

  it('reviews again once there IS something new — a changed answer', async () => {
    await applyPublicly('ada@test.com', 'beginner');
    const application = await applicationFor();
    await automation.autoLevel(application.id);
    const calls = groqService.generateText.mock.calls.length;

    await application.update({ responses: { about: 'I have shipped three production services' } });
    await automation.autoLevel(application.id);

    expect(groqService.generateText.mock.calls.length).toBe(calls + 1);
  });
});
