module.exports = (sequelize, DataTypes) => {
  const MenteeAnalytics = sequelize.define('MenteeAnalytics', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    menteeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentee_id'
    },
    enrollmentId: {
      type: DataTypes.UUID,
      field: 'enrollment_id'
    },
    tasksCompleted: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'tasks_completed'
    },
    tasksInProgress: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'tasks_in_progress'
    },
    tasksPending: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'tasks_pending'
    },
    overallProgressPercentage: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.00,
      field: 'overall_progress_percentage'
    },
    avgTaskRating: {
      type: DataTypes.DECIMAL(3, 2),
      field: 'avg_task_rating'
    },
    firstSubmissionApprovalRate: {
      type: DataTypes.DECIMAL(5, 2),
      field: 'first_submission_approval_rate'
    },
    avgRevisionCount: {
      type: DataTypes.DECIMAL(4, 2),
      field: 'avg_revision_count'
    },
    avgTaskCompletionTimeHours: {
      type: DataTypes.DECIMAL(6, 2),
      field: 'avg_task_completion_time_hours'
    },
    onTimeSubmissionRate: {
      type: DataTypes.DECIMAL(5, 2),
      field: 'on_time_submission_rate'
    },
    currentStreakDays: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'current_streak_days'
    },
    totalLoginDays: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_login_days'
    },
    avgDailyTimeMinutes: {
      type: DataTypes.DECIMAL(6, 2),
      field: 'avg_daily_time_minutes'
    },
    totalPoints: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_points'
    },
    currentLevel: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      field: 'current_level'
    },
    badgesEarned: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'badges_earned'
    },
    challengesCompleted: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'challenges_completed'
    },
    skillImprovements: {
      type: DataTypes.JSONB,
      field: 'skill_improvements'
    },
    calculatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'calculated_at'
    },
    periodStart: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'period_start'
    },
    periodEnd: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'period_end'
    }
  }, {
    tableName: 'mentee_analytics',
    underscored: true,
    timestamps: false,
    indexes: [
      { unique: true, fields: ['mentee_id', 'enrollment_id', 'period_start', 'period_end'] },
      { fields: ['mentee_id'] },
      { fields: ['enrollment_id'] },
      { fields: ['period_start', 'period_end'] }
    ]
  });

  MenteeAnalytics.associate = (models) => {
    MenteeAnalytics.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
    MenteeAnalytics.belongsTo(models.Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
  };

  return MenteeAnalytics;
};
