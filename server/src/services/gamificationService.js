const { models, Sequelize, sequelize } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { todayInZone } = require('../utils/timezone');
const authzService = require('./authzService');
const logger = require('../utils/logger');
const { ensureMenteeProfile } = require('./menteeProfile');
const performanceService = require('./performanceService');
const { runWithRequestContext } = require('../utils/auditContext');
const {
  currentStreak,
  longestStreak,
  milestonesReached,
  milestoneFromReason,
  STREAK_BONUSES
} = require('./streak');

/** Badge earning_scope: 0 workspace, 1 program, 2 clan */
const EARNING_SCOPE = { WORKSPACE: 0, PROGRAM: 1, CLAN: 2 };

class GamificationService {
  /** Stable key matching the user_badges_once_per_context index expression. */
  awardContextKey(badgeId, programId = null, clanId = null) {
    return String(clanId || programId || badgeId);
  }

  ownedAwardKey(badgeId, programId = null, clanId = null) {
    return `${badgeId}:${this.awardContextKey(badgeId, programId, clanId)}`;
  }
  async awardPoints(menteeId, pointsAmount, sourceType, sourceId = null, reason = null) {
    if (!menteeId || !pointsAmount || pointsAmount <= 0) {
      throw new ValidationError('Invalid points amount or mentee ID');
    }

    const menteeProfile = await models.MenteeProfile.findOne({
      where: { userId: menteeId }
    });

    if (!menteeProfile) {
      throw new NotFoundError('Mentee profile not found');
    }

    const pointsBefore = Number(menteeProfile.totalPoints || 0);
    const pointsAfter = pointsBefore + Number(pointsAmount);

    const history = await models.PointsHistory.create({
      userId: menteeId,
      pointsChange: pointsAmount,
      pointsBefore,
      pointsAfter,
      sourceType,
      sourceId,
      reason
    });

    await menteeProfile.update({ totalPoints: pointsAfter });

    // Keep core points-award successful even if non-critical side effects fail.
    try {
      await this.checkLevelUp(menteeId);
    } catch (error) {
      console.error('[Gamification] checkLevelUp failed:', error.message);
    }

    try {
      await this.updateLeaderboardEntry(menteeId);
    } catch (error) {
      console.error('[Gamification] updateLeaderboardEntry failed:', error.message);
    }

    try {
      await this.checkAndAwardBadges(menteeId);
    } catch (error) {
      console.error('[Gamification] checkAndAwardBadges failed:', error.message);
    }

    return {
      pointsAwarded: Number(pointsAmount),
      totalPoints: pointsAfter,
      history
    };
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

    const menteeProfile = await models.MenteeProfile.findOne({
      where: { userId: menteeId }
    });

    if (!menteeProfile) {
      throw new NotFoundError('Mentee profile not found');
    }

    const pointsBefore = Number(menteeProfile.totalPoints || 0);
    const pointsAfter = Math.max(0, pointsBefore + change);
    const applied = pointsAfter - pointsBefore;
    if (applied === 0) {
      return { applied: 0, totalPoints: pointsAfter };
    }

    await models.PointsHistory.create({
      userId: menteeId,
      pointsChange: applied,
      pointsBefore,
      pointsAfter,
      sourceType,
      sourceId,
      reason
    });

    await menteeProfile.update({ totalPoints: pointsAfter });

    try {
      await this.checkLevelUp(menteeId);
    } catch (error) {
      console.error('[Gamification] checkLevelUp failed:', error.message);
    }

    try {
      await this.updateLeaderboardEntry(menteeId);
    } catch (error) {
      console.error('[Gamification] updateLeaderboardEntry failed:', error.message);
    }

    try {
      await this.checkAndAwardBadges(menteeId);
    } catch (error) {
      console.error('[Gamification] checkAndAwardBadges failed:', error.message);
    }

    return { applied, totalPoints: pointsAfter };
  }

