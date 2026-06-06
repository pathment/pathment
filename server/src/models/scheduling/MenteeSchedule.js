module.exports = (sequelize, DataTypes) => {
  /**
   * MenteeSchedule - a mentee's current day as an ordered list of filled slots.
   * Seeded from a ScheduleTemplate's blocks on assignment, then each slot is
   * filled (kind: 'roadmap' with a roadmapChain, 'recurring' with a config, or
   * 'empty'). Independent snapshot - editing the template does not change it.
   *
   * schedule: SlotConfig[] = [{ id, label, time, days, kind, roadmapChain?, recurring?, bookable? }]
   */
  const MenteeSchedule = sequelize.define('MenteeSchedule', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    menteeId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'mentee_id' },
    templateId: { type: DataTypes.UUID, allowNull: true, field: 'template_id' },
    schedule: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    assignedBy: { type: DataTypes.UUID, allowNull: true, field: 'assigned_by' },
    assignedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'assigned_at' },
    // The zone the recurring wall-clock blocks are read in (the mentee's).
    timezone: { type: DataTypes.STRING(50), allowNull: true }
  }, {
    tableName: 'mentee_schedules',
    underscored: true,
    timestamps: true,
    indexes: [{ unique: true, fields: ['mentee_id'] }]
  });

  MenteeSchedule.associate = (models) => {
    MenteeSchedule.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
    MenteeSchedule.belongsTo(models.ScheduleTemplate, { foreignKey: 'template_id', as: 'template' });
  };

  return MenteeSchedule;
};
