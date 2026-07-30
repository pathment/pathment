const crypto = require('crypto');
const { models } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');

const QUESTION_TYPES = ['mcq', 'multi_select', 'short_text', 'long_text', 'file_upload', 'external_link'];
const AUTO_GRADED = ['mcq', 'multi_select'];

/**
 * Assessment authoring (admin) + grading. An assessment is a reusable set of
 * mixed-type questions attached optionally to a cohort's intake. Auto-graded
 * items (mcq / multi_select) are scored on submit; the rest are scored by hand.
 */
class AssessmentService {
  // ── Authoring (admin) ──────────────────────────────────────────────────────
  async listAssessments({ programId, status } = {}) {
    const where = {};
    if (programId) where.programId = programId;
    if (status) where.status = status;
    const assessments = await models.Assessment.findAll({
      where,
      include: [{ model: models.AssessmentQuestion, as: 'questions', attributes: ['id', 'points'] }],
      order: [['createdAt', 'DESC']]
    });
    return assessments.map((a) => {
      const json = a.toJSON();
      json.questionCount = json.questions ? json.questions.length : 0;
      json.totalPoints = (json.questions || []).reduce((s, q) => s + (q.points || 0), 0);
      delete json.questions;
      return json;
    });
  }

  async getAssessment(assessmentId) {
    const assessment = await models.Assessment.findByPk(assessmentId, {
      include: [{ model: models.AssessmentQuestion, as: 'questions' }]
    });
    if (!assessment) throw new NotFoundError('Assessment not found');
    const json = assessment.toJSON();
    json.questions = (json.questions || []).sort((a, b) => a.position - b.position);
    return json;
  }

  /** Shared field validation for create/update. Throws on bad numeric fields. */
  _validateMeta(data) {
    if (data.title !== undefined && (!data.title || !String(data.title).trim())) {
      throw new ValidationError('A title is required');
    }
    if (data.passingScore !== undefined && data.passingScore !== null && data.passingScore !== '') {
      const n = Number(data.passingScore);
      if (!Number.isFinite(n) || n < 0) throw new ValidationError('Passing score must be a number ≥ 0');
    }
    if (data.timeLimitMins !== undefined && data.timeLimitMins !== null && data.timeLimitMins !== '') {
      const n = Number(data.timeLimitMins);
      if (!Number.isInteger(n) || n < 1) throw new ValidationError('Time limit must be a whole number of minutes ≥ 1');
    }
  }

  async createAssessment(data, createdBy) {
    this._validateMeta(data);
    if (!data.title || !data.title.trim()) throw new ValidationError('A title is required');
    return models.Assessment.create({
      title: data.title.trim(),
      description: data.description || null,
      instructions: data.instructions || null,
      programId: data.programId || null,
      passingScore: (data.passingScore ?? '') === '' ? null : Number(data.passingScore),
      aiRubric: data.aiRubric && String(data.aiRubric).trim() ? String(data.aiRubric).trim() : null,
      timeLimitMins: (data.timeLimitMins ?? '') === '' ? null : Number(data.timeLimitMins),
      // A brand-new assessment has no questions yet, so it cannot be published.
      // Publishing is a deliberate step after adding at least one question.
      status: 'draft',
      createdBy
    });
  }

  async updateAssessment(assessmentId, data) {
    const assessment = await models.Assessment.findByPk(assessmentId);
    if (!assessment) throw new NotFoundError('Assessment not found');
    this._validateMeta(data);
    const allowed = ['title', 'description', 'instructions', 'programId', 'passingScore', 'timeLimitMins', 'status', 'aiRubric'];
    const patch = {};
    for (const key of allowed) if (data[key] !== undefined) patch[key] = data[key];
    if (patch.status && !['draft', 'published', 'archived'].includes(patch.status)) {
      throw new ValidationError('Invalid status');
    }
    // An assessment can't go live with zero questions — there'd be nothing to answer.
    if (patch.status === 'published') {
      const count = await models.AssessmentQuestion.count({ where: { assessmentId } });
      if (count === 0) throw new ValidationError('Add at least one question before publishing this assessment');
    }
    await assessment.update(patch);
    return assessment;
  }

