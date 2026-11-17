const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ForbiddenError, ValidationError, ConflictError } = require('../utils/errors/errorTypes');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');
const { snapToDifficultyPoints } = require('../config/points');
const { maxRecordingSeconds } = require('./interviewProctoring');

const QUESTION_KINDS = ['voice', 'code', 'text', 'video'];
const TIMING_MODES = ['per_question', 'total'];
const KIT_STATUSES = ['draft', 'published', 'archived'];

/**
 * InterviewKitService — authoring + assignment of reusable interview kits. A kit
 * is an ordered set of questions a mentor builds once and assigns to many mentees
 * as an `interview` task. Grading + the candidate runner live in later phases;
 * this service owns the kit lifecycle and the per-assignment options snapshot.
 */
class InterviewKitService {
  // ── Normalization ──────────────────────────────────────────────────────────

  /** Coerce one raw question from the editor into a clean, storable shape. */
  _normalizeQuestion(raw, position) {
    const kind = QUESTION_KINDS.includes(raw?.kind) ? raw.kind : 'voice';
    const prompt = String(raw?.prompt || '').trim();
    if (!prompt) throw new ValidationError(`Question ${position + 1} needs a prompt`);

    const toPosInt = (v, fallback) => {
      const n = Number.parseInt(v, 10);
      return Number.isFinite(n) && n > 0 ? n : fallback;
    };

    const q = {
      position,
      kind,
      prompt,
      // Snapped to the difficulty curve rather than taken as typed. See
      // config/points.js: the same difficulty is worth the same to everybody.
      points: snapToDifficultyPoints(toPosInt(raw?.points, 10)),
      required: raw?.required !== false,
      // Per-question timer (seconds). Default 120s for voice/text, 600s for code,
      // 180s for video (time to think, then up to the recording cap on camera).
      timeLimitSeconds: toPosInt(raw?.timeLimitSeconds, kind === 'code' ? 600 : kind === 'video' ? 180 : 120),
      codeLanguage: kind === 'code' ? (String(raw?.codeLanguage || 'javascript').trim() || 'javascript') : null,
      starterCode: kind === 'code' ? (raw?.starterCode ? String(raw.starterCode) : null) : null,
      referenceAnswer: raw?.referenceAnswer ? String(raw.referenceAnswer).trim() : null,
      config: (raw?.config && typeof raw.config === 'object' && !Array.isArray(raw.config)) ? { ...raw.config } : {},
    };
    // A video answer has a hard cap on its length, so the file always fits the
    // upload. Stored clamped, so what the runner enforces is what the kit says.
    if (kind === 'video') q.config.maxRecordingSeconds = maxRecordingSeconds(q.config);
    else delete q.config.maxRecordingSeconds;
    return q;
  }

  /** Validate + shape the kit meta fields shared by create/update. */
  _normalizeKitMeta(data = {}) {
    const meta = {};
    if (data.title !== undefined) {
      const title = String(data.title || '').trim();
      if (!title) throw new ValidationError('An interview kit needs a title');
      meta.title = title;
    }
    if (data.description !== undefined) meta.description = data.description ? String(data.description) : null;
    if (data.timingMode !== undefined) {
      if (!TIMING_MODES.includes(data.timingMode)) throw new ValidationError('Invalid timing mode');
      meta.timingMode = data.timingMode;
    }
    if (data.totalSeconds !== undefined) {
      const n = Number.parseInt(data.totalSeconds, 10);
      meta.totalSeconds = Number.isFinite(n) && n > 0 ? n : null;
    }
    if (data.cameraDefault !== undefined) meta.cameraDefault = Boolean(data.cameraDefault);
    if (data.aiGradingDefault !== undefined) meta.aiGradingDefault = Boolean(data.aiGradingDefault);
    if (data.allowRetakeDefault !== undefined) meta.allowRetakeDefault = Boolean(data.allowRetakeDefault);
    if (data.programId !== undefined) meta.programId = data.programId || null;
    if (data.clanId !== undefined) meta.clanId = data.clanId || null;
    if (data.status !== undefined) {
      if (!KIT_STATUSES.includes(data.status)) throw new ValidationError('Invalid kit status');
      meta.status = data.status;
    }
    if (data.settings !== undefined && data.settings && typeof data.settings === 'object') meta.settings = data.settings;
    // Interviewer identity for the candidate's TTS: name + pitch/rate + a preferred
    // voice (best-effort on the candidate's device). Stored under settings.interviewer.
    if (data.interviewer !== undefined) {
      const iv = data.interviewer || {};
      const clamp = (n, lo, hi, dflt) => { const x = Number(n); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : dflt; };
      meta.settings = {
        ...(meta.settings || {}),
        interviewer: {
          name: iv.name ? String(iv.name).slice(0, 40).trim() : null,
          voiceName: iv.voiceName ? String(iv.voiceName).slice(0, 120) : null,
          pitch: clamp(iv.pitch, 0, 2, 1),
          rate: clamp(iv.rate, 0.5, 2, 1),
        },
      };
    }
    return meta;
  }

