module.exports = (sequelize, DataTypes) => {
  const ProgramAnalytics = sequelize.define('ProgramAnalytics', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    programId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'program_id'
    },
    totalEnrollments: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_enrollments'
    },
    activeEnrollments: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'active_enrollments'
    },
    completedEnrollments: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'completed_enrollments'
    },
    droppedEnrollments: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'dropped_enrollments'
    },
    completionRate: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.00,
      field: 'completion_rate'
    },
    avgCompletionTimeDays: {
      type: DataTypes.DECIMAL(6, 2),
      field: 'avg_completion_time_days'
    },
    avgProgramRating: {
      type: DataTypes.DECIMAL(3, 2),
      field: 'avg_program_rating'
    },
    totalReviews: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_reviews'
    },
    avgTaskQuality: {
      type: DataTypes.DECIMAL(3, 2),
      field: 'avg_task_quality'
    },
    avgTasksPerMentee: {
      type: DataTypes.DECIMAL(6, 2),
      field: 'avg_tasks_per_mentee'
    },
    avgTimePerTaskHours: {
      type: DataTypes.DECIMAL(6, 2),
      field: 'avg_time_per_task_hours'
    },
    highRevisionTasks: {
      type: DataTypes.JSONB,
      field: 'high_revision_tasks'
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
    tableName: 'program_analytics',
    underscored: true,
    timestamps: false,
    indexes: [
      { unique: true, fields: ['program_id', 'period_start', 'period_end'] },
      { fields: ['program_id'] },
      { fields: ['period_start', 'period_end'] }
    ]
  });

  ProgramAnalytics.associate = (models) => {
    ProgramAnalytics.belongsTo(models.Program, { foreignKey: 'program_id', as: 'program' });
  };

  return ProgramAnalytics;
};
