module.exports = (sequelize, DataTypes) => {
  const UserBadge = sequelize.define('UserBadge', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
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
    programId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'program_id'
    },
    clanId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'clan_id'
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
      // Uniqueness: user_badges_once_per_context expression index (migration 123).
      { fields: ['user_id'] },
      { fields: ['badge_id'] },
      { fields: ['unlocked_at'] },
      { fields: ['program_id'] },
      { fields: ['clan_id'] },
    ],
    hooks: {
      afterCreate: async (userBadge, options) => {
        // Keep counters in the caller's transaction when this model is used
        // directly. The main award path performs the same updates beside its
        // conflict-safe raw INSERT because raw SQL does not run model hooks.
        const transaction = options?.transaction;
        const badge = await sequelize.models.Badge.findByPk(userBadge.badgeId, { transaction });
        if (badge) {
          await badge.increment('totalUnlocked', { transaction });
        }

        const menteeProfile = await sequelize.models.MenteeProfile.findOne({
          where: { userId: userBadge.userId },
          transaction,
        });
        if (menteeProfile) {
          await menteeProfile.increment('totalBadgesEarned', { transaction });
        }
      }
    }
  });

  UserBadge.associate = (models) => {
    UserBadge.belongsTo(models.User, { foreignKey: 'user_id' });
    UserBadge.belongsTo(models.Badge, { foreignKey: 'badge_id' });
    UserBadge.belongsTo(models.Program, { foreignKey: 'program_id', as: 'program' });
    UserBadge.belongsTo(models.Clan, { foreignKey: 'clan_id', as: 'clan' });
  };

  return UserBadge;
};
