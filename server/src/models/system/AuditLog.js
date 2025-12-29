module.exports = (sequelize, DataTypes) => {
  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      field: 'user_id'
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    entityType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'entity_type'
    },
    entityId: {
      type: DataTypes.UUID,
      field: 'entity_id'
    },
    oldValues: {
      type: DataTypes.JSONB,
      field: 'old_values'
    },
    newValues: {
      type: DataTypes.JSONB,
      field: 'new_values'
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      field: 'ip_address'
    },
    userAgent: {
      type: DataTypes.TEXT,
      field: 'user_agent'
    },
    sessionId: {
      type: DataTypes.UUID,
      field: 'session_id'
    }
  }, {
    tableName: 'audit_logs',
    underscored: true,
    updatedAt: false,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['entity_type', 'entity_id'] },
      { fields: ['action'] },
      { fields: ['created_at'] }
    ]
  });

  AuditLog.associate = (models) => {
    AuditLog.belongsTo(models.User, { foreignKey: 'user_id', as: 'user', onDelete: 'SET NULL' });
  };

  return AuditLog;
};
