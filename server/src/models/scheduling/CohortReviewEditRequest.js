module.exports = (sequelize, DataTypes) => {
  /**
   * Mentor request to delete/edit a cohort-review session while org deletion lock is on.
   */
  const CohortReviewEditRequest = sequelize.define('CohortReviewEditRequest', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    mentorId: { type: DataTypes.UUID, allowNull: false, field: 'mentor_id' },
    sessionId: { type: DataTypes.UUID, allowNull: false, field: 'session_id' },
    clanId: { type: DataTypes.UUID, allowNull: true, field: 'clan_id' },
    reason: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
      validate: { isIn: [['pending', 'approved', 'denied']] },
    },
    resolutionNote: { type: DataTypes.TEXT, allowNull: true, field: 'resolution_note' },
    resolvedBy: { type: DataTypes.UUID, allowNull: true, field: 'resolved_by' },
    expiresAt: { type: DataTypes.DATE, allowNull: true, field: 'expires_at' },
  }, {
    tableName: 'cohort_review_edit_requests',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['mentor_id', 'session_id'] },
      { fields: ['status'] },
    ],
  });

  CohortReviewEditRequest.associate = (models) => {
    CohortReviewEditRequest.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
    CohortReviewEditRequest.belongsTo(models.CohortReviewSession, { foreignKey: 'session_id', as: 'session' });
    CohortReviewEditRequest.belongsTo(models.Clan, { foreignKey: 'clan_id', as: 'clan' });
    CohortReviewEditRequest.belongsTo(models.User, { foreignKey: 'resolved_by', as: 'resolver' });
  };

  return CohortReviewEditRequest;
};
