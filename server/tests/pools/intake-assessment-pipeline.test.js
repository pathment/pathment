'use strict';

/**
 * The intake assessment pipeline end to end, on the server:
 *   imported → assessment sent (their level's, with a fresh private link) →
 *   opened → started (the clock; proctored needs a capable client) → autosaved
 *   → video answer stored server-side → submitted once → reviewed → accepted.
 * Plus: an "invite first" intake keeps the assessment back; a timed attempt is
 * submitted as it stands when the clock runs out; the new question types grade.
 */

jest.mock('../../src/utils/cloudinaryUpload', () => ({
  uploadToCloudinary: jest.fn(async (_buf, folder, type) => ({
    secure_url: `https://res.cloudinary.com/demo/${type}/upload/v1/${folder}/up-${Math.random().toString(36).slice(2)}.webm`,
    public_id: `${folder}/up-${Math.random().toString(36).slice(2)}`,
  })),
  deleteFromCloudinary: jest.fn(async () => ({ result: 'ok' })),
}));

const { models } = require('../../src/db');
const seed = require('../helpers/seed');
const emailService = require('../../src/services/emailService');
const assessmentService = require('../../src/services/assessmentService');
const pipeline = require('../../src/services/assessmentPipelineService');
const publicIntake = require('../../src/services/publicIntakeService');
const applicationService = require('../../src/services/applicationService');

const LEVELS = [{ key: 'beginner', label: 'Beginner' }, { key: 'senior', label: 'Senior' }];
let ctx;