  /**
   * Single award path for automatic, manual, and admin awards.
   * Context: { programId?, clanId?, awardMethod?, awardedBy?, reason?, … }
   * Side effects (XP, notification) run only when a new row is inserted.
   */
  async awardBadge(userId, badgeId, unlockContext = {}) {
    // Keep the badge lookup tenant-scoped. A caller with GAMIFICATION_MANAGE in
    // workspace A must never be able to award a UUID belonging to workspace B.
    const badge = await models.Badge.findByPk(badgeId);
    if (!badge) throw new NotFoundError('Badge not found');

    if (unlockContext.awardMethod === 'manual') {
      const targetMembership = await models.OrganizationMembership.findOne({
        where: { organizationId: badge.organizationId, userId, status: 'active' },
        attributes: ['id'],
      });
      if (!targetMembership) throw new ValidationError('User is not an active member of this workspace');
    }

    const scope = Number(badge.earningScope ?? EARNING_SCOPE.WORKSPACE);
    const { programId, clanId } = await this.#normalizeAwardContext(badge, unlockContext);

    const id = require('crypto').randomUUID();
    const awardMethod = unlockContext.awardMethod === 'manual' ? 'manual' : 'automatic';
    const contextJson = JSON.stringify({
      ...unlockContext,
      earningScope: scope,
      programId,
      clanId,
      awardMethod,
    });

    const created = await sequelize.transaction(async (transaction) => {
      const [rows] = await sequelize.query(
        `
        INSERT INTO user_badges (
          id, organization_id, user_id, badge_id, program_id, clan_id,
          unlocked_at, unlock_context, is_featured
        ) VALUES (
          :id, :organizationId, :userId, :badgeId, :programId, :clanId,
          CURRENT_TIMESTAMP, CAST(:unlockContext AS jsonb), false
        )
        ON CONFLICT (user_id, badge_id, (COALESCE(clan_id, program_id, badge_id)))
        DO NOTHING
        RETURNING id
        `,
        {
          replacements: {
            id,
            organizationId: badge.organizationId,
            userId,
            badgeId,
            programId: programId || null,
            clanId: clanId || null,
            unlockContext: contextJson,
          },
          transaction,
        }
      );
      if (!rows?.length) return null;

      // The raw INSERT is necessary for expression-index ON CONFLICT support,
      // but all derived counters must commit atomically with the award.
      await models.Badge.increment('totalUnlocked', {
        where: { id: badgeId },
        transaction,
      });

      const menteeProfile = await models.MenteeProfile.findOne({
        where: { userId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (menteeProfile) {
        const profilePatch = {
          totalBadgesEarned: Number(menteeProfile.totalBadgesEarned || 0) + 1,
        };
        if (badge.pointsReward > 0) {
          const pointsBefore = Number(menteeProfile.totalPoints || 0);
          const pointsAfter = pointsBefore + Number(badge.pointsReward);
          profilePatch.totalPoints = pointsAfter;
          await models.PointsHistory.create({
            userId,
            pointsChange: Number(badge.pointsReward),
            pointsBefore,
            pointsAfter,
            sourceType: 'badge_earned',
            sourceId: id,
            reason: `Earned badge: ${badge.name}`,
          }, { transaction });
        }
        await menteeProfile.update(profilePatch, { transaction });
      }

      return rows[0].id;
    });

    if (!created) {
      return { alreadyOwned: true, badgeDetails: badge };
    }

    const userBadge = await models.UserBadge.findByPk(created);

    // Refresh derived state after the award transaction. Failures here never
    // undo an award, but XP/counters themselves are already durable above.
    if (badge.pointsReward > 0) {
      await Promise.allSettled([
        this.checkLevelUp(userId),
        this.updateLeaderboardEntry(userId),
        this.checkAndAwardBadges(userId),
      ]);
    }

    try {
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.BADGE_EARNED || 'badge_earned',
        recipients: [{ userId }],
        payload: {
          title: 'Badge earned',
          message: `You earned the ${badge.name} badge.`,
          actionUrl: '/mentee/gamification',
          actionLabel: 'View badges',
          relatedEntityType: 'badge',
          relatedEntityId: badge.id,
          emailSubject: `Pathment: Badge earned - ${badge.name}`
        }
      });
    } catch (notificationError) {
      console.error('[Gamification] Failed to send badge notification:', notificationError.message);
    }

    return { success: true, badge: userBadge, badgeDetails: badge };
  }

  async #normalizeAwardContext(badge, unlockContext = {}) {
    const scope = Number(badge.earningScope ?? EARNING_SCOPE.WORKSPACE);
    let programId = unlockContext.programId || null;
    let clanId = unlockContext.clanId || null;

    if (scope === EARNING_SCOPE.WORKSPACE) {
      return { programId: null, clanId: null };
    }

    if (scope === EARNING_SCOPE.PROGRAM) {
      if (!programId) throw new ValidationError('Program context is required for this badge');
      if (clanId) clanId = null;
      const program = await models.Program.findByPk(programId, {
        attributes: ['id', 'organizationId', 'closedAt'],
        skipOrganizationScope: true,
      });
      if (!program || program.organizationId !== badge.organizationId) {
        throw new ValidationError('Program is not in this workspace');
      }
      return { programId, clanId: null };
    }

    // CLAN
    if (!clanId) throw new ValidationError('Clan context is required for this badge');
    const clan = await models.Clan.findByPk(clanId, {
      attributes: ['id', 'organizationId', 'programId', 'kind'],
      skipOrganizationScope: true,
    });
    if (!clan || clan.organizationId !== badge.organizationId) {
      throw new ValidationError('Clan is not in this workspace');
    }
    // Cohort: stamp original program. Standing: leave program_id null.
    // Closed program does not block clan-scoped awards; program_id is context only.
    programId = clan.kind === 'standing' ? null : clan.programId;
    return { programId, clanId };
  }

