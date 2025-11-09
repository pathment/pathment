module.exports = (sequelize, DataTypes) => {
  const UserSession = sequelize.define('UserSession', {
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
    sessionToken: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      field: 'session_token'
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      field: 'ip_address'
    },
    userAgent: {
      type: DataTypes.TEXT,
      field: 'user_agent'
    },
    deviceType: {
      type: DataTypes.STRING(50),
      field: 'device_type'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active'
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at'
    },
    lastActivityAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'last_activity_at'
    }
  }, {
    tableName: 'user_sessions',
    underscored: true,
    updatedAt: false,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['session_token'] },
      { fields: ['is_active', 'expires_at'] }
    ]
  });

  UserSession.associate = (models) => {
    UserSession.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return UserSession;
};
