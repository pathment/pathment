module.exports = (sequelize, DataTypes) => {
  const Challenge = sequelize.define('Challenge', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by'
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [['speed', 'quality', 'consistency', 'custom']]
      }
    },
    requirements: {
      type: DataTypes.JSONB,
      allowNull: false
    },
    eligibilityCriteria: {
      type: DataTypes.JSONB,
      field: 'eligibility_criteria'
    },
    pointsReward: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'points_reward'
    },
    badgeReward: {
      type: DataTypes.UUID,
      field: 'badge_reward'
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'start_date'
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'end_date'
    },
    totalParticipants: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_participants'
    },
    totalCompleted: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_completed'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active'
    }
  }, {
    tableName: 'challenges',
    underscored: true,
    indexes: [
      { fields: ['type'] },
      { fields: ['is_active'] },
      { fields: ['start_date', 'end_date'] }
    ]
  });

  Challenge.associate = (models) => {
    Challenge.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
    Challenge.belongsTo(models.Badge, { foreignKey: 'badge_reward', as: 'badge' });
    Challenge.hasMany(models.UserChallenge, { foreignKey: 'challenge_id', as: 'participants' });
  };

  return Challenge;
};
