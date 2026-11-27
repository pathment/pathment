'use strict';

/**
 * The level is decided BEFORE the paper is handed out.
 *
 * An applicant picks a level on the form; nothing verifies it. The intake then
 * used that pick to choose their assessment and only reviewed them afterwards,
 * so somebody who called themselves a beginner sat the beginner paper and was
 * moved to senior once the review had read their answers — judged on a paper
 * written for a different level.
 *
 * Now the review runs first and ITS level picks the paper. The applicant is
 * never blocked waiting for a human: the level is recorded as decided but
 * unconfirmed, and it is admin confirmation that gates what the level drives
 * downstream (pool placement, level-based work), not the paper.
 *
 * An intake with no level rules is untouched — there is nothing to decide, so
 * the paper goes out on their own pick exactly as before.
 */

const { models } = require('../../src/db');
const seed = require('../helpers/seed');
const emailService = require('../../src/services/emailService');
const groqService = require('../../src/services/groqService');
const assessmentService = require('../../src/services/assessmentService');
const levelRules = require('../../src/services/levelRecommendationService');
const publicIntake = require('../../src/services/publicIntakeService');

const LEVELS = [{ key: 'beginner', label: 'Beginner' }, { key: 'senior', label: 'Senior' }];
const RULES = {
  baseLevelKey: 'beginner',
  levels: [{
    levelKey: 'senior',
    minMet: 1,
    criteria: [{ key: 'ships_code', label: 'Has shipped real projects', how: 'Real repositories' }],
  }],
};

let ctx;
// What the review finds. Flipped per test to stand for a real applicant's evidence.
let verdict;

async function paper(title) {
  const a = await assessmentService.createAssessment({ title }, ctx.admin.id);
  await assessmentService.setQuestions(a.id, [{ type: 'short_text', prompt: 'Why?', points: 5 }]);
  await assessmentService.updateAssessment(a.id, { status: 'published' });
  return a;
}

/** An intake whose two levels sit different papers, with the review switched on. */
async function levelledIntake({ withRules = true, readGithub = false } = {}) {
  const cohort = await models.Cohort.create({
    programId: ctx.program.id, name: 'Spring intake', status: 'open', publicEnabled: true,
    publicSlug: 'spring', levels: LEVELS, intakeFormSchema: [], assessmentRequired: true,
  });
  const beginner = await paper('Beginner paper');
  const senior = await paper('Senior paper');
  await assessmentService.setCohortPool(cohort.id, [
    { assessmentId: beginner.id, level: 'beginner' },
    { assessmentId: senior.id, level: 'senior' },
  ]);
  if (withRules) {
    await levelRules.setRules(cohort.id, RULES);
    await levelRules.setAutomation(cohort.id, { readGithub });
  }
  return { cohort, beginner, senior };
}

const applyAs = (level) => publicIntake.submitApplication('spring', {
  firstName: 'Ada', lastName: 'L', email: 'ada@test.com', level, responses: {},
});

const applicationRow = () => models.Application.findOne({ where: { email: 'ada@test.com' } });

beforeEach(async () => {
  await seed.cleanDb();
  jest.clearAllMocks();
  verdict = 'true';
  groqService.generateText = jest.fn(async () => JSON.stringify({
    criteria: [{ key: 'ships_code', verdict, quote: 'errand-api', note: 'real repo' }], coherence: '',
  }));
  const admin = await seed.createAdmin();
  const program = await seed.createProgram({ createdBy: admin.id, name: 'Fellowship' });
  ctx = { admin, program };
});
afterEach(() => { delete groqService.generateText; });