  /**
   * Distinct completed tasks for badge progress/award.
   * Program scope uses enrollment.program_id, excludes standing-clan tasks,
   * Closed programs remain eligible: final reviews and backfills often happen
   * after close, and completed work must not disappear from badge evidence.
   */
  async countCompletedTasksScoped(userId, { organizationId, programId = null, clanId = null } = {}) {
    const [rows] = await sequelize.query(
      `
      SELECT COUNT(DISTINCT at.id)::int AS count
      FROM assigned_tasks at
      LEFT JOIN enrollments e ON e.id = at.enrollment_id
      LEFT JOIN clans c ON c.id = at.clan_id
      WHERE at.mentee_id = :userId
        AND at.status = 'completed'
        AND (:organizationId::uuid IS NULL OR at.organization_id = :organizationId)
        AND (
          :clanId::uuid IS NOT NULL AND at.clan_id = :clanId
          OR (
            :clanId::uuid IS NULL
            AND :programId::uuid IS NOT NULL
            AND e.program_id = :programId
            AND (c.id IS NULL OR c.kind IS DISTINCT FROM 'standing')
          )
          OR (
            :clanId::uuid IS NULL
            AND :programId::uuid IS NULL
          )
        )
      `,
      {
        replacements: {
          userId,
          organizationId: organizationId || null,
          programId: programId || null,
          clanId: clanId || null,
        },
      }
    );
    return Number(rows?.[0]?.count || 0);
  }

  async listTaskContextsForUser(userId, organizationId) {
    const [rows] = await sequelize.query(
      `
      SELECT DISTINCT
        e.program_id AS "programId",
        at.clan_id AS "clanId",
        c.kind AS "clanKind"
      FROM assigned_tasks at
      LEFT JOIN enrollments e ON e.id = at.enrollment_id
      LEFT JOIN clans c ON c.id = at.clan_id
      WHERE at.mentee_id = :userId
        AND at.status = 'completed'
        AND at.organization_id = :organizationId
      `,
      { replacements: { userId, organizationId } }
    );
    return rows || [];
  }