  /**
   * Replace the full question set in one call (the builder sends the whole list).
   * Each question: { type, prompt, required?, points?, options?, correctOptionIds?, config? }.
   * Options get stable ids so answers/correctOptionIds reference them safely.
   */
  async setQuestions(assessmentId, questions) {
    const assessment = await models.Assessment.findByPk(assessmentId);
    if (!assessment) throw new NotFoundError('Assessment not found');
    if (!Array.isArray(questions)) throw new ValidationError('questions must be an array');

    const rows = questions.map((q, index) => {
      if (!QUESTION_TYPES.includes(q.type)) throw new ValidationError(`Invalid question type: ${q.type}`);
      if (!q.prompt || !String(q.prompt).trim()) throw new ValidationError('Every question needs a prompt');

      let options = [];
      let correctOptionIds = [];
      if (q.type === 'mcq' || q.type === 'multi_select') {
        options = (q.options || []).map((opt) => ({
          id: opt.id || crypto.randomBytes(4).toString('hex'),
          label: String(opt.label ?? '').trim()
        })).filter((opt) => opt.label);
        if (options.length < 2) throw new ValidationError('Choice questions need at least 2 options');
        const validIds = new Set(options.map((o) => o.id));
        correctOptionIds = (q.correctOptionIds || []).filter((id) => validIds.has(id));
        if (q.type === 'mcq' && correctOptionIds.length > 1) correctOptionIds = [correctOptionIds[0]];
      }

      return {
        assessmentId,
        type: q.type,
        prompt: String(q.prompt).trim(),
        position: index,
        required: q.required !== false,
        points: Number.isFinite(Number(q.points)) ? Math.max(0, Math.trunc(Number(q.points))) : 0,
        options,
        correctOptionIds,
        // Grading guidance the AI scores an open-ended answer against. Stored
        // for any type (harmless), surfaced in the builder for text questions.
        rubric: q.rubric && String(q.rubric).trim() ? String(q.rubric).trim() : null,
        config: q.config && typeof q.config === 'object' ? q.config : {}
      };
    });

    // Don't let a LIVE assessment be stripped to zero questions (back-door to a
    // published-but-empty assessment). Unpublish it first.
    if (rows.length === 0 && assessment.status === 'published') {
      throw new ValidationError('A published assessment must keep at least one question — set it back to draft first');
    }

    await models.AssessmentQuestion.destroy({ where: { assessmentId } });
    if (rows.length) await models.AssessmentQuestion.bulkCreate(rows);
    return this.getAssessment(assessmentId);
  }

  async deleteAssessment(assessmentId) {
    const assessment = await models.Assessment.findByPk(assessmentId);
    if (!assessment) throw new NotFoundError('Assessment not found');
    // Refuse to delete an assessment that's wired to a cohort - detach first.
    // It can be attached the legacy way (cohorts.assessment_id) or via a pool.
    const [legacy, pooled] = await Promise.all([
      models.Cohort.count({ where: { assessmentId } }),
      models.CohortAssessment.count({ where: { assessmentId } })
    ]);
    if (legacy + pooled > 0) throw new ValidationError('Detach this assessment from its cohort(s) before deleting');
    await models.AssessmentQuestion.destroy({ where: { assessmentId } });
    await assessment.destroy();
    return { deleted: true };
  }

  // ── Cohort assessment pool (level-aware, randomly assigned) ──────────────────
  /** A cohort's assessment pool with each assessment's title/status, in order. */
  async getCohortPool(cohortId) {
    const rows = await models.CohortAssessment.findAll({
      where: { cohortId },
      include: [{ model: models.Assessment, as: 'assessment', attributes: ['id', 'title', 'status'] }],
      order: [['position', 'ASC']]
    });
    return rows.map((r) => ({
      id: r.id,
      assessmentId: r.assessmentId,
      level: r.level || null,
      position: r.position,
      assessment: r.assessment ? { id: r.assessment.id, title: r.assessment.title, status: r.assessment.status } : null
    }));
  }

