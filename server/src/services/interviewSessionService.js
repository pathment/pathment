const { models, sequelize } = require('../db');
const { Op } = require('sequelize');
const { NotFoundError, ForbiddenError, ValidationError, ConflictError } = require('../utils/errors/errorTypes');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const authzService = require('./authzService');
const { PERMISSIONS } = require('../config/permissions');

/**
 * InterviewSessionService — the candidate runner (Phase 2). Owns starting/resuming
 * an attempt, autosaving per-question answers (transcript / code / text), attaching
 * recorded audio, logging proctor events, and submitting the finished interview
 * (which drops a TaskSubmission marker so it lands in the mentor's Approvals queue).
 */
class InterviewSessionService {
  /** Load the assignment + kit for a task, asserting the mentee owns it. */
  async _loadContext(taskId, menteeId) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');
    if (task.menteeId !== menteeId) throw new ForbiddenError('This interview is not assigned to you');

    const assignment = await models.InterviewAssignment.findOne({ where: { assignedTaskId: taskId } });
    if (!assignment) throw new NotFoundError('This task is not an interview');

    const kit = await models.InterviewKit.findByPk(assignment.kitId, {
      include: [{ model: models.InterviewQuestion, as: 'questions' }],
    });
    if (!kit) throw new NotFoundError('Interview kit not found');