  /** Lifetime coins = sum of enrollment task points (unchanged by gift redemptions). */
  async lifetimeCoinsEarned(userId) {
    const enrollments = await models.Enrollment.findAll({
      where: { menteeId: userId },
      attributes: ['totalPointsEarned'],
    });
    return enrollments.reduce((sum, row) => sum + Number(row.totalPointsEarned || 0), 0);
  }

  /** Badge target role: missing/legacy → mentee (auto-award path). Mentor badges are manual. */
  badgeTargetRole(badge) {
    const role = badge?.criteriaValue?.targetRole || badge?.targetRole;
    return role === 'mentor' ? 'mentor' : 'mentee';
  }

  /**
   * Reconcile mentor badges affected by one committed clan membership change.
   * This is intentionally a normal service method, not an EventEmitter worker:
   * it is cheap, idempotent, workspace-bound, and safe with multiple dynos.
   */
  async reconcileClanMembershipBadges({ organizationId, clanId, userId, role }) {
    if (!organizationId || !clanId || !userId || !role) {
      throw new ValidationError('organizationId, clanId, userId and role are required');
    }

    return runWithRequestContext({ organizationId }, async () => {
      const mentorRoles = ['lead_mentor', 'co_mentor', 'core_team'];
      if (mentorRoles.includes(role)) {
        await this.checkAndAwardBadges(userId);
        return;
      }
      if (role !== 'mentee') return;

      const mentors = await models.ClanMembership.findAll({
        where: {
          organizationId,
          clanId,
          status: 'active',
          role: { [Sequelize.Op.in]: mentorRoles },
        },
        attributes: ['userId'],
        raw: true,
      });

      for (const mentor of mentors) {
        await this.checkAndAwardBadges(mentor.userId);
      }
    });
  }

  /**
   * Auto-award path. Optional hintContext from the approved assignment
   * ({ programId, clanId, organizationId }) — never from UI clan selection alone.
   */
  async checkAndAwardBadges(userId, hintContext = {}) {
    const menteeProfile = await models.MenteeProfile.findOne({ where: { userId } });

    const [activeBadges, ownedBadges] = await Promise.all([
      models.Badge.findAll({ where: { isActive: true } }),
      models.UserBadge.findAll({
        where: { userId },
        attributes: ['badgeId', 'programId', 'clanId'],
        skipOrganizationScope: true,
      }),
    ]);
    const ownedKeys = new Set(
      ownedBadges.map((ub) => this.ownedAwardKey(ub.badgeId, ub.programId, ub.clanId))
    );
    let taskContexts = null;

    for (const badge of activeBadges) {
      const role = this.badgeTargetRole(badge);
      const scope = Number(badge.earningScope ?? EARNING_SCOPE.WORKSPACE);

      // Mentor badges and non-task criteria stay workspace-scoped.
      if (role === 'mentor' || scope === EARNING_SCOPE.WORKSPACE
          || (badge.criteriaType !== 'tasks_completed' && scope !== EARNING_SCOPE.WORKSPACE)) {
        const key = this.ownedAwardKey(badge.id, null, null);
        if (ownedKeys.has(key)) continue;
        let ok = false;
        if (role === 'mentor') ok = await this.checkMentorBadgeCriteria(userId, badge);
        else if (menteeProfile) {
          ok = await this.checkBadgeCriteria(userId, badge, menteeProfile, {
            organizationId: badge.organizationId,
          });
        }
        if (!ok) continue;
        const result = await this.awardBadge(userId, badge.id, {
          triggeredAt: new Date().toISOString(),
          reason: badge.criteriaType,
          awardMethod: 'automatic',
        });
        if (result?.success) ownedKeys.add(key);
        continue;
      }

      // Program / clan task badges — evaluate each activity context.
      taskContexts ||= await this.listTaskContextsForUser(userId, badge.organizationId);
      const contexts = await this.#contextsForScopedBadge(userId, badge, hintContext, taskContexts);
      for (const ctx of contexts) {
        const key = this.ownedAwardKey(badge.id, ctx.programId, ctx.clanId);
        if (ownedKeys.has(key)) continue;
        const ok = await this.checkBadgeCriteria(userId, badge, menteeProfile, {
          organizationId: badge.organizationId,
          programId: ctx.programId,
          clanId: ctx.clanId,
        });
        if (!ok) continue;
        const result = await this.awardBadge(userId, badge.id, {
          programId: ctx.programId,
          clanId: ctx.clanId,
          triggeredAt: new Date().toISOString(),
          reason: badge.criteriaType,
          awardMethod: 'automatic',
        });
        if (result?.success) ownedKeys.add(key);
      }
    }
  }

