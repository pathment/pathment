module.exports = (sequelize, D) => {
  const model = sequelize.define('StandingClanRequest', {
    id: { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true },
    programId: { type: D.UUID, allowNull: false, field: 'program_id' },
    mentorId: { type: D.UUID, allowNull: false, field: 'mentor_id' },
    name: { type: D.STRING(150), allowNull: false },
    description: { type: D.TEXT },
    status: { type: D.STRING(20), allowNull: false, defaultValue: 'pending', validate: { isIn: [['pending', 'approved', 'rejected']] } },
    reviewedBy: { type: D.UUID, field: 'reviewed_by' },
    reviewedAt: { type: D.DATE, field: 'reviewed_at' },
    decisionNote: { type: D.TEXT, field: 'decision_note' },
    createdClanId: { type: D.UUID, field: 'created_clan_id' },
    /**
     * The clan this continuation grew out of.
     *
     * Keyed on the programme alone, one mentor could raise one request for a
     * whole programme — but a mentor often runs several clans in one: lead of
     * "Viral Loop Clan 2026" and co-mentor of "Core Team 2026", both inside
     * "Full Stack AI Engineering". A request from one then showed as pending on
     * the other, and the second clan could never get a standing clan of its
     * own. They are separate groups doing separate work.
     *
     * NULL only on rows that predate this column and could not be resolved
     * without guessing; those keep the old programme-wide behaviour.
     */
    sourceClanId: { type: D.UUID, field: 'source_clan_id' },
  }, { tableName: 'standing_clan_requests', underscored: true, indexes: [
    // One pending request per mentor PER CLAN. Legacy rows with no source clan
    // are excluded rather than collapsed together — we do not know what they
    // would conflict with.
    { unique: true, fields: ['mentor_id', 'source_clan_id'], where: { status: 'pending' }, name: 'standing_request_pending_clan_unique' },
    { fields: ['source_clan_id', 'status'], name: 'standing_request_source_clan' },
    { unique: true, fields: ['created_clan_id'] },
  ] });
  model.associate = m => {
    model.belongsTo(m.Program, { foreignKey: 'programId', as: 'program' });
    model.belongsTo(m.User, { foreignKey: 'mentorId', as: 'mentor' });
    model.belongsTo(m.User, { foreignKey: 'reviewedBy', as: 'reviewer' });
    model.belongsTo(m.Clan, { foreignKey: 'createdClanId', as: 'createdClan' });
    model.belongsTo(m.Clan, { foreignKey: 'sourceClanId', as: 'sourceClan' });
  };
  return model;
};
