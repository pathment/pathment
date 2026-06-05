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

  async createAssessment(data, createdBy) {
    if (!data.title || !data.title.trim()) throw new ValidationError('A title is required');
    return models.Assessment.create({
      title: data.title.trim(),
      description: data.description || null,
      instructions: data.instructions || null,
      programId: data.programId || null,
      passingScore: data.passingScore ?? null,
      timeLimitMins: data.timeLimitMins ?? null,
      status: data.status === 'published' ? 'published' : 'draft',
      createdBy
    });
  }

  async updateAssessment(assessmentId, data) {
    const assessment = await models.Assessment.findByPk(assessmentId);
    if (!assessment) throw new NotFoundError('Assessment not found');
    const allowed = ['title', 'description', 'instructions', 'programId', 'passingScore', 'timeLimitMins', 'status'];
    const patch = {};
    for (const key of allowed) if (data[key] !== undefined) patch[key] = data[key];
    if (patch.status && !['draft', 'published', 'archived'].includes(patch.status)) {
      throw new ValidationError('Invalid status');
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

    await models.AssessmentQuestion.destroy({ where: { assessmentId } });
    if (rows.length) await models.AssessmentQuestion.bulkCreate(rows);
    return this.getAssessment(assessmentId);
  }

  async deleteAssessment(assessmentId) {
    const assessment = await models.Assessment.findByPk(assessmentId);
    if (!assessment) throw new NotFoundError('Assessment not found');
    // Refuse to delete an assessment that's wired to a cohort — detach first.
    const inUse = await models.Cohort.count({ where: { assessmentId } });
    if (inUse > 0) throw new ValidationError('Detach this assessment from its cohort(s) before deleting');
    await models.AssessmentQuestion.destroy({ where: { assessmentId } });
    await assessment.destroy();
    return { deleted: true };
  }

  // ── Applicant-facing (sanitized) ─────────────────────────────────────────────
  /** The assessment as an applicant sees it — no points, no correct answers. */
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