  /** Upload a mentor's recorded prompt audio; the URL is stored on a question's
   *  config so the candidate hears the real voice for that question. */
  async uploadPromptAudio(userId, file) {
    if (!file || !file.buffer) throw new ValidationError('No audio file received');
    let result;
    try {
      result = await uploadToCloudinary(file.buffer, 'pathment/interviews/prompts', 'video');
    } catch (err) {
      console.error('[interview] prompt audio upload failed:', err?.message);
      throw new ValidationError('Could not upload the recording. Please try again.');
    }
    return { url: result.secure_url, publicId: result.public_id };
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  /** Create a kit (with its questions) owned by `userId`. */
  async createKit(userId, data = {}) {
    const meta = this._normalizeKitMeta(data);
    if (!meta.title) throw new ValidationError('An interview kit needs a title');
    const rawQuestions = Array.isArray(data.questions) ? data.questions : [];
    const questions = rawQuestions.map((q, i) => this._normalizeQuestion(q, i));

    return sequelize.transaction(async (transaction) => {
      const kit = await models.InterviewKit.create({ ...meta, createdBy: userId }, { transaction });
      if (questions.length) {
        await models.InterviewQuestion.bulkCreate(
          questions.map((q) => ({ ...q, kitId: kit.id })),
          { transaction }
        );
      }
      return this.getKit(userId, kit.id, { transaction });
    });
  }

  /**
   * Kits this user can author with — their own, most-recent first. Pass
   * `statuses` (e.g. `['published']`) to limit to assignable kits; omit for the
   * full authoring list (all statuses).
   */
  async listKits(userId, { statuses } = {}) {
    const where = { createdBy: userId };
    if (Array.isArray(statuses) && statuses.length) {
      where.status = { [Op.in]: statuses.filter((s) => KIT_STATUSES.includes(s)) };
    }
    const kits = await models.InterviewKit.findAll({
      where,
      include: [{ model: models.InterviewQuestion, as: 'questions', attributes: ['id', 'kind', 'points'] }],
      order: [['updated_at', 'DESC']],
    });
    return kits.map((k) => {
      const questions = k.questions || [];
      return {
        id: k.id,
        title: k.title,
        description: k.description,
        status: k.status,
        timingMode: k.timingMode,
        totalSeconds: k.totalSeconds,
        cameraDefault: k.cameraDefault,
        aiGradingDefault: k.aiGradingDefault,
        allowRetakeDefault: k.allowRetakeDefault,
        questionCount: questions.length,
        totalPoints: questions.reduce((s, q) => s + (q.points || 0), 0),
        updatedAt: k.updatedAt,
      };
    });
  }

  /** A single kit with its ordered questions. Author-only (or via assignment). */
  async getKit(userId, kitId, { transaction } = {}) {
    const kit = await models.InterviewKit.findByPk(kitId, {
      include: [{ model: models.InterviewQuestion, as: 'questions' }],
      order: [[{ model: models.InterviewQuestion, as: 'questions' }, 'position', 'ASC']],
      transaction,
    });
    if (!kit) throw new NotFoundError('Interview kit not found');
    if (userId && kit.createdBy !== userId) throw new ForbiddenError('You do not have access to this interview kit');
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
      timingMode: kit.timingMode,
      totalSeconds: kit.totalSeconds,
      cameraDefault: kit.cameraDefault,
      aiGradingDefault: kit.aiGradingDefault,
      allowRetakeDefault: kit.allowRetakeDefault,
      settings: kit.settings || {},
      totalPoints: questions.reduce((s, q) => s + (q.points || 0), 0),
      questions: questions.map((q) => ({
        id: q.id,
        position: q.position,
        kind: q.kind,
        prompt: q.prompt,
        timeLimitSeconds: q.timeLimitSeconds,
        points: q.points,
        required: q.required,
        codeLanguage: q.codeLanguage,
        starterCode: q.starterCode,
        referenceAnswer: q.referenceAnswer,
        config: q.config || {},
      })),
      updatedAt: kit.updatedAt,
      createdAt: kit.createdAt,
    };
  }

