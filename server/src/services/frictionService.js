const { models } = require('../db');
const authzService = require('./authzService');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { PERMISSIONS: P } = require('../config/permissions');
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
   * Throw unless `user` may touch this mentee's friction records. `canViewMentee`
   * is the one ownership rule — self, admin, direct 1:1 match, or MENTEE_VIEW at
   * the mentee's clan (covers lead/co-mentor and cross-clan cover) — so every
   * entry point below shares a single definition instead of its own guess.
   */
  async #assertCanAccessMentee(user, menteeId) {
    if (!user) throw new ForbiddenError('Authentication required');
    if (!menteeId) throw new ValidationError('menteeId is required');
    if (!(await authzService.canViewMentee(user, menteeId))) {
      throw new ForbiddenError('You are not authorized to access this mentee\'s records');
    }
    return menteeId;
  }

  /**
   * The mentee ids a LIST narrows to when the caller named none.
   *   undefined → no filter (admin tier: they see everything)
   *   [ids]     → their own record, if they're a learner, plus every mentee they
   *               mentor in a clan where `mentee.view` is actually in force
   * Derived from capabilities, never the base `role` column: a mentee-based
   * co-mentor really does mentor a clan, and an admin sub-role (core_team,
   * program_admin) doesn't read 'admin' there.
   */
  async #visibleMenteeIds(user) {
    if (!user) throw new ForbiddenError('Authentication required');
    // Resolved once and threaded through — each of these would otherwise rebuild
    // the user's whole role set (memberships + cover + grants) from scratch.
    const assignments = await authzService.getAssignments(user);
    if (await authzService.hasAdminAccess(user, { assignments })) return undefined;
    const [mentored, capabilities] = await Promise.all([
      authzService.resolveMenteeIds(user, { permission: P.MENTEE_VIEW, assignments }),
      authzService.getCapabilities(user, { assignments })
    ]);
    const ids = new Set(mentored);
    if (capabilities.includes('mentee')) ids.add(user.id);
    return [...ids];
  }

  /** List scoping: `undefined` = unfiltered, `[]` = nothing this user can see. */
  async #menteeScope(menteeId, user) {
    if (menteeId) return this.#assertCanAccessMentee(user, menteeId);
    return this.#visibleMenteeIds(user);
  }

  /**
   * A delay is reviewed FOR someone, never BY them. A mentee who co-mentors the
   * clan they also learn in holds TASK_REVIEW at that clan's scope and passes
   * `canViewMentee` on themselves, so without this they could accept — and
   * credit — their own delay. Mirrors the guard in authzService.canActOnTask.
   */
  async #assertNotSelfReview(user, menteeId) {
    if (user.id === menteeId && !(await authzService.hasAdminAccess(user))) {
      throw new ForbiddenError('You cannot review your own delay.');
    }
  }

  // ── Blockers ──────────────────────────────────────────────────────────────
  async listBlockers({ menteeId, status, user }) {
    const scope = await this.#menteeScope(menteeId, user);
    if (Array.isArray(scope) && scope.length === 0) return [];
    const where = {};
    if (scope !== undefined) where.menteeId = scope;
    if (status) where.status = status;
    return models.Blocker.findAll({ where, order: [['openedAt', 'DESC']] });
  }

  /**
   * Blockers for a single mentee, eager-loaded with their linked task title —
   * the shape the mentor's mentee-profile view renders. Owned here (not by
   * cohortService) so the friction domain keeps its query/includes in one place.
   *
   * Like `listDelaysFor`, this is an INTERNAL read for a caller that has already
   * authorized the mentee (cohortController runs `canViewMentee` before building
   * the profile). It takes a bare menteeId and does no check of its own — never
   * reach it straight from a route.
   */
  async listBlockersWithTask(menteeId) {
    return models.Blocker.findAll({
      where: { menteeId },
      order: [['status', 'ASC'], ['openedAt', 'DESC']],
      include: [{ model: models.AssignedTask, as: 'task', attributes: ['id'], include: [{ model: models.RoadmapTask, as: 'roadmapTask', attributes: ['title'] }] }]
    });
  }

  async createBlocker(data, createdBy, currentUser) {
    const { menteeId } = data;
    await this.#assertCanAccessMentee(currentUser, menteeId);
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
    await this.#assertCanAccessMentee(currentUser, blocker.menteeId);
    blocker.status = 'resolved';
    blocker.resolvedAt = new Date();
    await blocker.save();
    return blocker;
  }

  /**
   * Delete a blocker outright. Deleting your OWN record is the windowed case —
   * long enough to undo a mistake, short enough that nobody scrubs a week of
   * blockers off their record before a review. Mentors/admins delete as
   * moderators, so they're exempt. Keyed on whose record it is, not on the base
   * role: a mentee-based co-mentor is a moderator for their clan and a learner
   * for their own row.
   */
  async deleteBlocker(id, currentUser) {
    const blocker = await models.Blocker.findByPk(id);
    if (!blocker) throw new NotFoundError('Blocker not found');
    await this.#assertCanAccessMentee(currentUser, blocker.menteeId);
    const ownRecord = currentUser.id === blocker.menteeId;
    if (ownRecord && !(await authzService.hasAdminAccess(currentUser))) {
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
    const scope = await this.#menteeScope(menteeId, user);
    if (Array.isArray(scope) && scope.length === 0) return [];
    const where = {};
    if (scope !== undefined) where.menteeId = scope;
    return models.DelayEvent.findAll({ where, order: [['occurredAt', 'DESC']] });
  }

  /**
   * Delays for one mentee, for a caller that has ALREADY authorized them — the
   * mentor's mentee-profile assembly, where cohortController checks
   * `canViewMentee` before any of this runs. The counterpart to
   * `listBlockersWithTask`; `listDelays` stays the request-facing entry point
   * and keeps its own check. Route handlers must not call this.
   */
  async listDelaysFor(menteeId) {
    return models.DelayEvent.findAll({ where: { menteeId }, order: [['occurredAt', 'DESC']] });
  }

  async createDelay(data, createdBy, currentUser) {
    const { reason, menteeId } = data;
    await this.#assertCanAccessMentee(currentUser, menteeId);
    if (!reason) throw new ValidationError('reason is required');
    return models.DelayEvent.create({
      menteeId,
      assignedTaskId: data.assignedTaskId || null,
      reason,
      kind: data.kind || 'other',
      days: data.days || 0,
      category: data.category || 'external',
      accepted: false,
      reviewStatus: 'pending',
      aiRationale: data.aiRationale || null,
      createdBy: createdBy || null
    });
  }

  async acceptDelay(id, { accepted = true, category }, currentUser) {
    const delay = await models.DelayEvent.findByPk(id);
    if (!delay) throw new NotFoundError('Delay event not found');
    await this.#assertCanAccessMentee(currentUser, delay.menteeId);
    await this.#assertNotSelfReview(currentUser, delay.menteeId);
    if (delay.reviewStatus === 'rejected') {
      throw new ValidationError('This delay was rejected and cannot be approved unless it is reopened.');
    }
    if (delay.reviewStatus === 'accepted') {
      throw new ValidationError('This delay was already accepted.');
    }
    delay.accepted = accepted;
    delay.reviewStatus = 'accepted';
    delay.reviewedAt = new Date();
    delay.reviewedBy = currentUser.id;
    delay.rejectionReason = null;
    if (category) delay.category = category;
    await delay.save();
    return delay;
  }

  /**
   * Reject a PENDING logged delay — keeps the record for history, clears any
   * fairness credit, and notifies the mentee. Accepted delays stay locked.
   */
  async rejectDelay(id, { reason } = {}, currentUser) {
    const delay = await models.DelayEvent.findByPk(id);
    if (!delay) throw new NotFoundError('Delay event not found');
    await this.#assertCanAccessMentee(currentUser, delay.menteeId);
    await this.#assertNotSelfReview(currentUser, delay.menteeId);
    if (delay.reviewStatus === 'accepted' || delay.accepted) {
      throw new ValidationError('This delay was already accepted and credited — it can no longer be rejected.');
    }
    if (delay.reviewStatus === 'rejected') {
      throw new ValidationError('This delay was already rejected.');
    }

    const trimmed = typeof reason === 'string' ? reason.trim() : '';
    delay.reviewStatus = 'rejected';
    delay.accepted = false;
    delay.rejectionReason = trimmed || null;
    delay.reviewedAt = new Date();
    delay.reviewedBy = currentUser.id;
    await delay.save();

    const reviewer = await models.User.findByPk(currentUser.id, { attributes: ['firstName', 'lastName'] });
    const reviewerName = reviewer ? `${reviewer.firstName || ''} ${reviewer.lastName || ''}`.trim() : 'Your mentor';
    const reasonNote = trimmed ? ` Reason: ${trimmed}` : '';

    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.DELAY_REJECTED,
      recipients: [{ userId: delay.menteeId }],
      payload: {
        title: 'Delay request not accepted',
        message: `${reviewerName} did not accept your logged delay.${reasonNote}`,
        actionUrl: '/mentee/progress',
        actionLabel: 'View progress',
        relatedEntityType: 'delay_event',
        relatedEntityId: delay.id,
        emailSubject: 'Pathment: Your delay request was not accepted',
      },
      dedupe: { relatedEntityType: 'delay_rejected', relatedEntityId: delay.id },
    }).catch((e) => console.error('[friction] delay rejected notification failed:', e.message));

    return delay;
  }
}

module.exports = new FrictionService();
