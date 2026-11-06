/**
 * PoolMember — one candidate in one pool (migration 140).
 *
 * `userId` is NULL while the person is only invited: there is no account to
 * point at yet, so the normalised `email` is the identity and the unique key
 * per pool. Activation links the account.
 *
 * Separate tracks, deliberately:
 *   status     where the candidate is in the qualifying work
 *   decision   what the humans decided (NULL until they do)
 *   placedAt   set only once enrollment AND clan membership exist — a
 *              selection can stand while its placement fails and is retried
 *
 * Small JSON fields keep the row to what the spec names plus what the flow
 * cannot do without:
 *   details       { firstName, lastName, source, activatedAt }
 *   manualScores  { adjustment: { score, note, byId, at } } — the one number a
 *                 person types: points added to or taken off the points they
 *                 earned, for a judgement made away from the platform
 *   placement     { status: 'pending'|'failed', targetClanId, error, attempts }
 *   reminders     { [reminderKey]: sentAtIso } — each reminder sent, claimed
 *                 atomically so none goes out twice
 */
const MEMBER_STATUSES = ['invited', 'active', 'qualifying', 'completed', 'reviewing'];
const DECISIONS = ['selected', 'waitlisted', 'not_selected', 'withdrawn', 'disqualified'];
const SOURCES = ['import', 'invite', 'existing', 'application'];

module.exports = (sequelize, DataTypes) => {
  const PoolMember = sequelize.define('PoolMember', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    poolId: { type: DataTypes.UUID, allowNull: false, field: 'pool_id' },
    userId: { type: DataTypes.UUID, allowNull: true, field: 'user_id' },
    email: { type: DataTypes.STRING(255), allowNull: false, validate: { isEmail: true } },
    applicationId: { type: DataTypes.UUID, allowNull: true, field: 'application_id' },
    inviteId: { type: DataTypes.UUID, allowNull: true, field: 'invite_id' },
    // The level the candidate applied at — a key into the cohort's `levels`,
    // exactly as on applications (migration 149). NULL when the pool has no
    // cohort, the cohort asks no level question, or the candidate was imported
    // by email and was never asked. Work with no level targets everyone, so a
    // round that ignores levels behaves as it always did.
    level: { type: DataTypes.STRING(40), allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'invited', validate: { isIn: [MEMBER_STATUSES] } },
    decision: { type: DataTypes.STRING(20), allowNull: true, validate: { isIn: [DECISIONS] } },
    decisionReason: { type: DataTypes.TEXT, allowNull: true, field: 'decision_reason' },
    decidedById: { type: DataTypes.UUID, allowNull: true, field: 'decided_by_id' },
    decidedAt: { type: DataTypes.DATE, allowNull: true, field: 'decided_at' },
    // The CONFIRMED snapshot. Every generated version is in the audit log.
    scoreComponents: { type: DataTypes.JSONB, allowNull: true, field: 'score_components' },
    totalScore: { type: DataTypes.DECIMAL(7, 2), allowNull: true, field: 'total_score' },
    rank: { type: DataTypes.INTEGER, allowNull: true },
    placedEnrollmentId: { type: DataTypes.UUID, allowNull: true, field: 'placed_enrollment_id' },
    placedClanId: { type: DataTypes.UUID, allowNull: true, field: 'placed_clan_id' },
    placedAt: { type: DataTypes.DATE, allowNull: true, field: 'placed_at' },
    details: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    manualScores: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'manual_scores' },
    placement: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    reminders: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, {
    tableName: 'candidate_pool_members',
    underscored: true,
    indexes: [
      { unique: true, fields: ['pool_id', 'email'] },
      { fields: ['pool_id'] },
      { fields: ['user_id'] },
    ],
  });

  PoolMember.STATUSES = MEMBER_STATUSES;
  PoolMember.DECISIONS = DECISIONS;
  PoolMember.SOURCES = SOURCES;
  // Decisions that end a candidate's participation: no more work, no reminders.
  PoolMember.EXITED = ['withdrawn', 'disqualified'];

  /** "First Last" from the account once there is one, else from the import. */
  PoolMember.displayName = (member) => {
    const u = member.user;
    const fromUser = u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '';
    if (fromUser) return fromUser;
    const d = member.details || {};
    return [d.firstName, d.lastName].filter(Boolean).join(' ');
  };

  /** pending | placed | failed | null — placed is decided by placedAt alone. */
  PoolMember.placementStatus = (member) => {
    if (member.placedAt) return 'placed';
    return member.placement?.status || (member.decision === 'selected' ? 'pending' : null);
  };

  PoolMember.associate = (models) => {
    PoolMember.belongsTo(models.CandidatePool, { foreignKey: 'pool_id', as: 'pool' });
    PoolMember.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    PoolMember.belongsTo(models.Clan, { foreignKey: 'placed_clan_id', as: 'placedClan' });
    // No hasMany to AssignedTask on purpose: the task model's default scope hides
    // pool work, so such an association would always look empty. Pool code
    // queries `AssignedTask.scope('withPoolWork')` explicitly instead.
  };

  return PoolMember;
};
