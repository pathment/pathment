const crypto = require('crypto');
const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ForbiddenError, ValidationError, ConflictError } = require('../utils/errors/errorTypes');

const QUESTION_KINDS = ['single', 'multi', 'boolean', 'short'];
const CHOICE_KINDS = ['single', 'multi', 'boolean'];
const MATCH_MODES = ['exact', 'keyword'];
const KIT_STATUSES = ['draft', 'published', 'archived'];
const EVAL_MODES = ['auto', 'review'];

const optId = () => crypto.randomBytes(6).toString('hex');

/**
 * QuizKitService — authoring + assignment of reusable auto-gradable quiz kits. A
 * kit is an ordered set of objective questions (single / multi / boolean / short)
 * a mentor builds once and assigns to many mentees as a `quiz` task. This service
 * owns the kit lifecycle and the per-assignment options snapshot; grading and the
 * candidate runner live in quizSessionService.
 */
class QuizKitService {
  // ── Normalization ──────────────────────────────────────────────────────────

  /** Coerce + validate one raw question from the editor into a storable shape. */
  _normalizeQuestion(raw, position) {
    const kind = QUESTION_KINDS.includes(raw?.kind) ? raw.kind : 'single';
    const prompt = String(raw?.prompt || '').trim();
    if (!prompt) throw new ValidationError(`Question ${position + 1} needs a prompt`);

    const toPosInt = (v, fallback) => {
      const n = Number.parseInt(v, 10);
      return Number.isFinite(n) && n >= 0 ? n : fallback;
    };

    const q = {
      position,
      kind,
      prompt,
      points: Math.max(0, toPosInt(raw?.points, 5)),
      required: raw?.required !== false,
      options: [],
      correctOptionIds: [],
      acceptedAnswers: [],
      matchMode: 'exact',
      explanation: raw?.explanation ? String(raw.explanation).trim() : null,
      config: (raw?.config && typeof raw.config === 'object') ? raw.config : {},
    };

    if (kind === 'boolean') {
      // Fixed True/False options; the correct one is whichever id the author marked
      // (accept a raw boolean `correctBool` too, for JSON convenience).
      q.options = [{ id: 'true', label: 'True' }, { id: 'false', label: 'False' }];
      let correct = Array.isArray(raw?.correctOptionIds) ? raw.correctOptionIds.map(String) : [];
      if (!correct.length && typeof raw?.correctBool === 'boolean') correct = [raw.correctBool ? 'true' : 'false'];
      correct = correct.filter((id) => id === 'true' || id === 'false').slice(0, 1);
      if (!correct.length) throw new ValidationError(`Question ${position + 1}: mark True or False as the correct answer`);
      q.correctOptionIds = correct;
    } else if (kind === 'single' || kind === 'multi') {
      const rawOpts = Array.isArray(raw?.options) ? raw.options : [];
      const opts = rawOpts
        .map((o) => {
          const label = String((typeof o === 'string' ? o : (o?.label ?? '')) || '').trim();
          const id = (o && typeof o === 'object' && o.id) ? String(o.id) : optId();
          return label ? { id, label } : null;
        })
        .filter(Boolean);
      if (opts.length < 2) throw new ValidationError(`Question ${position + 1} needs at least two options`);
      // Which are correct? Accept ids, or a `correct` boolean flag on each option.
      const flagged = rawOpts
        .map((o, i) => ((o && typeof o === 'object' && o.correct === true) ? opts[i]?.id : null))
        .filter(Boolean);
      const byId = new Set(opts.map((o) => o.id));
      const explicit = (Array.isArray(raw?.correctOptionIds) ? raw.correctOptionIds.map(String) : []).filter((id) => byId.has(id));
      let correct = explicit.length ? explicit : flagged;
      if (kind === 'single') correct = correct.slice(0, 1);
      if (!correct.length) throw new ValidationError(`Question ${position + 1}: mark the correct answer${kind === 'multi' ? '(s)' : ''}`);
      q.options = opts;
      q.correctOptionIds = correct;
    } else { // short
      const accepted = (Array.isArray(raw?.acceptedAnswers) ? raw.acceptedAnswers : [])
        .map((a) => String(a || '').trim()).filter(Boolean);
      if (!accepted.length) throw new ValidationError(`Question ${position + 1}: add at least one accepted answer`);
      q.acceptedAnswers = accepted;
      q.matchMode = MATCH_MODES.includes(raw?.matchMode) ? raw.matchMode : 'exact';
    }
    return q;
  }

