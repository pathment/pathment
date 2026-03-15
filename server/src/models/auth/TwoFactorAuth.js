module.exports = (sequelize, DataTypes) => {
  const TwoFactorAuth = sequelize.define('TwoFactorAuth', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    secret: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    qrCode: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'qr_code'
    },
    backupCodes: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'backup_codes',
      get() {
        const codes = this.getDataValue('backupCodes');
        return codes ? (Array.isArray(codes) ? codes : JSON.parse(codes)) : [];
      },
      set(value) {
        this.setDataValue('backupCodes', Array.isArray(value) ? value : JSON.stringify(value));
      }
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_verified'
    },
    enabledAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'enabled_at'
    },
    temporarySecret: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'temporary_secret'
    }
  }, {
    tableName: 'two_factor_auths',
    underscored: true,
    timestamps: true,
    paranoid: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['is_verified'] }
    ]
  });

  TwoFactorAuth.associate = (models) => {
    TwoFactorAuth.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return TwoFactorAuth;
};