  /**
   * Replace a cohort's whole assessment pool in one call. `items` is
   * [{ assessmentId, level? }] — level null/empty = the "everyone" pool. Validates
   * each assessment exists (and is published, so applicants never hit a draft).
   */
  async setCohortPool(cohortId, items = []) {
    if (!Array.isArray(items)) throw new ValidationError('items must be an array');
    const clean = [];
    for (let i = 0; i < items.length; i += 1) {
      const it = items[i] || {};
      if (!it.assessmentId) continue;
      const a = await models.Assessment.findByPk(it.assessmentId, { attributes: ['id', 'status'] });
      if (!a) throw new ValidationError('One of the selected assessments no longer exists');
      if (a.status !== 'published') throw new ValidationError('Only published assessments can be attached to a cohort');
      clean.push({ cohortId, assessmentId: it.assessmentId, level: it.level ? String(it.level).slice(0, 40) : null, position: i });
    }
    await models.CohortAssessment.destroy({ where: { cohortId } });
    if (clean.length) await models.CohortAssessment.bulkCreate(clean);
    return this.getCohortPool(cohortId);
  }

  /**
   * Pick the assessment id an applicant should take. Prefers the pool matching
   * their `level`; falls back to the level-less ("everyone") pool; then the legacy
   * single cohort.assessmentId. One is chosen at random when a pool has several.
   * Returns an assessmentId or null (no assessment for this applicant).
   */
  async pickAssessmentId(cohort, level, randomFn = Math.random) {
    const rows = await models.CohortAssessment.findAll({ where: { cohortId: cohort.id }, attributes: ['assessmentId', 'level'] });
    let pool = [];
    if (rows.length) {
      const hasLevels = Array.isArray(cohort.levels) && cohort.levels.length > 0;
      if (hasLevels && level) pool = rows.filter((r) => r.level === level);
      if (!pool.length) pool = rows.filter((r) => !r.level);   // level-less / everyone
      if (!pool.length) pool = rows;                            // safety net
    }
    let ids = pool.map((r) => r.assessmentId);
    if (!ids.length && cohort.assessmentId) ids = [cohort.assessmentId]; // legacy single
    if (!ids.length) return null;
    return ids[Math.floor(randomFn() * ids.length) % ids.length];
  }

  /**
   * Ensure an applicant has a stable assigned assessment. Keeps an already-set,
   * still-valid one (so a returning applicant always sees the same assessment);
   * otherwise picks from the pool and persists it. Returns the assessmentId or null.
   */
  async ensureAssignedAssessment(application, cohort) {
    if (application.assignedAssessmentId) {
      const still = await models.Assessment.findByPk(application.assignedAssessmentId, { attributes: ['id'] });
      if (still) return application.assignedAssessmentId;
    }
    const picked = await this.pickAssessmentId(cohort, application.level);
    if (picked !== (application.assignedAssessmentId || null)) {
      await application.update({ assignedAssessmentId: picked || null });
    }
    return picked || null;
  }

  // ── Applicant-facing (sanitized) ─────────────────────────────────────────────
  /** The assessment as an applicant sees it - no points, no correct answers. */
  sanitizeForApplicant(assessmentJson) {
    return {
      id: assessmentJson.id,
      title: assessmentJson.title,
      description: assessmentJson.description,
      instructions: assessmentJson.instructions,
      timeLimitMins: assessmentJson.timeLimitMins,
      questions: (assessmentJson.questions || [])
        .sort((a, b) => a.position - b.position)
        .map((q) => ({
          id: q.id,
          type: q.type,
          prompt: q.prompt,
          required: q.required,
          options: (q.options || []).map((o) => ({ id: o.id, label: o.label })),
          config: q.config || {}
        }))
    };
  }

