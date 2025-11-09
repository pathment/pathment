module.exports = (sequelize, DataTypes) => {
  const UserChallenge = sequelize.define('UserChallenge', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    challengeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'challenge_id'
    },
    progress: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    progressPercentage: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.00,
      field: 'progress_percentage'
    },
    isCompleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_completed'
    },
    enrolledAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'enrolled_at'
    },
    completedAt: {
      type: DataTypes.DATE,
      field: 'completed_at'
    }
  }, {
    tableName: 'user_challenges',
    underscored: true,
    timestamps: false,
    indexes: [
      { unique: true, fields: ['user_id', 'challenge_id'] },
      { fields: ['user_id'] },
      { fields: ['challenge_id'] },
      { fields: ['is_completed'] }
    ]
  });

  UserChallenge.associate = (models) => {
    UserChallenge.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    UserChallenge.belongsTo(models.Challenge, { foreignKey: 'challenge_id', as: 'challenge' });
  };

  return UserChallenge;
};