/** The private link token from the last email sent to `email`. */
const tokenFor = (email) => {
  const calls = (emailService.sendEmail.mock?.calls || []).filter(([m]) => m.to === email);
  const text = calls[calls.length - 1]?.[0]?.text || '';
  const m = text.match(/apply\/status\/([^\s]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};

async function makeAssessment(title, questions, extra = {}) {
  const a = await assessmentService.createAssessment({ title, ...extra }, ctx.admin.id);
  await assessmentService.setQuestions(a.id, questions);
  await assessmentService.updateAssessment(a.id, { status: 'published' });
  return a;
}

beforeEach(async () => {
  await seed.cleanDb();
  if (emailService.sendEmail.mockClear) emailService.sendEmail.mockClear();
  const admin = await seed.createAdmin();
  const program = await seed.createProgram({ createdBy: admin.id, name: 'Fellowship' });
  const cohort = await models.Cohort.create({ programId: program.id, name: 'Spring intake', status: 'open', levels: LEVELS, assessmentMode: 'on_invite' });
  ctx = { admin, program, cohort };
});

describe('question types', () => {
  it('grades true/false, holds code and video for a person, and checks code against the starter', async () => {
    const a = await makeAssessment('Mixed', [
      { type: 'true_false', prompt: 'JS is single-threaded', points: 2, correctOptionIds: ['true'] },
      { type: 'code', prompt: 'sum', points: 5, config: { codeLanguage: 'python', starterCode: 'def f():\n  pass', referenceSolution: 'leak?' }, rubric: 'return a+b' },
      { type: 'video', prompt: 'intro', points: 5, config: { maxRecordingSeconds: 999 } },
    ]);
    const full = await assessmentService.getAssessment(a.id);
    const [tf, code, video] = full.questions;
    expect(tf.options.map((o) => o.id)).toEqual(['true', 'false']);
    expect(code.config).toEqual({ codeLanguage: 'python', starterCode: 'def f():\n  pass' });
    expect(video.config.maxRecordingSeconds).toBe(300);
    const pub = assessmentService.sanitizeForApplicant(full);
    expect(JSON.stringify(pub)).not.toContain('return a+b');

    const graded = assessmentService.gradeAuto(full.questions, { [tf.id]: { optionIds: ['true'] }, [code.id]: { text: 'x' } });
    expect(graded).toMatchObject({ autoScore: 2, maxScore: 12, hasManual: true });
    expect(() => assessmentService.validateAnswers(full.questions, {
      [tf.id]: { optionIds: ['true'] }, [code.id]: { text: 'def f():\n  pass' }, [video.id]: { videoUrl: 'x' },
    })).toThrow(/answer all required/);
    expect(assessmentService._answerText(video, { transcript: 'hello there' })).toBe('hello there');
  });
});

describe('audio answers and sections', () => {
  it('keeps a section label, caps the length of an audio answer, and needs the recording', async () => {
    const a = await makeAssessment('Sections', [
      { type: 'long_text', prompt: 'A customer reports…', points: 5, config: { section: '  Scenarios  ' } },
      { type: 'audio', prompt: 'Tell us about yourself', points: 5, config: { section: 'Interview', maxRecordingSeconds: 999 } },
      { type: 'mcq', prompt: 'Pick one', points: 2, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], correctOptionIds: ['a'], config: { section: '' } },
    ]);
    const full = await assessmentService.getAssessment(a.id);
    const [scenario, audio, mcq] = full.questions;
    expect(scenario.config).toEqual({ section: 'Scenarios' });
    expect(audio.config).toEqual({ section: 'Interview', maxRecordingSeconds: 300 });
    expect(mcq.config).toEqual({});
    expect(() => assessmentService.validateAnswers(full.questions, {
      [scenario.id]: { text: 'I would…' }, [mcq.id]: { optionIds: ['a'] },
    })).toThrow(/answer all required/);
    expect(() => assessmentService.validateAnswers(full.questions, {
      [scenario.id]: { text: 'I would…' }, [mcq.id]: { optionIds: ['a'] }, [audio.id]: { videoUrl: 'https://x/a.webm' },
    })).not.toThrow();
    expect(assessmentService._aiGradableTypes()).toContain('audio');
    expect(assessmentService._answerText(audio, { transcript: 'I am a developer' })).toBe('I am a developer');
  });
});

describe('the pipeline', () => {
  let beginnerTest; let seniorTest; let app;

  beforeEach(async () => {
    beginnerTest = await makeAssessment('Beginner test', [{ type: 'mcq', prompt: 'Pick A', points: 5, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], correctOptionIds: ['a'] }]);
    seniorTest = await makeAssessment('Senior test', [
      { type: 'mcq', prompt: 'Pick A', points: 5, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], correctOptionIds: ['a'] },
      { type: 'video', prompt: 'Explain', points: 5 },
    ], { proctored: true, timeLimitMins: 30, enforceTimeLimit: true });
    await models.CohortAssessment.bulkCreate([
      { cohortId: ctx.cohort.id, assessmentId: beginnerTest.id, level: 'beginner', position: 0 },
      { cohortId: ctx.cohort.id, assessmentId: seniorTest.id, level: 'senior', position: 1 },
    ]);
    // Imported from a sheet: no link of their own yet.
    app = await models.Application.create({ cohortId: ctx.cohort.id, email: 'sam@test.com', firstName: 'Sam', level: 'senior', status: 'pending', source: 'import' });
  });

  it('keeps the assessment back until it is sent, then sends their level\'s with a working link', async () => {
    expect(pipeline.stageOf(app)).toBe('added');

    const out = await pipeline.sendInvites(ctx.cohort.id, [app.id], ctx.admin);
    expect(out.sent).toEqual([expect.objectContaining({ email: 'sam@test.com', assessment: 'Senior test' })]);
    await app.reload();
    expect(app).toMatchObject({ status: 'assessment_sent', assessmentInviteCount: 1 });
    expect(pipeline.stageOf(app)).toBe('assessment_sent');
    const token = tokenFor('sam@test.com');
    expect(token).toBeTruthy();

    // Opening the link: "opened", and the senior (proctored, timed) assessment.
    const status = await publicIntake.getApplicationStatus(token);
    expect(status.awaitingInvite).toBe(false);
    expect(status.assessment).toMatchObject({ title: 'Senior test', proctored: true, enforceTimeLimit: true });
    expect(pipeline.stageOf(await app.reload())).toBe('opened');

    // Re-sending gives a new link; the old one stops working.
    await pipeline.sendInvites(ctx.cohort.id, [app.id], ctx.admin);
    await expect(publicIntake.getApplicationStatus(token)).rejects.toThrow(/not valid/);
    expect((await app.reload()).assessmentInviteCount).toBe(2);
  });

  it('runs a proctored, timed attempt: capable client, autosave, server-held video, one submission', async () => {
    await pipeline.sendInvites(ctx.cohort.id, [app.id], ctx.admin);
    const token = tokenFor('sam@test.com');
    const { assessment } = await publicIntake.getApplicationStatus(token);
    const [mcq, video] = assessment.questions;

    await expect(publicIntake.startAssessment(token, { capabilities: [] })).rejects.toThrow(/screen sharing/);
    const started = await publicIntake.startAssessment(token, { capabilities: ['screen', 'video'] });
    expect(started.deadlineAt).toBeTruthy();
    expect(pipeline.stageOf(await app.reload())).toBe('in_progress');

    await publicIntake.saveAssessmentDraft(token, { [mcq.id]: { optionIds: ['a'] } });
    await publicIntake.attachAssessmentVideo(token, video.id, { file: { buffer: Buffer.from('v') } });
    await publicIntake.logAssessmentProctor(token, [{ type: 'focus_loss' }]);
    await publicIntake.uploadAssessmentSnapshot(token, { buffer: Buffer.from('j'), mimetype: 'image/jpeg' }, { source: 'screen' });

    // The browser can't swap in a video URL of its own.
    const res = await publicIntake.submitAssessment(token, {
      [mcq.id]: { optionIds: ['a'] }, [video.id]: { videoUrl: 'https://evil.example/x.mp4' },
    });
    expect(res).toMatchObject({ autoScore: 5, pendingManualGrading: true });
    const sub = await models.AssessmentSubmission.findOne({ where: { applicationId: app.id } });
    expect(sub.answers[video.id].videoUrl).toMatch(/res\.cloudinary\.com/);
    expect(pipeline.stageOf(await app.reload(), sub)).toBe('submitted');

    // One sitting: no second submission, and the page says it's closed.
    await expect(publicIntake.submitAssessment(token, { [mcq.id]: { optionIds: ['b'] } })).rejects.toThrow(/already submitted/);
    expect((await publicIntake.getApplicationStatus(token)).canEditAssessment).toBe(false);

    // The admin sees the proctoring record and the timeline; grading → reviewed.
    const detail = await applicationService.getApplication(app.id);
    expect(detail.submission.proctor.snapshots).toEqual([expect.objectContaining({ source: 'screen' })]);
    expect(detail.submission.proctor.flagCounts).toEqual({ focus_loss: 1 });
    expect(detail.submission.proctorLog).toBeUndefined();
    expect(detail.timeline.find((t) => t.key === 'submitted').at).toBeTruthy();
    await assessmentService.gradeSubmission(sub.id, { manualScore: 4 }, ctx.admin.id);
    expect((await applicationService.getApplication(app.id)).stage).toBe('reviewed');

    // Accepted → a programme invitation goes out.
    await applicationService.acceptApplication(app.id, {}, ctx.admin.id);
    expect((await applicationService.getApplication(app.id)).stage).toBe('programme_invited');
  });

  it('still takes a submission that arrives in the grace after the buzzer', async () => {
    /*
     * The browser auto-submits at zero and the answers travel over whatever
     * network the applicant has. A submission a few seconds past the deadline
     * is that journey, not a cheat, so it lands — and required-answer
     * validation is not held against somebody whose clock has run out.
     */
    await pipeline.sendInvites(ctx.cohort.id, [app.id], ctx.admin);
    const token = tokenFor('sam@test.com');
    const { assessment } = await publicIntake.getApplicationStatus(token);
    const [mcq] = assessment.questions;
    await publicIntake.startAssessment(token, { capabilities: ['screen', 'video'] });

    // Thirty seconds past a thirty-minute limit: inside the ninety of grace.
    const sub = await models.AssessmentSubmission.findOne({ where: { applicationId: app.id } });
    await sub.update({ startedAt: new Date(Date.now() - (30 * 60 * 1000 + 30 * 1000)) });

    // The video question is unanswered, which would normally be refused.
    const res = await publicIntake.submitAssessment(token, { [mcq.id]: { optionIds: ['a'] } });

    expect(res).toMatchObject({ autoScore: 5 });
    await sub.reload();
    expect(sub.status).toBe('submitted');
    expect(sub.answers[mcq.id]).toEqual({ optionIds: ['a'] });
  });

  it('will not let one applicant\'s link write to another\'s attempt', async () => {
    // The proctoring endpoints take a token, not an id. A token is the only
    // thing standing between two applicants' recordings and snapshots.
    await pipeline.sendInvites(ctx.cohort.id, [app.id], ctx.admin);
    const mine = tokenFor('sam@test.com');
    await publicIntake.startAssessment(mine, { capabilities: ['screen', 'video'] });

    const stranger = 'not-a-real-token';
    await expect(publicIntake.logAssessmentProctor(stranger, [{ type: 'focus_loss' }])).rejects.toThrow();
    await expect(publicIntake.uploadAssessmentSnapshot(
      stranger, { buffer: Buffer.from('j'), mimetype: 'image/jpeg' }, { source: 'screen' },
    )).rejects.toThrow();

    // Nothing reached the real attempt.
    const detail = await applicationService.getApplication(app.id);
    expect(detail.submission.proctor.snapshots).toEqual([]);
    expect(detail.submission.proctor.flagCounts).toEqual({});
  });

  it('submits a timed attempt as it stands once the clock has run out', async () => {
    await pipeline.sendInvites(ctx.cohort.id, [app.id], ctx.admin);
    const token = tokenFor('sam@test.com');
    const { assessment } = await publicIntake.getApplicationStatus(token);
    await publicIntake.startAssessment(token, { capabilities: ['screen', 'video'] });
    await publicIntake.saveAssessmentDraft(token, { [assessment.questions[0].id]: { optionIds: ['a'] } });

    const sub = await models.AssessmentSubmission.findOne({ where: { applicationId: app.id } });
    await sub.update({ startedAt: new Date(Date.now() - 32 * 60 * 1000) });
    await expect(publicIntake.saveAssessmentDraft(token, {})).rejects.toThrow(/Time is up/);
    await sub.reload();
    expect(sub).toMatchObject({ status: 'submitted' });
    expect(Number(sub.autoScore)).toBe(5);
  });

  it('skips who it should, with the reason', async () => {
    const gone = await models.Application.create({ cohortId: ctx.cohort.id, email: 'gone@test.com', status: 'removed', source: 'import' });
    const out = await pipeline.sendInvites(ctx.cohort.id, [app.id, gone.id], ctx.admin);
    expect(out.sent).toHaveLength(1);
    expect(out.skipped).toEqual([expect.objectContaining({ email: 'gone@test.com', reason: 'Application is removed' })]);
  });

  it('an untimed, unproctored assessment still lets them revise after submitting', async () => {
    const junior = await models.Application.create({ cohortId: ctx.cohort.id, email: 'jo@test.com', firstName: 'Jo', level: 'beginner', status: 'pending', source: 'import' });
    await pipeline.sendInvites(ctx.cohort.id, [junior.id], ctx.admin);
    const token = tokenFor('jo@test.com');
    const { assessment } = await publicIntake.getApplicationStatus(token);
    const q = assessment.questions[0];
    await publicIntake.submitAssessment(token, { [q.id]: { optionIds: ['b'] } });
    const again = await publicIntake.submitAssessment(token, { [q.id]: { optionIds: ['a'] } });
    expect(again).toMatchObject({ autoScore: 5, submissionCount: 2 });
  });
});
