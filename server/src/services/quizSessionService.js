const { models, sequelize } = require('../db');
const { Op } = require('sequelize');
const { NotFoundError, ForbiddenError, ValidationError, ConflictError } = require('../utils/errors/errorTypes');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const authzService = require('./authzService');
const { PERMISSIONS } = require('../config/permissions');

/**
 * QuizSessionService — the candidate runner + auto-grading + mentor review for
 * `quiz` tasks. The mentee takes the quiz; objective answers grade instantly on
 * submit. If the assignment is 'auto' the score finalizes immediately (points +
 * gamification), otherwise it lands in Approvals for the mentor to confirm/adjust.
 */
class QuizSessionService {
  // ── Grading (pure) ───────────────────────────────────────────────────────────

  _norm(s) {
    return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /** Grade one answer against its question. Binary per question (no partial credit).
   *  Returns { isCorrect, points }. */
  _grade(question, answer = {}) {
    const kind = question.kind;
    const points = question.points || 0;
    if (kind === 'single' || kind === 'boolean') {
      const picked = (answer.selectedOptionIds || []).map(String);
      const correct = (question.correctOptionIds || []).map(String);
      const ok = picked.length === 1 && correct.includes(picked[0]);
      return { isCorrect: ok, points: ok ? points : 0 };
    }
    if (kind === 'multi') {
      const picked = new Set((answer.selectedOptionIds || []).map(String));
      const correct = new Set((question.correctOptionIds || []).map(String));
      const exact = picked.size === correct.size && [...picked].every((id) => correct.has(id));
      return { isCorrect: exact, points: exact ? points : 0 };
    }
    // short
    const text = this._norm(answer.answerText);
    if (!text) return { isCorrect: false, points: 0 };
    const accepted = (question.acceptedAnswers || []).map((a) => this._norm(a)).filter(Boolean);
    let ok = false;
    if (question.matchMode === 'keyword') {
      // Every accepted entry is a required keyword that must appear in the response.
      ok = accepted.length > 0 && accepted.every((kw) => text.includes(kw));
    } else {
      ok = accepted.includes(text);
    }
    return { isCorrect: ok, points: ok ? points : 0 };
  }

  // ── Context / shaping ────────────────────────────────────────────────────────

  async _loadContext(taskId, menteeId) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');
    if (task.menteeId !== menteeId) throw new ForbiddenError('This quiz is not assigned to you');

    const assignment = await models.QuizAssignment.findOne({ where: { assignedTaskId: taskId } });
    if (!assignment) throw new NotFoundError('This task is not a quiz');

    const kit = await models.QuizKit.findByPk(assignment.kitId, {
      include: [{ model: models.QuizQuestion, as: 'questions' }],
    });
    if (!kit) throw new NotFoundError('Quiz not found');

    let questions = [...(kit.questions || [])].sort((a, b) => a.position - b.position);
    // Stable per-mentee shuffle so a reload keeps the same order during an attempt.
    if (assignment.shuffleQuestions) {
      const seed = `${taskId}:${menteeId}`;
      const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
      questions = questions.map((q) => ({ q, k: hash(seed + q.id) })).sort((a, b) => a.k - b.k).map((x) => x.q);
    }
    return { task, assignment, kit, questions };
  }

  /** Public candidate shape — NEVER leaks the answer key. */
  _publicQuestion(q) {
    return {
      id: q.id,
      position: q.position,
      kind: q.kind,
      prompt: q.prompt,
      points: q.points,
      required: q.required,
      // Options carry no "correct" marker; short questions carry none at all.
      options: (q.options || []).map((o) => ({ id: o.id, label: o.label })),
      multiple: q.kind === 'multi',
    };
  }