  /**
   * Update kit meta and (when `questions` is provided) replace the full question
   * set. Replacing wholesale keeps the editor dead-simple: it always sends the
   * current list and we reconcile — no per-row add/update/delete plumbing.
   */
  async updateKit(userId, kitId, data = {}) {
    const kit = await models.InterviewKit.findByPk(kitId);
    if (!kit) throw new NotFoundError('Interview kit not found');
    if (kit.createdBy !== userId) throw new ForbiddenError('You do not have access to this interview kit');

    const meta = this._normalizeKitMeta(data);
    // Merge settings so setting the interviewer doesn't drop other settings keys.
    if (meta.settings) meta.settings = { ...(kit.settings || {}), ...meta.settings };

    return sequelize.transaction(async (transaction) => {
      if (Object.keys(meta).length) await kit.update(meta, { transaction });
      if (Array.isArray(data.questions)) {
        const questions = data.questions.map((q, i) => this._normalizeQuestion(q, i));
        await models.InterviewQuestion.destroy({ where: { kitId }, transaction });
        if (questions.length) {
          await models.InterviewQuestion.bulkCreate(
            questions.map((q) => ({ ...q, kitId })),
            { transaction }
          );
        }
      }
      return this.getKit(userId, kitId, { transaction });
    });
  }

  /** Delete a kit. Blocked while assignments reference it (FK is RESTRICT). */
  async deleteKit(userId, kitId) {
    const kit = await models.InterviewKit.findByPk(kitId);
    if (!kit) throw new NotFoundError('Interview kit not found');
    if (kit.createdBy !== userId) throw new ForbiddenError('You do not have access to this interview kit');

    const inUse = await models.InterviewAssignment.count({ where: { kitId } });
    if (inUse > 0) {
      throw new ConflictError('This kit is in use by assigned interviews. Archive it instead of deleting.');
    }
    await models.InterviewQuestion.destroy({ where: { kitId } });
    await kit.destroy();
    return { deleted: true };
  }

  // ── Assignment ───────────────────────────────────────────────────────────────

  /**
   * Attach an interview kit + per-assignment options to a freshly created
   * `assigned_task` of type 'interview'. Called from taskService.createCustomTask.
   * Options default to the kit's own defaults when the mentor didn't override them.
   */
  async createAssignmentForTask({ assignedTaskId, kitId, options = {} }, { transaction } = {}) {
    if (!assignedTaskId) throw new ValidationError('assignedTaskId is required');
    if (!kitId) throw new ValidationError('An interview task needs a kit (kitId)');

    const kit = await models.InterviewKit.findByPk(kitId, { transaction });
    if (!kit) throw new NotFoundError('Interview kit not found');
    if (kit.status !== 'published') {
      throw new ValidationError("This interview kit isn't published yet — publish it before assigning.");
    }

    const questionCount = await models.InterviewQuestion.count({ where: { kitId }, transaction });
    if (questionCount === 0) throw new ValidationError('This interview kit has no questions yet');

    const pick = (v, fallback) => (v === undefined || v === null ? fallback : Boolean(v));
    const timingMode = TIMING_MODES.includes(options.timingMode) ? options.timingMode : kit.timingMode;
    const totalSecondsRaw = options.totalSeconds ?? kit.totalSeconds;
    const totalSecondsNum = Number.parseInt(totalSecondsRaw, 10);

    return models.InterviewAssignment.create({
      assignedTaskId,
      kitId,
      allowRetake: pick(options.allowRetake, kit.allowRetakeDefault),
      cameraRequired: pick(options.cameraRequired, kit.cameraDefault),
      aiGradingEnabled: pick(options.aiGradingEnabled, kit.aiGradingDefault),
      timingMode,
      totalSeconds: timingMode === 'total' && Number.isFinite(totalSecondsNum) && totalSecondsNum > 0 ? totalSecondsNum : null,
    }, { transaction });
  }
}

module.exports = new InterviewKitService();
