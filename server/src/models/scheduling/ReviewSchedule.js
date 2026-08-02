module.exports = (sequelize, DataTypes) => {
  /**
   * ReviewSchedule — a mentor's RECURRING cohort review for a clan.
   *
   * Simple recurrence: a weekday + local wall-clock time, weekly or every two
   * weeks, from `startsOn` until an optional `endsOn`. The wall-clock lives in
   * `timezone` so occurrences stay at (e.g.) 5pm local across DST.
   *
   * Each occurrence is materialised as a CohortReviewSession (linked by
   * `reviewScheduleId`, with `scheduledAt` = the exact UTC instant), whose room
   * auto-opens at that time. The scheduler sends the invite + reminders.
   */
  const ReviewSchedule = sequelize.define('ReviewSchedule', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    clanId: { type: DataTypes.UUID, allowNull: false, field: 'clan_id' },
    mentorId: { type: DataTypes.UUID, allowNull: false, field: 'mentor_id' },
    title: { type: DataTypes.STRING(200), allowNull: true },
    // 0 = Sunday … 6 = Saturday
    dayOfWeek: { type: DataTypes.INTEGER, allowNull: false, field: 'day_of_week', validate: { min: 0, max: 6 } },
    // 'HH:mm' wall-clock in `timezone`
    timeLocal: { type: DataTypes.STRING(5), allowNull: false, field: 'time_local' },
    timezone: { type: DataTypes.STRING(64), allowNull: false },
    intervalWeeks: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'interval_weeks', validate: { isIn: [[1, 2]] } },
    durationMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60, field: 'duration_minutes' },
    startsOn: { type: DataTypes.DATEONLY, allowNull: false, field: 'starts_on' },
    endsOn: { type: DataTypes.DATEONLY, allowNull: true, field: 'ends_on' },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, {
    tableName: 'review_schedules',
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ['clan_id'] }, { fields: ['active'] }],
  });

  ReviewSchedule.associate = (models) => {
    if (models.Clan) ReviewSchedule.belongsTo(models.Clan, { foreignKey: 'clanId', as: 'clan' });
    if (models.User) ReviewSchedule.belongsTo(models.User, { foreignKey: 'mentorId', as: 'mentor' });
    if (models.CohortReviewSession) ReviewSchedule.hasMany(models.CohortReviewSession, { foreignKey: 'reviewScheduleId', as: 'sessions' });
  };

  return ReviewSchedule;
};