  async getForCandidate(taskId, menteeId) {
    const { task, assignment, kit, questions } = await this._loadContext(taskId, menteeId);

    const sessions = await models.QuizSession.findAll({
      where: { assignedTaskId: taskId, menteeId },
      order: [['attempt_number', 'DESC']],
    });
    const active = sessions.find((s) => s.status === 'in_progress') || null;
    const submitted = sessions.filter((s) => s.status === 'submitted');
    const submittedCount = submitted.length;
    const canStart = !active && (submittedCount === 0 || assignment.allowRetake);

    let answers = [];
    if (active) {
      const rows = await models.QuizAnswer.findAll({ where: { sessionId: active.id } });
      answers = rows.map((a) => ({
        questionId: a.questionId,
        selectedOptionIds: a.selectedOptionIds || [],
        answerText: a.answerText,
      }));
    }

    // Last result (for the "already completed" screen). Reveal per-question
    // correctness only when the assignment allows it.
    let lastResult = null;
    const lastSubmitted = submitted[0];
    if (lastSubmitted) {
      lastResult = {
        scorePercent: lastSubmitted.scorePercent,
        autoScore: lastSubmitted.autoScore,
        maxScore: lastSubmitted.maxScore,
        passed: lastSubmitted.passed,
        submittedAt: lastSubmitted.submittedAt,
      };
    }

    return {
      task: { id: task.id, status: task.status, dueDate: task.dueDate },
      kit: {
        id: kit.id,
        title: kit.title,
        description: kit.description,
        totalPoints: questions.reduce((s, q) => s + (q.points || 0), 0),
      },
      options: {
        evaluationMode: assignment.evaluationMode,
        allowRetake: assignment.allowRetake,
        timeLimitSeconds: assignment.timeLimitSeconds,
        showAnswers: assignment.showAnswers,
        passScore: assignment.passScore,
      },
      questions: questions.map((q) => this._publicQuestion(q)),
      state: {
        canStart,
        activeSessionId: active ? active.id : null,
        attemptNumber: active ? active.attemptNumber : submittedCount + 1,
        submittedCount,
        savedAnswers: answers,
        currentPosition: active ? (active.currentPosition || 0) : 0,
        sessionStartedAt: active ? active.startedAt : null,
        lastResult,
      },
      serverNow: new Date().toISOString(),
    };
  }

  // ── Attempt lifecycle ────────────────────────────────────────────────────────

  async startOrResume(taskId, menteeId) {
    const { assignment } = await this._loadContext(taskId, menteeId);

    const existing = await models.QuizSession.findOne({
      where: { assignedTaskId: taskId, menteeId, status: 'in_progress' },
    });
    if (existing) return this._sessionShape(existing);

    const submittedCount = await models.QuizSession.count({
      where: { assignedTaskId: taskId, menteeId, status: 'submitted' },
    });
    if (submittedCount > 0 && !assignment.allowRetake) {
      throw new ConflictError('You have already completed this quiz.');
    }

    const session = await models.QuizSession.create({
      assignedTaskId: taskId,
      quizAssignmentId: assignment.id,
      menteeId,
      attemptNumber: submittedCount + 1,
      status: 'in_progress',
      startedAt: new Date(),
    });

    await models.AssignedTask.update(
      { status: 'in_progress', startedAt: sequelize.literal('COALESCE(started_at, NOW())') },
      { where: { id: taskId, status: { [Op.in]: ['assigned', 'not_started'] } } }
    );

    return this._sessionShape(session);
  }

  _sessionShape(s) {
    return { id: s.id, attemptNumber: s.attemptNumber, status: s.status, startedAt: s.startedAt };
  }

  async _openSession(sessionId, menteeId) {
    const session = await models.QuizSession.findByPk(sessionId);
    if (!session) throw new NotFoundError('Quiz session not found');
    if (session.menteeId !== menteeId) throw new ForbiddenError('This session is not yours');
    if (session.status !== 'in_progress') throw new ConflictError('This quiz has already been submitted.');
    return session;
  }

  async _kitIdForSession(session) {
    const assignment = await models.QuizAssignment.findByPk(session.quizAssignmentId, { attributes: ['kitId'] });
    return assignment ? assignment.kitId : null;
  }

  /** Upsert a single answer (autosave). Snapshots the question meta on first write. */
  async saveAnswer(sessionId, menteeId, questionId, payload = {}) {
    const session = await this._openSession(sessionId, menteeId);
    if (!questionId) throw new ValidationError('questionId is required');

    const question = await models.QuizQuestion.findByPk(questionId);
    if (!question || question.kitId !== (await this._kitIdForSession(session))) {
      throw new ValidationError('That question is not part of this quiz');
    }

    const fields = {
      position: question.position,
      kind: question.kind,
      promptSnapshot: question.prompt,
      pointsPossible: question.points,
    };
    if (payload.selectedOptionIds !== undefined) {
      const ids = Array.isArray(payload.selectedOptionIds) ? payload.selectedOptionIds.map(String) : [];
      const valid = new Set((question.options || []).map((o) => String(o.id)));
      fields.selectedOptionIds = ids.filter((id) => valid.has(id));
    }
    if (payload.answerText !== undefined) fields.answerText = payload.answerText ? String(payload.answerText) : null;
    // Forward-only resume position.
    if (question.position > (session.currentPosition || 0)) {
      await session.update({ currentPosition: question.position });
    }

    const [answer] = await models.QuizAnswer.findOrCreate({
      where: { sessionId, questionId },
      defaults: { sessionId, questionId, ...fields },
    });
    await answer.update(fields);
    return { saved: true, questionId };
  }

