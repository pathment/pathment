const { models } = require('../db');
const authzService = require('./authzService');
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
  /**
   * Resolve the menteeId(s) that `currentUser` is authorized to access.
   *
   * - Specific mentee requested: verify via authzService.canViewMentee()
   *   (handles self, admin, direct match, clan scope, cross-clan cover)
   * - No specific mentee: admin → no filter; mentee → self; mentor → all
   *   their mentees via authzService.resolveMenteeIds()
   *
   * @returns {string|string[]|undefined}  single id, array of ids, or
   *   undefined (admin sees all — no filter). Throws ForbiddenError when
   *   the caller has no right to the target mentee.
   */
  async #resolveAuthorizedMenteeIds(requestedMenteeId, currentUser) {
    if (!currentUser) throw new ForbiddenError('Authentication required');

    // Specific mentee requested: one-shot permission check.
    if (requestedMenteeId) {
      if (!(await authzService.canViewMentee(currentUser, requestedMenteeId))) {
        throw new ForbiddenError('You are not authorized to access this mentee\'s records');
      }
      return requestedMenteeId;
    }

    // No specific mentee — determine the implicit scope.
    if (currentUser.role === 'mentee') return currentUser.id;
    if (currentUser.role === 'admin') return undefined; // admin sees all

    // Mentor and any other mentoring-role holder.
    return authzService.resolveMenteeIds(currentUser.id);
  }

  // ── Blockers ──────────────────────────────────────────────────────────────
  async listBlockers({ menteeId, status, user }) {
    const resolved = await this.#resolveAuthorizedMenteeIds(menteeId, user);
    if (resolved !== undefined && Array.isArray(resolved) && resolved.length === 0) return [];
    let where = {};
    if (resolved !== undefined) where.menteeId = resolved;
    if (status) where.status = status;
    return models.Blocker.findAll({ where, order: [['openedAt', 'DESC']] });
  }

  async createBlocker(data, createdBy, currentUser) {
    const { menteeId } = data;
    if (!menteeId) throw new ValidationError('menteeId is required');
    await this.#resolveAuthorizedMenteeIds(menteeId, currentUser);
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    if (!title) throw new ValidationError('title is required');
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

  async resolveBlocker(id, currentUser) {
    const blocker = await models.Blocker.findByPk(id);
    if (!blocker) throw new NotFoundError('Blocker not found');
    await this.#resolveAuthorizedMenteeIds(blocker.menteeId, currentUser);
    blocker.status = 'resolved';
    blocker.resolvedAt = new Date();
    await blocker.save();
    return blocker;
  }

  async deleteBlocker(id, currentUser) {
    const blocker = await models.Blocker.findByPk(id);
    if (!blocker) throw new NotFoundError('Blocker not found');
    await this.#resolveAuthorizedMenteeIds(blocker.menteeId, currentUser);
    if (currentUser.role === 'mentee') {
      const age = Date.now() - new Date(blocker.openedAt || blocker.createdAt).getTime();
      if (age > DELETE_WINDOW_MS) {
        throw new ForbiddenError('Blockers can only be deleted within 6 hours of logging them. Mark it resolved instead.');
      }
    }
    await blocker.destroy();
    return { deleted: true, id };
  }

  // ── Delays ──────────────────────────────────────────────────────────────
  async listDelays({ menteeId, user }) {
    const resolved = await this.#resolveAuthorizedMenteeIds(menteeId, user);
    if (resolved !== undefined && Array.isArray(resolved) && resolved.length === 0) return [];
    const where = {};
    if (resolved !== undefined) where.menteeId = resolved;
    return models.DelayEvent.findAll({ where, order: [['occurredAt', 'DESC']] });
  }

  async createDelay(data, createdBy, currentUser) {
    const { reason, menteeId } = data;
    if (!menteeId) throw new ValidationError('menteeId is required');
    await this.#resolveAuthorizedMenteeIds(menteeId, currentUser);
    if (!reason) throw new ValidationError('reason is required');
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

  async acceptDelay(id, { accepted = true, category }, currentUser) {
    const delay = await models.DelayEvent.findByPk(id);
    if (!delay) throw new NotFoundError('Delay event not found');
    await this.#resolveAuthorizedMenteeIds(delay.menteeId, currentUser);
    delay.accepted = accepted;
    if (category) delay.category = category;
    await delay.save();
    return delay;
  }

  async rejectDelay(id, currentUser) {
    const delay = await models.DelayEvent.findByPk(id);
    if (!delay) throw new NotFoundError('Delay event not found');
    await this.#resolveAuthorizedMenteeIds(delay.menteeId, currentUser);
    if (delay.accepted) {
      throw new ValidationError('This delay was already accepted and credited — it can no longer be rejected.');
    }
    await delay.destroy();
    return { deleted: true, id };
  }
}

module.exports = new FrictionService();
