module.exports = (sequelize, DataTypes) => {
  const MentorMenteeMatch = sequelize.define('MentorMenteeMatch', {
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
    menteeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentee_id'
    },
    enrollmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'enrollment_id'
    },
    levelId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'level_id'
    },
    matchedBy: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'matched_by'
    },
    matchScore: {
      type: DataTypes.DECIMAL(5, 2),
      field: 'match_score'
    },
    matchReason: {
      type: DataTypes.TEXT,
      field: 'match_reason'
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'active',
      validate: {
        isIn: [['pending', 'active', 'completed', 'cancelled']]
      }
    },
    matchedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'matched_at'
    },
    startedAt: {
      type: DataTypes.DATE,
      field: 'started_at'
    },
    endedAt: {
      type: DataTypes.DATE,
      field: 'ended_at'
    },
    menteeSatisfactionRating: {
      type: DataTypes.DECIMAL(3, 2),
      field: 'mentee_satisfaction_rating'
    },
    mentorSatisfactionRating: {
      type: DataTypes.DECIMAL(3, 2),
      field: 'mentor_satisfaction_rating'
    }
  }, {
    tableName: 'mentor_mentee_matches',
    underscored: true,
    indexes: [
      { fields: ['mentor_id'] },
      { fields: ['mentee_id'] },
      { fields: ['enrollment_id'] },
      { fields: ['status'] },
      { fields: ['level_id'] }
    ]
  });

  MentorMenteeMatch.associate = (models) => {
    MentorMenteeMatch.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
    MentorMenteeMatch.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
    MentorMenteeMatch.belongsTo(models.Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
    MentorMenteeMatch.belongsTo(models.ProgramLevel, { foreignKey: 'level_id', as: 'level' });
    MentorMenteeMatch.belongsTo(models.User, { foreignKey: 'matched_by', as: 'matcher' });
  };

  return MentorMenteeMatch;
};
