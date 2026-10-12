module.exports = (sequelize, DataTypes) => {
  /** TalkCategory - an admin-managed label used to organise the talks library. */
  const TalkCategory = sequelize.define('TalkCategory', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
    name: { type: DataTypes.STRING(100), allowNull: false },
    nameKey: { type: DataTypes.STRING(100), allowNull: false, field: 'name_key' },
    createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' }
  }, {
    tableName: 'talk_categories',
    underscored: true,
    timestamps: true,
    indexes: [{ unique: true, fields: ['organization_id', 'name_key'] }]
  });

  TalkCategory.associate = (models) => {
    TalkCategory.belongsTo(models.Organization, { foreignKey: 'organization_id', as: 'organization' });
    TalkCategory.belongsToMany(models.Talk, {
      through: models.TalkCategoryLink,
      foreignKey: 'category_id',
      otherKey: 'talk_id',
      as: 'talks'
    });
  };

  return TalkCategory;
};
