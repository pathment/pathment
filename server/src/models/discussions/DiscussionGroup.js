module.exports = (sequelize, DataTypes) => {
  /**
   * DiscussionGroup - the people discussing a scenario, and when they can.
   *
   * Its messages and members are the rows of the one conversation it owns. The
   * schedule uses the same weekly fields as ReviewSchedule, so the occurrence
   * math in utils/reviewRecurrence applies to both.
   */
  const DiscussionGroup = sequelize.define('DiscussionGroup', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    clanId: { type: DataTypes.UUID, allowNull: false, field: 'clan_id' },
    scenarioId: { type: DataTypes.UUID, allowNull: false, field: 'scenario_id' },
    conversationId: { type: DataTypes.UUID, allowNull: true, field: 'conversation_id' },
    name: { type: DataTypes.STRING(150), allowNull: false },
    repeat: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'none',
      validate: { isIn: [['none', 'weekly']] },
    },
    startsAt: { type: DataTypes.DATE, allowNull: true, field: 'starts_at' },
    endsAt: { type: DataTypes.DATE, allowNull: true, field: 'ends_at' },
    dayOfWeek: { type: DataTypes.INTEGER, allowNull: true, field: 'day_of_week' },
    timeLocal: { type: DataTypes.STRING(5), allowNull: true, field: 'time_local' },
    durationMinutes: { type: DataTypes.INTEGER, allowNull: true, field: 'duration_minutes' },
    timezone: { type: DataTypes.STRING(64), allowNull: true },
    startsOn: { type: DataTypes.DATEONLY, allowNull: true, field: 'starts_on' },
    endsOn: { type: DataTypes.DATEONLY, allowNull: true, field: 'ends_on' },
    createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' },
  }, {
    tableName: 'discussion_groups',
    underscored: true,
  });

  DiscussionGroup.associate = (models) => {
    DiscussionGroup.belongsTo(models.DiscussionScenario, { foreignKey: 'scenario_id', as: 'scenario' });
    DiscussionGroup.belongsTo(models.Conversation, { foreignKey: 'conversation_id', as: 'conversation' });
    if (models.Clan) DiscussionGroup.belongsTo(models.Clan, { foreignKey: 'clan_id', as: 'clan' });
    // Its live meeting is a CohortReviewSession of kind 'discussion' with this
    // group's id (migration 147); discussionMeetingService looks it up.
  };

  return DiscussionGroup;
};