    const questions = [...(kit.questions || [])].sort((a, b) => a.position - b.position);
    return { task, assignment, kit, questions };
  }

  /** Public candidate shape of a question — NEVER leaks the reference answer. */
  _publicQuestion(q) {
    return {
      id: q.id,
      position: q.position,
      kind: q.kind,
      prompt: q.prompt,
      timeLimitSeconds: q.timeLimitSeconds,
      points: q.points,
      required: q.required,
      codeLanguage: q.codeLanguage,
      starterCode: q.starterCode,
      // Mentor's own recording for this question (plays instead of TTS if present).
      promptAudioUrl: (q.config && q.config.promptAudioUrl) || null,
    };
  }

  /**
   * The candidate's view: kit meta + public questions + options + current attempt
   * state (whether they can start, resume an in-progress attempt, or are done).
   */
  async getForCandidate(taskId, menteeId) {
    const { task, assignment, kit, questions } = await this._loadContext(taskId, menteeId);

    // Interviewer identity: the mentor's kit config, defaulting the NAME to the
    // kit creator's own name (so it's "Meet <mentor>", not a generic persona).
    const ivSettings = (kit.settings && kit.settings.interviewer) || {};
    let defaultName = null;
    if (!ivSettings.name) {
      const creator = await models.User.findByPk(kit.createdBy, { attributes: ['firstName', 'lastName'] });
      if (creator) defaultName = creator.firstName || `${creator.firstName || ''} ${creator.lastName || ''}`.trim() || null;
    }
    const interviewer = {
      name: ivSettings.name || defaultName || 'Aria',
      voiceName: ivSettings.voiceName || null,
      pitch: typeof ivSettings.pitch === 'number' ? ivSettings.pitch : 1,
      rate: typeof ivSettings.rate === 'number' ? ivSettings.rate : 1,
    };

    const sessions = await models.InterviewSession.findAll({
      where: { assignedTaskId: taskId, menteeId },
      order: [['attempt_number', 'DESC']],
    });
    const taskOpen = !['cancelled', 'completed'].includes(task.status);
    const active = taskOpen ? (sessions.find((s) => s.status === 'in_progress') || null) : null;
    const submittedCount = sessions.filter((s) => s.status === 'submitted').length;
    const latestSubmitted = sessions.find((s) => s.status === 'submitted') || null;

    // A mentor-requested partial redo re-opens THIS session for just the flagged
    // questions — allowed regardless of the full-retake setting.
    const redoQuestionIds = ((active || latestSubmitted)?.meta?.redoQuestionIds || []).map(String);

    // Can they take it? Fresh if no attempts; resumable if one's in progress; a
    // redo is pending; otherwise only when retake is allowed.
    const canStart = !active && (submittedCount === 0 || assignment.allowRetake || redoQuestionIds.length > 0);

    let answers = [];
    if (active) {
      const rows = await models.InterviewAnswer.findAll({ where: { sessionId: active.id } });
      answers = rows.map((a) => ({
        questionId: a.questionId,
        transcript: a.transcript,
        audioUrl: a.audioUrl,
        code: a.code,
        answerText: a.answerText,
        timeSpentSeconds: a.timeSpentSeconds,
        startedAt: a.startedAt, // wall-clock anchor for resuming this question's timer
      }));
    }

    return {
      task: { id: task.id, status: task.status, dueDate: task.dueDate },
      kit: {
        id: kit.id,
        title: kit.title,
        description: kit.description,
        totalPoints: questions.reduce((s, q) => s + (q.points || 0), 0),
      },
      // Interviewer identity/voice for the candidate's TTS (name defaults to the
      // kit creator's name; pitch/rate/voice from the mentor's config).
      interviewer,
      options: {
        allowRetake: assignment.allowRetake,
        cameraRequired: assignment.cameraRequired,
        timingMode: assignment.timingMode,
        totalSeconds: assignment.totalSeconds,
      },
      questions: questions.map((q) => this._publicQuestion(q)),
      state: {
        canStart,
        activeSessionId: active ? active.id : null,
        attemptNumber: active ? active.attemptNumber : submittedCount + 1,
        submittedCount,
        savedAnswers: answers,
        // Resume metadata: where they were, and when the (total-mode) session began.
        currentPosition: active ? (active.currentPosition || 0) : 0,
        sessionStartedAt: active ? active.startedAt : null,
        // When non-empty, the mentor asked the mentee to redo ONLY these questions.
        redoQuestionIds,
      },
      // Server clock so the client can correct for local clock skew when computing
      // remaining time (all deadlines are wall-clock, server-authoritative).
      serverNow: new Date().toISOString(),
    };
  }

  /**
   * Stamp when the candidate first started a question (idempotent) and remember it
   * as the session's current position. The wall-clock deadline is this timestamp +
   * the question's limit, so a refresh/resume continues the real countdown instead
   * of restarting it. Returns the authoritative start + the server clock (for skew).
   */
  async startQuestion(sessionId, menteeId, questionId) {
    const session = await this._openSession(sessionId, menteeId);
    if (!questionId) throw new ValidationError('questionId is required');

    const question = await models.InterviewQuestion.findByPk(questionId);
    if (!question || question.kitId !== (await this._kitIdForSession(session))) {
      throw new ValidationError('That question is not part of this interview');
    }

    // A redo re-answers flagged questions with a FRESH per-question timer.
    const redo = (session.meta?.redoQuestionIds || []).map(String);
    const isRedo = redo.length > 0 && redo.includes(String(questionId));

    const [answer] = await models.InterviewAnswer.findOrCreate({
      where: { sessionId, questionId },
      defaults: {
        sessionId, questionId,
        position: question.position,
        kind: question.kind,
        promptSnapshot: question.prompt,
        pointsPossible: question.points,
        codeLanguage: question.kind === 'code' ? question.codeLanguage : null,
        startedAt: new Date(),
      },
    });
    // Only stamp the start once — resuming must NOT reset the clock — EXCEPT a redo,
    // which restarts that question's clock fresh.
    if (!answer.startedAt || isRedo) await answer.update({ startedAt: new Date() });
    // Advance the resume position forward-only (you can't go back to a question).
    if (question.position > (session.currentPosition || 0)) {
      await session.update({ currentPosition: question.position });
    }
    return { startedAt: answer.startedAt, serverNow: new Date().toISOString() };
  }

  /** Start a fresh attempt or resume the in-progress one. Enforces retake rules. */
  async startOrResume(taskId, menteeId) {
    const { task, assignment } = await this._loadContext(taskId, menteeId);
    if (task.status === 'cancelled') {
      throw new ValidationError('This interview task has been cancelled.');
    }

    const existing = await models.InterviewSession.findOne({
      where: { assignedTaskId: taskId, menteeId, status: 'in_progress' },
    });
    if (existing) return this._sessionShape(existing);

    // Mentor-requested partial redo: re-open the SUBMITTED session (keeping every
    // other answer, the proctor log, and the attempt number) rather than starting a
    // brand-new attempt. This is independent of the full-retake setting.
    const latestSubmitted = await models.InterviewSession.findOne({
      where: { assignedTaskId: taskId, menteeId, status: 'submitted' },
      order: [['attempt_number', 'DESC']],
    });
    if (latestSubmitted && (latestSubmitted.meta?.redoQuestionIds || []).length > 0) {
      await latestSubmitted.update({ status: 'in_progress' });
      const task = await models.AssignedTask.findByPk(taskId);
      if (task) await task.update({ status: 'in_progress' });
      return this._sessionShape(latestSubmitted);
    }

    const submittedCount = await models.InterviewSession.count({
      where: { assignedTaskId: taskId, menteeId, status: 'submitted' },
    });
    if (submittedCount > 0 && !assignment.allowRetake) {
      throw new ConflictError('You have already completed this interview.');
    }

    const session = await models.InterviewSession.create({
      assignedTaskId: taskId,
      interviewAssignmentId: assignment.id,
      menteeId,
      attemptNumber: submittedCount + 1,
      status: 'in_progress',
      startedAt: new Date(),
    });

    // Mark the task in-progress the first time they begin.
    await models.AssignedTask.update(
      { status: 'in_progress', startedAt: sequelize.literal('COALESCE(started_at, NOW())') },
      { where: { id: taskId, status: { [Op.in]: ['assigned', 'not_started'] } } }
    );

    return this._sessionShape(session);
  }

  _sessionShape(s) {
    return { id: s.id, attemptNumber: s.attemptNumber, status: s.status, startedAt: s.startedAt };
  }

  /** Assert the session belongs to this mentee and is still open. */
  async _openSession(sessionId, menteeId) {
    const session = await models.InterviewSession.findByPk(sessionId);
    if (!session) throw new NotFoundError('Interview session not found');
    if (session.menteeId !== menteeId) throw new ForbiddenError('This session is not yours');
    if (session.status !== 'in_progress') throw new ConflictError('This interview has already been submitted.');
    return session;
  }

  /** Assert ownership only (any status). Used for late-arriving background audio
   *  uploads that may land just after the candidate hit submit. */
  async _ownedSession(sessionId, menteeId) {
    const session = await models.InterviewSession.findByPk(sessionId);
    if (!session) throw new NotFoundError('Interview session not found');
    if (session.menteeId !== menteeId) throw new ForbiddenError('This session is not yours');
    return session;
  }

  /**
   * Upsert a single answer (autosave). Snapshots the question's prompt/kind/points
   * on first write so the candidate's record survives later kit edits.
   */
  async saveAnswer(sessionId, menteeId, questionId, payload = {}) {
    const session = await this._openSession(sessionId, menteeId);
    if (!questionId) throw new ValidationError('questionId is required');

    // During a mentor-requested redo, only the flagged questions may be re-answered.
    const redo = (session.meta?.redoQuestionIds || []).map(String);
    if (redo.length > 0 && !redo.includes(String(questionId))) {
      throw new ForbiddenError('This question is not part of the requested redo.');
    }

    const question = await models.InterviewQuestion.findByPk(questionId);
    if (!question || question.kitId !== (await this._kitIdForSession(session))) {
      throw new ValidationError('That question is not part of this interview');
    }

    const fields = {
      position: question.position,
      kind: question.kind,
      promptSnapshot: question.prompt,
      pointsPossible: question.points,
      codeLanguage: question.kind === 'code' ? question.codeLanguage : null,
    };
    if (payload.transcript !== undefined) fields.transcript = payload.transcript ? String(payload.transcript) : null;
    if (payload.code !== undefined) fields.code = payload.code ? String(payload.code) : null;
    if (payload.answerText !== undefined) fields.answerText = payload.answerText ? String(payload.answerText) : null;
    if (payload.timeSpentSeconds !== undefined) {
      const n = Number.parseInt(payload.timeSpentSeconds, 10);
      if (Number.isFinite(n) && n >= 0) fields.timeSpentSeconds = n;
    }

    const [answer] = await models.InterviewAnswer.findOrCreate({
      where: { sessionId, questionId },
      defaults: { sessionId, questionId, ...fields },
    });
    // Safety net: never let a stray empty autosave (a race, a stale flush) wipe a
    // previously saved answer. Interview answers are one-shot — a blank incoming
    // value over existing content is almost always noise, not intentional deletion.
    for (const f of ['transcript', 'code', 'answerText']) {
      if ((fields[f] === null || fields[f] === '') && answer[f]) delete fields[f];
    }
    // findOrCreate doesn't update an existing row — apply the patch.
    await answer.update(fields);
    return { saved: true, questionId };
  }

  async _kitIdForSession(session) {
    const assignment = await models.InterviewAssignment.findByPk(session.interviewAssignmentId, { attributes: ['kitId'] });
    return assignment ? assignment.kitId : null;
  }

  /** Upload a recorded audio clip for one question and store its URL. Accepts a
   *  just-submitted session too, so a background/retry upload isn't lost. */
  async attachAudio(sessionId, menteeId, questionId, file) {
    const session = await this._ownedSession(sessionId, menteeId);
    if (!questionId) throw new ValidationError('questionId is required');
    if (!file || !file.buffer) throw new ValidationError('No audio file received');

    const question = await models.InterviewQuestion.findByPk(questionId);
    if (!question) throw new ValidationError('That question is not part of this interview');
    // Audio only belongs to a voice question. A clip landing on a code/text question
    // is always a client misattribution (a stale/shared recorder ref) — reject it
    // rather than corrupt that question's row with someone else's recording.
    if (question.kind !== 'voice') throw new ValidationError('Audio can only be attached to a voice question');

    // Audio goes under Cloudinary's 'video' resource type (it handles audio there).
    // Log the real reason on failure — otherwise the client only sees a generic
    // "audio failed" and we can never tell config from network from size.
    let result;
    try {
      result = await uploadToCloudinary(file.buffer, 'pathment/interviews', 'video');
    } catch (err) {
      console.error('[interview] audio upload to Cloudinary failed:', {
        message: err?.message, httpCode: err?.http_code, bytes: file.buffer?.length,
      });
      throw new ValidationError('Audio upload failed. Please check your connection and try again.');
    }

    const fields = {
      position: question.position,
      kind: question.kind,
      promptSnapshot: question.prompt,
      pointsPossible: question.points,
      audioUrl: result.secure_url,
      audioPublicId: result.public_id,
    };
    const [answer] = await models.InterviewAnswer.findOrCreate({
      where: { sessionId, questionId },
      defaults: { sessionId, questionId, ...fields },
    });
    await answer.update(fields);
    return { audioUrl: result.secure_url, questionId };
  }

  /** Append proctor events (focus-loss, fullscreen-exit, paste, snapshot refs). */
  async logProctorEvents(sessionId, menteeId, events = []) {
    const session = await this._openSession(sessionId, menteeId);
    if (!Array.isArray(events) || !events.length) return { logged: 0 };
    const clean = events
      .filter((e) => e && typeof e.type === 'string')
      .map((e) => ({ type: e.type, at: e.at || new Date().toISOString(), meta: e.meta || {} }));
    await session.update({ proctorLog: [...(session.proctorLog || []), ...clean] });
    return { logged: clean.length };
  }

  /**
   * Upload a webcam proctor snapshot and record it in the proctor log as a
   * `snapshot` event carrying its URL. Called on an interval (and on suspicious
   * events) while the camera is required, so the mentor can eyeball presence.
   */
  async attachSnapshot(sessionId, menteeId, file, questionId = null) {
    const session = await this._openSession(sessionId, menteeId);
    if (!file || !file.buffer) throw new ValidationError('No snapshot received');
    const result = await uploadToCloudinary(file.buffer, 'pathment/interviews/snapshots', 'image');
    const meta = { url: result.secure_url, publicId: result.public_id };
    if (questionId) meta.questionId = String(questionId);
    const event = { type: 'snapshot', at: new Date().toISOString(), meta };
    await session.update({ proctorLog: [...(session.proctorLog || []), event] });
    return { url: result.secure_url };
  }

  // ── Mentor review (Phase 4) — mentor is the source of truth ──────────────────

  /** Assert the reviewer can act on this task (lead / co-mentor / cover). */
  async _assertReviewer(mentorId, task) {
    if (!(await authzService.canActOnTask(mentorId, task, PERMISSIONS.TASK_REVIEW))) {
      throw new ForbiddenError('You do not have permission to review this interview');
    }
  }

  /**
   * The mentor's review payload for an interview task: kit questions WITH their
   * reference answers, the candidate's latest submitted attempt (transcript /
   * audio / code + per-answer grades), the proctor log split into snapshots +
   * flags, and totals. Read-access is also granted to the owning mentee (so they
   * can see "what he said"); reviewer power is required for anyone else.
   */
  async getForReview(taskId, requesterId) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');
    const isOwnerMentee = task.menteeId === requesterId;
    if (!isOwnerMentee) await this._assertReviewer(requesterId, task);

    const assignment = await models.InterviewAssignment.findOne({ where: { assignedTaskId: taskId } });
    if (!assignment) throw new NotFoundError('This task is not an interview');

    const kit = await models.InterviewKit.findByPk(assignment.kitId, {
      include: [{ model: models.InterviewQuestion, as: 'questions' }],
    });
    const questions = [...((kit && kit.questions) || [])].sort((a, b) => a.position - b.position);

    // Latest submitted attempt (fall back to the most recent session).
    const sessions = await models.InterviewSession.findAll({
      where: { assignedTaskId: taskId },
      order: [['attempt_number', 'DESC']],
      include: [
        { model: models.InterviewAnswer, as: 'answers' },
        { model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'] },
      ],
    });
    const session = sessions.find((s) => s.status === 'submitted') || sessions[0] || null;
    const answers = session ? [...(session.answers || [])].sort((a, b) => a.position - b.position) : [];
    const answerByQ = new Map(answers.map((a) => [a.questionId, a]));

    const proctorLog = session ? (session.proctorLog || []) : [];
    // Bucket each snapshot to the question that was active when it was taken:
    // prefer an explicit questionId captured at snapshot time (newer interviews),
    // else fall back to the answer whose `startedAt` most recently preceded it —
    // so older interviews also get per-question images retroactively.
    const answerStarts = answers
      .filter((a) => a.startedAt)
      .map((a) => ({ questionId: a.questionId, t: new Date(a.startedAt).getTime() }))
      .sort((x, y) => x.t - y.t);
    const bucketQuestion = (atIso) => {
      const t = new Date(atIso).getTime();
      let qid = null;
      for (const s of answerStarts) { if (s.t <= t) qid = s.questionId; else break; }
      return qid;
    };
    const snapshots = proctorLog.filter((e) => e.type === 'snapshot').map((e) => ({
      url: e.meta?.url,
      at: e.at,
      questionId: e.meta?.questionId || bucketQuestion(e.at),
    }));
    const flags = proctorLog.filter((e) => e.type !== 'snapshot');
    const flagCounts = flags.reduce((m, e) => { m[e.type] = (m[e.type] || 0) + 1; return m; }, {});

    const items = questions.map((q) => {
      const a = answerByQ.get(q.id);
      return {
        snapshots: isOwnerMentee ? [] : snapshots.filter((s) => s.questionId === q.id),
        questionId: q.id,
        position: q.position,
        kind: q.kind,
        prompt: q.prompt,
        points: q.points,
        codeLanguage: q.codeLanguage,
        referenceAnswer: isOwnerMentee ? null : (q.referenceAnswer || null), // hidden from the mentee
        answer: a ? {
          transcript: a.transcript,
          audioUrl: a.audioUrl,
          code: a.code,
          answerText: a.answerText,
          timeSpentSeconds: a.timeSpentSeconds,
          pointsAwarded: a.pointsAwarded,
          scoreNote: a.scoreNote,
          aiDraft: isOwnerMentee ? null : (a.aiDraft || null),
        } : null,
      };
    });

    const totalPossible = questions.reduce((s, q) => s + (q.points || 0), 0);
    const totalAwarded = items.reduce((s, it) => s + (Number(it.answer?.pointsAwarded) || 0), 0);
    const gradedCount = items.filter((it) => it.answer && it.answer.pointsAwarded != null).length;

    return {
      task: { id: task.id, status: task.status, pointsAwarded: task.pointsAwarded, menteeId: task.menteeId },
      kit: { id: kit?.id, title: kit?.title, description: kit?.description },
      options: {
        aiGradingEnabled: assignment.aiGradingEnabled,
        allowRetake: assignment.allowRetake,
        cameraRequired: assignment.cameraRequired,
      },
      session: session ? {
        id: session.id,
        status: session.status,
        attemptNumber: session.attemptNumber,
        startedAt: session.startedAt,
        submittedAt: session.submittedAt,
        mentee: session.mentee ? {
          id: session.mentee.id,
          name: `${session.mentee.firstName} ${session.mentee.lastName}`.trim(),
          avatarUrl: session.mentee.profilePictureUrl,
        } : null,
      } : null,
      // Proctoring (webcam snapshots + behavior flags) is reviewer-only — never
      // shown back to the candidate being proctored.
      proctor: isOwnerMentee ? { snapshots: [], flags: [], flagCounts: {} } : { snapshots, flags, flagCounts },
      // Mentor's manual follow-up flag (hidden from the owning mentee).
      flag: isOwnerMentee ? null : (session?.meta?.flag?.flagged ? session.meta.flag : null),
      items,
      totals: { totalPossible, totalAwarded, gradedCount, questionCount: questions.length },
      canReview: !isOwnerMentee && task.status !== 'completed',
    };
  }

  /** Save a per-answer grade (mentor). Creates the answer row if the mentee skipped it. */
  async gradeAnswer(taskId, mentorId, questionId, { pointsAwarded, scoreNote } = {}) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');
    await this._assertReviewer(mentorId, task);

    const session = await this._latestSubmittedSession(taskId);
    if (!session) throw new NotFoundError('No submitted interview to grade');

    const question = await models.InterviewQuestion.findByPk(questionId);
    if (!question) throw new ValidationError('Unknown question');

    const patch = {};
    if (pointsAwarded !== undefined) {
      const n = Number.parseInt(pointsAwarded, 10);
      patch.pointsAwarded = Number.isFinite(n) ? Math.max(0, Math.min(question.points, n)) : null;
    }
    if (scoreNote !== undefined) patch.scoreNote = scoreNote ? String(scoreNote) : null;

    const [answer] = await models.InterviewAnswer.findOrCreate({
      where: { sessionId: session.id, questionId },
      defaults: {
        sessionId: session.id, questionId, position: question.position,
        kind: question.kind, promptSnapshot: question.prompt, pointsPossible: question.points, ...patch,
      },
    });
    await answer.update(patch);
    return { questionId, pointsAwarded: answer.pointsAwarded, scoreNote: answer.scoreNote };
  }

  /** Delete the proctor snapshot images only (mentor). Strips them from the log
   *  and best-effort removes the files from Cloudinary; behavior flags are kept. */
  async deleteSnapshots(taskId, mentorId) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');
    await this._assertReviewer(mentorId, task);

    const session = await this._latestSubmittedSession(taskId);
    if (!session) throw new NotFoundError('No interview session found');

    const log = session.proctorLog || [];
    const snapshots = log.filter((e) => e.type === 'snapshot');
    const kept = log.filter((e) => e.type !== 'snapshot');

    const { deleteFromCloudinary } = require('../utils/cloudinaryUpload');
    await Promise.all(snapshots.map(async (e) => {
      const pid = e.meta?.publicId;
      if (pid) { try { await deleteFromCloudinary(pid, 'image'); } catch (err) { console.error('[interview] snapshot delete failed:', err?.message); } }
    }));

    await session.update({ proctorLog: kept });
    return { deleted: snapshots.length };
  }

  /** Flag (or clear the flag on) an interview for follow-up (mentor). Stored on
   *  the session meta so it survives and is visible on the review. */
  async setFlag(taskId, mentorId, { flagged, reason } = {}) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');
    await this._assertReviewer(mentorId, task);

    const session = await this._latestSubmittedSession(taskId);
    if (!session) throw new NotFoundError('No interview session found');

    const flag = flagged
      ? { flagged: true, reason: reason ? String(reason) : null, by: mentorId, at: new Date().toISOString() }
      : { flagged: false };
    await session.update({ meta: { ...(session.meta || {}), flag } });
    return flag;
  }

  async _latestSubmittedSession(taskId) {
    const sessions = await models.InterviewSession.findAll({
      where: { assignedTaskId: taskId },
      order: [['attempt_number', 'DESC']],
    });
    return sessions.find((s) => s.status === 'submitted') || sessions[0] || null;
  }

  /**
   * Mentor asks the mentee to redo ONLY the selected questions (e.g. answers that
   * came back missing or unclear). Flags them on the session and sends the task
   * back through the normal request-changes path (status + feedback + notification).
   * The mentee then re-answers just those questions in the runner, in place —
   * independent of the full-retake setting.
   */
  async requestRedo(taskId, mentorId, { questionIds = [], note } = {}) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');
    await this._assertReviewer(mentorId, task);

    const requested = [...new Set((questionIds || []).map(String))].filter(Boolean);
    if (requested.length === 0) throw new ValidationError('Select at least one question to redo.');

    const session = await this._latestSubmittedSession(taskId);
    if (!session) throw new NotFoundError('No submitted interview to send back');
    const submissionId = session.meta?.submissionId;
    if (!submissionId) throw new ValidationError('This interview has no submission to send back');

    // Only keep ids that are genuinely part of this interview's kit.
    const kitId = await this._kitIdForSession(session);
    const valid = await models.InterviewQuestion.findAll({ where: { id: requested, kitId }, attributes: ['id'] });
    const validIds = valid.map((q) => String(q.id));
    if (validIds.length === 0) throw new ValidationError('None of the selected questions are part of this interview.');

    const n = validIds.length;
    const redoNote = note || `Please redo ${n} question${n === 1 ? '' : 's'} — the answer${n === 1 ? ' was' : 's were'} missing or unclear.`;
    await session.update({ meta: { ...(session.meta || {}), redoQuestionIds: validIds, redoNote } });

    // Send the task back WITHOUT the shared review path — a redo has no star
    // rating (which reviewSubmission requires) and shouldn't finalize a score.
    await models.TaskSubmission.update({ status: 'revision_needed' }, { where: { id: submissionId } });
    await task.update({ status: 'revision_needed', revisionCount: (task.revisionCount || 0) + 1 });

    try {
      const reviewer = await models.User.findByPk(mentorId, { attributes: ['firstName', 'lastName'] });
      const who = reviewer ? `${reviewer.firstName} ${reviewer.lastName}`.trim() : 'Your mentor';
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.SUBMISSION_REVIEWED,
        recipients: [{ userId: task.menteeId }],
        payload: {
          title: `${who} asked you to redo ${n} question${n === 1 ? '' : 's'}`,
          message: redoNote,
          actionUrl: `/mentee/interviews/${task.id}`,
          actionLabel: 'Redo questions',
          relatedEntityType: 'task_submission',
          relatedEntityId: submissionId,
        },
        dedupe: { relatedEntityType: 'interview_redo', relatedEntityId: submissionId },
      });
    } catch (e) {
      console.error('interview redo notification failed:', e.message);
    }

    return { redoQuestionIds: validIds, count: n };
  }

  /**
   * AI draft grade for one answer (optional assist, gated on the assignment's
   * aiGradingEnabled + a configured BYO key). Suggests a score + short note by
   * comparing the candidate's answer to the reference answer. Stored on the
   * answer; the mentor still decides.
   */
  async aiDraftAnswer(taskId, mentorId, questionId) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');
    await this._assertReviewer(mentorId, task);

    // AI draft is mentor-initiated and runs on the mentor's OWN key, so it's
    // available whenever this is a real interview — not gated to the assign-time
    // toggle (that toggle only controls whether it's suggested up front).
    const assignment = await models.InterviewAssignment.findOne({ where: { assignedTaskId: taskId } });
    if (!assignment) throw new NotFoundError('This task is not an interview');

    const question = await models.InterviewQuestion.findByPk(questionId);
    if (!question) throw new ValidationError('Unknown question');
    const session = await this._latestSubmittedSession(taskId);
    if (!session) throw new NotFoundError('No submitted interview to grade');
    const answer = await models.InterviewAnswer.findOne({ where: { sessionId: session.id, questionId } });

    const groqService = require('./groqService');

    // For a voice answer, re-transcribe the actual recording with Whisper — the
    // browser's live STT frequently garbles accent/pronunciation, and grading that
    // garbled text is unfair. Fall back to the browser transcript if unavailable.
    let aiTranscript = null;
    if (question.kind === 'voice' && answer?.audioUrl) {
      try {
        aiTranscript = await groqService.transcribeAudio({ audioUrl: answer.audioUrl, userId: mentorId, feature: 'feedback' });
      } catch (e) {
        console.error('[interview] Whisper transcription failed:', e.message);
      }
    }

    const spoken = aiTranscript || answer?.transcript;
    const candidate = [spoken, answer?.answerText, answer?.code].filter(Boolean).join('\n\n') || '(no answer given)';
    const raw = await groqService.generateText({
      feature: 'feedback',
      userId: mentorId,
      temperature: 0.2,
      maxTokens: 280,
      system: [
        'You are a fair, experienced technical interviewer grading ONE answer.',
        `Score the candidate from 0 to 100 for this question (worth ${question.points} points), using the reference rubric if one is given.`,
        'Calibrate honestly: 85–100 = clearly above bar, 60–84 = meets the bar, 40–59 = partial or shaky, below 40 = incorrect or a red flag. Give partial credit — a good-but-imperfect answer is not a low score.',
        'The answer may be an automatic voice transcription, so overlook spelling, grammar and transcription noise — judge the underlying understanding, not the wording.',
        'Reply with STRICT JSON only: {"score": <integer 0-100>, "note": "<one or two sentences: what was right and what was missing>"}. No text outside the JSON.',
      ].join(' '),
      prompt: `Question:\n${question.prompt}\n\nReference answer / rubric:\n${question.referenceAnswer || '(none provided — judge on correctness and clarity)'}\n\nCandidate answer:\n${candidate}`,
    });

    let parsed = { score: null, note: raw };
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch { /* keep raw as note */ }

    const pct = Math.max(0, Math.min(100, Number(parsed.score) || 0));
    const suggestedPoints = Math.round((pct / 100) * question.points);
    const aiDraft = { score: pct, suggestedPoints, note: parsed.note || raw, transcript: aiTranscript || null, at: new Date().toISOString() };

    const [row] = await models.InterviewAnswer.findOrCreate({
      where: { sessionId: session.id, questionId },
      defaults: {
        sessionId: session.id, questionId, position: question.position,
        kind: question.kind, promptSnapshot: question.prompt, pointsPossible: question.points, aiDraft,
      },
    });
    await row.update({ aiDraft });
    return aiDraft;
  }

  /**
   * Grade EVERY answer in one pass so the mentor doesn't have to click each
   * question. Voice answers are re-transcribed with Whisper (reusing any
   * transcript already cached on the answer so re-runs are free), then the
   * questions are graded in context-sized chunks — one AI request per chunk
   * instead of one per question. Returns the per-question suggested points/notes;
   * the mentor still sets the final score (the client applies these as drafts).
   */
  async aiDraftAll(taskId, mentorId, { questionIds } = {}) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');
    await this._assertReviewer(mentorId, task);

    const assignment = await models.InterviewAssignment.findOne({ where: { assignedTaskId: taskId } });
    if (!assignment) throw new NotFoundError('This task is not an interview');

    const kit = await models.InterviewKit.findByPk(assignment.kitId, {
      include: [{ model: models.InterviewQuestion, as: 'questions' }],
    });
    let questions = [...((kit && kit.questions) || [])].sort((a, b) => a.position - b.position);
    // Grade only a requested slice when given — the client pages through the
    // interview in small chunks so no single request has to transcribe + grade
    // dozens of answers (and blow the HTTP timeout).
    if (Array.isArray(questionIds) && questionIds.length > 0) {
      const want = new Set(questionIds.map(String));
      questions = questions.filter((q) => want.has(String(q.id)));
    }
    if (questions.length === 0) return { drafts: [], graded: 0 };

    const session = await this._latestSubmittedSession(taskId);
    if (!session) throw new NotFoundError('No submitted interview to grade');
    const answers = await models.InterviewAnswer.findAll({ where: { sessionId: session.id } });
    const answerByQ = new Map(answers.map((a) => [a.questionId, a]));

    const groqService = require('./groqService');

    // 1) Transcribe voice answers with Whisper, reusing a cached transcript when we
    //    already have one. Best-effort per answer — a failure just falls back to the
    //    browser transcript for that one question.
    const transcripts = new Map(); // questionId -> transcript text
    await Promise.all(questions
      .filter((q) => q.kind === 'voice')
      .map(async (q) => {
        const a = answerByQ.get(q.id);
        if (!a || !a.audioUrl) return;
        if (a.aiDraft && a.aiDraft.transcript) { transcripts.set(q.id, a.aiDraft.transcript); return; }
        try {
          const t = await groqService.transcribeAudio({ audioUrl: a.audioUrl, userId: mentorId, feature: 'feedback' });
          if (t) transcripts.set(q.id, t);
        } catch (e) {
          console.error('[interview] batch Whisper failed:', e.message);
        }
      }));

    // 2) Build the gradeable payload for each question.
    const gradeItems = questions.map((q) => {
      const a = answerByQ.get(q.id);
      const spoken = transcripts.get(q.id) || a?.transcript || null;
      const candidate = [spoken, a?.answerText, a?.code].filter(Boolean).join('\n\n') || '(no answer given)';
      return { q, a, candidate, transcript: transcripts.get(q.id) || null };
    });

    // 3) Grade in context-sized chunks — one AI call per chunk, JSON array back.
    const CHUNK = 8;
    const scoreByQ = new Map(); // questionId -> { score, note }
    for (let i = 0; i < gradeItems.length; i += CHUNK) {
      const batch = gradeItems.slice(i, i + CHUNK);
      const body = batch.map((it, j) => (
        `[Q${i + j + 1}] id: ${it.q.id} · worth ${it.q.points} points\n` +
        `Question: ${it.q.prompt}\n` +
        `Reference / rubric: ${it.q.referenceAnswer || '(none — judge on correctness and clarity)'}\n` +
        `Candidate answer: ${it.candidate}`
      )).join('\n\n---\n\n');
      let raw;
      try {
        raw = await groqService.generateText({
          feature: 'feedback',
          userId: mentorId,
          temperature: 0.2,
          maxTokens: Math.min(1800, 140 * batch.length + 120),
          system: [
            'You are a fair, experienced technical interviewer grading several interview answers at once.',
            'Each block gives a question, its point value, an optional reference rubric, and the candidate answer (which may be an automatic voice transcription — overlook spelling, grammar and transcription noise and judge the underlying understanding).',
            'Score EACH answer 0–100 against ITS OWN rubric. Calibrate honestly: 85–100 = clearly above bar, 60–84 = meets the bar, 40–59 = partial or shaky, below 40 = incorrect or a red flag. Give partial credit.',
            'Reply with STRICT JSON only: an array like [{"id":"<the exact id shown>","score":<integer 0-100>,"note":"<one or two sentences: what was right and what was missing>"}]. One object per question, no text outside the JSON.',
          ].join(' '),
          prompt: body,
        });
      } catch (e) {
        console.error('[interview] batch grade chunk failed:', e.message);
        continue;
      }
      try {
        const match = raw.match(/\[[\s\S]*\]/);
        const arr = match ? JSON.parse(match[0]) : [];
        for (const r of arr) {
          if (r && r.id) scoreByQ.set(String(r.id), { score: r.score, note: r.note });
        }
      } catch { /* skip an unparseable chunk; other chunks still land */ }
    }

    // 4) Persist a draft on each answer and return the suggestions.
    const at = new Date().toISOString();
    const drafts = [];
    for (const it of gradeItems) {
      const r = scoreByQ.get(String(it.q.id));
      if (!r && !it.transcript) continue; // nothing new for this question
      const pct = Math.max(0, Math.min(100, Number(r?.score) || 0));
      const suggestedPoints = Math.round((pct / 100) * it.q.points);
      const aiDraft = { score: pct, suggestedPoints, note: r?.note || null, transcript: it.transcript, at };
      const [row] = await models.InterviewAnswer.findOrCreate({
        where: { sessionId: session.id, questionId: it.q.id },
        defaults: {
          sessionId: session.id, questionId: it.q.id, position: it.q.position,
          kind: it.q.kind, promptSnapshot: it.q.prompt, pointsPossible: it.q.points, aiDraft,
        },
      });
      await row.update({ aiDraft });
      drafts.push({ questionId: it.q.id, suggestedPoints, note: aiDraft.note, score: pct });
    }

    return { drafts, graded: drafts.length };
  }

  /**
   * Finalize the review: sum the per-answer scores and complete the task through
   * the shared review path (so points, gamification, the mentee notification and
   * the Approvals "reviewed" tab all behave exactly like a normal submission). The
   * interview score is applied as a percentage of the task's standard points, so it
   * fits the difficulty-based points economy.
   */
  async finalizeReview(taskId, mentorId, { overallNote } = {}) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');
    await this._assertReviewer(mentorId, task);

    const session = await this._latestSubmittedSession(taskId);
    if (!session) throw new NotFoundError('No submitted interview to review');
    const submissionId = session.meta?.submissionId;
    if (!submissionId) throw new ValidationError('This interview has no submission to review');

    const answers = await models.InterviewAnswer.findAll({ where: { sessionId: session.id } });
    const totalPossible = answers.reduce((s, a) => s + (a.pointsPossible || 0), 0);
    const totalAwarded = answers.reduce((s, a) => s + (Number(a.pointsAwarded) || 0), 0);
    const pct = totalPossible > 0 ? (totalAwarded / totalPossible) * 100 : 0;

    const submissionService = require('./submissionService');
    await submissionService.reviewSubmission(submissionId, mentorId, {
      decision: 'approved',
      isApproved: true,
      rating: Math.round((pct / 100) * 5 * 100) / 100, // 0–5, for the existing rating field
      feedbackText: overallNote || `Interview reviewed — ${totalAwarded}/${totalPossible} points.`,
      pointsPercent: pct,
    });

    return { totalAwarded, totalPossible, pointsPercent: Math.round(pct) };
  }

  /**
   * Finalize the attempt: mark the session submitted, move the task to 'submitted',
   * and drop a TaskSubmission marker so it appears in the mentor's Approvals queue
   * (the interview review UI in Phase 4 reads the session's answers).
   */
  async submit(sessionId, menteeId) {
    const session = await this._openSession(sessionId, menteeId);
    const task = await models.AssignedTask.findByPk(session.assignedTaskId);
    if (!task) throw new NotFoundError('Task not found');

    const answeredCount = await models.InterviewAnswer.count({ where: { sessionId } });
    const redoIds = (session.meta?.redoQuestionIds || []);
    const wasRedo = redoIds.length > 0;

    return sequelize.transaction(async (transaction) => {
      await session.update({ status: 'submitted', submittedAt: new Date() }, { transaction });

      // Next submission version for this assignment (mirrors submissionService).
      const last = await models.TaskSubmission.findOne({
        where: { assignedTaskId: task.id },
        order: [['version', 'DESC']],
        transaction,
      });
      const version = (last?.version || 0) + 1;
      const isLate = task.dueDate ? new Date() > new Date(task.dueDate) : false;

      const submission = await models.TaskSubmission.create({
        assignedTaskId: task.id,
        version,
        submissionText: wasRedo
          ? `Interview redo submitted — ${redoIds.length} question${redoIds.length === 1 ? '' : 's'} re-answered.`
          : `Interview completed — ${answeredCount} answer${answeredCount === 1 ? '' : 's'} (attempt ${session.attemptNumber}).`,
        submissionUrls: [],
        status: 'pending',
        submittedAt: new Date(),
      }, { transaction });

      await task.update({
        status: 'submitted',
        submittedAt: new Date(),
        currentSubmissionVersion: version,
        isLate,
      }, { transaction });

      // Persist the session id on the submission meta-less way: store it via meta
      // on the session already; the reviewer resolves the session by task.
      // Clear the redo request now that it's been re-answered and re-submitted.
      await session.update({ meta: { ...(session.meta || {}), submissionId: submission.id, redoQuestionIds: [] } }, { transaction });

      return { submissionId: submission.id, sessionId: session.id, version };
    }).then(async (out) => {
      // Notify the mentor — same deep link as normal submissions (Approvals + drawer).
      try {
        const submitter = await models.User.findByPk(menteeId, { attributes: ['firstName', 'lastName'] });
        const name = submitter ? `${submitter.firstName} ${submitter.lastName}`.trim() : 'A mentee';
        await notificationOrchestrator.dispatch({
          eventKey: NOTIFICATION_EVENTS.TASK_SUBMITTED,
          recipients: [{ userId: task.mentorId }],
          payload: {
            title: `${name} completed an interview`,
            message: `${name} finished the interview “${task.titleOverride || 'interview'}”. Review it when you can.`,
            actionUrl: `/mentor/approvals?task=${task.id}`,
            actionLabel: 'Review interview',
            relatedEntityType: 'task_submission',
            relatedEntityId: out.submissionId,
          },
          dedupe: { relatedEntityType: 'interview_submitted', relatedEntityId: out.submissionId },
        });
      } catch (e) {
        console.error('interview submit notification failed:', e.message);
      }
      return out;
    });
  }

  /**
   * Drop in-progress attempts for a task (e.g. mentor cancelled/unassigned). Submitted
   * attempts are preserved for review/history.
   */
  async abandonInProgressForTask(taskId) {
    await models.InterviewSession.destroy({
      where: { assignedTaskId: taskId, status: 'in_progress' },
    });
  }

  /** Mentor ends a live attempt without deleting submitted history. */
  async abandonActiveForMentor(taskId, userId) {
    await this.getAssignmentForMentor(taskId, userId);
    await this.abandonInProgressForTask(taskId);
    return { abandoned: true };
  }

  /** Mentor view of per-assignment options + whether a session is live. */
  async getAssignmentForMentor(taskId, userId) {
    const task = await models.AssignedTask.findByPk(taskId, {
      include: [{ model: models.RoadmapTask, as: 'roadmapTask', attributes: ['type'] }],
    });
    if (!task) throw new NotFoundError('Task not found');
    if (!(await authzService.canActOnTask(userId, task, PERMISSIONS.TASK_ASSIGN))) {
      throw new ForbiddenError('You do not have permission to manage this interview');
    }

    const assignment = await models.InterviewAssignment.findOne({ where: { assignedTaskId: taskId } });
    if (!assignment) throw new NotFoundError('This task is not an interview');

    const activeSession = await models.InterviewSession.findOne({
      where: { assignedTaskId: taskId, status: 'in_progress' },
      attributes: ['id', 'startedAt', 'attemptNumber'],
    });

    return {
      taskStatus: task.status,
      options: {
        timingMode: assignment.timingMode,
        totalSeconds: assignment.totalSeconds,
        allowRetake: assignment.allowRetake,
        cameraRequired: assignment.cameraRequired,
      },
      activeSession: activeSession ? {
        id: activeSession.id,
        startedAt: activeSession.startedAt,
        attemptNumber: activeSession.attemptNumber,
      } : null,
    };
  }

  /** Mentor adjusts timing on an assignment that hasn't been submitted yet. */
  async updateAssignmentForMentor(taskId, userId, { timingMode, totalSeconds } = {}) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');
    if (!(await authzService.canActOnTask(userId, task, PERMISSIONS.TASK_ASSIGN))) {
      throw new ForbiddenError('You do not have permission to manage this interview');
    }
    if (['submitted', 'completed'].includes(task.status)) {
      throw new ValidationError('Cannot change interview timing after the mentee has submitted');
    }

    const assignment = await models.InterviewAssignment.findOne({ where: { assignedTaskId: taskId } });
    if (!assignment) throw new NotFoundError('This task is not an interview');

    const TIMING_MODES = ['per_question', 'total'];
    const updates = {};
    if (timingMode !== undefined) {
      if (!TIMING_MODES.includes(timingMode)) throw new ValidationError('Invalid timing mode');
      updates.timingMode = timingMode;
    }
    const mode = updates.timingMode || assignment.timingMode;
    if (totalSeconds !== undefined) {
      const n = Number.parseInt(totalSeconds, 10);
      updates.totalSeconds = mode === 'total' && Number.isFinite(n) && n > 0 ? n : null;
    } else if (updates.timingMode === 'per_question') {
      updates.totalSeconds = null;
    }

    if (Object.keys(updates).length === 0) {
      throw new ValidationError('No interview options to update');
    }

    await assignment.update(updates);
    return this.getAssignmentForMentor(taskId, userId);
  }
}

module.exports = new InterviewSessionService();
