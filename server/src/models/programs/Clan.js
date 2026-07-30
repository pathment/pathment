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
    programId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'program_id'
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT
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
    }
  }, {
    tableName: 'clans',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['program_id'] },
      { fields: ['lead_mentor_id'] },
      { fields: ['status'] }
    ]
  });

  Clan.associate = (models) => {
    Clan.belongsTo(models.Program, { foreignKey: 'program_id', as: 'program' });
    Clan.belongsTo(models.User, { foreignKey: 'lead_mentor_id', as: 'leadMentor' });
    Clan.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
    Clan.hasMany(models.ClanMembership, { foreignKey: 'clan_id', as: 'memberships' });

    // Reverse side (kept here to avoid editing the live Program/User wiring).
    models.Program.hasMany(Clan, { foreignKey: 'program_id', as: 'clans' });
    models.User.hasMany(Clan, { foreignKey: 'lead_mentor_id', as: 'ledClans' });
  };

  return Clan;
};
