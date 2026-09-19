module.exports = (sequelize, DataTypes) => {
  const OpenSourceOrg = sequelize.define('OpenSourceOrg', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    url: { type: DataTypes.STRING(1000), allowNull: false },
    createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' }
  }, {
    tableName: 'open_source_orgs',
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ['name'] }]
  });

  OpenSourceOrg.associate = (models) => {
    if (models.User) OpenSourceOrg.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
  };

  return OpenSourceOrg;
};