  // ── Grading ──────────────────────────────────────────────────────────────────
  /**
   * Auto-grade the answerable items. Returns { autoScore, maxScore, hasManual }.
   * `answers` is { [questionId]: { optionIds?, text?, fileUrl?, link? } }.
   */
  gradeAuto(questions, answers = {}) {
    let autoScore = 0;
    let maxScore = 0;
    let hasManual = false;

    for (const q of questions) {
      maxScore += q.points || 0;
      const answer = answers[q.id] || {};

      if (q.type === 'mcq') {
        const picked = (answer.optionIds || [])[0];
        if (picked && q.correctOptionIds.includes(picked)) autoScore += q.points || 0;
      } else if (q.type === 'multi_select') {
        const picked = new Set(answer.optionIds || []);
        const correct = new Set(q.correctOptionIds || []);
        const exact = picked.size === correct.size && [...picked].every((id) => correct.has(id));
        if (exact) autoScore += q.points || 0;
      } else if (AUTO_GRADED.indexOf(q.type) === -1) {
        // free text / file / link → needs a human if it carries points
        if ((q.points || 0) > 0) hasManual = true;
      }
    }
    return { autoScore, maxScore, hasManual };
  }

  /** Validate an applicant's answers cover all required questions. */
  validateAnswers(questions, answers = {}) {
    for (const q of questions) {
      if (!q.required) continue;
      const a = answers[q.id] || {};
      const empty =
        (q.type === 'mcq' || q.type === 'multi_select') ? !(a.optionIds && a.optionIds.length)
          : q.type === 'file_upload' ? !a.fileUrl
            : q.type === 'external_link' ? !a.link
              : !(a.text && String(a.text).trim());
      if (empty) throw new ValidationError('Please answer all required questions before submitting');
    }
  }

  /** Admin sets/overrides manual scores for free-text/file/link items. */
  async gradeSubmission(submissionId, { manualScore, totalScore }, gradedBy) {
    const submission = await models.AssessmentSubmission.findByPk(submissionId);
    if (!submission) throw new NotFoundError('Submission not found');
    const auto = Number(submission.autoScore || 0);
    const manual = manualScore != null ? Number(manualScore) : Number(submission.manualScore || 0);
    const total = totalScore != null ? Number(totalScore) : auto + manual;
    await submission.update({
      manualScore: manual,
      totalScore: total,
      status: 'graded',
      gradedAt: new Date(),
      gradedBy
    });
    // Mirror the final score onto the application for triage.
    await models.Application.update({ assessmentScore: total }, { where: { id: submission.applicationId } });
    return submission;
  }

  // ── AI grading (a SUGGESTION the admin reviews — never the final score) ──────
  /** Open-ended types the AI can read + score from text. mcq/multi_select are
   *  already auto-graded; file/link have no gradable text, so they stay manual. */
  _aiGradableTypes() { return ['short_text', 'long_text']; }

