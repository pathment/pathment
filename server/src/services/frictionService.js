const { models } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');

/**
 * frictionService - blockers and delay events. These are the mentee-facing
 * "what's slowing you down" inputs that feed the cockpit and the fairness read.
 */
class FrictionService {
  // ── Blockers ──────────────────────────────────────────────────────────────
  async listBlockers({ menteeId, status }) {
    const where = {};
    if (menteeId) where.menteeId = menteeId;
    if (status) where.status = status;
    return models.Blocker.findAll({ where, order: [['openedAt', 'DESC']] });
  }

  async createBlocker(data, createdBy) {
    const { menteeId } = data;
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    if (!title || !menteeId) throw new ValidationError('title and menteeId are required');
    // Generous cap with a friendly message, so a huge paste is a clean 400 — not
    // an opaque DB error. (Column is TEXT, so normal paragraphs are fine.)
    if (title.length > 5000) throw new ValidationError('That blocker note is too long — please keep it under 5000 characters.');
    return models.Blocker.create({
      menteeId,
      assignedTaskId: data.assignedTaskId || null,
      title,
      category: data.category || 'technical',
      severity: data.severity || 'medium',
      status: 'open',
      createdBy: createdBy || null
    });
  }

  async resolveBlocker(id) {
    const blocker = await models.Blocker.findByPk(id);
    if (!blocker) throw new NotFoundError('Blocker not found');
    blocker.status = 'resolved';
    blocker.resolvedAt = new Date();
    await blocker.save();
    return blocker;
  }

  // ── Delays ──────────────────────────────────────────────────────────────
  async listDelays({ menteeId }) {
    const where = {};
    if (menteeId) where.menteeId = menteeId;
    return models.DelayEvent.findAll({ where, order: [['occurredAt', 'DESC']] });
  }

  async createDelay(data, createdBy) {
    const { reason, menteeId } = data;
    if (!reason || !menteeId) throw new ValidationError('reason and menteeId are required');
    return models.DelayEvent.create({
      menteeId,
      assignedTaskId: data.assignedTaskId || null,
      reason,
      kind: data.kind || 'other',
      days: data.days || 0,
      category: data.category || 'external',
      accepted: false,
      aiRationale: data.aiRationale || null,
      createdBy: createdBy || null
    });
  }

  async acceptDelay(id, { accepted = true, category }) {
    const delay = await models.DelayEvent.findByPk(id);
    if (!delay) throw new NotFoundError('Delay event not found');
    delay.accepted = accepted;
    if (category) delay.category = category;
    await delay.save();
    return delay;
  }
}

module.exports = new FrictionService();
