const { Op } = require('sequelize');
const { sequelize, models } = require('../db');

class AnalyticsService {
  async getSystemOverview() {
    const [mentors, mentees, programs, enrollments, matches] =
      await Promise.all([
        this.getMentorStats(),
        this.getMenteeStats(),
        this.getProgramStats(),
        this.getEnrollmentStats(),
        this.getMatchingStats()
      ]);

    return {
      mentors,
      mentees,
      programs,
      enrollments,
      matches,
      lastUpdated: new Date()
    };
  }

  async getMentorStats() {
    const [total, avgRating, currentMatches] = await Promise.all([
      models.User.count({
        where: { role: 'mentor', status: 'active' }
      }),
      models.MentorProfile.findOne({
        attributes: [
          [sequelize.fn('AVG', sequelize.col('avg_feedback_rating')), 'rating']
        ],
        raw: true
      }),
      models.MentorMenteeMatch.count({
        where: { status: 'active' }
      })
    ]);

    return {
      totalMentors: total,
      activeMatches: currentMatches,
      avgRating: parseFloat(avgRating?.rating || 0).toFixed(1),
      utilization: total > 0 ? Math.round((currentMatches / (total * 5)) * 100) : 0
    };
  }

  async getMenteeStats() {
    const [total, avgProgress, activeEnrollments, engagementScore] = await Promise.all([
      models.User.count({
        where: { role: 'mentee', status: 'active' }
      }),
      models.MenteeAnalytics.findOne({
        attributes: [
          [sequelize.fn('AVG', sequelize.col('overall_progress_percentage')), 'avg']
        ],
        raw: true
      }),
      models.Enrollment.count({
        where: { status: { [Op.in]: ['active', 'matched'] } }
      }),
      this.#calculateEngagementScore()
    ]);

    return {
      totalMentees: total,
      activeEnrollments,
      avgProgress: Math.round(parseFloat(avgProgress?.avg || 0)),
      engagementScore
    };
  }

  async getProgramStats() {
    const [total, published, completionRate] = await Promise.all([
      models.Program.count(),
      models.Program.count({
        where: { status: 'published' }
      }),
      models.Enrollment.findOne({
        attributes: [
          [sequelize.fn('AVG', sequelize.col('overall_progress_percentage')), 'avg']
        ],
        where: { status: { [Op.in]: ['program_completed', 'level_completed'] } },
        raw: true
      })
    ]);

    return {
      totalPrograms: total,
      publishedPrograms: published,
      completionRate: Math.round(parseFloat(completionRate?.avg || 0)),
      draftPrograms: total - published
    };
  }

  async getEnrollmentStats() {
    const result = await models.Enrollment.findAll({
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    const counts = {};
    result.forEach(r => {
      counts[r.status] = parseInt(r.count);
    });

    return {
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      byStatus: counts
    };
  }

  async getMatchingStats() {
    const [total, active, pending, avgSatisfaction] = await Promise.all([
      models.MentorMenteeMatch.count(),
      models.MentorMenteeMatch.count({
        where: { status: 'active' }
      }),
      models.MentorMenteeMatch.count({
        where: { status: 'pending' }
      }),
      models.MentorMenteeMatch.findOne({
        attributes: [
          [sequelize.fn('AVG', sequelize.col('mentee_satisfaction_rating')), 'avg']
        ],
        raw: true
      })
    ]);

    return {
      totalMatches: total,
      activeMatches: active,
      pendingMatches: pending,
      avgSatisfaction: parseFloat(avgSatisfaction?.avg || 0).toFixed(1)
    };
  }

  async getProgramsList({ page = 1, limit = 20, search } = {}) {
    const offset = (page - 1) * limit;
    const where = {};

    if (search) {
      where.name = { [Op.iLike]: `%${search}%` };
    }

    const { rows, count } = await models.Program.findAndCountAll({
      where,
      include: [
        {
          model: models.Enrollment,
          as: 'enrollments',
          attributes: ['id', 'status', 'overallProgressPercentage']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true
    });

    const programs = rows.map(program => {
      const enrollments = program.enrollments || [];
      const activeEnrollments = enrollments.filter(e =>
        ['active', 'matched'].includes(e.status)
      );
      const completedEnrollments = enrollments.filter(e =>
        ['program_completed', 'level_completed'].includes(e.status)
      );
      const avgProgress = enrollments.length > 0
        ? Math.round(
            enrollments.reduce((sum, e) => sum + parseFloat(e.overallProgressPercentage || 0), 0) /
            enrollments.length
          )
        : 0;

      return {
        id: program.id,
        name: program.name,
        type: program.type,
        status: program.status,
        totalEnrollments: enrollments.length,
        activeEnrollments: activeEnrollments.length,
        completedEnrollments: completedEnrollments.length,
        completionRate: enrollments.length > 0
          ? Math.round((completedEnrollments.length / enrollments.length) * 100)
          : 0,
        avgProgress,
        createdAt: program.createdAt
      };
    });

    return {
      programs,
      pagination: {
        page,
        limit,
        totalItems: count,
        totalPages: Math.ceil(count / limit)
      }
    };
  }

  async getMentorsList({ page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    const { rows, count } = await models.User.findAndCountAll({
      where: { role: 'mentor', status: 'active' },
      include: [
        {
          model: models.MentorProfile,
          as: 'mentorProfile',
          attributes: [
            'specialization',
            'currentMenteeCount',
            'maxMentees',
            'avgFeedbackRating',
            'avgResponseTimeHours',
            'successRate',
            'totalMenteesGuided'
          ]
        }
      ],
      attributes: ['id', 'firstName', 'lastName', 'email', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    const mentors = rows.map(mentor => ({
      id: mentor.id,
      name: `${mentor.firstName} ${mentor.lastName}`,
      email: mentor.email,
      specialization: mentor.mentorProfile?.specialization || [],
      currentMenteeCount: mentor.mentorProfile?.currentMenteeCount || 0,
      maxMentees: mentor.mentorProfile?.maxMentees || 5,
      avgRating: parseFloat(mentor.mentorProfile?.avgFeedbackRating || 0).toFixed(1),
      avgResponseTimeHours: parseFloat(mentor.mentorProfile?.avgResponseTimeHours || 0).toFixed(1),
      successRate: parseFloat(mentor.mentorProfile?.successRate || 0).toFixed(0),
      totalMenteesGuided: mentor.mentorProfile?.totalMenteesGuided || 0,
      joinedAt: mentor.createdAt
    }));

    return {
      mentors,
      pagination: {
        page,
        limit,
        totalItems: count,
        totalPages: Math.ceil(count / limit)
      }
    };
  }

  async #calculateEngagementScore() {
    const activeUsers = await models.User.count({
      where: { status: 'active' }
    });

    if (activeUsers === 0) return 0;

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    let recentActivity = 0;
    try {
      recentActivity = await models.AnalyticsEvent.count({
        where: {
          createdAt: { [Op.gte]: oneDayAgo }
        }
      });
    } catch {
      const recentLogins = await models.User.count({
        where: {
          lastLoginAt: { [Op.gte]: oneDayAgo }
        }
      });
      return Math.min(100, Math.round((recentLogins / activeUsers) * 100));
    }

    return Math.min(100, Math.round((recentActivity / activeUsers) * 100));
  }
}

module.exports = new AnalyticsService();
