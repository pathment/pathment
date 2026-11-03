module.exports = (sequelize, DataTypes) => {
  /** DiscussionScenario - the prompt a clan's discussion groups talk through. */
  const DiscussionScenario = sequelize.define('DiscussionScenario', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    clanId: { type: DataTypes.UUID, allowNull: false, field: 'clan_id' },
    title: { type: DataTypes.STRING(200), allowNull: false },
    prompt: { type: DataTypes.TEXT, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' },
  }, {
    tableName: 'discussion_scenarios',
    underscored: true,
  });

  DiscussionScenario.associate = (models) => {
    DiscussionScenario.hasMany(models.DiscussionGroup, { foreignKey: 'scenario_id', as: 'groups' });
  };

  return DiscussionScenario;
};
