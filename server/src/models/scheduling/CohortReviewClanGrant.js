module.exports = (sequelize, DataTypes) => {
  /**
   * Time-bound clan-wide unlock so mentors in a clan can delete cohort-review
   * sessions while the org deletion lock is on.
   */
  const CohortReviewClanGrant = sequelize.define('CohortReviewClanGrant', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    clanId: { type: DataTypes.UUID, allowNull: false, field: 'clan_id' },
    grantedBy: { type: DataTypes.UUID, allowNull: false, field: 'granted_by' },
    note: { type: DataTypes.TEXT, allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
  }, {
    tableName: 'cohort_review_clan_grants',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['clan_id'] },
      { fields: ['expires_at'] },
    ],
  });

  CohortReviewClanGrant.associate = (models) => {
    CohortReviewClanGrant.belongsTo(models.Clan, { foreignKey: 'clan_id', as: 'clan' });
    CohortReviewClanGrant.belongsTo(models.User, { foreignKey: 'granted_by', as: 'granter' });
  };

  return CohortReviewClanGrant;
};
