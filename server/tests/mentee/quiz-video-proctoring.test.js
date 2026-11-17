'use strict';

/**
 * Video answers and full proctoring for quizzes:
 *   - a quiz with a video question always goes to the mentor, and the kit
 *     stores a clamped recording cap; full proctoring follows the kit default;
 *   - a client that can't share a screen / record video is turned away;
 *   - a recorded video waits for the mentor's score; an unrecorded one is 0;
 *   - the review can't finish while a video is unscored, and then carries the
 *     final score onto the attempt;
 *   - a video arriving just after submit is put up for grading;
 *   - snapshots and events land in the quiz's own proctor log.
 */

jest.mock('../../src/utils/cloudinaryUpload', () => ({
  uploadToCloudinary: jest.fn(async (_buf, folder, type) => ({
    secure_url: `https://res.cloudinary.com/demo/${type}/upload/v1/${folder}/up-${Math.random().toString(36).slice(2)}.webm`,
    public_id: `${folder}/up-${Math.random().toString(36).slice(2)}`,
  })),
  deleteFromCloudinary: jest.fn(async () => ({ result: 'ok' })),
}));

jest.mock('../../src/config/cloudinary', () => ({
  config: () => ({ cloud_name: 'demo', api_key: 'key', api_secret: 'secret' }),
  utils: { api_sign_request: jest.fn(() => 'signed') },
  api: { resource: jest.fn(async (id) => ({ public_id: id, secure_url: `https://res.cloudinary.com/demo/video/upload/v1/${id}.webm` })) },
}));

const { models } = require('../../src/db');
const quizSessionService = require('../../src/services/quizSessionService');
const quizKitService = require('../../src/services/quizKitService');
const proctoring = require('../../src/services/proctoringRules');
const authzService = require('../../src/services/authzService');
const submissionService = require('../../src/services/submissionService');
const { deleteFromCloudinary } = require('../../src/utils/cloudinaryUpload');
const { cleanDb, createMentor, createMentee } = require('../helpers/seed');

describe('quiz kits with video questions', () => {
  it('stores a video question with no answer key and a clamped cap', () => {
    const q = quizKitService._normalizeQuestion({ kind: 'video', prompt: 'Explain closures on camera', maxRecordingSeconds: 2000 }, 0);
    expect(q).toMatchObject({ kind: 'video', options: [], correctOptionIds: [], acceptedAnswers: [] });
    expect(q.config.maxRecordingSeconds).toBe(300);
    const short = quizKitService._normalizeQuestion({ kind: 'short', prompt: 'x', acceptedAnswers: ['y'], config: { maxRecordingSeconds: 60 } }, 1);
    expect(short.config.maxRecordingSeconds).toBeUndefined();
  });

  it('keeps the proctoring default in the kit settings', () => {
    expect(quizKitService._normalizeKitMeta({ proctorDefault: true }).settings).toEqual({ proctorDefault: true });
  });
});

