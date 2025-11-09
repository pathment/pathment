module.exports = (sequelize, DataTypes) => {
  const PasswordResetToken = sequelize.define('PasswordResetToken', {
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
    usedAt: {
      type: DataTypes.DATE,
      field: 'used_at'
    }
  }, {
    tableName: 'password_reset_tokens',
    underscored: true,
    updatedAt: false,
    indexes: [
      { fields: ['token'] },
      { fields: ['user_id'] }
    ]
  });

  PasswordResetToken.associate = (models) => {
    PasswordResetToken.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return PasswordResetToken;
};
