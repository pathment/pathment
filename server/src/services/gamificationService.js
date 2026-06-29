const { models, Sequelize } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');

class GamificationService {
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

  async awardBadge(userId, badgeId, unlockContext = {}) {
    const existing = await models.UserBadge.findOne({
      where: { userId, badgeId }
    });

    if (existing) {
      return { alreadyOwned: true };
    }

    const badge = await models.Badge.findByPk(badgeId);
    if (!badge) {
      throw new NotFoundError('Badge not found');
    }

    const userBadge = await models.UserBadge.create({
      userId,
      badgeId,
      unlockContext
    });

    if (badge.pointsReward && badge.pointsReward > 0) {
      await this.awardPoints(
        userId,
        badge.pointsReward,
        'badge_earned',
        badge.id,
        `Earned badge: ${badge.name}`
      );
    }

    try {
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.BADGE_EARNED || 'badge_earned',
        recipients: [{ userId }],
        payload: {
          title: 'Badge earned',
          message: `You earned the ${badge.name} badge.`,
          actionUrl: '/mentee/profile/badges',
          actionLabel: 'View badges',
          relatedEntityType: 'badge',
          relatedEntityId: badge.id,
          emailSubject: `Pathment: Badge earned - ${badge.name}`
        }
      });
    } catch (notificationError) {
      console.error('[Gamification] Failed to send badge notification:', notificationError.message);
    }

    return {
      success: true,
      badge: userBadge,
      badgeDetails: badge
    };
  }

  async checkAndAwardBadges(userId) {
    const menteeProfile = await models.MenteeProfile.findOne({ where: { userId } });
    if (!menteeProfile) return;

    const activeBadges = await models.Badge.findAll({ where: { isActive: true } });
    const userBadges = await models.UserBadge.findAll({ where: { userId } });
    const ownedBadgeIds = new Set(userBadges.map(ub => ub.badgeId));

    for (const badge of activeBadges) {
      if (ownedBadgeIds.has(badge.id)) continue;

      const isCriteriaMet = await this.checkBadgeCriteria(userId, badge, menteeProfile);
      if (!isCriteriaMet) continue;

      await this.awardBadge(userId, badge.id, {
        triggeredAt: new Date().toISOString(),
        reason: badge.criteriaType
      });
    }
  }

  async checkBadgeCriteria(userId, badge, menteeProfile = null) {
    const { criteriaType, criteriaValue } = badge;

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
        await existing.update({
          rank,
          points: Number(menteeProfile.totalPoints || 0),
          periodEnd: period.end,
          isVisible: true
        });
      } else {
        await models.LeaderboardEntry.create({
          userId,
          programId,
          rank,
          points: Number(menteeProfile.totalPoints || 0),
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

  async updateStreak(userId) {
    const menteeProfile = await models.MenteeProfile.findOne({ where: { userId } });
    if (!menteeProfile) return;

    const today = new Date().toISOString().split('T')[0];
    const lastActivityDate = menteeProfile.lastActivityDate
      ? new Date(menteeProfile.lastActivityDate).toISOString().split('T')[0]
      : null;

    if (!lastActivityDate) {
      await menteeProfile.update({
        currentStreakDays: 1,
        longestStreakDays: 1,
        lastActivityDate: today
      });
      return;
    }

    if (lastActivityDate === today) {
      return;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayIso = yesterday.toISOString().split('T')[0];

    if (lastActivityDate === yesterdayIso) {
      const newStreak = Number(menteeProfile.currentStreakDays || 0) + 1;
      const longest = Math.max(newStreak, Number(menteeProfile.longestStreakDays || 0));

      await menteeProfile.update({
        currentStreakDays: newStreak,
        longestStreakDays: longest,
        lastActivityDate: today
      });

      if ([7, 14, 30, 60, 100].includes(newStreak)) {
        const bonusMap = { 7: 50, 14: 100, 30: 200, 60: 300, 100: 500 };
        await this.awardPoints(
          userId,
          bonusMap[newStreak],
          'streak_bonus',
          null,
          `${newStreak} day streak bonus`
        );
      }

      return;
    }

    await menteeProfile.update({
      currentStreakDays: 1,
      lastActivityDate: today
    });
  }

  /**
   * Leaderboard ranked by points EARNED IN THE PERIOD - computed live from the
   * PointsHistory ledger so daily/weekly/monthly are actually different from
   * all-time (they previously all showed the same all-time rank).
   */
  async getLeaderboard(programId = null, periodType = 'all_time', limit = 50) {
    const now = new Date();
    let since = null; // 'YYYY-MM-DD' window start; null = all-time
    if (periodType === 'daily') since = now.toISOString().split('T')[0];
    else if (periodType === 'weekly') since = this.getWeekStart(now);
    else if (periodType === 'monthly') since = this.getMonthStart(now);

    const where = {};
    if (since) where.createdAt = { [Sequelize.Op.gte]: since };

    const rows = await models.PointsHistory.findAll({
      attributes: ['userId', [Sequelize.fn('SUM', Sequelize.col('points_change')), 'pts']],
      where,
      group: ['userId'],
      order: [[Sequelize.fn('SUM', Sequelize.col('points_change')), 'DESC']],
      limit,
      raw: true
    });

    const positive = rows.filter((r) => Number(r.pts) > 0);
    if (!positive.length) return [];

    const userIds = positive.map((r) => r.userId);
    const users = await models.User.findAll({
      where: { id: userIds },
      attributes: ['id', 'firstName', 'lastName', 'email']
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    return positive.map((r, index) => ({
      id: `lb-${r.userId}-${periodType}`,
      userId: r.userId,
      rank: index + 1,
      points: Number(r.pts) || 0,
      periodType,
      user: byId.get(r.userId) || null
    }));
  }

  async getUserBadges(userId) {
    return models.UserBadge.findAll({
      where: { userId },
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

  async getUserGamificationStats(userId) {
    const menteeProfile = await models.MenteeProfile.findOne({ where: { userId } });
    if (!menteeProfile) {
      throw new NotFoundError('Mentee profile not found');
    }

    const totalBadges = await models.UserBadge.count({ where: { userId } });
    const recentBadges = await this.getUserBadges(userId);
    const recentPoints = await this.getUserPointsHistory(userId, 10);
    const latestPointsEntry = recentPoints.length > 0 ? recentPoints[0] : null;

    let userLeaderboardRank = await models.LeaderboardEntry.findOne({
      where: {
        userId,
        periodType: 'all_time',
        programId: null
      }
    });

    if (!userLeaderboardRank) {
      const higherRankedCount = await models.MenteeProfile.count({
        where: {
          totalPoints: { [Sequelize.Op.gt]: Number(menteeProfile.totalPoints || 0) }
        }
      });

      userLeaderboardRank = { rank: higherRankedCount + 1 };
    }

    const today = new Date().toISOString().split('T')[0];
    const latestActivityDay = latestPointsEntry?.createdAt
      ? new Date(latestPointsEntry.createdAt).toISOString().split('T')[0]
      : null;

    const derivedCurrentStreak =
      Number(menteeProfile.currentStreakDays || 0) === 0 && latestActivityDay === today
        ? 1
        : Number(menteeProfile.currentStreakDays || 0);

    return {
      totalPoints: Number(menteeProfile.totalPoints || 0),
      currentLevel: Number(menteeProfile.currentLevel || 1),
      currentStreak: derivedCurrentStreak,
      longestStreak: Number(menteeProfile.longestStreakDays || 0),
      totalBadges,
      totalTasksCompleted: Number(menteeProfile.totalTasksCompleted || 0),
      totalProgramsCompleted: Number(menteeProfile.totalProgramsCompleted || 0),
      avgTaskRating: parseFloat(menteeProfile.avgTaskRating) || 0,
      leaderboardRank: userLeaderboardRank ? userLeaderboardRank.rank : null,
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

  async createDefaultBadges() {
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
        defaults: badgeData
      });
    }

    const count = await models.Badge.count();
    return count;
  }
}

module.exports = new GamificationService();