  /** Validate + shape the kit meta fields shared by create/update. */
  _normalizeKitMeta(data = {}) {
    const meta = {};
    if (data.title !== undefined) {
      const title = String(data.title || '').trim();
      if (!title) throw new ValidationError('A quiz needs a title');
      meta.title = title;
    }
    if (data.description !== undefined) meta.description = data.description ? String(data.description) : null;
    if (data.timeLimitSeconds !== undefined) {
      const n = Number.parseInt(data.timeLimitSeconds, 10);
      meta.timeLimitSeconds = Number.isFinite(n) && n > 0 ? n : null;
    }
    if (data.passScore !== undefined) {
      const n = Number.parseInt(data.passScore, 10);
      meta.passScore = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
    }
    if (data.shuffleQuestions !== undefined) meta.shuffleQuestions = Boolean(data.shuffleQuestions);
    if (data.showAnswers !== undefined) meta.showAnswers = Boolean(data.showAnswers);
    if (data.allowRetakeDefault !== undefined) meta.allowRetakeDefault = Boolean(data.allowRetakeDefault);
    if (data.evaluationDefault !== undefined) {
      if (!EVAL_MODES.includes(data.evaluationDefault)) throw new ValidationError('Invalid evaluation mode');
      meta.evaluationDefault = data.evaluationDefault;
    }
    if (data.programId !== undefined) meta.programId = data.programId || null;
    if (data.clanId !== undefined) meta.clanId = data.clanId || null;
    if (data.status !== undefined) {
      if (!KIT_STATUSES.includes(data.status)) throw new ValidationError('Invalid kit status');
      meta.status = data.status;
    }
    if (data.settings !== undefined && data.settings && typeof data.settings === 'object') meta.settings = data.settings;
    return meta;
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  async createKit(userId, data = {}) {
    const meta = this._normalizeKitMeta(data);
    if (!meta.title) throw new ValidationError('A quiz needs a title');
    const rawQuestions = Array.isArray(data.questions) ? data.questions : [];
    const questions = rawQuestions.map((q, i) => this._normalizeQuestion(q, i));

    return sequelize.transaction(async (transaction) => {
      const kit = await models.QuizKit.create({ ...meta, createdBy: userId }, { transaction });
      if (questions.length) {
        await models.QuizQuestion.bulkCreate(questions.map((q) => ({ ...q, kitId: kit.id })), { transaction });
      }
      return this.getKit(userId, kit.id, { transaction });
    });
  }

  /** Kits this user can author with — their own, most-recent first. */
  async listKits(userId, { statuses } = {}) {
    const where = { createdBy: userId };
    if (Array.isArray(statuses) && statuses.length) {
      where.status = { [Op.in]: statuses.filter((s) => KIT_STATUSES.includes(s)) };
    }
    const kits = await models.QuizKit.findAll({
      where,
      include: [{ model: models.QuizQuestion, as: 'questions', attributes: ['id', 'kind', 'points'] }],
      order: [['updated_at', 'DESC']],
    });
    return kits.map((k) => {
      const questions = k.questions || [];
      return {
        id: k.id,
        title: k.title,
        description: k.description,
        status: k.status,
        timeLimitSeconds: k.timeLimitSeconds,
        passScore: k.passScore,
        evaluationDefault: k.evaluationDefault,
        allowRetakeDefault: k.allowRetakeDefault,
        questionCount: questions.length,
        totalPoints: questions.reduce((s, q) => s + (q.points || 0), 0),
        updatedAt: k.updatedAt,
      };
    });
  }

  /** A single kit with its ordered questions (author-only). */
  async getKit(userId, kitId, { transaction } = {}) {
    const kit = await models.QuizKit.findByPk(kitId, {
      include: [{ model: models.QuizQuestion, as: 'questions' }],
      order: [[{ model: models.QuizQuestion, as: 'questions' }, 'position', 'ASC']],
      transaction,
    });
    if (!kit) throw new NotFoundError('Quiz not found');
    if (userId && kit.createdBy !== userId) throw new ForbiddenError('You do not have access to this quiz');
    return this._shapeKit(kit);
  }

  _shapeKit(kit) {
    const questions = [...(kit.questions || [])].sort((a, b) => a.position - b.position);
    return {
      id: kit.id,
      title: kit.title,
      description: kit.description,
      createdBy: kit.createdBy,
      programId: kit.programId,
      clanId: kit.clanId,
      status: kit.status,
      timeLimitSeconds: kit.timeLimitSeconds,
      passScore: kit.passScore,
      shuffleQuestions: kit.shuffleQuestions,
      showAnswers: kit.showAnswers,
      allowRetakeDefault: kit.allowRetakeDefault,
      evaluationDefault: kit.evaluationDefault,
      settings: kit.settings || {},
      totalPoints: questions.reduce((s, q) => s + (q.points || 0), 0),
      questions: questions.map((q) => ({
        id: q.id,
        position: q.position,
        kind: q.kind,
        prompt: q.prompt,
        points: q.points,
        required: q.required,
        options: q.options || [],
        correctOptionIds: q.correctOptionIds || [],
        acceptedAnswers: q.acceptedAnswers || [],
        matchMode: q.matchMode,
        explanation: q.explanation,
        config: q.config || {},
      })),
      updatedAt: kit.updatedAt,
      createdAt: kit.createdAt,
    };
  }

  /** Update kit meta and (when `questions` is provided) replace the full set. */
  async updateKit(userId, kitId, data = {}) {
    const kit = await models.QuizKit.findByPk(kitId);
    if (!kit) throw new NotFoundError('Quiz not found');
    if (kit.createdBy !== userId) throw new ForbiddenError('You do not have access to this quiz');

    const meta = this._normalizeKitMeta(data);
    if (meta.settings) meta.settings = { ...(kit.settings || {}), ...meta.settings };

    return sequelize.transaction(async (transaction) => {
      if (Object.keys(meta).length) await kit.update(meta, { transaction });
      if (Array.isArray(data.questions)) {
        const questions = data.questions.map((q, i) => this._normalizeQuestion(q, i));
        await models.QuizQuestion.destroy({ where: { kitId }, transaction });
        if (questions.length) {
          await models.QuizQuestion.bulkCreate(questions.map((q) => ({ ...q, kitId })), { transaction });
        }
      }
      return this.getKit(userId, kitId, { transaction });
    });
  }

  /** Delete a kit. Blocked while assignments reference it (FK is RESTRICT). */
  async deleteKit(userId, kitId) {
    const kit = await models.QuizKit.findByPk(kitId);
    if (!kit) throw new NotFoundError('Quiz not found');
    if (kit.createdBy !== userId) throw new ForbiddenError('You do not have access to this quiz');

    const inUse = await models.QuizAssignment.count({ where: { kitId } });
    if (inUse > 0) throw new ConflictError('This quiz is in use by assigned tasks. Archive it instead of deleting.');
    await models.QuizQuestion.destroy({ where: { kitId } });
    await kit.destroy();
    return { deleted: true };
  }

  // ── Assignment ───────────────────────────────────────────────────────────────

  /**
   * Attach a quiz kit + per-assignment options to a freshly created `assigned_task`
   * of type 'quiz'. Called from taskService.createCustomTask. Options default to the
   * kit's own defaults when the mentor didn't override them.
   */
  async createAssignmentForTask({ assignedTaskId, kitId, options = {} }, { transaction } = {}) {
    if (!assignedTaskId) throw new ValidationError('assignedTaskId is required');
    if (!kitId) throw new ValidationError('A quiz task needs a kit (kitId)');

    const kit = await models.QuizKit.findByPk(kitId, { transaction });
    if (!kit) throw new NotFoundError('Quiz not found');
    if (kit.status !== 'published') {
      throw new ValidationError("This quiz isn't published yet — publish it before assigning.");
    }

    const questionCount = await models.QuizQuestion.count({ where: { kitId }, transaction });
    if (questionCount === 0) throw new ValidationError('This quiz has no questions yet');

    const pick = (v, fallback) => (v === undefined || v === null ? fallback : Boolean(v));
    const evaluationMode = EVAL_MODES.includes(options.evaluationMode) ? options.evaluationMode : kit.evaluationDefault;
    const tlRaw = options.timeLimitSeconds ?? kit.timeLimitSeconds;
    const tlNum = Number.parseInt(tlRaw, 10);
    const passRaw = options.passScore ?? kit.passScore;
    const passNum = Number.parseInt(passRaw, 10);

    return models.QuizAssignment.create({
      assignedTaskId,
      kitId,
      evaluationMode,
      allowRetake: pick(options.allowRetake, kit.allowRetakeDefault),
      timeLimitSeconds: Number.isFinite(tlNum) && tlNum > 0 ? tlNum : null,
      shuffleQuestions: pick(options.shuffleQuestions, kit.shuffleQuestions),
      showAnswers: pick(options.showAnswers, kit.showAnswers),
      passScore: Number.isFinite(passNum) ? Math.max(0, Math.min(100, passNum)) : null,
    }, { transaction });
  }
}

module.exports = new QuizKitService();
