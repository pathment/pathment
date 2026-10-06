module.exports = (sequelize, DataTypes) => {
  /** Talk - an org-shared talk or video link that mentors and admins can reuse. */
  const Talk = sequelize.define('Talk', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
    title: { type: DataTypes.STRING(255), allowNull: false },
    speaker: { type: DataTypes.STRING(150), allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    url: { type: DataTypes.TEXT, allowNull: false },
    urlKey: { type: DataTypes.STRING(1000), allowNull: false, field: 'url_key' },
    durationMins: { type: DataTypes.INTEGER, allowNull: true, field: 'duration_mins' },
    uploadedBy: { type: DataTypes.UUID, allowNull: true, field: 'uploaded_by' }
  }, {
    tableName: 'talks',
    underscored: true,
    timestamps: true,
    indexes: [{ unique: true, fields: ['organization_id', 'url_key'] }]
  });

  Talk.associate = (models) => {
    Talk.belongsTo(models.Organization, { foreignKey: 'organization_id', as: 'organization' });
    Talk.belongsTo(models.User, { foreignKey: 'uploaded_by', as: 'uploader' });
    Talk.belongsToMany(models.TalkCategory, {
      through: models.TalkCategoryLink,
      foreignKey: 'talk_id',
      otherKey: 'category_id',
      as: 'categories'
    });
  };

  return Talk;
};
