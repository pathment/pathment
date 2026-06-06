module.exports = (sequelize, DataTypes) => {
  /**
   * ScheduleTemplate - a reusable day-shape: an ordered set of named time
   * blocks (PURE STRUCTURE, no tasks/roadmaps). Org templates are inheritable;
   * mentors own their own. Assigning a template to a mentee seeds their
   * per-mentee Schedule (see MenteeSchedule), which is then filled per slot.
   *
   * blocks: TimeBlock[] = [{ id, label, time, days, bookable }]
   */
  const ScheduleTemplate = sequelize.define('ScheduleTemplate', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(150), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    source: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'mentor',
      validate: { isIn: [['org', 'mentor']] }
    },
    ownerMentorId: { type: DataTypes.UUID, allowNull: true, field: 'owner_mentor_id' },
    blocks: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' },
    // Recurring blocks are wall-clock-in-a-zone; this is the zone they're read in.
    timezone: { type: DataTypes.STRING(50), allowNull: true }
  }, {
    tableName: 'schedule_templates',
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ['source'] }, { fields: ['owner_mentor_id'] }]
  });

  return ScheduleTemplate;
};