  /**
   * AI-score ONE submission: each open-ended answer against its per-question
   * rubric (0–100 → suggested points), plus a holistic 0–100 fit score + summary
   * for the whole application against the assessment's `aiRubric`. Stores the
   * result on `submission.aiDraft` and NEVER touches the real score.
   */
  async aiGradeSubmission(submissionId, graderId) {
    const groqService = require('./groqService');
    const submission = await models.AssessmentSubmission.findByPk(submissionId, {
      include: [
        { model: models.Assessment, as: 'assessment', include: [{ model: models.AssessmentQuestion, as: 'questions' }] },
        { model: models.Application, as: 'application' },
      ],
    });
    if (!submission) throw new NotFoundError('Submission not found');
    const assessment = submission.assessment;
    const questions = [...((assessment && assessment.questions) || [])].sort((a, b) => a.position - b.position);
    const answers = submission.answers || {};

    // Per-question blocks for the open-ended, answered items only.
    const gradable = questions.filter((q) => this._aiGradableTypes().includes(q.type));
    const blocks = gradable
      .map((q) => ({ q, text: String((answers[q.id] || {}).text || '').trim() }))
      .filter((b) => b.text.length > 0);

    // Compact context so the holistic score can weigh the whole picture.
    const autoInfo = questions
      .filter((q) => AUTO_GRADED.includes(q.type))
      .map((q) => `- ${q.prompt}: ${(q.points || 0)} pt auto-graded`);
    const app = submission.application;
    const profileLines = [];
    if (app) {
      if (app.level) profileLines.push(`Level chosen: ${app.level}`);
      // Answers keyed by the QUESTION that was asked, not the raw field key.
      const { labelledResponses } = require('../utils/intakeResponses');
      const cohort = await models.Cohort.findByPk(app.cohortId, { attributes: ['intakeFormSchema'] });
      profileLines.push(...labelledResponses(app.responses, cohort && cohort.intakeFormSchema));
    }

    const qBody = blocks.map((b, i) => (
      `[Q${i + 1}] id: ${b.q.id} · worth ${b.q.points || 0} points\n` +
      `Question: ${b.q.prompt}\n` +
      `Rubric: ${b.q.rubric || '(none — judge on correctness, relevance and clarity)'}\n` +
      `Answer: ${b.text}`
    )).join('\n\n---\n\n');

    const prompt = [
      `Program / role rubric for the OVERALL fit score:\n${assessment?.aiRubric || '(none — judge overall suitability from the answers and profile)'}`,
      profileLines.length ? `\nApplicant profile:\n${profileLines.join('\n')}` : '',
      autoInfo.length ? `\nAuto-graded questions (already scored, for context):\n${autoInfo.join('\n')}` : '',
      blocks.length ? `\nOpen-ended answers to score:\n\n${qBody}` : '\n(No open-ended answers to score — give the overall from the profile + auto-graded items.)',
    ].join('\n');

    const raw = await groqService.generateText({
      feature: 'assessment',
      userId: graderId,
      temperature: 0.2,
      maxTokens: Math.min(2000, 160 * (blocks.length + 1) + 200),
      system: [
        'You are a fair, experienced admissions reviewer scoring ONE applicant\'s assessment.',
        'Score EACH open-ended question 0–100 against ITS OWN rubric. Calibrate honestly: 85–100 = clearly above bar, 60–84 = meets the bar, 40–59 = partial or shaky, below 40 = weak or off-topic. Give partial credit.',
        'Then give an OVERALL 0–100 fit score for the candidate against the program rubric, weighing every answer and the profile, with a one or two sentence summary of strengths and gaps.',
        'Reply with STRICT JSON only, no text outside it: {"questions":[{"id":"<exact id shown>","score":<int 0-100>,"note":"<one sentence>"}],"overall":<int 0-100>,"summary":"<1-2 sentences>"}.',
      ].join(' '),
      prompt,
    });

    // Tolerant parse (the model may wrap the JSON in prose).
    let parsed = {};
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    } catch { parsed = {}; }

    const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
    const perQuestion = {};
    const byId = new Map(blocks.map((b) => [String(b.q.id), b.q]));
    for (const r of (Array.isArray(parsed.questions) ? parsed.questions : [])) {
      const q = r && byId.get(String(r.id));
      if (!q) continue;
      const pct = clamp(r.score);
      perQuestion[q.id] = {
        score: pct,
        suggestedPoints: Math.round((pct / 100) * (q.points || 0)),
        note: r.note ? String(r.note).slice(0, 500) : null,
      };
    }

