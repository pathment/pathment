module.exports = (sequelize, DataTypes) => {
  const AnalyticsEvent = sequelize.define('AnalyticsEvent', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      field: 'user_id'
    },
    eventType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'event_type'
    },
    eventCategory: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'event_category'
    },
    eventData: {
      type: DataTypes.JSONB,
      field: 'event_data'
    },
    sessionId: {
      type: DataTypes.UUID,
      field: 'session_id'
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      field: 'ip_address'
    },
    userAgent: {
      type: DataTypes.TEXT,
      field: 'user_agent'
    }
  }, {
    tableName: 'analytics_events',
    underscored: true,
    updatedAt: false,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['event_type'] },
      { fields: ['event_category'] },
      { fields: ['created_at'] },
      { fields: ['session_id'] }
    ]
  });

  AnalyticsEvent.associate = (models) => {
    AnalyticsEvent.belongsTo(models.User, { foreignKey: 'user_id', as: 'user', onDelete: 'SET NULL' });
  };

  return AnalyticsEvent;
};
