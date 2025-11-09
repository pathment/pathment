module.exports = (sequelize, DataTypes) => {
  const MentorAnalytics = sequelize.define('MentorAnalytics', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    mentorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentor_id'
    },
    totalMenteesCurrent: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_mentees_current'
    },
    totalMenteesAllTime: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_mentees_all_time'
    },
    successfulMentees: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'successful_mentees'
    },
    avgResponseTimeHours: {
      type: DataTypes.DECIMAL(6, 2),
      field: 'avg_response_time_hours'
    },
    avgFeedbackQuality: {
      type: DataTypes.DECIMAL(3, 2),
      field: 'avg_feedback_quality'
    },
    avgMenteeSuccessRate: {
      type: DataTypes.DECIMAL(5, 2),
      field: 'avg_mentee_success_rate'
    },
    totalTasksReviewed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_tasks_reviewed'
    },
    avgReviewTimeHours: {
      type: DataTypes.DECIMAL(6, 2),
      field: 'avg_review_time_hours'
    },
    approvalRate: {
      type: DataTypes.DECIMAL(5, 2),
      field: 'approval_rate'
    },
    totalMessagesSent: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_messages_sent'
    },
    avgMessagesPerMentee: {
      type: DataTypes.DECIMAL(6, 2),
      field: 'avg_messages_per_mentee'
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
    tableName: 'mentor_analytics',
    underscored: true,
    timestamps: false,
    indexes: [
      { unique: true, fields: ['mentor_id', 'period_start', 'period_end'] },
      { fields: ['mentor_id'] },
      { fields: ['period_start', 'period_end'] }
    ]
  });

  MentorAnalytics.associate = (models) => {
    MentorAnalytics.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
  };

  return MentorAnalytics;
};
