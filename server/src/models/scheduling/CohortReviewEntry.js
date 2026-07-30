module.exports = (sequelize, DataTypes) => {
  /**
   * CohortReviewEntry - one mentee's state within a CohortReviewSession.
   *   attendance: present | absent | excused (null = not marked)
   *   status:     pending  | reviewed | deferred
   *     - reviewed = the mentor finished looking at them this session ("seen")
   *     - deferred = skipped for now, surfaced as "to revisit"
   * Unique per (session, mentee).
   */
  const CohortReviewEntry = sequelize.define('CohortReviewEntry', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    sessionId: { type: DataTypes.UUID, allowNull: false, field: 'session_id' },
    menteeId: { type: DataTypes.UUID, allowNull: false, field: 'mentee_id' },
    attendance: {
      type: DataTypes.STRING(10), allowNull: true,
      validate: { isIn: [['present', 'absent', 'excused']] },
    },
    status: {
      type: DataTypes.STRING(12), allowNull: false, defaultValue: 'pending',
      validate: { isIn: [['pending', 'reviewed', 'deferred']] },
    },
    note: { type: DataTypes.TEXT, allowNull: true },
    // ── Live-meeting presence + contribution ──
    joinedAt: { type: DataTypes.DATE, allowNull: true, field: 'joined_at' },
    leftAt: { type: DataTypes.DATE, allowNull: true, field: 'left_at' },
    secondsPresent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'seconds_present' },
    autoPresent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'auto_present' },
    talkSeconds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'talk_seconds' },
    contributionPoints: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'contribution_points' },
  }, {
    tableName: 'cohort_review_entries',
    underscored: true,
    timestamps: true,
    indexes: [
      { unique: true, fields: ['session_id', 'mentee_id'] },
      { fields: ['session_id'] },
    ],
  });

  CohortReviewEntry.associate = (models) => {
    CohortReviewEntry.belongsTo(models.CohortReviewSession, { foreignKey: 'session_id', as: 'session' });
    CohortReviewEntry.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
  };

  return CohortReviewEntry;
};
