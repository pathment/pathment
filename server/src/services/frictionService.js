const { models } = require('../db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors/errorTypes');

// Grace window for a mentee to delete a friction record they logged. Long
// enough to undo an accidental/duplicate entry, short enough that nobody can
// scrub a week's worth of blockers off their record right before a review.
// (Mentors/admins are exempt — they delete as moderators.) Tunable.
const DELETE_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

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

  /**
   * Delete a blocker outright. A mentee may only delete their OWN blocker, and
   * only within the grace window (after that it's a permanent part of the
   * record — they can still Resolve it). Mentors/admins may delete any, anytime.
   */
  async deleteBlocker(id, user) {
    const blocker = await models.Blocker.findByPk(id);
    if (!blocker) throw new NotFoundError('Blocker not found');
    if (user && user.role === 'mentee') {
      if (blocker.menteeId !== user.id) {
        throw new ForbiddenError('You can only delete your own blockers');
      }
      const age = Date.now() - new Date(blocker.openedAt || blocker.createdAt).getTime();
      if (age > DELETE_WINDOW_MS) {
        throw new ForbiddenError('Blockers can only be deleted within 6 hours of logging them. Mark it resolved instead.');
      }
    }
    await blocker.destroy();
    return { deleted: true, id };
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

  /**
   * Reject (remove) a PENDING logged delay. Lets a mentor clear duplicate/bogus
   * requests. An already-accepted delay is locked: it's been credited toward the
   * mentee's fair progress, so removing it would retroactively change standings —
   * not allowed. The route is permission-gated (TASK_REVIEW on the delay's scope).
   */
  async rejectDelay(id) {
    const delay = await models.DelayEvent.findByPk(id);
    if (!delay) throw new NotFoundError('Delay event not found');
    if (delay.accepted) {
      throw new ValidationError('This delay was already accepted and credited — it can no longer be rejected.');
    }
    await delay.destroy();
    return { deleted: true, id };
  }
}

module.exports = new FrictionService();
