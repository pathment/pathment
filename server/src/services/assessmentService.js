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
    const allowed = ['title', 'description', 'instructions', 'programId', 'passingScore', 'timeLimitMins', 'status'];
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
}

module.exports = new AssessmentService();
