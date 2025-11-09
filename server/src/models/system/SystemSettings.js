module.exports = (sequelize, DataTypes) => {
  const SystemSettings = sequelize.define('SystemSettings', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    settingKey: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      field: 'setting_key'
    },
    settingValue: {
      type: DataTypes.TEXT,
      field: 'setting_value'
    },
    settingType: {
      type: DataTypes.STRING(50),
      defaultValue: 'string',
      field: 'setting_type'
    },
    category: {
      type: DataTypes.STRING(50)
    },
    description: {
      type: DataTypes.TEXT
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_public'
    },
    lastModifiedBy: {
      type: DataTypes.UUID,
      field: 'last_modified_by'
    }
  }, {
    tableName: 'system_settings',
    underscored: true,
    indexes: [
      { fields: ['setting_key'] },
      { fields: ['category'] }
    ]
  });

  SystemSettings.associate = (models) => {
    SystemSettings.belongsTo(models.User, { foreignKey: 'last_modified_by', as: 'modifier', onDelete: 'SET NULL' });
  };

  return SystemSettings;
};