  /**
   * Submit the attempt: auto-grade every question, tally the score, drop a
   * TaskSubmission marker, and — when the assignment is 'auto' — finalize the score
   * straight into the points/gamification pipeline. In 'review' mode it stays
   * pending in Approvals for the mentor.
   */
  async submit(sessionId, menteeId) {
    const session = await this._openSession(sessionId, menteeId);
    const { task, assignment, questions } = await this._loadContext(session.assignedTaskId, menteeId);

    // Grade against the saved answers (create rows for skipped questions too).
    const saved = await models.QuizAnswer.findAll({ where: { sessionId: session.id } });
    const byQ = new Map(saved.map((a) => [a.questionId, a]));

    let autoScore = 0;
    let maxScore = 0;
    const graded = [];
    for (const q of questions) {
      maxScore += q.points || 0;
      const a = byQ.get(q.id);
      const { isCorrect, points } = this._grade(q, {
        selectedOptionIds: a ? (a.selectedOptionIds || []) : [],
        answerText: a ? a.answerText : null,
      });
      autoScore += points;
      graded.push({ question: q, existing: a, isCorrect, points });
    }
    const pct = maxScore > 0 ? (autoScore / maxScore) * 100 : 0;
    const passed = assignment.passScore != null ? pct >= assignment.passScore : null;

    const out = await sequelize.transaction(async (transaction) => {
      // Persist per-answer grade snapshots.
      for (const g of graded) {
        const fields = {
          position: g.question.position,
          kind: g.question.kind,
          promptSnapshot: g.question.prompt,
          pointsPossible: g.question.points,
          isCorrect: g.isCorrect,
          autoPoints: g.points,
          pointsAwarded: g.points,
        };
        if (g.existing) {
          await g.existing.update(fields, { transaction });
        } else {
          await models.QuizAnswer.create({ sessionId: session.id, questionId: g.question.id, selectedOptionIds: [], ...fields }, { transaction });
        }
      }

      await session.update({
        status: 'submitted', submittedAt: new Date(),
        autoScore, maxScore, scorePercent: pct, passed,
      }, { transaction });

      // Next submission version for this assignment (mirrors submissionService).
      const last = await models.TaskSubmission.findOne({
        where: { assignedTaskId: task.id }, order: [['version', 'DESC']], transaction,
      });
      const version = (last?.version || 0) + 1;
      const isLate = task.dueDate ? new Date() > new Date(task.dueDate) : false;

      const submission = await models.TaskSubmission.create({
        assignedTaskId: task.id,
        version,
        submissionText: `Quiz completed — ${autoScore}/${maxScore} points (${Math.round(pct)}%).`,
        submissionUrls: [],
        status: 'pending',
        submittedAt: new Date(),
      }, { transaction });

      await task.update({
        status: 'submitted', submittedAt: new Date(), currentSubmissionVersion: version, isLate,
      }, { transaction });

      await session.update({ meta: { ...(session.meta || {}), submissionId: submission.id } }, { transaction });
      return { submissionId: submission.id, version };
    });

    // Auto mode → finalize now (posts points + gamification, marks completed).
    let finalized = false;
    if (assignment.evaluationMode === 'auto') {
      const submissionService = require('./submissionService');
      await submissionService.reviewSubmission(out.submissionId, task.mentorId, {
        decision: 'approved',
        isApproved: true,
        rating: Math.round((pct / 100) * 5 * 100) / 100,
        feedbackText: `Quiz auto-graded — ${autoScore}/${maxScore} points (${Math.round(pct)}%).`,
        pointsPercent: pct,
      });
      finalized = true;
    } else {
      // Review mode → notify the mentor there's a quiz to confirm.
      try {
        const submitter = await models.User.findByPk(menteeId, { attributes: ['firstName', 'lastName'] });
        const name = submitter ? `${submitter.firstName} ${submitter.lastName}`.trim() : 'A mentee';
        await notificationOrchestrator.dispatch({
          eventKey: NOTIFICATION_EVENTS.TASK_SUBMITTED,
          recipients: [{ userId: task.mentorId }],
          payload: {
            title: `${name} completed a quiz`,
            message: `${name} scored ${Math.round(pct)}% on a quiz. Confirm the result when you can.`,
            actionUrl: `/mentor/approvals?task=${task.id}`,
            actionLabel: 'Review quiz',
            relatedEntityType: 'task_submission',
            relatedEntityId: out.submissionId,
          },
          dedupe: { relatedEntityType: 'quiz_submitted', relatedEntityId: out.submissionId },
        });
      } catch (e) {
        console.error('quiz submit notification failed:', e.message);
      }
    }

    return {
      autoScore, maxScore, scorePercent: Math.round(pct), passed,
      evaluationMode: assignment.evaluationMode, finalized,
      // Only reveal per-question correctness when the assignment allows it.
      review: assignment.showAnswers ? await this._candidateResult(session.id, menteeId) : null,
    };
  }

