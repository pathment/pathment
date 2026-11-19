'use strict';

/**
 * Video answers and full proctoring for interviews:
 *   - the rules (who needs a camera, a screen, video) and the client gate;
 *   - a video question's recording cap, kept within the upload limit;
 *   - a signed direct upload that can only land on its own answer;
 *   - recordings accepted shortly after submit, never once graded;
 *   - camera and screen snapshots appended without losing each other.
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
  api: {
    resource: jest.fn(async (id) => ({ public_id: id, secure_url: `https://res.cloudinary.com/demo/video/upload/v1/${id}.webm` })),
  },
}));

const { models } = require('../../src/db');
const interviewSessionService = require('../../src/services/interviewSessionService');
const interviewKitService = require('../../src/services/interviewKitService');
const proctoring = require('../../src/proctoring/rules');
const cloudinary = require('../../src/config/cloudinary');
const { deleteFromCloudinary } = require('../../src/utils/cloudinaryUpload');
const { cleanDb, createMentor, createMentee } = require('../helpers/seed');

describe('interview proctoring rules', () => {
  it('needs a camera for proctoring or any video question, a screen only for proctoring', () => {
    expect(proctoring.requirementsFor({ proctored: false, questions: [{ kind: 'voice' }] }))
      .toEqual({ camera: false, screen: false, video: false });
    expect(proctoring.requirementsFor({ proctored: false, questions: [{ kind: 'video' }] }))
      .toEqual({ camera: true, screen: false, video: true });
    expect(proctoring.requirementsFor({ proctored: true, questions: [{ kind: 'text' }] }))
      .toEqual({ camera: true, screen: true, video: false });
  });

  it('names what a client is missing', () => {
    const need = { camera: true, screen: true, video: true };
    expect(proctoring.missingCapability(need, proctoring.parseCapabilities([]))).toBe('screen');
    expect(proctoring.missingCapability(need, proctoring.parseCapabilities(['screen']))).toBe('video');
    expect(proctoring.missingCapability(need, proctoring.parseCapabilities('screen, video, junk'))).toBeNull();
    expect(proctoring.missingCapability({ camera: false, screen: false, video: false }, new Set())).toBeNull();
  });

  it('clamps a recording cap and finds a video\'s audio track', () => {
    expect(proctoring.maxRecordingSeconds({})).toBe(120);
    expect(proctoring.maxRecordingSeconds({ maxRecordingSeconds: 5 })).toBe(15);
    expect(proctoring.maxRecordingSeconds({ maxRecordingSeconds: 9999 })).toBe(300);
    expect(proctoring.audioTrackUrl('https://res.cloudinary.com/d/video/upload/v1/a/b.webm')).toBe('https://res.cloudinary.com/d/video/upload/v1/a/b.mp3');
    expect(proctoring.audioTrackUrl('https://example.com/b.webm')).toBe('https://example.com/b.webm');
  });

  it('stores a video question with its cap, and strips the cap from other kinds', () => {
    const video = interviewKitService._normalizeQuestion({ kind: 'video', prompt: 'Introduce yourself', config: { maxRecordingSeconds: 1000 } }, 0);
    expect(video.kind).toBe('video');
    expect(video.timeLimitSeconds).toBe(180);
    expect(video.config.maxRecordingSeconds).toBe(300);
    const voice = interviewKitService._normalizeQuestion({ kind: 'voice', prompt: 'Hi', config: { maxRecordingSeconds: 60, promptAudioUrl: 'x' } }, 1);
    expect(voice.config).toEqual({ promptAudioUrl: 'x' });
  });
});

describe('interview video answers and snapshots', () => {
  let mentee, task, assignment, videoQ, voiceQ, session;

  beforeEach(async () => {
    await cleanDb();
    jest.clearAllMocks();
    const mentor = await createMentor({ email: 'mentor@test.com' });
    mentee = await createMentee({ email: 'mentee@test.com' });
    task = await models.AssignedTask.create({ menteeId: mentee.id, mentorId: mentor.id, status: 'in_progress' }, { validate: false });
    const kit = await models.InterviewKit.create({ title: 'Screen', createdBy: mentor.id });
    videoQ = await models.InterviewQuestion.create({ kitId: kit.id, position: 0, kind: 'video', prompt: 'Walk me through a project.', points: 10, config: { maxRecordingSeconds: 90 } });
    voiceQ = await models.InterviewQuestion.create({ kitId: kit.id, position: 1, kind: 'voice', prompt: 'Closures?', points: 10 });
    assignment = await models.InterviewAssignment.create({ assignedTaskId: task.id, kitId: kit.id, cameraRequired: true });
  });

  const startWith = (capabilities) => interviewSessionService.startOrResume(task.id, mentee.id, { capabilities });

  it('turns away a client that cannot share a screen or record video, before any clock starts', async () => {
    await expect(startWith(undefined)).rejects.toThrow(/screen sharing/);
    await expect(startWith(['screen'])).rejects.toThrow(/answer on video/);
    expect(await models.InterviewSession.count()).toBe(0);
    const s = await startWith(['screen', 'video']);
    expect(s.status).toBe('in_progress');
  });

  it('tells the runner what it needs and each video question\'s cap', async () => {
    const view = await interviewSessionService.getForCandidate(task.id, mentee.id);
    expect(view.options).toMatchObject({ cameraRequired: true, screenShareRequired: true, videoAnswers: true });
    expect(view.questions.find((q) => q.id === videoQ.id).maxRecordingSeconds).toBe(90);
    expect(view.questions.find((q) => q.id === voiceQ.id).maxRecordingSeconds).toBeNull();
  });

  describe('with an open session', () => {
    beforeEach(async () => {
      const s = await startWith(['screen', 'video']);
      session = await models.InterviewSession.findByPk(s.id);
    });

    it('signs an upload that can only land on this answer, then attaches it', async () => {
      const signed = await interviewSessionService.signVideoUpload(session.id, mentee.id, videoQ.id);
      expect(signed.direct).toBe(true);
      expect(signed.publicId.startsWith(proctoring.videoPublicIdPrefix('interviews', session.id, videoQ.id))).toBe(true);
      expect(signed.fields).toMatchObject({ api_key: 'key', public_id: signed.publicId, signature: 'signed' });

      const out = await interviewSessionService.attachVideo(session.id, mentee.id, videoQ.id, { publicId: signed.publicId });
      expect(out.videoUrl).toContain(signed.publicId);
      const view = await interviewSessionService.getForCandidate(task.id, mentee.id);
      const saved = view.state.savedAnswers.find((a) => a.questionId === videoQ.id);
      expect(saved).toMatchObject({ videoUrl: out.videoUrl, audioUrl: null });
    });

    it('refuses a video id signed for another answer, and video on a voice question', async () => {
      const elsewhere = `${proctoring.videoPublicIdPrefix('interviews', session.id, voiceQ.id)}123`;
      await expect(interviewSessionService.attachVideo(session.id, mentee.id, videoQ.id, { publicId: elsewhere }))
        .rejects.toThrow(/does not belong/);
      await expect(interviewSessionService.signVideoUpload(session.id, mentee.id, voiceQ.id)).rejects.toThrow(/video question/);
      await expect(interviewSessionService.attachAudio(session.id, mentee.id, videoQ.id, { buffer: Buffer.from('x') }))
        .rejects.toThrow(/voice question/);
    });

    it('says so when a direct upload never reached Cloudinary', async () => {
      cloudinary.api.resource.mockRejectedValueOnce(new Error('Resource not found'));
      const signed = await interviewSessionService.signVideoUpload(session.id, mentee.id, videoQ.id);
      await expect(interviewSessionService.attachVideo(session.id, mentee.id, videoQ.id, { publicId: signed.publicId }))
        .rejects.toThrow(/could not find that video/);
    });

    it('takes the file itself as a fallback, and a re-record removes the old take', async () => {
      const first = await interviewSessionService.attachVideo(session.id, mentee.id, videoQ.id, { file: { buffer: Buffer.from('one') } });
      const row = await models.InterviewAnswer.findOne({ where: { sessionId: session.id, questionId: videoQ.id } });
      const oldId = row.audioPublicId;
      const second = await interviewSessionService.attachVideo(session.id, mentee.id, videoQ.id, { file: { buffer: Buffer.from('two') } });
      expect(second.videoUrl).not.toBe(first.videoUrl);
      expect(deleteFromCloudinary).toHaveBeenCalledWith(oldId, 'video');
    });

    it('accepts a recording just after submit, never after the window or once graded', async () => {
      await session.update({ status: 'submitted', submittedAt: new Date() });
      await expect(interviewSessionService.attachVideo(session.id, mentee.id, videoQ.id, { file: { buffer: Buffer.from('late') } }))
        .resolves.toMatchObject({ questionId: videoQ.id });

      await session.update({ submittedAt: new Date(Date.now() - proctoring.LATE_UPLOAD_GRACE_MS - 1000) });
      await expect(interviewSessionService.attachVideo(session.id, mentee.id, videoQ.id, { file: { buffer: Buffer.from('later') } }))
        .rejects.toThrow(/already been submitted/);

      await session.update({ submittedAt: new Date() });
      await task.update({ status: 'completed' });
      await expect(interviewSessionService.attachVideo(session.id, mentee.id, videoQ.id, { file: { buffer: Buffer.from('graded') } }))
        .rejects.toThrow(/already been submitted/);
    });

    it('keeps every snapshot and event when they arrive at once, with their source', async () => {
      const shot = (source) => interviewSessionService.attachSnapshot(
        session.id, mentee.id, { buffer: Buffer.from('jpg'), mimetype: 'image/jpeg' }, videoQ.id, source,
      );
      await Promise.all([
        shot('camera'), shot('screen'), shot('camera'), shot('screen'),
        interviewSessionService.logProctorEvents(session.id, mentee.id, [{ type: 'focus_loss' }, { type: 'screen_share_stopped' }]),
        // A client may not forge a snapshot with a URL of its choosing.
        interviewSessionService.logProctorEvents(session.id, mentee.id, [{ type: 'snapshot', meta: { url: 'https://evil.example/x.jpg' } }]),
      ]);
      const log = (await session.reload()).proctorLog;
      const snaps = log.filter((e) => e.type === 'snapshot');
      expect(snaps).toHaveLength(4);
      expect(snaps.filter((e) => e.meta.source === 'screen')).toHaveLength(2);
      expect(snaps.some((e) => String(e.meta.url).includes('evil'))).toBe(false);
      expect(log.filter((e) => e.type !== 'snapshot').map((e) => e.type).sort()).toEqual(['focus_loss', 'screen_share_stopped']);

      await expect(interviewSessionService.attachSnapshot(session.id, mentee.id, { buffer: Buffer.from('x'), mimetype: 'text/html' }))
        .rejects.toThrow(/must be an image/);
    });

    it('shows the mentor the video and which snapshots came from the screen', async () => {
      await interviewSessionService.attachVideo(session.id, mentee.id, videoQ.id, { file: { buffer: Buffer.from('v') } });
      await interviewSessionService.attachSnapshot(session.id, mentee.id, { buffer: Buffer.from('j'), mimetype: 'image/jpeg' }, videoQ.id, 'screen');
      await interviewSessionService.submit(session.id, mentee.id);
      const reviewer = await models.User.findOne({ where: { email: 'mentor@test.com' } });
      const authz = require('../../src/services/authzService');
      jest.spyOn(authz, 'canActOnTask').mockResolvedValue(true);
      const review = await interviewSessionService.getForReview(task.id, reviewer.id);
      const item = review.items.find((it) => it.questionId === videoQ.id);
      expect(item.answer.videoUrl).toMatch(/^https:/);
      expect(item.answer.audioUrl).toBeNull();
      expect(item.snapshots[0].source).toBe('screen');
      expect(review.options.screenShareRequired).toBe(true);
    });
  });
});
