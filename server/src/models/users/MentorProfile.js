module.exports = (sequelize, DataTypes) => {
  const MentorProfile = sequelize.define('MentorProfile', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      field: 'user_id'
    },
    title: {
      type: DataTypes.STRING(150)
    },
    organization: {
      type: DataTypes.STRING(200)
    },
    yearsOfExperience: {
      type: DataTypes.INTEGER,
      field: 'years_of_experience'
    },
    specialization: {
      type: DataTypes.ARRAY(DataTypes.TEXT)
    },
    linkedinUrl: {
      type: DataTypes.TEXT,
      field: 'linkedin_url'
    },
    githubUrl: {
      type: DataTypes.TEXT,
      field: 'github_url'
    },
    portfolioUrl: {
      type: DataTypes.TEXT,
      field: 'portfolio_url'
    },
    maxMentees: {
      type: DataTypes.INTEGER,
      defaultValue: 5,
      field: 'max_mentees'
    },
    currentMenteeCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'current_mentee_count'
    },
    avgResponseTimeHours: {
      type: DataTypes.DECIMAL(5, 2),
      field: 'avg_response_time_hours'
    },
    totalMenteesGuided: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_mentees_guided'
    },
    successRate: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.00,
      field: 'success_rate'
    },
    avgFeedbackRating: {
      type: DataTypes.DECIMAL(3, 2),
      defaultValue: 0.00,
      field: 'avg_feedback_rating'
    },
    totalTasksReviewed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_tasks_reviewed'
    },
    isAcceptingMentees: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_accepting_mentees'
    },
    preferredMenteeLevel: {
      type: DataTypes.ARRAY(DataTypes.STRING(50)),
      field: 'preferred_mentee_level'
    }
  }, {
    tableName: 'mentor_profiles',
    underscored: true
  });

  MentorProfile.associate = (models) => {
    MentorProfile.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    // MentorProfile.hasMany(models.MentorMenteeMatch, { foreignKey: 'mentor_id', as: 'matches' });
  };

  return MentorProfile;
};
