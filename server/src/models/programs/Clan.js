const { CLAN_KINDS } = require('../../config/clanKinds');
module.exports = (sequelize, DataTypes) => {
  /**
   * Clan - a mentor-led group of mentees inside a Program (the org runs one
   * Program per year; a Program contains many Clans/cohorts). A Clan owns its
   * mentors and mentees (via ClanMembership), optionally a level, and the
   * roadmaps its mentor authors or imports. Replaces 1:1 mentor matching:
   * a mentee is placed into a Clan and inherits the Clan's mentors.
   */
  const Clan = sequelize.define('Clan', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
    programId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'program_id'
    },
    /*
     * What this clan IS, which decides whether its work counts towards the
     * programme. See `config/clanKinds.js` — ask `isProgrammeClan`, don't
     * compare this directly unless you mean one specific kind.
     */
    /*
     * A selection round's work, per level: [{ level, roadmapId, stepIndexes? }].
     * Empty on every other kind of clan. See poolClanService.
     */
    levelRules: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'level_rules' },
    kind: { type: DataTypes.STRING(20), allowNull: false, defaultValue: CLAN_KINDS[0], validate: { isIn: [CLAN_KINDS] } },
    frozenAt: { type: DataTypes.DATE, field: 'frozen_at' },
    /**
     * Does joining this standing clan carry the mentee's work across with them?
     *
     * Defaults true, so clans created from now on bring a joiner's in-flight
     * roadmaps and custom work with them automatically. Migration 126 set it
     * FALSE on every clan that already existed: those rosters were built
     * deliberately one mentee at a time, and generating assignments against
     * them after the fact would look like work appearing from nowhere.
     */
    autoContinueOnJoin: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'auto_continue_on_join' },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    avatarUrl: { type: DataTypes.TEXT, allowNull: true, field: 'avatar_url' },
    description: {
      type: DataTypes.TEXT
    },
    // Optional WhatsApp group INVITE link for the clan. Included in a new mentee's
    // acceptance email + shown in-app so they can join. (WhatsApp has no API to
    // auto-add someone to a group, so the mentee joins via this link themselves.)
    whatsappGroupLink: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'whatsapp_group_link'
    },
    // Optional lead mentor (the "clan leader"). Co-mentors are tracked as
    // ClanMembership rows with role 'co_mentor'.
    leadMentorId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'lead_mentor_id'
    },
    // Free-form technology / track tags (e.g. 'frontend', 'backend').
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING(40)),
      allowNull: false,
      defaultValue: []
    },
    // Cohort level keys this clan serves (a clan may serve several). Empty means
    // no level constraint — the clan takes candidates of any level.
    levels: {
      type: DataTypes.ARRAY(DataTypes.STRING(40)),
      allowNull: false,
      defaultValue: []
    },
    // Countries this clan serves (regional grouping). Empty = any country.
    countries: {
      type: DataTypes.ARRAY(DataTypes.STRING(80)),
      allowNull: false,
      defaultValue: []
    },
    maxMentees: {
      type: DataTypes.INTEGER,
      defaultValue: 25,
      field: 'max_mentees'
    },
    // Lifecycle status of the clan.
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'active',
      validate: {
        isIn: [['active', 'inactive', 'archived']]
      }
    },
    // Operational health (RAG) - computed/rolled-up; nullable until evaluated.
    healthStatus: {
      type: DataTypes.STRING(10),
      allowNull: true,
      field: 'health_status',
      validate: {
        isIn: [['green', 'amber', 'red']]
      }
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by'
    },
    // ── Public clan joining link ───────────────────────────────────────────
    // Admin permission (default off). Lead may only generate/activate a link
    // when this is true. Removing access immediately makes any slug unusable.
    publicJoinAllowed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'public_join_allowed'
    },
    // Lead activation switch. Link is usable only when allowed AND enabled
    // AND a slug exists AND the clan is active.
    publicJoinEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'public_join_enabled'
    },
    // Opaque shareable token for `/clan/join/<slug>`. Only the current value
    // is valid; regeneration replaces it and invalidates old URLs.
    publicJoinSlug: {
      type: DataTypes.STRING(64),
      allowNull: true,
      unique: true,
      field: 'public_join_slug'
    },
    // Optional join window (UTC instants). Null start = open when enabled;
    // null end = no expiry. Wall-clock input is converted via publicJoinTimezone
    // using the same helpers as cohort apply opens/closes.
    publicJoinStartsAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'public_join_starts_at'
    },
    publicJoinEndsAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'public_join_ends_at'
    },
    publicJoinTimezone: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'public_join_timezone'
    }
  }, {
    tableName: 'clans',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['program_id'] },
      { fields: ['lead_mentor_id'] },
      { fields: ['status'] },
      { fields: ['public_join_slug'], unique: true, name: 'clans_public_join_slug_uniq' },
      { fields: ['public_join_allowed'] }
    ]
  });

  Clan.associate = (models) => {
    Clan.belongsTo(models.Program, { foreignKey: 'program_id', as: 'program' });
    Clan.belongsTo(models.User, { foreignKey: 'lead_mentor_id', as: 'leadMentor' });
    Clan.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
    Clan.hasMany(models.ClanMembership, { foreignKey: 'clan_id', as: 'memberships' });
    if (models.ClanJoinRequest) {
      Clan.hasMany(models.ClanJoinRequest, { foreignKey: 'clan_id', as: 'joinRequests' });
    }

    // Reverse side (kept here to avoid editing the live Program/User wiring).
    models.Program.hasMany(Clan, { foreignKey: 'program_id', as: 'clans' });
    models.User.hasMany(Clan, { foreignKey: 'lead_mentor_id', as: 'ledClans' });
  };

  return Clan;
};