  /** Per-question result for the mentee (only when showAnswers is on). */
  async _candidateResult(sessionId, menteeId) {
    const { questions } = await this._loadContext(
      (await models.QuizSession.findByPk(sessionId)).assignedTaskId, menteeId
    );
    const answers = await models.QuizAnswer.findAll({ where: { sessionId } });
    const byQ = new Map(answers.map((a) => [a.questionId, a]));
    return questions.map((q) => {
      const a = byQ.get(q.id);
      return {
        questionId: q.id,
        prompt: q.prompt,
        kind: q.kind,
        points: q.points,
        options: (q.options || []).map((o) => ({ id: o.id, label: o.label })),
        correctOptionIds: q.correctOptionIds || [],
        acceptedAnswers: q.acceptedAnswers || [],
        explanation: q.explanation || null,
        selectedOptionIds: a ? (a.selectedOptionIds || []) : [],
        answerText: a ? a.answerText : null,
        isCorrect: a ? a.isCorrect : false,
        pointsAwarded: a ? a.pointsAwarded : 0,
      };
    });
  }

  // ── Mentor review (review mode) ──────────────────────────────────────────────

  async _assertReviewer(mentorId, task) {
    if (!(await authzService.canActOnTask(mentorId, task, PERMISSIONS.TASK_REVIEW))) {
      throw new ForbiddenError('You do not have permission to review this quiz');
    }
  }

  async _latestSubmittedSession(taskId) {
    const sessions = await models.QuizSession.findAll({
      where: { assignedTaskId: taskId }, order: [['attempt_number', 'DESC']],
    });
    return sessions.find((s) => s.status === 'submitted') || sessions[0] || null;
  }

  /** Mentor review payload: questions WITH the answer key, the mentee's answers,
   *  the auto-grade, and totals. The owning mentee gets read access without the key. */
  async getForReview(taskId, requesterId) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');
    const isOwnerMentee = task.menteeId === requesterId;
    if (!isOwnerMentee) await this._assertReviewer(requesterId, task);

    const assignment = await models.QuizAssignment.findOne({ where: { assignedTaskId: taskId } });
    if (!assignment) throw new NotFoundError('This task is not a quiz');

    const kit = await models.QuizKit.findByPk(assignment.kitId, {
      include: [{ model: models.QuizQuestion, as: 'questions' }],
    });
    const questions = [...((kit && kit.questions) || [])].sort((a, b) => a.position - b.position);

