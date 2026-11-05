/** The five things a mentor rates in a group discussion, 0 to 100 each. */
const DISCUSSION_CRITERIA = ['communication', 'relevance', 'openness', 'criticalThinking', 'collaboration'];

module.exports = (sequelize, DataTypes) => {
  const score = (field) => ({
    type: DataTypes.SMALLINT,
    allowNull: false,
    defaultValue: 50,
    field,
    validate: { min: 0, max: 100 },
  });

  /**
   * DiscussionFeedback - one mentor's view of one mentee in one group.
   *
   * Higher is better on every criterion. `openness` is how well somebody
   * takes feedback and being disagreed with, so 100 means fully open.
   * Unique per (group, mentee, mentor): rating again is a correction, and
   * a second mentor's rating is a second opinion that is kept beside it.
   */
  const DiscussionFeedback = sequelize.define('DiscussionFeedback', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    groupId: { type: DataTypes.UUID, allowNull: false, field: 'group_id' },
    menteeId: { type: DataTypes.UUID, allowNull: false, field: 'mentee_id' },
    mentorId: { type: DataTypes.UUID, allowNull: false, field: 'mentor_id' },
    communication: score('communication'),
    relevance: score('relevance'),
    openness: score('openness'),
    criticalThinking: score('critical_thinking'),
    collaboration: score('collaboration'),
    note: { type: DataTypes.TEXT, allowNull: true },
  }, {
    tableName: 'discussion_feedback',
    underscored: true,
    indexes: [
      { unique: true, fields: ['group_id', 'mentee_id', 'mentor_id'], name: 'discussion_feedback_uniq' },
      { fields: ['group_id', 'mentee_id'] },
    ],
  });

  DiscussionFeedback.associate = (models) => {
    DiscussionFeedback.belongsTo(models.DiscussionGroup, { foreignKey: 'group_id', as: 'group' });
    DiscussionFeedback.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
    DiscussionFeedback.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
  };

  return DiscussionFeedback;
};

module.exports.DISCUSSION_CRITERIA = DISCUSSION_CRITERIA;
