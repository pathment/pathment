module.exports = (sequelize, DataTypes) => {
  /**
   * CohortReviewSession - one dated pass over a CLAN's cohort.
   * The session belongs to a clan (`clanId`); everyone who mentors that clan
   * (lead + co-mentors) shares the same daily session and can co-edit it.
   * `mentorId` is the "started by" creator (display/audit only) - access is
   * decided by clan membership, not ownership.
   * `sessionDate` is the creator's LOCAL calendar date (date-only), so "today's
   * review" matches their timezone. While `in_progress` it's the live session;
   * `finished` marks it done. A session can be reopened to edit it, and browsed
   * as history by date. Per-mentee state lives in the entries.
   */
  const CohortReviewSession = sequelize.define('CohortReviewSession', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    mentorId: { type: DataTypes.UUID, allowNull: false, field: 'mentor_id' },
    clanId: { type: DataTypes.UUID, allowNull: true, field: 'clan_id' },
    sessionDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'session_date' },
    title: { type: DataTypes.STRING(150), allowNull: true },
    status: {
      type: DataTypes.STRING(20), allowNull: false, defaultValue: 'in_progress',
      validate: { isIn: [['in_progress', 'finished']] },
    },
    finishedAt: { type: DataTypes.DATE, allowNull: true, field: 'finished_at' },
    note: { type: DataTypes.TEXT, allowNull: true },
  }, {
    tableName: 'cohort_review_sessions',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['mentor_id', 'session_date'] },
      { fields: ['clan_id', 'session_date'] },
    ],
  });

  CohortReviewSession.associate = (models) => {
    CohortReviewSession.hasMany(models.CohortReviewEntry, { foreignKey: 'session_id', as: 'entries' });
    CohortReviewSession.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
    if (models.Clan) CohortReviewSession.belongsTo(models.Clan, { foreignKey: 'clan_id', as: 'clan' });
  };

  return CohortReviewSession;
};
