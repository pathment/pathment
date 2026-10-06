module.exports = (sequelize, DataTypes) => {
  /** TalkCategoryLink - join table so a talk can sit in several categories. */
  const TalkCategoryLink = sequelize.define('TalkCategoryLink', {
    talkId: { type: DataTypes.UUID, allowNull: false, primaryKey: true, field: 'talk_id' },
    categoryId: { type: DataTypes.UUID, allowNull: false, primaryKey: true, field: 'category_id' }
  }, {
    tableName: 'talk_category_links',
    underscored: true,
    timestamps: false
  });

  return TalkCategoryLink;
};
