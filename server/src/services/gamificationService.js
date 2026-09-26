const { models, Sequelize, sequelize } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { todayInZone } = require('../utils/timezone');
const authzService = require('./authzService');
const logger = require('../utils/logger');
const { ensureMenteeProfile } = require('./menteeProfile');
const performanceService = require('./performanceService');
const { AsyncLocalStorage } = require('async_hooks');
const {
  currentStreak,
  longestStreak,
  milestonesReached,
  milestoneFromReason,
  STREAK_BONUSES
} = require('./streak');
const { normalizeIconUrl } = require('../utils/badgeIcons');
const {
  MENTOR_AUTO_CRITERIA,
  isMentorAutoCriteria,
  measureMentorCriteria,
} = require('../utils/mentorBadgeRules');

// Auto-award can nest (badge → XP → more badges). Cap depth so Achievement
// Collector can unlock once without unbounded XP/badge chains.
const badgeEvalStore = new AsyncLocalStorage();
const MAX_BADGE_EVAL_DEPTH = 2;

/**
 * Historical activity policy (mentor auto badges):
 * All org-scoped qualifying activity counts toward thresholds (including
 * activity before the badge was published). Publishing does not scan the org;
 * awards run only after the next qualifying mentor event triggers
 * checkAndAwardMentorBadges. Progress in the catalog uses the same counters.
 */

class GamificationService {
  async audit(action, badgeId, oldValues, newValues, transaction) {
    const ctx = require('../utils/auditContext').getRequestContext();
    return models.AuditLog.create({ action, entityType: 'badge', entityId: badgeId,
      userId: ctx.userId || null, ipAddress: ctx.ip || null, userAgent: ctx.userAgent || null,
      oldValues, newValues }, { transaction });
  }

