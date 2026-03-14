module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'password_hash'
    },
    role: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [['admin', 'mentor', 'mentee']]
      }
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending',
      validate: {
        isIn: [['active', 'inactive', 'pending', 'suspended']]
      }
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'first_name'
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'last_name'
    },
    profilePictureUrl: {
      type: DataTypes.TEXT,
      field: 'profile_picture_url'
    },
    bio: {
      type: DataTypes.TEXT
    },
    phone: {
      type: DataTypes.STRING(20)
    },
    emailVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'email_verified'
    },
    emailVerifiedAt: {
      type: DataTypes.DATE,
      field: 'email_verified_at'
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      field: 'last_login_at'
    },
    loginCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'login_count'
    },
    profileCompleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'profile_completed'
    },
    onboardingStep: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'onboarding_step',
      comment: '0=registered, 1=profile_completed, 2=skills_added, 3=onboarding_finished'
    },
    deletedAt: {
      type: DataTypes.DATE,
      field: 'deleted_at'
    }
  }, {
    tableName: 'users',
    underscored: true,
    paranoid: true,
    indexes: [
      { fields: ['email'] },
      { fields: ['role'] },
      { fields: ['status'] },
      { fields: ['created_at'] }
    ]
  });

  User.associate = (models) => {
    // Profile associations
    User.hasOne(models.MentorProfile, { foreignKey: 'user_id', as: 'mentorProfile' });
    User.hasOne(models.MenteeProfile, { foreignKey: 'user_id', as: 'menteeProfile' });
    User.hasOne(models.AdminProfile, { foreignKey: 'user_id', as: 'adminProfile' });
    
    // Programs created
    User.hasMany(models.Program, { foreignKey: 'created_by', as: 'createdPrograms' });
    
    // Enrollments
    User.hasMany(models.Enrollment, { foreignKey: 'mentee_id', as: 'enrollments' });
    
    // Skills
    User.belongsToMany(models.Skill, {
      through: models.UserSkill,
      foreignKey: 'user_id',
      otherKey: 'skill_id',
      as: 'skills'
    });
    
    // Auth tokens
    User.hasMany(models.RefreshToken, { foreignKey: 'user_id', as: 'refreshTokens' });
    User.hasMany(models.PasswordResetToken, { foreignKey: 'user_id', as: 'passwordResetTokens' });
    User.hasMany(models.EmailVerificationToken, { foreignKey: 'user_id', as: 'emailVerificationTokens' });
    
    // Sessions
    User.hasMany(models.UserSession, { foreignKey: 'user_id', as: 'sessions' });
    
    // Notifications & Messages
    User.hasMany(models.Notification, { foreignKey: 'user_id', as: 'notifications' });
    User.hasMany(models.Message, { foreignKey: 'sender_id', as: 'sentMessages' });
    User.hasMany(models.Message, { foreignKey: 'recipient_id', as: 'receivedMessages' });
    User.hasMany(models.Conversation, { foreignKey: 'created_by', as: 'createdConversations' });
    User.hasMany(models.ConversationParticipant, { foreignKey: 'user_id', as: 'conversationParticipants' });
    
    // Badges & Gamification
    User.belongsToMany(models.Badge, {
      through: models.UserBadge,
      foreignKey: 'user_id',
      otherKey: 'badge_id',
      as: 'badges'
    });
    User.hasMany(models.PointsHistory, { foreignKey: 'user_id', as: 'pointsHistory' });
    
    // Settings
    User.hasOne(models.UserSettings, { foreignKey: 'user_id', as: 'settings' });
  };

  return User;
};