    const aiDraft = {
      perQuestion,
      overall: parsed.overall != null ? clamp(parsed.overall) : null,
      summary: parsed.summary ? String(parsed.summary).slice(0, 1000) : null,
      gradedQuestionIds: blocks.map((b) => b.q.id),
      at: new Date().toISOString(),
    };
    await submission.update({ aiDraft });
    return { submissionId: submission.id, applicationId: submission.applicationId, aiDraft };
  }

  /**
   * What an AI-scoring run would actually grade on — shown to the admin BEFORE
   * anything runs, so "AI score" is never a black box. A cohort can use a POOL
   * of assessments (level-aware, randomly assigned), so different applicants in
   * the same selection can sit different papers: this groups the selection by
   * the assessment each applicant was actually assigned, and lists exactly the
   * questions the AI will read, with their points and rubric.
   */
  async getScoringPlan(cohortId, applicationIds = []) {
    const cohort = await models.Cohort.findByPk(cohortId);
    if (!cohort) throw new NotFoundError('Cohort not found');

    const where = { cohortId };
    if (Array.isArray(applicationIds) && applicationIds.length) where.id = applicationIds;
    const apps = await models.Application.findAll({
      where, attributes: ['id', 'assignedAssessmentId'],
    });

    // Who actually has something to grade.
    const subs = apps.length
      ? await models.AssessmentSubmission.findAll({
        where: { applicationId: apps.map((a) => a.id) },
        attributes: ['applicationId', 'status'],
      })
      : [];
    const submittedIds = new Set(subs.filter((s) => s.status !== 'in_progress').map((s) => s.applicationId));

    // Group the selection by the assessment each applicant was assigned.
    const countByAssessment = new Map();
    for (const a of apps) {
      const aid = a.assignedAssessmentId || cohort.assessmentId;
      if (!aid) continue;
      countByAssessment.set(String(aid), (countByAssessment.get(String(aid)) || 0) + 1);
    }

    const ids = [...countByAssessment.keys()];
    const assessments = ids.length
      ? await models.Assessment.findAll({
        where: { id: ids },
        include: [{ model: models.AssessmentQuestion, as: 'questions' }],
      })
      : [];

    const aiTypes = this._aiGradableTypes();
    const plan = assessments.map((asmt) => {
      const questions = [...(asmt.questions || [])].sort((a, b) => a.position - b.position);
      const gradable = questions.filter((q) => aiTypes.includes(q.type));
      return {
        id: asmt.id,
        title: asmt.title,
        aiRubric: asmt.aiRubric || null,
        applicantCount: countByAssessment.get(String(asmt.id)) || 0,
        autoGradedCount: questions.filter((q) => AUTO_GRADED.includes(q.type)).length,
        questions: gradable.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          type: q.type,
          points: q.points || 0,
          rubric: q.rubric || null,
        })),
      };
    }).sort((a, b) => b.applicantCount - a.applicantCount);

    return {
      applicants: {
        selected: apps.length,
        withSubmission: apps.filter((a) => submittedIds.has(a.id)).length,
        withoutSubmission: apps.filter((a) => !submittedIds.has(a.id)).length,
      },
      assessments: plan,
    };
  }

  // ── Reusable rubric snippets ─────────────────────────────────────────────
  async listSnippets() {
    const rows = await models.RubricSnippet.findAll({ order: [['title', 'ASC']] });
    return rows.map((r) => r.toJSON());
  }

  async createSnippet({ title, body }, createdBy) {
    const t = String(title || '').trim();
    const b = String(body || '').trim();
    if (!t) throw new ValidationError('Give the snippet a name');
    if (!b) throw new ValidationError('A snippet needs some rubric text');
    return models.RubricSnippet.create({ title: t.slice(0, 160), body: b, createdBy });
  }

  async deleteSnippet(id) {
    const row = await models.RubricSnippet.findByPk(id);
    if (!row) throw new NotFoundError('Snippet not found');
    await row.destroy();
    return { deleted: true };
  }

  /** AI-grade by applicationId (resolves the latest submission). Returns a
   *  per-application result so a bulk caller can page through selected rows. */
  async aiGradeApplication(applicationId, graderId) {
    const submission = await models.AssessmentSubmission.findOne({
      where: { applicationId },
      order: [['submittedAt', 'DESC']],
    });
    if (!submission) return { applicationId, graded: false, reason: 'no_submission' };
    if (submission.status === 'in_progress') return { applicationId, graded: false, reason: 'not_submitted' };
    const res = await this.aiGradeSubmission(submission.id, graderId);
    return { applicationId, graded: true, submissionId: submission.id, aiDraft: res.aiDraft };
  }

  /**
   * Commit the AI's suggested per-question points to the REAL score (the admin's
   * explicit "apply" action): total = autoScore + Σ suggested points for the
   * AI-graded questions. Marks the submission graded and mirrors onto the
   * application — same write path as a manual grade.
   */
  async applyAiScores(submissionId, gradedBy) {
    const submission = await models.AssessmentSubmission.findByPk(submissionId);
    if (!submission) throw new NotFoundError('Submission not found');
    const draft = submission.aiDraft;
    if (!draft || !draft.perQuestion) throw new ValidationError('No AI scores to apply — run AI scoring first');
    const aiPoints = Object.values(draft.perQuestion).reduce((s, r) => s + (Number(r.suggestedPoints) || 0), 0);
    const total = Number(submission.autoScore || 0) + aiPoints;
    return this.gradeSubmission(submissionId, { manualScore: aiPoints, totalScore: total }, gradedBy);
  }
}

module.exports = new AssessmentService();
