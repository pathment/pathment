module.exports = (sequelize, DataTypes) => {
  /**
   * RoadmapProgress - a mentee's position in a linear roadmap. currentStep is
   * the index into the roadmap's ordered steps. Approving a roadmap-linked task
   * advances this and auto-assigns the next step.
   */
  const RoadmapProgress = sequelize.define('RoadmapProgress', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    roadmapId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'roadmap_id'
    },
    menteeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentee_id'
    },
    enrollmentId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'enrollment_id'
    },
    currentStep: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'current_step'
    },
    // Optional slot id this roadmap runs in (schedule integration, later).
    slot: {
      type: DataTypes.STRING(60),
      allowNull: true
    },
    clanId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'clan_id'
    },
    completed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    startedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'started_at'
    }
  }, {
    tableName: 'roadmap_progress',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['roadmap_id', 'mentee_id', 'clan_id'] },
      { fields: ['mentee_id'] }
    ]
  });

  RoadmapProgress.associate = (models) => {
    RoadmapProgress.belongsTo(models.Roadmap, { foreignKey: 'roadmap_id', as: 'roadmap' });
    RoadmapProgress.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
    if (models.Clan) RoadmapProgress.belongsTo(models.Clan, { foreignKey: 'clan_id', as: 'clan' });
    models.User.hasMany(RoadmapProgress, { foreignKey: 'mentee_id', as: 'roadmapProgress' });
  };

  return RoadmapProgress;
};
