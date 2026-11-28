'use strict';

/**
 * Proctoring on an intake assessment, end to end on the server.
 *
 * The pipeline test next door proves a proctored attempt runs. This is about
 * the proctoring itself, and about the two things a reviewer actually has to
 * be able to trust:
 *
 *   - the GATE: a client that cannot share its screen, or cannot record video
 *     where the paper asks for it, is turned away before the clock starts and
 *     told which of the two it is. The capability list comes from the
 *     applicant's own browser, so the server has to be the one refusing.
 *   - the RECORD: the log is append-only across the whole attempt, snapshots
 *     are kept apart from flags and attributed to the question that was on
 *     screen, and the interruptions are totalled — how many times they came
 *     back, how long they were away, offline, or out of fullscreen. A reviewer
 *     reads those numbers to tell a power cut from a second browser.
 *
 * The clock is the other half: once an attempt is past its deadline and its
 * grace, opening the link again must finalise it rather than quietly hand back
 * more time, and nothing more may be written to its log.
 */

jest.mock('../../src/utils/cloudinaryUpload', () => ({
  uploadToCloudinary: jest.fn(async (_buf, folder, type) => ({
    secure_url: `https://res.cloudinary.com/demo/${type}/upload/v1/${folder}/shot-${Math.random().toString(36).slice(2)}.jpg`,
    public_id: `${folder}/shot-${Math.random().toString(36).slice(2)}`,
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
const media = require('../../src/proctoring/media');

const MINUTE = 60 * 1000;
let ctx;

const tokenFor = (email) => {
  const calls = (emailService.sendEmail.mock?.calls || []).filter(([m]) => m.to === email);
  const text = calls[calls.length - 1]?.[0]?.text || '';
  const m = text.match(/apply\/status\/([^\s]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};

async function publish(title, questions, extra) {
  const a = await assessmentService.createAssessment({ title, ...extra }, ctx.admin.id);
  await assessmentService.setQuestions(a.id, questions);
  await assessmentService.updateAssessment(a.id, { status: 'published' });
  return a;
}

const mcq = {
  type: 'mcq', prompt: 'Pick one', points: 5,
  options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], correctOptionIds: ['a'],
};

/** An applicant with a private link to a published assessment. */
async function applicant(assessment, { email = 'sam@test.com' } = {}) {
  await models.Cohort.update({ assessmentId: assessment.id }, { where: { id: ctx.cohort.id } });
  const application = await models.Application.create({
    cohortId: ctx.cohort.id, email, firstName: 'Sam', lastName: 'A',
    status: 'pending', source: 'public_link', responses: {},
  });
  await pipeline.sendInvites(ctx.cohort.id, [application.id], ctx.admin);
  return { application, token: tokenFor(email) };
}

const logOf = async (applicationId) => {
  const sub = await models.AssessmentSubmission.findOne({ where: { applicationId } });
  return sub.proctorLog || [];
};

beforeEach(async () => {
  await seed.cleanDb();
  if (emailService.sendEmail.mockClear) emailService.sendEmail.mockClear();
  const admin = await seed.createAdmin();
  const program = await seed.createProgram({ createdBy: admin.id, name: 'Fellowship' });
  const cohort = await models.Cohort.create({
    programId: program.id, name: 'Spring intake', status: 'open', levels: [], assessmentMode: 'on_invite',
  });
  ctx = { admin, program, cohort };
});

describe('the gate before the clock starts', () => {
  it('turns away a client that cannot share its screen, and says so', async () => {
    const assessment = await publish('Proctored', [mcq], { proctored: true });
    const { token } = await applicant(assessment);

    await expect(publicIntake.startAssessment(token, { capabilities: [] }))
      .rejects.toThrow(/screen sharing/i);
    await expect(publicIntake.startAssessment(token, { capabilities: ['video'] }))
      .rejects.toThrow(/screen sharing/i);

    // Refused means refused: no attempt row, so no clock has started.
    expect(await models.AssessmentSubmission.count()).toBe(0);
  });

  it('turns away a client that cannot record, when the paper asks for video', async () => {
    const assessment = await publish('Video paper', [
      mcq,
      { type: 'video', prompt: 'Tell us about a project', points: 5, config: { maxRecordingSeconds: 60 } },
    ]);
    const { token } = await applicant(assessment);

    await expect(publicIntake.startAssessment(token, { capabilities: [] }))
      .rejects.toThrow(/on video/i);
    expect(await models.AssessmentSubmission.count()).toBe(0);
  });

  it('lets a capable client in, and starts its clock once', async () => {
    const assessment = await publish('Proctored', [mcq], { proctored: true, timeLimitMins: 30, enforceTimeLimit: true });
    const { application, token } = await applicant(assessment);

    const first = await publicIntake.startAssessment(token, { capabilities: ['screen', 'video'] });
    expect(first.deadlineAt).toBeTruthy();

    // Reopening the page must not hand back a fresh half hour.
    const again = await publicIntake.startAssessment(token, { capabilities: ['screen', 'video'] });
    expect(again.startedAt).toEqual(first.startedAt);
    expect(await models.AssessmentSubmission.count({ where: { applicationId: application.id } })).toBe(1);
  });

  it('asks nothing of a client when the paper is neither proctored nor filmed', async () => {
    const assessment = await publish('Plain', [mcq]);
    const { token } = await applicant(assessment);

    await expect(publicIntake.startAssessment(token, { capabilities: [] })).resolves.toMatchObject({ status: 'in_progress' });
  });
});

describe('the record a reviewer reads', () => {
  let assessment; let application; let token;

  beforeEach(async () => {
    assessment = await publish('Proctored', [mcq], { proctored: true, timeLimitMins: 30, enforceTimeLimit: true });
    ({ application, token } = await applicant(assessment));
    await publicIntake.startAssessment(token, { capabilities: ['screen', 'video'] });
  });

  it('appends every batch, and never loses what came before', async () => {
    await publicIntake.logAssessmentProctor(token, [{ type: 'focus_loss' }, { type: 'fullscreen_exit' }]);
    await publicIntake.logAssessmentProctor(token, [{ type: 'focus_loss' }]);

    const log = await logOf(application.id);
    expect(log).toHaveLength(3);
    expect(log.map((e) => e.type)).toEqual(['focus_loss', 'fullscreen_exit', 'focus_loss']);
    expect(log.every((e) => e.at)).toBe(true);
  });

  it('will not take a snapshot through the events endpoint', async () => {
    // A snapshot carries an uploaded image; one claimed in a plain event would
    // be a flag-shaped hole in the record pointing anywhere the client liked.
    const out = await publicIntake.logAssessmentProctor(token, [
      { type: 'snapshot', meta: { url: 'https://evil.example/anything.jpg' } },
      { type: 'focus_loss' },
    ]);

    expect(out.logged).toBe(1);
    const log = await logOf(application.id);
    expect(log.map((e) => e.type)).toEqual(['focus_loss']);
  });

  it('totals the interruptions, so a power cut reads differently from a second browser', async () => {
    await publicIntake.logAssessmentProctor(token, [
      { type: 'attempt_opened' },
      { type: 'connection_lost' },
      { type: 'connection_restored', meta: { downMs: 45_000 } },
      { type: 'fullscreen_exit' },
      { type: 'fullscreen_restored', meta: { awayMs: 12_000 } },
      // They came back after the tab died, four minutes later.
      { type: 'attempt_opened', meta: { awayMs: 4 * MINUTE } },
    ]);

    const { stats, flagCounts } = media.splitProctorLog(await logOf(application.id), []);
    expect(stats).toMatchObject({
      opens: 2,
      resumes: 1,
      awayMs: 4 * MINUTE,
      offline: 1,
      offlineMs: 45_000,
      fullscreenExits: 1,
      fullscreenOutMs: 12_000,
      fullscreenUnavailable: false,
    });
    expect(flagCounts.attempt_opened).toBe(2);
  });

  it('keeps snapshots apart from flags, and says where each came from', async () => {
    await publicIntake.uploadAssessmentSnapshot(token, { buffer: Buffer.from('j'), mimetype: 'image/jpeg' }, { source: 'camera' });
    await publicIntake.uploadAssessmentSnapshot(token, { buffer: Buffer.from('j'), mimetype: 'image/jpeg' }, { source: 'screen' });
    await publicIntake.logAssessmentProctor(token, [{ type: 'focus_loss' }]);

    const { snapshots, flags, flagCounts } = media.splitProctorLog(await logOf(application.id), []);
    expect(snapshots.map((s) => s.source)).toEqual(['camera', 'screen']);
    expect(snapshots.every((s) => s.url)).toBe(true);
    expect(flags.map((f) => f.type)).toEqual(['focus_loss']);
    expect(flagCounts).toEqual({ focus_loss: 1 });
  });

  it('refuses an image that is not one', async () => {
    await expect(publicIntake.uploadAssessmentSnapshot(
      token, { buffer: Buffer.from('MZ'), mimetype: 'application/x-msdownload' }, { source: 'camera' },
    )).rejects.toThrow(/must be an image/i);
  });

  it('reaches the admin as a summary, with the raw log kept back', async () => {
    await publicIntake.uploadAssessmentSnapshot(token, { buffer: Buffer.from('j'), mimetype: 'image/jpeg' }, { source: 'screen' });
    await publicIntake.logAssessmentProctor(token, [{ type: 'attempt_opened' }, { type: 'focus_loss' }]);

    const detail = await applicationService.getApplication(application.id);
    expect(detail.submission.proctor.snapshots).toHaveLength(1);
    expect(detail.submission.proctor.flagCounts.focus_loss).toBe(1);
    expect(detail.submission.proctor.stats.opens).toBe(1);
    // The reviewer gets the reading, not the tape.
    expect(detail.submission.proctorLog).toBeUndefined();
  });
});

describe('once the clock has run out', () => {
  it('finalises the attempt on the next open instead of handing back more time', async () => {
    const assessment = await publish('Proctored', [mcq], { proctored: true, timeLimitMins: 30, enforceTimeLimit: true });
    const { application, token } = await applicant(assessment);
    await publicIntake.startAssessment(token, { capabilities: ['screen', 'video'] });
    await publicIntake.saveAssessmentDraft(token, { [assessment.questions?.[0]?.id || 'q']: { optionIds: ['a'] } });

    // Well past the deadline and its grace.
    const sub = await models.AssessmentSubmission.findOne({ where: { applicationId: application.id } });
    await sub.update({ startedAt: new Date(Date.now() - 120 * MINUTE) });

    const reopened = await publicIntake.startAssessment(token, { capabilities: ['screen', 'video'] });
    expect(reopened.status).not.toBe('in_progress');
    expect((await sub.reload()).status).toBe('submitted');
  });

  it('writes nothing more to the log once the attempt is closed', async () => {
    const assessment = await publish('Proctored', [mcq], { proctored: true, timeLimitMins: 30, enforceTimeLimit: true });
    const { application, token } = await applicant(assessment);
    await publicIntake.startAssessment(token, { capabilities: ['screen', 'video'] });
    await publicIntake.logAssessmentProctor(token, [{ type: 'focus_loss' }]);

    const sub = await models.AssessmentSubmission.findOne({ where: { applicationId: application.id } });
    await sub.update({ startedAt: new Date(Date.now() - 120 * MINUTE) });
    await publicIntake.startAssessment(token, { capabilities: ['screen', 'video'] });

    const out = await publicIntake.logAssessmentProctor(token, [{ type: 'focus_loss' }, { type: 'fullscreen_exit' }]);
    expect(out.logged).toBe(0);

    // Nothing of the applicant's is added after the buzzer. The one entry that
    // IS added is the server's own: it closed the attempt, and the record says
    // so rather than ending mid-sentence.
    const log = await logOf(application.id);
    expect(log.map((e) => e.type)).toEqual(['focus_loss', 'time_expired']);
  });
});
