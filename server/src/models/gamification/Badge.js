module.exports = (sequelize, DataTypes) => {
  const Badge = sequelize.define('Badge', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
    audience: { type: DataTypes.STRING(20), defaultValue: 'mentee' },
    retiredAt: { type: DataTypes.DATE, field: 'retired_at' },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    iconUrl: {
      type: DataTypes.TEXT,
      field: 'icon_url'
    },
    criteriaType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'criteria_type'
    },
    criteriaValue: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'criteria_value'
    },
    pointsReward: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'points_reward'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active'
    },
    isSecret: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_secret'
    },
    totalUnlocked: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_unlocked'
    }
  }, {
    tableName: 'badges',
    underscored: true,
    indexes: [
      { fields: ['category'] },
      { fields: ['is_active'] },
      { unique: true, fields: ['organization_id', 'name'] }
    ]
  });

  Badge.associate = (models) => {
    Badge.belongsTo(models.Organization, { foreignKey: 'organization_id', as: 'organization' });
    Badge.belongsToMany(models.User, {
      through: models.UserBadge,
      foreignKey: 'badge_id',
      otherKey: 'user_id',
      as: 'users'
    });
  };

  return Badge;
};
