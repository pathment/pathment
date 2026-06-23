module.exports = (sequelize, DataTypes) => {
  /**
   * ClanMembership - a user's clan-scoped role. This is what makes roles
   * contextual: the same user can be a 'mentee' in one clan and a 'co_mentor'
   * (or 'lead_mentor' / 'core_team') in another. Platform-level capabilities
   * live on User.capabilities; the per-clan role lives here.
   */
  const ClanMembership = sequelize.define('ClanMembership', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    clanId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'clan_id'
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    role: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [['lead_mentor', 'co_mentor', 'mentee', 'core_team']]
      }
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'active',
      validate: {
        // 'paused' = stopped attending / never started; kept in the clan but
        // excluded from reports and sent win-back reminders.
        isIn: [['active', 'invited', 'removed', 'paused']]
      }
    },
    // Pause + re-engagement bookkeeping (see migration 065).
    pausedAt: { type: DataTypes.DATE, allowNull: true, field: 'paused_at' },
    pausedReason: { type: DataTypes.TEXT, allowNull: true, field: 'paused_reason' },
    pausedBy: { type: DataTypes.STRING(20), allowNull: true, field: 'paused_by' },
    reengageCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'reengage_count' },
    lastReengagedAt: { type: DataTypes.DATE, allowNull: true, field: 'last_reengaged_at' },
    reengageStage: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'reengage_stage' },
    pauseSuggestionDismissedAt: { type: DataTypes.DATE, allowNull: true, field: 'pause_suggestion_dismissed_at' },
    // The enrollment this membership corresponds to (for mentees), so a clan
    // membership ties back to the existing program enrollment when relevant.
    enrollmentId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'enrollment_id'
    },
    joinedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'joined_at'
    },
    leftAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'left_at'
    }
  }, {
    tableName: 'clan_memberships',
    underscored: true,
    timestamps: true,
    indexes: [
      { unique: true, fields: ['clan_id', 'user_id'] },
      { fields: ['user_id'] },
      { fields: ['clan_id'] },
      { fields: ['role'] }
    ]
  });

  ClanMembership.associate = (models) => {
    ClanMembership.belongsTo(models.Clan, { foreignKey: 'clan_id', as: 'clan' });
    ClanMembership.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    if (models.Enrollment) {
      ClanMembership.belongsTo(models.Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
    }

    // Reverse side (defined here to avoid editing the live User wiring).
    models.User.hasMany(ClanMembership, { foreignKey: 'user_id', as: 'clanMemberships' });
  };

  return ClanMembership;
};