  async #contextsForScopedBadge(userId, badge, hintContext = {}, taskContexts = null) {
    const scope = Number(badge.earningScope ?? EARNING_SCOPE.WORKSPACE);
    const orgId = badge.organizationId;
    const rows = taskContexts || await this.listTaskContextsForUser(userId, orgId);
    const out = [];
    const seen = new Set();

    const push = (programId, clanId) => {
      const k = this.ownedAwardKey(badge.id, programId, clanId);
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ programId: programId || null, clanId: clanId || null });
    };

    if (scope === EARNING_SCOPE.PROGRAM) {
      if (hintContext.programId) {
        push(hintContext.programId, null);
      }
      for (const row of rows) {
        if (row.programId && row.clanKind !== 'standing') {
          push(row.programId, null);
        }
      }
    } else if (scope === EARNING_SCOPE.CLAN) {
      if (hintContext.clanId) {
        const clan = await models.Clan.findByPk(hintContext.clanId, {
          attributes: ['id', 'programId', 'kind'],
          skipOrganizationScope: true,
        });
        if (clan) {
          push(clan.kind === 'standing' ? null : clan.programId, clan.id);
        }
      }
      for (const row of rows) {
        if (!row.clanId) continue;
        push(row.clanKind === 'standing' ? null : row.programId, row.clanId);
      }
    }
    return out;
  }

  async checkBadgeCriteria(userId, badge, menteeProfile = null, scopeCtx = {}) {
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
      case 'coins_earned': {
        // Lifetime coins earned — spending gifts must never revoke this.
        const earned = await this.lifetimeCoinsEarned(userId);
        return earned >= Number(criteriaValue.threshold || 0);
      }
      case 'tasks_completed': {
        const relatedId = criteriaValue.relatedRoadmapTaskId || criteriaValue.relatedTaskId;
        const organizationId = scopeCtx.organizationId || badge.organizationId;
        const programId = scopeCtx.programId || null;
        const clanId = scopeCtx.clanId || null;
        if (relatedId) {
          const [rows] = await sequelize.query(
            `
            SELECT COUNT(DISTINCT at.id)::int AS count
            FROM assigned_tasks at
            LEFT JOIN enrollments e ON e.id = at.enrollment_id
            LEFT JOIN clans c ON c.id = at.clan_id
            LEFT JOIN programs p ON p.id = e.program_id
            WHERE at.mentee_id = :userId
              AND at.status = 'completed'
              AND at.roadmap_task_id = :relatedId
              AND (:organizationId::uuid IS NULL OR at.organization_id = :organizationId)
              AND (
                :clanId::uuid IS NOT NULL AND at.clan_id = :clanId
                OR (
                  :clanId::uuid IS NULL AND :programId::uuid IS NOT NULL
                  AND e.program_id = :programId
                  AND p.closed_at IS NULL
                  AND (c.id IS NULL OR c.kind IS DISTINCT FROM 'standing')
                )
                OR (:clanId::uuid IS NULL AND :programId::uuid IS NULL)
              )
            `,
            { replacements: { userId, relatedId, organizationId, programId, clanId } }
          );
          return Number(rows?.[0]?.count || 0) >= Number(criteriaValue.count || 1);
        }
        const count = await this.countCompletedTasksScoped(userId, {
          organizationId,
          programId,
          clanId,
        });
        return count >= Number(criteriaValue.count || 0);
      }
      case 'programs_completed':
        return Number(menteeProfile.totalProgramsCompleted || 0) >= Number(criteriaValue.count || 0);
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

  /**
   * Mentor auto-badges — count real event rows only (not stale MentorProfile counters).
   * custom → always false (admin manual award).
   */
  async checkMentorBadgeCriteria(userId, badge) {
    const { criteriaType, criteriaValue } = badge;
    const need = Number(criteriaValue?.count ?? criteriaValue?.threshold ?? 0);

    switch (criteriaType) {
      case 'reviews_given': {
        const count = await models.TaskFeedback.count({ where: { mentorId: userId } });
        return count >= Math.max(1, need);
      }
      case 'tasks_approved': {
        const count = await models.TaskFeedback.count({
          where: { mentorId: userId, isApproved: true },
        });
        return count >= Math.max(1, need);
      }
      case 'meetings_logged': {
        const count = await models.MeetingNote.count({ where: { mentorId: userId } });
        return count >= Math.max(1, need);
      }
      case 'mentees_guided': {
        const guided = await this.mentorMenteesGuidedCount(userId);
        return guided >= Math.max(1, need);
      }
      case 'clans_led': {
        const led = await models.ClanMembership.count({
          where: { userId, role: 'lead_mentor', status: 'active' },
        });
        return led >= Math.max(1, need || 1);
      }
      case 'mentor_avg_rating': {
        const minRating = Number(criteriaValue?.minRating ?? criteriaValue?.threshold ?? 0);
        const minResponses = Number(criteriaValue?.minResponses ?? 3);
        const programReviewService = require('./programReviewService');
        const summary = await programReviewService.getMentorFeedbackSummary(userId);
        if (!summary?.revealed || summary.total < minResponses) return false;
        return Number(summary.overall || 0) >= minRating;
      }
      case 'custom':
      default:
        return false;
    }
  }

  /** Distinct mentees ever placed in clans this user leads/co-mentors (same as mentor profile). */
  async mentorMenteesGuidedCount(userId) {
    const clanRows = await models.ClanMembership.findAll({
      where: {
        userId,
        status: 'active',
        role: { [Sequelize.Op.in]: ['lead_mentor', 'co_mentor', 'core_team'] },
      },
      attributes: ['clanId'],
      raw: true,
    });
    const clanIds = [...new Set(clanRows.map((r) => r.clanId).filter(Boolean))];
    if (!clanIds.length) return 0;
    const everMembers = await models.ClanMembership.findAll({
      where: { clanId: { [Sequelize.Op.in]: clanIds }, role: 'mentee' },
      attributes: ['userId'],
      raw: true,
    });
    return new Set(everMembers.map((m) => m.userId)).size;
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

    await menteeProfile.update({ currentLevel: newLevel });

    try {
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.LEVEL_UP || 'level_up',
        recipients: [{ userId }],
        payload: {
          title: 'Level up',
          message: `You reached level ${newLevel}.`,
          actionUrl: '/mentee/profile/progress',
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
    const rows = await models.UserBadge.findAll({
      where: { userId },
      include: [
        { model: models.Badge, required: false },
        { model: models.Program, as: 'program', attributes: ['id', 'name'], required: false },
        { model: models.Clan, as: 'clan', attributes: ['id', 'name', 'kind'], required: false },
      ],
      order: [['unlockedAt', 'DESC']],
    });

    const out = [];
    for (const row of rows) {
      let badge = row.Badge || row.badge || null;
      if (!badge && row.badgeId) {
        badge = await models.Badge.findByPk(row.badgeId, { skipOrganizationScope: true });
      }
      if (!badge) continue;
      const json = typeof badge.toJSON === 'function' ? badge.toJSON() : badge;
      out.push({
        ...json,
        unlockedAt: row.unlockedAt,
        userBadgeId: row.id,
        programId: row.programId || null,
        clanId: row.clanId || null,
        programName: row.program?.name || null,
        clanName: row.clan?.name || null,
        earningScope: Number(badge.earningScope ?? EARNING_SCOPE.WORKSPACE),
      });
    }
    return out;
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
    const menteeProfile = await this.#readableMenteeProfile(userId);

    const totalBadges = await models.UserBadge.count({ where: { userId } });
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

    const rewardsService = require('./rewardsService');
    const coinBalance = await rewardsService.menteePointsBalance(userId);
    const badgeProgress = await this.badgeProgressFor(userId, menteeProfile);

    return {
      totalPoints: Number(menteeProfile.totalPoints || 0),
      /** Alias for UI clarity — same as totalPoints (engagement XP). */
      xp: Number(menteeProfile.totalPoints || 0),
      currentLevel: Number(menteeProfile.currentLevel || 1),
      currentStreak: streak.current,
      longestStreak: Math.max(streak.longest, Number(menteeProfile.longestStreakDays || 0)),
      totalBadges,
      totalTasksCompleted: Number(menteeProfile.totalTasksCompleted || 0),
      totalProgramsCompleted: Number(menteeProfile.totalProgramsCompleted || 0),
      avgTaskRating: parseFloat(menteeProfile.avgTaskRating) || 0,
      leaderboardRank: userLeaderboardRank ? userLeaderboardRank.rank : null,
      progressScore: standing.score,
      progressBand: standing.band ?? null,
      /** Why they hold no rank yet, in words a mentee can act on. */
      notRankedBecause: standing.notRankedBecause,
      /** Gift wallet: lifetime task coins − redemptions. */
      coinsEarned: coinBalance.earned,
      coinsSpent: coinBalance.spent,
      coinsBalance: coinBalance.balance,
      badgeProgress,
      recentBadges: recentBadges.slice(0, 5),
      recentPoints
    };
  }

  /**
   * Simple progress toward active mentee badges (for Duolingo-style "next" UI).
   * Does not change award rules — display only.
   */
  async badgeProgressFor(userId, menteeProfile) {
    const [activeBadges, owned] = await Promise.all([
      models.Badge.findAll({ where: { isActive: true } }),
      models.UserBadge.findAll({
        where: { userId },
        attributes: ['badgeId', 'programId', 'clanId'],
        skipOrganizationScope: true,
      }),
    ]);
    const ownedKeys = new Set(
      owned.map((row) => this.ownedAwardKey(row.badgeId, row.programId, row.clanId))
    );
    const coins = await this.lifetimeCoinsEarned(userId);
    const out = [];
    let taskContexts = null;
    const taskCountCache = new Map();
    const contextLabelCache = new Map();
    const taskCount = async (organizationId, programId = null, clanId = null) => {
      const key = `${organizationId}:${programId || ''}:${clanId || ''}`;
      if (!taskCountCache.has(key)) {
        taskCountCache.set(key, this.countCompletedTasksScoped(userId, {
          organizationId,
          programId,
          clanId,
        }));
      }
      return taskCountCache.get(key);
    };
    const contextLabel = async ({ programId = null, clanId = null }) => {
      const key = clanId ? `clan:${clanId}` : `program:${programId}`;
      if (!contextLabelCache.has(key)) {
        contextLabelCache.set(key, clanId
          ? models.Clan.findByPk(clanId, { attributes: ['name'], skipOrganizationScope: true }).then((row) => row?.name || null)
          : models.Program.findByPk(programId, { attributes: ['name'], skipOrganizationScope: true }).then((row) => row?.name || null));
      }
      return contextLabelCache.get(key);
    };

    for (const badge of activeBadges) {
      if (this.badgeTargetRole(badge) !== 'mentee') continue;
      const { criteriaType, criteriaValue } = badge;
      const scope = Number(badge.earningScope ?? EARNING_SCOPE.WORKSPACE);
      const target = Number(
        criteriaType === 'points_milestone' || criteriaType === 'coins_earned'
          ? criteriaValue.threshold
          : criteriaValue.count || 0
      );
      if (target <= 0) continue;

      const pushRow = (current, earned, programId = null, clanId = null, label = null) => {
        out.push({
          badgeId: badge.id,
          name: label ? `${badge.name} · ${label}` : badge.name,
          iconUrl: badge.iconUrl || null,
          criteriaType,
          earningScope: scope,
          programId,
          clanId,
          current: Math.min(current, target),
          target,
          earned,
          percent: Math.max(0, Math.min(100, Math.round((current / target) * 100))),
          progressKey: this.ownedAwardKey(badge.id, programId, clanId),
        });
      };

      if (criteriaType === 'points_milestone') {
        const earned = ownedKeys.has(this.ownedAwardKey(badge.id));
        pushRow(Number(menteeProfile.totalPoints || 0), earned);
      } else if (criteriaType === 'coins_earned') {
        const earned = ownedKeys.has(this.ownedAwardKey(badge.id));
        pushRow(coins, earned);
      } else if (criteriaType === 'tasks_completed') {
        if (scope === EARNING_SCOPE.WORKSPACE) {
          const earned = ownedKeys.has(this.ownedAwardKey(badge.id));
          const current = await taskCount(badge.organizationId);
          pushRow(current, earned);
        } else {
          taskContexts ||= await this.listTaskContextsForUser(userId, badge.organizationId);
          const contexts = await this.#contextsForScopedBadge(userId, badge, {}, taskContexts);
          for (const ctx of contexts) {
            const earned = ownedKeys.has(
              this.ownedAwardKey(badge.id, ctx.programId, ctx.clanId)
            );
            const current = await taskCount(badge.organizationId, ctx.programId, ctx.clanId);
            const label = await contextLabel(ctx);
            pushRow(current, earned, ctx.programId, ctx.clanId, label || null);
          }
        }
      }
    }

    return out.sort((a, b) => Number(a.earned) - Number(b.earned) || a.percent - b.percent).slice(0, 8);
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
    const defaultBadges = [
      {
        name: 'First Steps',
        description: 'Complete your first task',
        category: 'milestone',
        criteriaType: 'tasks_completed',
        criteriaValue: { count: 1 },
        pointsReward: 10,
        isActive: true,
        isSecret: false,
        earningScope: EARNING_SCOPE.WORKSPACE,
      },
      {
        name: 'Achievement Collector',
        description: 'Earn 5 badges',
        category: 'achievement',
        criteriaType: 'custom',
        criteriaValue: { manual: true },
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
        description: 'Earn 500 points',
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

    for (const badgeData of defaultBadges) {
      await models.Badge.findOrCreate({
        where: { name: badgeData.name },
        defaults: badgeData, transaction
      });
    }

    const count = await models.Badge.count({ transaction });
    return count;
  }

  async awardDailyLoginPoint(userId) {
    const profile = await models.MenteeProfile.findOne({ where: { userId } });
    if (!profile) return;

    const today = todayInZone();
    const existing = await models.PointsHistory.findOne({
      where: {
        userId,
        sourceType: 'daily_login',
        createdAt: { [Sequelize.Op.gte]: new Date(today) }
      }
    });

    if (existing) return;

    await this.awardPoints(userId, 1, 'daily_login', null, 'Daily login bonus');
  }
}

const gamificationService = new GamificationService();
gamificationService.EARNING_SCOPE = EARNING_SCOPE;
module.exports = gamificationService;
