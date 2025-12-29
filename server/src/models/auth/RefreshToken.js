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
    }
  }, {
    tableName: 'refresh_tokens',
    underscored: true,
    updatedAt: false,
    indexes: [
      { fields: ['token'] },
      { fields: ['user_id'] }
    ]
  });

  RefreshToken.associate = (models) => {
    RefreshToken.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return RefreshToken;
};