  async saveBadge(id, data) {
    return sequelize.transaction(async transaction => {
      const badge = id ? await models.Badge.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE }) : null;
      if (id && !badge) throw new NotFoundError('Badge not found');
      if (badge?.retiredAt) throw new ValidationError('Retired badges cannot be changed');
      const oldValues = badge?.toJSON() || null;
      const payload = { ...data };
      if (Object.prototype.hasOwnProperty.call(payload, 'iconUrl')) {
        payload.iconUrl = normalizeIconUrl(payload.iconUrl, { ValidationError });
      }
      const rule = { ...oldValues, ...payload };
      const requiredValue = {
        tasks_completed: 'count', programs_completed: 'count', badges_earned: 'count',
        streak_days: 'days', points_milestone: 'threshold', avg_rating: 'minRating',
        level_reached: 'level', skill_mastery: 'minProficiency',
        mentor_accepted_answers: 'count', mentor_qualifying_reviews: 'count',
        mentor_distinct_mentees: 'menteeCount', mentor_rating: 'minRating',
        mentor_sessions_finished: 'count', mentor_cert_verifications: 'count',
      }[rule.criteriaType];
      if (requiredValue && !(Number(rule.criteriaValue?.[requiredValue]) > 0)) {
        throw new ValidationError('The badge rule needs a positive threshold');
      }
      if (rule.criteriaType === 'skill_mastery' && !rule.criteriaValue?.skillId) throw new ValidationError('Select a skill');
      if (rule.criteriaType === 'mentor_rating') {
        const minReviews = Number(rule.criteriaValue?.minReviews || 3);
        if (minReviews < 3) throw new ValidationError('Mentor rating badges require at least 3 reviews');
      }
      if (rule.audience === 'mentor' && rule.criteriaType !== 'custom' && !isMentorAutoCriteria(rule.criteriaType)) {
        throw new ValidationError('Mentor badges must be manual recognition or a supported automatic rule');
      }
      if (rule.audience !== 'mentor' && isMentorAutoCriteria(rule.criteriaType)) {
        throw new ValidationError('This automatic rule is only available for mentor badges');
      }      if (badge && await models.UserBadge.count({ where: { badgeId: id }, transaction })) {
        for (const field of ['audience', 'criteriaType', 'criteriaValue', 'pointsReward']) {
          if (payload[field] !== undefined && JSON.stringify(payload[field]) !== JSON.stringify(badge[field])) {
            throw new ValidationError('Create a new badge to change an earned badge’s rules or XP');
          }
        }
      }
      const saved = badge ? await badge.update(payload, { transaction }) : await models.Badge.create(payload, { transaction });
      await this.audit(id ? 'badge.updated' : 'badge.created', saved.id, oldValues, saved.toJSON(), transaction);
      return saved;
    });
  }

  async revokeBadge(userId, badgeId, reason) {
    // Soft-revoke only: the UserBadge row stays so the same badge cannot be
    // re-awarded (unique user+badge). Historical badge XP and levels are kept.
    return sequelize.transaction(async transaction => {
      await this._profile(userId, transaction);
      const award = await models.UserBadge.findOne({ where: { userId, badgeId }, transaction, lock: transaction.LOCK.UPDATE });
      if (!award) throw new NotFoundError('Award not found');
      if (award.revokedAt) return award;
      await award.update({ revokedAt: new Date(), revokeReason: reason, isFeatured: false }, { transaction });
      await this.audit('badge.revoked', badgeId, null, { userId, reason, xpPreserved: true, reawardBlocked: true }, transaction);
      return award;
    });
  }
  // The existing ORM workspace boundary stamps and scopes every operation here.
  // Lock a stable profile row, including when its ledger is still empty.
  // Prefer mentee ledger when both exist (legacy dual-role XP path), unless
  // forceMentor is set for mentor-audience awards and mentor badge checks.
  async _profile(userId, transaction, { forceMentor = false } = {}) {
    const options = { where: { userId }, transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) };
    if (!forceMentor) {
      const mentee = await models.MenteeProfile.findOne(options);
      if (mentee) return { profile: mentee, mentor: false };
    }
    const mentor = await models.MentorProfile.findOne(options);
    if (!mentor) {
      if (forceMentor) throw new NotFoundError('Mentor gamification profile not found');
      throw new NotFoundError('Gamification profile not found');
    }
    return { profile: mentor, mentor: true };
  }

  async _writePoints(userId, change, sourceType, sourceId, reason, eventKey, transaction, { forceMentor = false } = {}) {
    const { profile, mentor } = await this._profile(userId, transaction, { forceMentor });
    const pointsBefore = mentor
      ? Number(await models.PointsHistory.sum('pointsChange', { where: { userId, organizationId: profile.organizationId }, transaction }) || 0)
      : Number(profile.totalPoints || 0);
    // Consult pre-migration events too: a new key must never repay an old event.
    const legacy = sourceId ? { userId, sourceType, sourceId }
      : sourceType === 'streak_bonus' ? { userId, sourceType, reason } : null;
    const existing = eventKey && await models.PointsHistory.findOne({
      where: legacy ? { [Sequelize.Op.or]: [{ userId, eventKey }, legacy] } : { userId, eventKey }, transaction,
    });
    if (existing) return { pointsAwarded: 0, applied: 0, totalPoints: pointsBefore, alreadyAwarded: true, history: existing };
    // Mentor XP requires verified recognition or an answer accepted by another person.
    if (mentor && !['badge_earned', 'community_answer'].includes(sourceType)) {
      return { pointsAwarded: 0, applied: 0, totalPoints: pointsBefore };
    }
    if (mentor && sourceType === 'community_answer') {
      const today = new Date().toISOString().slice(0, 10);
      const paidToday = Number(await models.PointsHistory.sum('pointsChange', { where: {
        userId, organizationId: profile.organizationId, sourceType, createdAt: { [Sequelize.Op.gte]: new Date(`${today}T00:00:00Z`) },
      }, transaction }) || 0);
      change = Math.max(0, Math.min(change, 100 - paidToday));
    }
    const pointsAfter = Math.max(0, pointsBefore + change);
    const applied = pointsAfter - pointsBefore;
    const history = await models.PointsHistory.create({
      userId, pointsChange: applied, pointsBefore, pointsAfter, sourceType, sourceId, reason, eventKey,
    }, { transaction });
    if (!mentor) await profile.update({ totalPoints: pointsAfter }, { transaction });
    return { pointsAwarded: applied, applied, totalPoints: pointsAfter, history };
  }

  async _afterPoints(userId) {
    for (const method of ['checkLevelUp', 'checkAndAwardBadges', 'checkAndAwardMentorBadges']) {
      try { await this[method](userId); }
      catch (error) { logger.error(`Gamification ${method} failed`, { userId, error: error.message }); }
    }
  }

  /**
   * Progress for locked auto-badges. Only types with a clear numeric target are
   * measurable — manual/custom/secret/non-numeric rules return measurable:false.
   */
  badgeProgress(badge, menteeProfile) {
    if (!badge || badge.criteriaType === 'custom' || badge.isSecret) {
      return { measurable: false };
    }
    if (isMentorAutoCriteria(badge.criteriaType)) {
      return { measurable: false }; // mentors use mentorBadgeProgress
    }
    if (!menteeProfile) return { measurable: false };
    const value = badge.criteriaValue || {};
    switch (badge.criteriaType) {
      case 'tasks_completed': {
        const target = Number(value.count || 0);
        if (!(target > 0)) return { measurable: false };
        const current = Number(menteeProfile.totalTasksCompleted || 0);
        return {
          measurable: true, current, target, unit: 'approved tasks',
          label: `${Math.min(current, target)}/${target} approved tasks`,
        };
      }
      case 'streak_days': {
        const target = Number(value.days || 0);
        if (!(target > 0)) return { measurable: false };
        const current = Number(menteeProfile.currentStreakDays || 0);
        return {
          measurable: true, current, target, unit: 'day streak',
          label: `${Math.min(current, target)}/${target} day streak`,
        };
      }
      case 'level_reached': {
        const target = Number(value.level || 0);
        if (!(target > 0)) return { measurable: false };
        const current = Number(menteeProfile.currentLevel || 1);
        return {
          measurable: true, current, target, unit: 'level',
          label: `Level ${Math.min(current, target)}/${target}`,
        };
      }
      case 'points_milestone': {
        const target = Number(value.threshold || 0);
        if (!(target > 0)) return { measurable: false };
        const current = Number(menteeProfile.totalPoints || 0);
        return {
          measurable: true, current, target, unit: 'XP',
          label: `${Math.min(current, target)}/${target} XP`,
        };
      }
      default:
        return { measurable: false };
    }
  }

  async mentorBadgeProgress(userId, badge, mentorProfile) {
    if (!badge || badge.isSecret || badge.criteriaType === 'custom' || !isMentorAutoCriteria(badge.criteriaType)) {
      return { measurable: false };
    }
    const organizationId = mentorProfile?.organizationId;
    if (!organizationId) return { measurable: false };
    const measured = await measureMentorCriteria(models, sequelize, userId, organizationId, badge);
    return {
      measurable: measured.measurable,
      current: measured.current,
      target: measured.target,
      unit: measured.unit,
      label: measured.label,
    };
  }

  /**
   * Earned + available catalog for the user's audience. Secret badges stay
   * hidden until earned. Progress uses the same counters as award checks.
   *
   * Pass options.audience = 'mentor'|'mentee' for dual-role users (portals).
   * Default: mentor-only profile → mentor; otherwise mentee.
   */
  async getBadgeCatalog(userId, options = {}) {
    const menteeProfile = await models.MenteeProfile.findOne({ where: { userId } });
    const mentorProfile = await models.MentorProfile.findOne({ where: { userId } });
    let audience = options.audience;
    if (audience !== 'mentor' && audience !== 'mentee') {
      audience = mentorProfile && !menteeProfile ? 'mentor' : 'mentee';
    }
    if (audience === 'mentor' && !mentorProfile) audience = 'mentee';
    if (audience === 'mentee' && !menteeProfile && mentorProfile) audience = 'mentor';

    const [published, awards] = await Promise.all([
      models.Badge.findAll({
        where: { audience, isActive: true, retiredAt: null },
        order: [['name', 'ASC']],
      }),
      models.UserBadge.findAll({
        where: { userId, revokedAt: null },
        include: [{ model: models.Badge, where: { audience }, required: true }],
        order: [['unlockedAt', 'DESC']],
      }),
    ]);

    const earnedIds = new Set(awards.map((row) => row.badgeId));
    const earned = awards.map((row) => {
      const badge = row.Badge || row.badge;
      return {
        id: badge.id,
        name: badge.name,
        description: badge.description,
        category: badge.category,
        audience: badge.audience,
        criteriaType: badge.criteriaType,
        pointsReward: badge.pointsReward,
        isSecret: badge.isSecret,
        iconUrl: badge.iconUrl || null,
        unlockedAt: row.unlockedAt,
        status: 'earned',
        automatic: isMentorAutoCriteria(badge.criteriaType) || (badge.audience === 'mentee' && badge.criteriaType !== 'custom'),
        progress: { measurable: false },
      };
    });

    const available = [];
    for (const badge of published) {
      if (earnedIds.has(badge.id)) continue;
      if (badge.isSecret) continue;
      let progress = { measurable: false };
      if (audience === 'mentor' && mentorProfile) {
        progress = await this.mentorBadgeProgress(userId, badge, mentorProfile);
      } else if (audience === 'mentee' && menteeProfile) {
        progress = this.badgeProgress(badge, menteeProfile);
      }
      available.push({
        id: badge.id,
        name: badge.name,
        description: badge.description,
        category: badge.category,
        audience: badge.audience,
        criteriaType: badge.criteriaType,
        pointsReward: badge.pointsReward,
        isSecret: false,
        iconUrl: badge.iconUrl || null,
        status: 'locked',
        automatic: isMentorAutoCriteria(badge.criteriaType) || (badge.audience === 'mentee' && badge.criteriaType !== 'custom'),
        progress,
      });
    }

    return { audience, earned, available };
  }

  async awardPoints(userId, amount, sourceType, sourceId = null, reason = null, options = {}) {
    if (!userId || !Number.isSafeInteger(Number(amount)) || Number(amount) <= 0) {
      throw new ValidationError('Invalid points amount or user ID');
    }
    const eventKey = options.eventKey || (sourceId ? `${sourceType}:${sourceId}`
      : sourceType === 'streak_bonus' ? `streak:${milestoneFromReason(reason)}` : null);
    const result = await sequelize.transaction(transaction =>
      this._writePoints(userId, Number(amount), sourceType, sourceId, reason, eventKey, transaction));
    await this._afterPoints(userId);
    return result;
  }

  /**
   * Apply a SIGNED points delta (can be negative) and record it. Used when a
   * mentor edits an already-approved review and the awarded points change — we
   * reconcile only the difference so the running total and the points history
   * stay correct. The total is floored at 0; the history row records the actual
   * applied change (which may be smaller than the requested delta if it would
   * have gone negative). A zero (or non-finite) delta is a no-op.
   */
  async adjustPoints(menteeId, delta, sourceType, sourceId = null, reason = null) {
    const change = Number(delta);
    if (!menteeId || !Number.isFinite(change) || change === 0) {
      return null;
    }

    if (!Number.isSafeInteger(change)) throw new ValidationError('Points must be whole numbers');
    const result = await sequelize.transaction(transaction =>
      this._writePoints(menteeId, change, sourceType, sourceId, reason, null, transaction));
    await this._afterPoints(menteeId);
    return result;
  }

  async awardBadge(userId, badgeId, unlockContext = {}) {
    const result = await sequelize.transaction(async transaction => {
      const badge = await models.Badge.findByPk(badgeId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!badge || !badge.isActive || badge.retiredAt) throw new NotFoundError('Published badge not found');

      const forceMentor = badge.audience === 'mentor';
      if (forceMentor) {
        const user = await models.User.findByPk(userId, { transaction });
        if (!user || !(await authzService.getCapabilities(user)).includes('mentor')) {
          throw new ValidationError('This badge requires mentor access');
        }
        const mentorProfile = await models.MentorProfile.findOne({ where: { userId }, transaction });
        if (!mentorProfile) throw new ValidationError('Mentor gamification profile not found');
        if (isMentorAutoCriteria(badge.criteriaType)) {
          // Automatic mentor rule — awarded by system after qualifying activity.
          if (!unlockContext.reason) unlockContext = { ...unlockContext, reason: badge.criteriaType, automatic: true };
        } else {
          if (!unlockContext.awardedBy || String(unlockContext.reason || '').trim().length < 10) {
            throw new ValidationError('Mentor recognition needs an admin and supporting evidence');
          }
          if (unlockContext.awardedBy === userId) {
            throw new ValidationError('Another administrator must verify your mentor recognition');
          }
        }
      } else {
        const menteeProfile = await models.MenteeProfile.findOne({ where: { userId }, transaction });
        if (!menteeProfile) throw new ValidationError('This badge is for mentees');
      }

      const existing = await models.UserBadge.findOne({ where: { userId, badgeId }, transaction });
      if (existing) return { alreadyOwned: true, revoked: Boolean(existing.revokedAt) };
      const userBadge = await models.UserBadge.create({ userId, badgeId, unlockContext }, { transaction });
      if (badge.pointsReward > 0) {
        await this._writePoints(
          userId, badge.pointsReward, 'badge_earned', badgeId,
          `Earned badge: ${badge.name}`, `badge_earned:${badgeId}`, transaction,
          { forceMentor }
        );
      }
      await this.audit('badge.awarded', badgeId, null, { userId, ...unlockContext }, transaction);
      return { success: true, badge: userBadge, badgeDetails: badge, mentor: forceMentor };
    });
    // Revoked awards keep the unique row — re-award is intentionally blocked.
    if (result.alreadyOwned) {
      if (result.revoked) {
        throw new ValidationError('This badge was revoked for this person and cannot be awarded again. Historical XP is preserved.');
      }
      return result;
    }
    const badge = result.badgeDetails;

    try {
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.BADGE_EARNED,
        recipients: [{ userId }],
        payload: {
          title: 'Badge earned',
          message: `You earned the ${badge.name} badge.`,
          actionUrl: result.mentor ? '/mentor/gamification' : '/mentee/gamification',
          actionLabel: 'View badges',
          relatedEntityType: 'badge',
          relatedEntityId: badge.id,
          emailSubject: `Pathment: Badge earned - ${badge.name}`
        }
      });
    } catch (notificationError) {
      console.error('[Gamification] Failed to send badge notification:', notificationError.message);
    }

    await this._afterPoints(userId);
    return result;
  }

  async checkAndAwardBadges(userId) {
    const depth = badgeEvalStore.getStore()?.depth || 0;
    if (depth >= MAX_BADGE_EVAL_DEPTH) return;

    return badgeEvalStore.run({ depth: depth + 1 }, async () => {
      const menteeProfile = await models.MenteeProfile.findOne({ where: { userId } });
      if (!menteeProfile) return;

      const [activeBadges, ownedBadges] = await Promise.all([
        models.Badge.findAll({ where: { isActive: true, retiredAt: null, audience: 'mentee' } }),
        models.UserBadge.findAll({ where: { userId }, attributes: ['badgeId'] })
      ]);
      const ownedBadgeIds = new Set(ownedBadges.map((ub) => ub.badgeId));

      for (const badge of activeBadges) {
        if (ownedBadgeIds.has(badge.id)) continue;

        const isCriteriaMet = await this.checkBadgeCriteria(userId, badge, menteeProfile);
        if (!isCriteriaMet) continue;

        const awarded = await this.awardBadge(userId, badge.id, {
          triggeredAt: new Date().toISOString(),
          reason: badge.criteriaType
        });
        if (awarded?.success) ownedBadgeIds.add(badge.id);
      }
    });
  }

  /**
   * Evaluate published automatic mentor badges for this user.
   * Uses mentor activity even when the same account also has a mentee profile.
   * Does not convert or re-check manual (custom) mentor badges.
   */
  async checkAndAwardMentorBadges(userId) {
    const depth = badgeEvalStore.getStore()?.depth || 0;
    if (depth >= MAX_BADGE_EVAL_DEPTH) return;

    return badgeEvalStore.run({ depth: depth + 1 }, async () => {
      const mentorProfile = await models.MentorProfile.findOne({ where: { userId } });
      if (!mentorProfile) return;

      const [activeBadges, ownedBadges] = await Promise.all([
        models.Badge.findAll({
          where: {
            isActive: true,
            retiredAt: null,
            audience: 'mentor',
            criteriaType: { [Sequelize.Op.in]: MENTOR_AUTO_CRITERIA },
          },
        }),
        models.UserBadge.findAll({ where: { userId }, attributes: ['badgeId'] }),
      ]);
      const ownedBadgeIds = new Set(ownedBadges.map((ub) => ub.badgeId));

      for (const badge of activeBadges) {
        if (ownedBadgeIds.has(badge.id)) continue;
        const measured = await measureMentorCriteria(
          models, sequelize, userId, mentorProfile.organizationId, badge
        );
        if (!measured.met) continue;

        const awarded = await this.awardBadge(userId, badge.id, {
          triggeredAt: new Date().toISOString(),
          reason: badge.criteriaType,
          automatic: true,
        });
        if (awarded?.success) ownedBadgeIds.add(badge.id);
      }
    });
  }

  async checkBadgeCriteria(userId, badge, menteeProfile = null) {
    const { criteriaType, criteriaValue } = badge;

    // Callers that already hold the profile (checkAndAwardBadges) pass it in to
    // avoid a per-badge re-query; standalone callers still fetch it.
    if (!menteeProfile) {
      menteeProfile = await models.MenteeProfile.findOne({ where: { userId } });
    }
    if (!menteeProfile) return false;

    switch (criteriaType) {
      case 'points_milestone':
        return Number(menteeProfile.totalPoints || 0) >= Number(criteriaValue.threshold || 0);
      case 'tasks_completed':
        return Number(menteeProfile.totalTasksCompleted || 0) >= Number(criteriaValue.count || 0);
      case 'programs_completed':
        return await models.Enrollment.count({ where: { menteeId: userId, status: 'program_completed' } }) >= Number(criteriaValue.count || 1);
      case 'badges_earned':
        return await models.UserBadge.count({ where: { userId, revokedAt: null } }) >= Number(criteriaValue.count || 1);
      case 'streak_days':
        return Number(menteeProfile.currentStreakDays || 0) >= Number(criteriaValue.days || 0);
      case 'avg_rating':
        return Number(menteeProfile.avgTaskRating || 0) >= Number(criteriaValue.minRating || 0);
      case 'level_reached':
        return Number(menteeProfile.currentLevel || 1) >= Number(criteriaValue.level || 1);
      case 'skill_mastery': {
        if (!criteriaValue.skillId) return false;

        const userSkill = await models.UserSkill.findOne({
          where: {
            userId,
            skillId: criteriaValue.skillId
          }
        });

        return !!userSkill && Number(userSkill.proficiencyLevel || 0) >= Number(criteriaValue.minProficiency || 0);
      }
      case 'custom':
      default:
        return false;
    }
  }

  async updateLeaderboardEntry(userId, programId = null) {
    const menteeProfile = await models.MenteeProfile.findOne({ where: { userId } });
    if (!menteeProfile) return;

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const periods = [
      { type: 'daily', start: today, end: today },
      { type: 'weekly', start: this.getWeekStart(now), end: today },
      { type: 'monthly', start: this.getMonthStart(now), end: today },
      { type: 'all_time', start: '2000-01-01', end: today }
    ];

    const higherRankedCount = await models.MenteeProfile.count({
      where: {
        totalPoints: { [Sequelize.Op.gt]: Number(menteeProfile.totalPoints || 0) }
      }
    });

    const rank = higherRankedCount + 1;
    const points = Number(menteeProfile.totalPoints || 0);

    // Each period is a distinct row (unique by user/program/periodType/start), so
    // the four upserts don't touch each other — run them in parallel.
    await Promise.all(periods.map(async (period) => {
      const existing = await models.LeaderboardEntry.findOne({
        where: {
          userId,
          programId,
          periodType: period.type,
          periodStart: period.start
        }
      });

      if (existing) {
        await existing.update({ rank, points, periodEnd: period.end, isVisible: true });
      } else {
        await models.LeaderboardEntry.create({
          userId,
          programId,
          rank,
          points,
          periodType: period.type,
          periodStart: period.start,
          periodEnd: period.end,
          isVisible: true
        });
      }
    }));
  }

  async checkLevelUp(userId) {
    const menteeProfile = await models.MenteeProfile.findOne({ where: { userId } });
    if (!menteeProfile) return;

    const currentLevel = Number(menteeProfile.currentLevel || 1);
    const currentPoints = Number(menteeProfile.totalPoints || 0);

    const levelThresholds = {
      1: 0,
      2: 500,
      3: 2000,
      4: 5000,
      5: 10000
    };

    let newLevel = currentLevel;
    for (const [level, threshold] of Object.entries(levelThresholds)) {
      if (currentPoints >= threshold) {
        newLevel = Number(level);
      }
    }

    if (newLevel <= currentLevel) return;

    const [changed] = await models.MenteeProfile.update({ currentLevel: newLevel }, {
      where: { userId, currentLevel: { [Sequelize.Op.lt]: newLevel } },
    });
    if (!changed) return;

    try {
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.LEVEL_UP || 'level_up',
        recipients: [{ userId }],
        payload: {
          title: 'Level up',
          message: `You reached level ${newLevel}.`,
          actionUrl: '/mentee/gamification',
          actionLabel: 'View progress',
          relatedEntityType: 'mentee_profile',
          relatedEntityId: userId,
          emailSubject: `Pathment: Level ${newLevel}`
        }
      });
    } catch (notificationError) {
      console.error('[Gamification] Failed to send level-up notification:', notificationError.message);
    }
  }

  /** Today's calendar date in this mentee's own zone, which is what a day is. */
  async _todayFor(userId) {
    const settings = await models.UserSettings.findOne({
      where: { userId },
      attributes: ['timezone']
    });
    return todayInZone(settings?.timezone || 'UTC');
  }

  /**
   * The streak as the daily log says it is, without touching anything.
   *
   * Reads rather than counters. A stored counter can only be right if every
   * event that should have moved it did, and this one was advanced from a
   * single place - a mentor approving a submission - so it was wrong for every
   * mentee who logged their days and was waiting on a review. Counting the log
   * cannot drift, needs no repair for the rows that are already wrong, and
   * gives the same answer as the phone because it is the same rule.
   */
  async readStreak(userId) {
    const [entries, todayKey] = await Promise.all([
      models.DailyLogEntry.findAll({
        where: { menteeId: userId },
        attributes: ['dateKey'],
        raw: true
      }),
      this._todayFor(userId)
    ]);

    const dateKeys = entries.map((entry) => entry.dateKey);

    return {
      current: currentStreak(dateKeys, todayKey),
      longest: longestStreak(dateKeys),
      todayKey
    };
  }

  /**
   * Recount the streak, store it, and pay for any milestone just passed.
   *
   * Safe to call more than once a day and safe to call from anywhere: it
   * derives the number instead of stepping it, so a second call the same
   * afternoon changes nothing and awards nothing.
   */
  async updateStreak(userId) {
    const menteeProfile = await models.MenteeProfile.findOne({ where: { userId } });
    if (!menteeProfile) return;

    const { current, longest, todayKey } = await this.readStreak(userId);

    const todayLogs = await models.DailyLogEntry.findAll({ where: { menteeId: userId, dateKey: todayKey },
      attributes: ['tasksDone', 'slotsDone', 'note'] });
    const meaningfulActivity = todayLogs.some(log => log.tasksDone?.length || log.slotsDone?.length || log.note?.trim())
      || await models.TaskProgressEntry.count({ where: { menteeId: userId, dateKey: todayKey } });
    if (current > 0 && meaningfulActivity) {
      await this.awardPoints(userId, 1, 'daily_activity', null, 'Daily learning activity', { eventKey: `daily_activity:${todayKey}` });
    }

    await menteeProfile.update({
      currentStreakDays: current,
      // Never lowered. Some of these were earned under the old counter, and
      // taking back a longest streak somebody already saw would be worse than
      // carrying a number the log cannot account for.
      longestStreakDays: Math.max(longest, Number(menteeProfile.longestStreakDays || 0)),
      lastActivityDate: todayKey
    });

    // What this run qualifies for, minus what the ledger says has already been
    // paid. Deliberately NOT derived from `previous`: that counter goes to zero
    // whenever a streak breaks or a recount lands before the day's first log,
    // and the old `milestonesCrossed(previous, current)` then re-paid every
    // milestone under the streak. It happened repeatedly in production —
    // 8,250 points across 11 mentees, one of them paid the seven-day bonus
    // eight times — and it inflated the leaderboard past anything real.
    const alreadyPaid = await this.paidStreakMilestones(userId);
    for (const milestone of milestonesReached(current)) {
      if (alreadyPaid.has(milestone)) continue;
      await this.awardPoints(
        userId,
        STREAK_BONUSES[milestone],
        'streak_bonus',
        null,
        `${milestone} day streak bonus`
      );
    }

    await this.checkAndAwardBadges(userId);
  }

  /**
   * The streak milestones this mentee has ever been paid for.
   *
   * The ledger is the record of what was paid, so it is the thing to ask. A
   * milestone is a one-time achievement: cross seven days once and the bonus is
   * yours, and rebuilding a streak after a break does not re-open it. Anything
   * else needs a notion of "which run" that nothing in the data supports, and
   * the version that tried to infer it from a counter is what overpaid.
   */
  async paidStreakMilestones(userId) {
    const rows = await models.PointsHistory.findAll({
      where: { userId, sourceType: 'streak_bonus' },
      attributes: ['reason'],
      raw: true
    });
    const paid = new Set();
    for (const row of rows) {
      const milestone = milestoneFromReason(row.reason);
      if (milestone) paid.add(milestone);
    }
    return paid;
  }

  /**
   * The leaderboard ranks on the PROGRESS SCORE — the same number the mentor
   * portal shows under Teaching, computed by the same service.
   *
   * It has been three different things. Originally the sum of every point
   * anybody had been given, which made it a badge table: badges were 65% of all
   * points at an average of 60 an award while finishing a task paid about 10,
   * so the two mentees who had done the most work on the platform sat seventh
   * and eighth behind people with nine tasks. Ranking on completed work fixed
   * that but invented a second definition of "doing well" beside the one the
   * mentors already used.
   *
   * There is now one. The progress score weighs seven things — progress against
   * where the programme expects you, output weighted by difficulty, effort,
   * quality adjusted for how generously your own mentor rates, reliability,
   * attendance, consistency — with per-clan weights an admin can tune. A mentee
   * and their mentor now read the same number off two different screens.
   *
   * Two of those dimensions are percentiles, so the peer group is part of the
   * answer: everybody is scored against their own programme, in one pass.
   */
  async getLeaderboard({ user = null, programId = null, limit = 50 } = {}) {
    const menteeIds = await this._peerGroupFor(user, programId);
    if (!menteeIds.length) return [];

    const { ranked } = await performanceService.leaderboard(menteeIds, { limit });

    return ranked.map((row) => ({
      id: `lb-${row.id}`,
      userId: row.id,
      rank: row.rank,
      score: row.score,
      band: row.band,
      // The evidence travels with the score: "99, from 45 tasks at 96% on time"
      // is a sentence a mentee can check against their own week.
      tasksCompleted: row.evidence?.tasksCompleted ?? 0,
      onTimeRate: row.evidence?.onTimeRate ?? null,
      user: {
        id: row.id,
        firstName: (row.name || '').split(' ')[0] || '',
        lastName: (row.name || '').split(' ').slice(1).join(' '),
        email: '',
        profilePictureUrl: row.profilePictureUrl ?? null
      }
    }));
  }

  /**
   * Where a mentee stands, and why they might not stand anywhere.
   *
   * The score has an eligibility bar — enough reviewed tasks, enough of the
   * programme behind you — because ranking somebody on two data points is not
   * a ranking. Somebody below it is told what is missing rather than given a
   * meaningless position.
   */
  async progressStandingFor(userId) {
    const menteeIds = await this._peerGroupFor({ id: userId }, null);
    if (!menteeIds.length) return { rank: null, score: null, notRankedBecause: null };

    const { ranked, notRanked } = await performanceService.leaderboard(menteeIds, {});
    const mine = ranked.find((row) => row.id === userId);
    if (mine) return { rank: mine.rank, score: mine.score, band: mine.band, notRankedBecause: null };

    const waiting = notRanked.find((row) => row.id === userId);
    return {
      rank: null,
      score: waiting?.score ?? null,
      band: waiting?.band ?? null,
      notRankedBecause: waiting?.notRankedBecause ?? null
    };
  }

  /**
   * Who this mentee is measured against: everybody in their own programme.
   *
   * Not the whole platform — two of the score's dimensions are percentiles, and
   * a percentile against people on a different syllabus says nothing.
   */
  async _peerGroupFor(user, programId) {
    let targetProgramId = programId;

    if (!targetProgramId && user?.id) {
      // Any clan the asker belongs to will do, in any role. A mentee is the
      // usual case, but a mentor or an admin opening the board should see their
      // own programme rather than an empty list — and the row that answers this
      // for them is a mentor membership, not a mentee one.
      const membership = await models.ClanMembership.findOne({
        where: { userId: user.id },
        include: [{ model: models.Clan, as: 'clan', attributes: ['programId'], required: true }],
        order: [['role', 'ASC']]
      });
      targetProgramId = membership?.clan?.programId ?? null;
    }
    // No peer group, no ranking. Two of the score's dimensions are percentiles,
    // so a board with nobody to compare against would be a made-up order.
    if (!targetProgramId) return [];

    const memberships = await models.ClanMembership.findAll({
      where: { role: 'mentee', status: { [Sequelize.Op.in]: ['active', 'paused'] } },
      include: [{
        model: models.Clan, as: 'clan',
        where: { programId: targetProgramId }, attributes: ['id'], required: true
      }],
      attributes: ['userId']
    });
    return [...new Set(memberships.map((m) => m.userId))];
  }

  async getUserBadges(userId) {
    return models.UserBadge.findAll({
      where: { userId, revokedAt: null },
      include: [{ model: models.Badge }],
      order: [['unlockedAt', 'DESC']]
    });
  }

  async getUserPointsHistory(userId, limit = 50) {
    return models.PointsHistory.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit
    });
  }

  /**
   * The profile these stats are read off, healing it when it is missing.
   *
   * A read has no business 404-ing because a derived row was never written: the
   * person really is a learner (they hold the capability — an enrollment or a
   * mentee placement says so), and the absent row is our bookkeeping, not their
   * state. Somebody who is NOT a learner still gets the 404, because for them
   * "no mentee profile" is the correct answer rather than a gap to fill.
   *
   * `clanService.addMember` writes this row at placement time so new cases
   * cannot arise; this covers everybody placed before that, without waiting on
   * `scripts/backfill-mentee-profiles.js` having been run against the database.
   */
  async #readableMenteeProfile(userId) {
    const existing = await models.MenteeProfile.findOne({ where: { userId } });
    if (existing) return existing;

    const user = await models.User.findByPk(userId, { attributes: ['id', 'role'] });
    if (!user) throw new NotFoundError('Mentee profile not found');

    const capabilities = await authzService.getCapabilities(user);
    if (!capabilities.includes('mentee')) {
      throw new NotFoundError('Mentee profile not found');
    }
    logger.info('Healed a missing mentee profile on read', { userId });
    return ensureMenteeProfile(userId);
  }

  async getUserGamificationStats(userId) {
    const existingMentee = await models.MenteeProfile.findOne({ where: { userId } });
    const mentorProfile = !existingMentee && await models.MentorProfile.findOne({ where: { userId } });
    if (mentorProfile) {
      const totalPoints = Number(await models.PointsHistory.sum('pointsChange', { where: { userId, organizationId: mentorProfile.organizationId } }) || 0);
      return { role: 'mentor', totalPoints, rewardCredits: 0,
        currentLevel: 1 + [500, 2000, 5000, 10000].filter(n => totalPoints >= n).length,
        currentStreak: 0, longestStreak: 0, totalBadges: await models.UserBadge.count({ where: { userId, revokedAt: null } }),
        totalTasksCompleted: 0, totalProgramsCompleted: 0, avgTaskRating: 0, leaderboardRank: null };
    }
    const menteeProfile = await this.#readableMenteeProfile(userId);

    const totalBadges = await models.UserBadge.count({ where: { userId, revokedAt: null } });
    const recentBadges = await this.getUserBadges(userId);
    const recentPoints = await this.getUserPointsHistory(userId, 10);

    /**
     * The same number, from the same ledger, as the list printed beside it.
     *
     * This used to count mentee profiles holding more TOTAL points, while the
     * board listed something else entirely — so the rank and the list were two
     * answers to one question. It also meant somebody who had earned nothing
     * was told they were 551st: a count of the 550 people ahead that ignored
     * the 502 sitting level with them on zero. No work, no rank; the screen
     * renders that as "Unranked", which is the truth.
     */
    const standing = await this.progressStandingFor(userId);
    const userLeaderboardRank = standing.rank === null ? null : { rank: standing.rank };

    // Counted from the daily log at the moment of asking, so this screen and
    // the phone cannot disagree. The stored counter is still written, because
    // badge criteria read it, but nothing displays it.
    //
    // What stood here was a patch over the bug rather than a fix: if the stored
    // streak was zero but points had been earned today it reported 1. That made
    // the number look alive on the day something was approved and hid the fact
    // that it was counting the wrong thing the rest of the time.
    const streak = await this.readStreak(userId);

    return {
      role: 'mentee',
      rewardCredits: (await require('./rewardsService').menteePointsBalance(userId)).balance,
      totalPoints: Number(menteeProfile.totalPoints || 0),
      currentLevel: Number(menteeProfile.currentLevel || 1),
      currentStreak: streak.current,
      longestStreak: Math.max(streak.longest, Number(menteeProfile.longestStreakDays || 0)),
      totalBadges,
      totalTasksCompleted: Number(menteeProfile.totalTasksCompleted || 0),
      totalProgramsCompleted: await models.Enrollment.count({ where: { menteeId: userId, status: 'program_completed' } }),
      avgTaskRating: parseFloat(menteeProfile.avgTaskRating) || 0,
      leaderboardRank: userLeaderboardRank ? userLeaderboardRank.rank : null,
      progressScore: standing.score,
      progressBand: standing.band ?? null,
      /** Why they hold no rank yet, in words a mentee can act on. */
      notRankedBecause: standing.notRankedBecause,
      recentBadges: recentBadges.slice(0, 5),
      recentPoints
    };
  }

  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff)).toISOString().split('T')[0];
  }

  getMonthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
  }

  async createDefaultBadges({ transaction } = {}) {
    if (!transaction) return sequelize.transaction(transaction => this.createDefaultBadges({ transaction }));
    const organizationId = require('../utils/auditContext').getRequestContext().organizationId;
    if (!organizationId) throw new ValidationError('Organization context is required to seed badges');

    const defaultBadges = [
      {
        name: 'First Steps',
        description: 'Complete your first task',
        category: 'milestone',
        criteriaType: 'tasks_completed',
        criteriaValue: { count: 1 },
        pointsReward: 10,
        isActive: true,
        isSecret: false
      },
      {
        name: 'Achievement Collector',
        description: 'Earn 5 badges',
        category: 'achievement',
        criteriaType: 'badges_earned',
        criteriaValue: { count: 5 },
        pointsReward: 50,
        isActive: true,
        isSecret: false
      },
      {
        name: 'Quick Learner',
        description: 'Complete 5 tasks',
        category: 'milestone',
        criteriaType: 'tasks_completed',
        criteriaValue: { count: 5 },
        pointsReward: 25,
        isActive: true,
        isSecret: false
      },
      {
        name: 'Staying Strong',
        description: 'Maintain a 7-day streak',
        category: 'streak',
        criteriaType: 'streak_days',
        criteriaValue: { days: 7 },
        pointsReward: 50,
        isActive: true,
        isSecret: false
      },
      {
        name: 'Consistency Master',
        description: 'Maintain a 30-day streak',
        category: 'streak',
        criteriaType: 'streak_days',
        criteriaValue: { days: 30 },
        pointsReward: 200,
        isActive: true,
        isSecret: false
      },
      {
        name: 'Rising Star',
        description: 'Reach level 3',
        category: 'level',
        criteriaType: 'level_reached',
        criteriaValue: { level: 3 },
        pointsReward: 100,
        isActive: true,
        isSecret: false
      },
      {
        name: 'Excellence',
        description: 'Achieve 4.5+ average rating',
        category: 'quality',
        criteriaType: 'avg_rating',
        criteriaValue: { minRating: 4.5 },
        pointsReward: 150,
        isActive: true,
        isSecret: false
      },
      {
        name: 'Program Master',
        description: 'Complete your first program',
        category: 'milestone',
        criteriaType: 'programs_completed',
        criteriaValue: { count: 1 },
        pointsReward: 100,
        isActive: true,
        isSecret: false
      },
      {
        name: 'Points Collector',
        description: 'Earn 500 XP',
        category: 'points',
        criteriaType: 'points_milestone',
        criteriaValue: { threshold: 500 },
        pointsReward: 0,
        isActive: true,
        isSecret: false
      },
      {
        name: 'Legend',
        description: 'Reach level 5',
        category: 'level',
        criteriaType: 'level_reached',
        criteriaValue: { level: 5 },
        pointsReward: 500,
        isActive: true,
        isSecret: true
      }
    ];

    defaultBadges.push(...[
      ['Thoughtful Feedback', 'Evidence of actionable feedback that helped a mentee improve.'],
      ['Timely Support', 'Evidence of timely, useful reviews; speed alone does not qualify.'],
      ['Blocker Resolver', 'Evidence that a mentee confirmed a blocker was resolved.'],
      ['Mentee Growth', 'Evidence of sustained mentee improvement over a review period.'],
      ['Cohort Support', 'Evidence of helpful support across a cohort.'],
    ].map(([name, description]) => ({ name, description, category: 'mentor', audience: 'mentor',
      criteriaType: 'custom', criteriaValue: { manual: true }, pointsReward: 50, isActive: false, isSecret: false })));

    const createdNames = [];
    const existingNames = [];
    for (const badgeData of defaultBadges) {
      // Per-organization idempotent seed — never merge or re-award existing users.
      const [badge, created] = await models.Badge.findOrCreate({
        where: { name: badgeData.name, organizationId },
        defaults: { ...badgeData, organizationId },
        transaction,
      });
      if (created) {
        createdNames.push(badge.name);
        await this.audit('badge.created', badge.id, null, badge.toJSON(), transaction);
      } else {
        existingNames.push(badge.name);
      }
    }

    const total = await models.Badge.count({ transaction });
    return {
      total,
      created: createdNames.length,
      skipped: existingNames.length,
      createdNames,
      existingNames,
    };
  }

  async awardDailyLoginPoint(userId) {
    // Kept for old callers. Existing login XP remains; new XP follows activity.
    return;
  }
}

module.exports = new GamificationService();
