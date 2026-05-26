module.exports = (sequelize, DataTypes) => {
  const MenteeProfile = sequelize.define('MenteeProfile', {
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
    currentEducation: {
      type: DataTypes.STRING(200),
      field: 'current_education'
    },
    currentOccupation: {
      type: DataTypes.STRING(200),
      field: 'current_occupation'
    },
    learningGoals: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      field: 'learning_goals'
    },
    interests: {
      type: DataTypes.ARRAY(DataTypes.TEXT)
    },
     linkedinUrl: {
      type: DataTypes.STRING(255),
      field: 'linkedin_url',
      allowNull: true
    },
    githubUrl: {
      type: DataTypes.STRING(255),
      field: 'github_url',
      allowNull: true
    },
    priorExperience: {
      type: DataTypes.TEXT,
      field: 'prior_experience'
    },
    preferredLearningStyle: {
      type: DataTypes.STRING(50),
      field: 'preferred_learning_style'
    },
    totalProgramsEnrolled: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_programs_enrolled'
    },
    totalProgramsCompleted: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_programs_completed'
    },
    totalTasksCompleted: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_tasks_completed'
    },
    avgTaskRating: {
      type: DataTypes.DECIMAL(3, 2),
      defaultValue: 0.00,
      field: 'avg_task_rating'
    },
    currentStreakDays: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'current_streak_days'
    },
    longestStreakDays: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'longest_streak_days'
    },
    lastActivityDate: {
      type: DataTypes.DATEONLY,
      field: 'last_activity_date'
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
    totalBadgesEarned: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_badges_earned'
    }
  }, {
    tableName: 'mentee_profiles',
    underscored: true
  });

  MenteeProfile.associate = (models) => {
    MenteeProfile.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return MenteeProfile;
};
