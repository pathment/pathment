/* Synthetic test for the public intake + assessment flow. Creates a published
 * program + open cohort with a public link and an attached assessment, then
 * walks an applicant through apply → take assessment (auto-graded), and checks
 * admin grading. Self-cleaning. Run: node scripts/test-public-intake.js */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Op } = require('sequelize');
const { models, sequelize } = require('../src/db');
const cohortIntakeService = require('../src/services/cohortIntakeService');
const assessmentService = require('../src/services/assessmentService');
const publicIntakeService = require('../src/services/publicIntakeService');

const TAG = `intaketest_${Date.now()}_`;
const e = (s) => (TAG + s + '@x.io').toLowerCase();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const created = { users: [], programs: [], cohorts: [], assessments: [], applications: [] };

(async () => {
  try {
    const admin = await models.User.create({
      email: e('admin'), passwordHash: 'x', role: 'admin',
      firstName: 'Intake', lastName: 'Admin', emailVerified: true, status: 'active'
    });
    created.users.push(admin.id);

    const program = await models.Program.create({
      createdBy: admin.id, name: `${TAG}Program`, description: 'Test program',
      type: 'mentorship', status: 'published', visibility: 'public',
      totalDurationWeeks: 12, estimatedHoursPerWeek: 5
    });
    created.programs.push(program.id);

    const cohort = await cohortIntakeService.createCohort(
      { programId: program.id, name: 'Spring Intake', status: 'open' }, admin.id
    );
    created.cohorts.push(cohort.id);

    // Enable the public link → mints a slug.
    const { cohort: enabled, applyUrl } = await cohortIntakeService.enablePublicLink(cohort.id);
    ok(!!enabled.publicSlug && enabled.publicEnabled, 'public link enabled with a slug');
    ok(applyUrl.includes(enabled.publicSlug), 'apply URL contains the slug');
    const slug = enabled.publicSlug;

    // Resolves while open.
    const resolved = await cohortIntakeService.getOpenCohortBySlug(slug);
    ok(resolved && resolved.open, 'open cohort resolves by slug');

    // Build an assessment: 1 auto-graded MCQ (10 pts) + 1 manual long_text (0 pts).
    const assessment = await assessmentService.createAssessment(
      { title: 'Entry assessment', programId: program.id, status: 'published' }, admin.id
    );
    created.assessments.push(assessment.id);
    const built = await assessmentService.setQuestions(assessment.id, [
      {
        type: 'mcq', prompt: 'What is 2+2?', points: 10, required: true,
        options: [{ label: '3' }, { label: '4' }, { label: '5' }],
        // correct = the "4" option; we resolve its id after creation below
      },
      { type: 'long_text', prompt: 'Why do you want to join?', points: 0, required: true }
    ]);
    ok(built.questions.length === 2, 'assessment has 2 questions');

    // Fix the correct option id now that options have stable ids.
    const mcq = built.questions.find((q) => q.type === 'mcq');
    const fourOpt = mcq.options.find((o) => o.label === '4');
    await assessmentService.setQuestions(assessment.id, [
      {
        type: 'mcq', prompt: mcq.prompt, points: 10, required: true,
        options: mcq.options, correctOptionIds: [fourOpt.id]
      },
      { type: 'long_text', prompt: 'Why do you want to join?', points: 0, required: true }
    ]);

    // Attach assessment (required) to the cohort.
    await cohortIntakeService.updateCohort(cohort.id, { assessmentId: assessment.id, assessmentRequired: true });

    // Applicant info shows it's open + requires assessment.
    const info = await publicIntakeService.getCohortApplyInfo(slug);
    ok(info.open && info.assessment && info.assessment.required, 'apply info shows required assessment');

    // Apply.
    const applicantEmail = e('applicant');
    const applyResult = await publicIntakeService.submitApplication(slug, { email: applicantEmail, firstName: 'Ada' });
    created.applications.push(applyResult.application.id);
    ok(applyResult.accessToken && applyResult.requiresAssessment, 'application submitted; assessment required');
    ok(applyResult.application.status === 'assessment_sent', 'status starts at assessment_sent');
    const token = applyResult.accessToken;

    // Status page exposes the sanitized assessment (no correct answers leaked).
    const status = await publicIntakeService.getApplicationStatus(token);
    ok(status.assessment && status.assessment.questions.length === 2, 'status exposes assessment questions');
    const leaked = JSON.stringify(status.assessment).includes('correctOptionIds');
    ok(!leaked, 'correct answers are NOT leaked to the applicant');

    // Missing a required answer is rejected.
    const freshAssessment = await assessmentService.getAssessment(assessment.id);
    const mcqId = freshAssessment.questions.find((q) => q.type === 'mcq').id;
    const longId = freshAssessment.questions.find((q) => q.type === 'long_text').id;
    const correctOptId = freshAssessment.questions.find((q) => q.type === 'mcq').correctOptionIds[0];

    let blocked = false;
    try {
      await publicIntakeService.submitAssessment(token, { [mcqId]: { optionIds: [correctOptId] } });
    } catch { blocked = true; }
    ok(blocked, 'submission missing a required answer is rejected');

    // Submit correctly → auto-graded, no manual items (long_text is 0 pts).
    const result = await publicIntakeService.submitAssessment(token, {
      [mcqId]: { optionIds: [correctOptId] },
      [longId]: { text: 'I love learning.' }
    });
    ok(Number(result.autoScore) === 10, 'auto score = 10 for correct MCQ');
    ok(result.pendingManualGrading === false, 'no manual grading needed (final score)');

    const app = await models.Application.findByPk(applyResult.application.id);
    ok(app.status === 'under_review', 'application moved to under_review after assessment');
    ok(Number(app.assessmentScore) === 10, 'assessment score mirrored onto application');

    const submission = await models.AssessmentSubmission.findOne({
      where: { assessmentId: assessment.id, applicationId: app.id }
    });
    ok(submission && submission.status === 'submitted', 'submission row stored');
    ok(Number(submission.maxScore) === 10, 'max score computed (10)');

    // Re-submitting is blocked.
    let resubmitBlocked = false;
    try {
      await publicIntakeService.submitAssessment(token, {
        [mcqId]: { optionIds: [correctOptId] }, [longId]: { text: 'again' }
      });
    } catch { resubmitBlocked = true; }
    ok(resubmitBlocked, 're-submitting a completed assessment is blocked');

    // Public catalog lists the program as accepting applications.
    const catalog = await publicIntakeService.listPublicPrograms();
    const inCatalog = catalog.find((p) => p.id === program.id);
    ok(inCatalog && inCatalog.acceptingApplications, 'program appears in public catalog as accepting');

    // Closing the cohort stops the link resolving as open.
    await cohortIntakeService.updateCohort(cohort.id, { status: 'closed' });
    const closed = await cohortIntakeService.getOpenCohortBySlug(slug);
    ok(closed && !closed.open && closed.reasons.includes('not_open'), 'closed cohort no longer accepts applications');

  } catch (err) {
    fail++;
    console.error('  ✗ threw:', err.message);
    console.error(err.stack);
  } finally {
    try {
      if (created.applications.length) {
        await models.AssessmentSubmission.destroy({ where: { applicationId: { [Op.in]: created.applications } } });
        await models.Application.destroy({ where: { id: { [Op.in]: created.applications } } });
      }
      if (created.assessments.length) {
        await models.AssessmentQuestion.destroy({ where: { assessmentId: { [Op.in]: created.assessments } } });
        await models.Assessment.destroy({ where: { id: { [Op.in]: created.assessments } } });
      }
      if (created.cohorts.length) await models.Cohort.destroy({ where: { id: { [Op.in]: created.cohorts } } });
      if (created.programs.length) await models.Program.destroy({ where: { id: { [Op.in]: created.programs } }, force: true });
      if (created.users.length) await models.User.destroy({ where: { id: { [Op.in]: created.users } }, force: true });
    } catch (cleanupErr) {
      console.error('  cleanup warning:', cleanupErr.message);
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    await sequelize.close();
    process.exit(fail ? 1 : 0);
  }
})();