describe('quiz video answers and proctoring', () => {
  let mentor, mentee, task, kit, choiceQ, videoQ, videoQ2, session;

  beforeEach(async () => {
    await cleanDb();
    jest.clearAllMocks();
    jest.spyOn(authzService, 'canActOnTask').mockResolvedValue(true);
    jest.spyOn(submissionService, 'assertClanWritableForReview').mockResolvedValue();
    jest.spyOn(submissionService, 'reviewSubmission').mockResolvedValue({});
    mentor = await createMentor({ email: 'mentor@test.com' });
    mentee = await createMentee({ email: 'mentee@test.com' });
    task = await models.AssignedTask.create({ menteeId: mentee.id, mentorId: mentor.id, status: 'in_progress' }, { validate: false });
    kit = await models.QuizKit.create({ title: 'Mixed', createdBy: mentor.id, status: 'published', evaluationDefault: 'auto', settings: { proctorDefault: true }, passScore: 50 });
    choiceQ = await models.QuizQuestion.create({ kitId: kit.id, position: 0, kind: 'single', prompt: 'Pick a', points: 5, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], correctOptionIds: ['a'] });
    videoQ = await models.QuizQuestion.create({ kitId: kit.id, position: 1, kind: 'video', prompt: 'Explain it', points: 10, config: { maxRecordingSeconds: 60 } });
    videoQ2 = await models.QuizQuestion.create({ kitId: kit.id, position: 2, kind: 'video', prompt: 'And this', points: 5, config: {} });
  });

  const assign = (options = {}) => quizKitService.createAssignmentForTask({ assignedTaskId: task.id, kitId: kit.id, options });
  const start = (capabilities) => quizSessionService.startOrResume(task.id, mentee.id, { capabilities });

  it('always reviews a quiz with video, and proctors it by the kit default', async () => {
    const a = await assign({ evaluationMode: 'auto' });
    expect(a.evaluationMode).toBe('review');
    expect(a.proctored).toBe(true);
    const view = await quizSessionService.getForCandidate(task.id, mentee.id);
    expect(view.options).toMatchObject({ evaluationMode: 'review', cameraRequired: true, screenShareRequired: true, videoAnswers: true });
    expect(view.questions.find((q) => q.id === videoQ.id).maxRecordingSeconds).toBe(60);
    expect(view.questions.find((q) => q.id === choiceQ.id).maxRecordingSeconds).toBeNull();
  });

  it('turns away a client that cannot share a screen or record video', async () => {
    await assign();
    await expect(start([])).rejects.toThrow(/quiz is proctored with screen sharing/);
    await expect(start(['screen'])).rejects.toThrow(/answer on video/);
    expect(await models.QuizSession.count()).toBe(0);
    await expect(start(['screen', 'video'])).resolves.toMatchObject({ status: 'in_progress' });
  });

  describe('an attempt', () => {
    beforeEach(async () => {
      await assign();
      const s = await start(['screen', 'video']);
      session = await models.QuizSession.findByPk(s.id);
      await quizSessionService.saveAnswer(session.id, mentee.id, choiceQ.id, { selectedOptionIds: ['a'] });
    });

    it('signs an upload only for its own video answer, and keeps captions', async () => {
      const signed = await quizSessionService.signVideoUpload(session.id, mentee.id, videoQ.id);
      expect(signed.publicId.startsWith(proctoring.videoPublicIdPrefix('quizzes', session.id, videoQ.id))).toBe(true);
      await expect(quizSessionService.attachVideo(session.id, mentee.id, videoQ.id, {
        publicId: `${proctoring.videoPublicIdPrefix('quizzes', session.id, videoQ2.id)}1`,
      })).rejects.toThrow(/does not belong/);
      await expect(quizSessionService.signVideoUpload(session.id, mentee.id, choiceQ.id)).rejects.toThrow(/video question/);

      await quizSessionService.attachVideo(session.id, mentee.id, videoQ.id, { publicId: signed.publicId });
      await quizSessionService.saveAnswer(session.id, mentee.id, videoQ.id, { transcript: 'closures capture scope' });
      await quizSessionService.saveAnswer(session.id, mentee.id, videoQ.id, { transcript: null });
      const view = await quizSessionService.getForCandidate(task.id, mentee.id);
      expect(view.state.savedAnswers.find((a) => a.questionId === videoQ.id))
        .toMatchObject({ videoUrl: expect.stringContaining(signed.publicId), transcript: 'closures capture scope' });
    });

    it('a re-record replaces the old take and deletes it', async () => {
      await quizSessionService.attachVideo(session.id, mentee.id, videoQ.id, { file: { buffer: Buffer.from('1') } });
      const first = (await models.QuizAnswer.findOne({ where: { sessionId: session.id, questionId: videoQ.id } })).recordingPublicId;
      await quizSessionService.attachVideo(session.id, mentee.id, videoQ.id, { file: { buffer: Buffer.from('2') } });
      expect(deleteFromCloudinary).toHaveBeenCalledWith(first, 'video');
    });

    it('leaves a recorded video for the mentor, scores a missing one 0, and holds the score back', async () => {
      await quizSessionService.attachVideo(session.id, mentee.id, videoQ.id, { file: { buffer: Buffer.from('v') } });
      const res = await quizSessionService.submit(session.id, mentee.id);
      expect(res).toMatchObject({ autoScore: 5, maxScore: 20, finalized: false, evaluationMode: 'review', passed: null });
      expect(submissionService.reviewSubmission).not.toHaveBeenCalled();

      const recorded = await models.QuizAnswer.findOne({ where: { sessionId: session.id, questionId: videoQ.id } });
      expect(recorded).toMatchObject({ isCorrect: null, autoPoints: null, pointsAwarded: null });
      const missing = await models.QuizAnswer.findOne({ where: { sessionId: session.id, questionId: videoQ2.id } });
      expect(missing).toMatchObject({ isCorrect: false, autoPoints: 0, pointsAwarded: 0 });

      await session.reload();
      expect(session.scorePercent).toBeNull();
      const sub = await models.TaskSubmission.findOne({ where: { assignedTaskId: task.id } });
      expect(sub.submissionText).toMatch(/1 video answer to score/);
    });

    it('won\'t finish the review until every video is scored, then records the final score', async () => {
      await quizSessionService.attachVideo(session.id, mentee.id, videoQ.id, { file: { buffer: Buffer.from('v') } });
      await quizSessionService.submit(session.id, mentee.id);

      const review = await quizSessionService.getForReview(task.id, mentor.id);
      expect(review.videosToGrade).toBe(1);
      expect(review.items.find((i) => i.questionId === videoQ.id).answer.videoUrl).toMatch(/^https:/);
      await expect(quizSessionService.finalizeReview(task.id, mentor.id)).rejects.toThrow(/Score the video answer/);

      await quizSessionService.gradeAnswer(task.id, mentor.id, videoQ.id, { pointsAwarded: 8 });
      const out = await quizSessionService.finalizeReview(task.id, mentor.id);
      expect(out).toMatchObject({ totalAwarded: 13, totalPossible: 20, pointsPercent: 65 });
      await session.reload();
      expect(session.scorePercent).toBeCloseTo(65);
      expect(session.passed).toBe(true);
    });

    it('puts a video that lands just after submit up for grading', async () => {
      await quizSessionService.submit(session.id, mentee.id);
      await quizSessionService.attachVideo(session.id, mentee.id, videoQ2.id, { file: { buffer: Buffer.from('late') } });
      const late = await models.QuizAnswer.findOne({ where: { sessionId: session.id, questionId: videoQ2.id } });
      expect(late).toMatchObject({ pointsAwarded: null, autoPoints: null, isCorrect: null });
      expect(late.recordingUrl).toMatch(/^https:/);

      await session.update({ submittedAt: new Date(Date.now() - proctoring.LATE_UPLOAD_GRACE_MS - 1000) });
      await expect(quizSessionService.attachVideo(session.id, mentee.id, videoQ2.id, { file: { buffer: Buffer.from('x') } }))
        .rejects.toThrow(/already been submitted/);
    });

    it('keeps camera and screen snapshots and events in the quiz\'s own log, for the mentor only', async () => {
      const shot = (source) => quizSessionService.attachSnapshot(session.id, mentee.id, { buffer: Buffer.from('j'), mimetype: 'image/jpeg' }, choiceQ.id, source);
      await Promise.all([
        shot('camera'), shot('screen'), shot('screen'),
        quizSessionService.logProctorEvents(session.id, mentee.id, [{ type: 'focus_loss' }, { type: 'snapshot', meta: { url: 'https://evil.example' } }]),
      ]);
      await quizSessionService.submit(session.id, mentee.id);

      const review = await quizSessionService.getForReview(task.id, mentor.id);
      expect(review.proctor.snapshots).toHaveLength(3);
      expect(review.proctor.snapshots.filter((s) => s.source === 'screen')).toHaveLength(2);
      expect(review.proctor.flagCounts).toEqual({ focus_loss: 1 });
      expect(review.items.find((i) => i.questionId === choiceQ.id).snapshots).toHaveLength(3);
      expect(review.options).toMatchObject({ proctored: true, screenShareRequired: true });

      const own = await quizSessionService.getForReview(task.id, mentee.id);
      expect(own.proctor.snapshots).toHaveLength(0);

      const del = await quizSessionService.deleteSnapshots(task.id, mentor.id);
      expect(del.deleted).toBe(3);
      expect((await quizSessionService.getForReview(task.id, mentor.id)).proctor.snapshots).toHaveLength(0);
    });
  });

  it('leaves an objective, unproctored quiz exactly as it was (auto-graded, no gate)', async () => {
    await videoQ.destroy();
    await videoQ2.destroy();
    await kit.update({ settings: {} });
    const a = await assign();
    expect(a).toMatchObject({ evaluationMode: 'auto', proctored: false });
    const s = await start(undefined);
    await quizSessionService.saveAnswer(s.id, mentee.id, choiceQ.id, { selectedOptionIds: ['a'] });
    const res = await quizSessionService.submit(s.id, mentee.id);
    expect(res).toMatchObject({ autoScore: 5, maxScore: 5, finalized: true, passed: true });
    expect(submissionService.reviewSubmission).toHaveBeenCalled();
  });
});
