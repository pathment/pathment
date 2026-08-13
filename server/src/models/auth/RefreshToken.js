module.exports = (sequelize, DataTypes) => {
  const RefreshToken = sequelize.define('RefreshToken', {
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
    token: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at'
    },
    revokedAt: {
      type: DataTypes.DATE,
      field: 'revoked_at'
    },
    // The successor issued when this token was spent. A client that retries
    // /auth/refresh on a flaky network presents a token we just rotated; because
    // we remember what it became, that retry is answered instead of being
    // treated as a stolen-token replay and logging the person out.
    replacedByToken: {
      type: DataTypes.TEXT,
      field: 'replaced_by_token'
    },
    // 'rotated' | 'logout' | 'logout_all' | 'reuse_detected' | 'password_change'
    revokedReason: {
      type: DataTypes.STRING(32),
      field: 'revoked_reason'
    },
    lastUsedAt: {
      type: DataTypes.DATE,
      field: 'last_used_at'
    },
    client: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'web'
    }
  }, {
    tableName: 'refresh_tokens',
    underscored: true,
    updatedAt: false,
    indexes: [
      { fields: ['token'] },
      { fields: ['user_id'] },
      { fields: ['user_id', 'revoked_at'] }
    ]
  });

  RefreshToken.associate = (models) => {
    RefreshToken.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return RefreshToken;
};
