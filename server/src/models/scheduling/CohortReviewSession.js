module.exports = (sequelize, DataTypes) => {
  /**
   * CohortReviewSession - one dated pass a mentor makes over their cohort.
   * `sessionDate` is the mentor's LOCAL calendar date (date-only), so "today's
   * review" matches their timezone. While `in_progress` it's the live session;
   * `finished` marks it done. A mentor can reopen a finished session to edit it,
   * and browse the full history by date. Per-mentee state lives in the entries.
   */
  const CohortReviewSession = sequelize.define('CohortReviewSession', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    mentorId: { type: DataTypes.UUID, allowNull: false, field: 'mentor_id' },
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
    indexes: [{ fields: ['mentor_id', 'session_date'] }],
  });

  CohortReviewSession.associate = (models) => {
    CohortReviewSession.hasMany(models.CohortReviewEntry, { foreignKey: 'session_id', as: 'entries' });
    CohortReviewSession.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
  };

  return CohortReviewSession;
};