describe('the paper follows the decided level, not the claimed one', () => {
  it('gives a self-declared beginner the senior paper when the review says senior', async () => {
    const { senior } = await levelledIntake();

    await applyAs('beginner');
    const application = await applicationRow();
    // Nothing is papered on the claim alone.
    expect(application.assignedAssessmentId).toBeNull();

    await publicIntake.afterApply(application.id);

    const after = await application.reload();
    expect(after.level).toBe('senior');
    expect(after.selfSelectedLevel).toBe('beginner');
    expect(after.assignedAssessmentId).toBe(senior.id);
  });

  it('leaves an applicant the review agrees with exactly where they were', async () => {
    verdict = 'false';                       // clears nothing, so they stay at base
    const { beginner } = await levelledIntake();

    await applyAs('beginner');
    const application = await applicationRow();
    await publicIntake.afterApply(application.id);

    const after = await application.reload();
    expect(after.level).toBe('beginner');
    expect(after.assignedAssessmentId).toBe(beginner.id);
  });

  it('papers an intake with no levels at all immediately, exactly as before', async () => {
    // The common intake: one paper, nothing to decide. `getRules` seeds default
    // criteria for any cohort that HAS levels, so "no levels" — not "no rules" —
    // is the state where no review is coming and the paper goes out at once.
    const only = await paper('The paper');
    const cohort = await models.Cohort.create({
      programId: ctx.program.id, name: 'Plain intake', status: 'open', publicEnabled: true,
      publicSlug: 'plain', levels: [], intakeFormSchema: [], assessmentRequired: true,
      assessmentId: only.id,
    });
    expect(cohort.id).toBeTruthy();

    await publicIntake.submitApplication('plain', {
      firstName: 'Ada', lastName: 'L', email: 'ada@test.com', responses: {},
    });

    const application = await applicationRow();
    expect(application.assignedAssessmentId).toBe(only.id);
    expect(application.status).toBe('assessment_sent');
  });

  it('still papers them when the review itself fails', async () => {
    // The model is down. An applicant must not be left with no assessment.
    groqService.generateText = jest.fn(async () => { throw new Error('Groq is down'); });
    const { beginner } = await levelledIntake();

    await applyAs('beginner');
    const application = await applicationRow();
    await publicIntake.afterApply(application.id);

    const after = await application.reload();
    expect(after.level).toBe('beginner');          // their own pick stands
    expect(after.assignedAssessmentId).toBe(beginner.id);
  });

  it('hands out one paper however many times the chain runs', async () => {
    const { senior } = await levelledIntake();
    await applyAs('beginner');
    const application = await applicationRow();

    await publicIntake.afterApply(application.id);
    await publicIntake.afterApply(application.id);

    const after = await application.reload();
    expect(after.assignedAssessmentId).toBe(senior.id);
    const sent = (emailService.sendEmail.mock?.calls || [])
      .filter(([m]) => m.to === 'ada@test.com' && m.emailType === 'intake_assessment_invite');
    expect(sent).toHaveLength(1);
  });
});

describe('decided, then confirmed', () => {
  it('records who decided the level, and that nobody has confirmed it yet', async () => {
    await levelledIntake();
    await applyAs('beginner');
    const application = await applicationRow();

    expect((await application.reload()).levelSource).toBe('self');

    await publicIntake.afterApply(application.id);

    const after = await application.reload();
    expect(after.levelSource).toBe('ai');
    expect(after.levelConfirmedAt).toBeNull();
  });

  it('stamps who confirmed it and when', async () => {
    await levelledIntake();
    await applyAs('beginner');
    const application = await applicationRow();
    await publicIntake.afterApply(application.id);

    await levelRules.confirmLevel(application.id, 'senior', ctx.admin.id);

    const after = await application.reload();
    expect(after.level).toBe('senior');
    expect(after.levelSource).toBe('admin');
    expect(after.levelConfirmedAt).toBeTruthy();
    expect(after.levelConfirmedBy).toBe(ctx.admin.id);
  });

  it('flags an override that lands after they have already sat the paper', async () => {
    const { senior } = await levelledIntake();
    await applyAs('beginner');
    const application = await applicationRow();
    await publicIntake.afterApply(application.id);

    // They sit the paper they were given.
    await models.AssessmentSubmission.create({
      assessmentId: senior.id, applicationId: application.id, answers: {}, status: 'submitted', submittedAt: new Date(),
    });

    await levelRules.confirmLevel(application.id, 'beginner', ctx.admin.id);

    const after = await application.reload();
    expect(after.level).toBe('beginner');
    // The paper they sat is NOT swapped under them; it is raised for a human.
    expect(after.assignedAssessmentId).toBe(senior.id);
    expect(after.levelChangedAfterAssessment).toBe(true);
  });

  it('does not flag a confirmation that changes nothing', async () => {
    await levelledIntake();
    await applyAs('beginner');
    const application = await applicationRow();
    await publicIntake.afterApply(application.id);

    await levelRules.confirmLevel(application.id, 'senior', ctx.admin.id);

    expect((await application.reload()).levelChangedAfterAssessment).toBe(false);
  });
});
