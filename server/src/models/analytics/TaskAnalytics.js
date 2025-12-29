module.exports = (sequelize, DataTypes) => {
  const TaskAnalytics = sequelize.define('TaskAnalytics', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    roadmapTaskId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'roadmap_task_id'
    },
    totalAssignments: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_assignments'
    },
    totalCompletions: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_completions'
    },
    completionRate: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.00,
      field: 'completion_rate'
    },
    avgRating: {
      type: DataTypes.DECIMAL(3, 2),
      field: 'avg_rating'
    },
    firstSubmissionApprovalRate: {
      type: DataTypes.DECIMAL(5, 2),
      field: 'first_submission_approval_rate'
    },
    avgRevisionCount: {
      type: DataTypes.DECIMAL(4, 2),
      field: 'avg_revision_count'
    },
    avgCompletionTimeHours: {
      type: DataTypes.DECIMAL(6, 2),
      field: 'avg_completion_time_hours'
    },
    medianCompletionTimeHours: {
      type: DataTypes.DECIMAL(6, 2),
      field: 'median_completion_time_hours'
    },
    onTimeCompletionRate: {
      type: DataTypes.DECIMAL(5, 2),
      field: 'on_time_completion_rate'
    },
    commonIssues: {
      type: DataTypes.JSONB,
      field: 'common_issues'
    },
    revisionReasons: {
      type: DataTypes.JSONB,
      field: 'revision_reasons'
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
    tableName: 'task_analytics',
    underscored: true,
    timestamps: false,
    indexes: [
      { unique: true, fields: ['roadmap_task_id', 'period_start', 'period_end'] },
      { fields: ['roadmap_task_id'] },
      { fields: ['period_start', 'period_end'] },
      { fields: ['avg_revision_count'] }
    ]
  });

  TaskAnalytics.associate = (models) => {
    TaskAnalytics.belongsTo(models.RoadmapTask, { foreignKey: 'roadmap_task_id', as: 'task' });
  };

  return TaskAnalytics;
};
