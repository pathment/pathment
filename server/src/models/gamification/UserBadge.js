module.exports = (sequelize, DataTypes) => {
  const UserBadge = sequelize.define('UserBadge', {
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
    badgeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'badge_id'
    },
    unlockedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'unlocked_at'
    },
    unlockContext: {
      type: DataTypes.JSONB,
      field: 'unlock_context'
    },
    isFeatured: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_featured'
    }
  }, {
    tableName: 'user_badges',
    underscored: true,
    timestamps: false,
    indexes: [
      { unique: true, fields: ['user_id', 'badge_id'] },
      { fields: ['user_id'] },
      { fields: ['badge_id'] },
      { fields: ['unlocked_at'] }
    ],
    hooks: {
      afterCreate: async (userBadge, options) => {
        // Increment badge's total_unlocked
        const badge = await sequelize.models.Badge.findByPk(userBadge.badgeId);
        if (badge) {
          await badge.increment('totalUnlocked');
        }
        
        // Increment mentee's total_badges_earned
        const menteeProfile = await sequelize.models.MenteeProfile.findOne({
          where: { user_id: userBadge.userId }
        });
        if (menteeProfile) {
          await menteeProfile.increment('totalBadgesEarned');
        }
      }
    }
  });

  UserBadge.associate = (models) => {
    UserBadge.belongsTo(models.User, { foreignKey: 'user_id' });
    UserBadge.belongsTo(models.Badge, { foreignKey: 'badge_id' });
  };

  return UserBadge;
};