    const sessions = await models.QuizSession.findAll({
      where: { assignedTaskId: taskId },
      order: [['attempt_number', 'DESC']],
      include: [
        { model: models.QuizAnswer, as: 'answers' },
        { model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'] },
      ],
    });
    const session = sessions.find((s) => s.status === 'submitted') || sessions[0] || null;
    const answers = session ? (session.answers || []) : [];
    const answerByQ = new Map(answers.map((a) => [a.questionId, a]));

    const items = questions.map((q) => {
      const a = answerByQ.get(q.id);
      return {
        questionId: q.id,
        position: q.position,
        kind: q.kind,
        prompt: q.prompt,
        points: q.points,
        options: (q.options || []).map((o) => ({ id: o.id, label: o.label })),
        // The answer key is hidden from the owning mentee.
        correctOptionIds: isOwnerMentee ? null : (q.correctOptionIds || []),
        acceptedAnswers: isOwnerMentee ? null : (q.acceptedAnswers || []),
        matchMode: q.matchMode,
        explanation: q.explanation || null,
        answer: a ? {
          selectedOptionIds: a.selectedOptionIds || [],
          answerText: a.answerText,
          isCorrect: a.isCorrect,
          autoPoints: a.autoPoints,
          pointsAwarded: a.pointsAwarded,
          scoreNote: a.scoreNote,
        } : null,
      };
    });

    const totalPossible = questions.reduce((s, q) => s + (q.points || 0), 0);
    const totalAwarded = items.reduce((s, it) => s + (Number(it.answer?.pointsAwarded) || 0), 0);

    return {
      task: { id: task.id, status: task.status, pointsAwarded: task.pointsAwarded, menteeId: task.menteeId },
      kit: { id: kit?.id, title: kit?.title, description: kit?.description },
      options: {
        evaluationMode: assignment.evaluationMode,
        allowRetake: assignment.allowRetake,
        passScore: assignment.passScore,
      },
      session: session ? {
        id: session.id,
        status: session.status,
        attemptNumber: session.attemptNumber,
        submittedAt: session.submittedAt,
        autoScore: session.autoScore,
        maxScore: session.maxScore,
        scorePercent: session.scorePercent,
        passed: session.passed,
        mentee: session.mentee ? {
          id: session.mentee.id,
          name: `${session.mentee.firstName} ${session.mentee.lastName}`.trim(),
          avatarUrl: session.mentee.profilePictureUrl,
        } : null,
      } : null,
      items,
      totals: { totalPossible, totalAwarded, questionCount: questions.length },
      canReview: !isOwnerMentee && task.status !== 'completed',
    };
  }

  /** Override a per-answer grade (mentor, review mode). */
  async gradeAnswer(taskId, mentorId, questionId, { pointsAwarded, scoreNote } = {}) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');
    await this._assertReviewer(mentorId, task);

    const session = await this._latestSubmittedSession(taskId);
    if (!session) throw new NotFoundError('No submitted quiz to grade');

    const question = await models.QuizQuestion.findByPk(questionId);
    if (!question) throw new ValidationError('Unknown question');

    const patch = {};
    if (pointsAwarded !== undefined) {
      const n = Number.parseInt(pointsAwarded, 10);
      patch.pointsAwarded = Number.isFinite(n) ? Math.max(0, Math.min(question.points, n)) : null;
    }
    if (scoreNote !== undefined) patch.scoreNote = scoreNote ? String(scoreNote) : null;

    const [answer] = await models.QuizAnswer.findOrCreate({
      where: { sessionId: session.id, questionId },
      defaults: {
        sessionId: session.id, questionId, position: question.position,
        kind: question.kind, promptSnapshot: question.prompt, pointsPossible: question.points, ...patch,
      },
    });
    await answer.update(patch);
    return { questionId, pointsAwarded: answer.pointsAwarded, scoreNote: answer.scoreNote };
  }

  /** Finalize the review: sum the per-answer points and complete the task through
   *  the shared review path (points/gamification/notifications). */
  async finalizeReview(taskId, mentorId, { overallNote } = {}) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');
    await this._assertReviewer(mentorId, task);

    const session = await this._latestSubmittedSession(taskId);
    if (!session) throw new NotFoundError('No submitted quiz to review');
    const submissionId = session.meta?.submissionId;
    if (!submissionId) throw new ValidationError('This quiz has no submission to review');

    const answers = await models.QuizAnswer.findAll({ where: { sessionId: session.id } });
    const totalPossible = answers.reduce((s, a) => s + (a.pointsPossible || 0), 0);
    const totalAwarded = answers.reduce((s, a) => s + (Number(a.pointsAwarded) || 0), 0);
    const pct = totalPossible > 0 ? (totalAwarded / totalPossible) * 100 : 0;

    const submissionService = require('./submissionService');
    await submissionService.reviewSubmission(submissionId, mentorId, {
      decision: 'approved',
      isApproved: true,
      rating: Math.round((pct / 100) * 5 * 100) / 100,
      feedbackText: overallNote || `Quiz reviewed — ${totalAwarded}/${totalPossible} points (${Math.round(pct)}%).`,
      pointsPercent: pct,
    });

    return { totalAwarded, totalPossible, pointsPercent: Math.round(pct) };
  }
}

module.exports = new QuizSessionService();
