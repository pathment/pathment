module.exports = (sequelize, DataTypes) => {
  const PointsHistory = sequelize.define('PointsHistory', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
    eventKey: { type: DataTypes.STRING(255), field: 'event_key' },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    pointsChange: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'points_change'
    },
    pointsBefore: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'points_before'
    },
    pointsAfter: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'points_after'
    },
    sourceType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'source_type'
    },
    sourceId: {
      type: DataTypes.UUID,
      field: 'source_id'
    },
    reason: {
      type: DataTypes.TEXT
    }
  }, {
    tableName: 'points_history',
    underscored: true,
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['organization_id', 'user_id', 'event_key'], name: 'points_history_event_key_uniq' },
      { fields: ['user_id'] },
      { fields: ['created_at'] }
    ]
  });

  PointsHistory.associate = (models) => {
    PointsHistory.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return PointsHistory;
};
