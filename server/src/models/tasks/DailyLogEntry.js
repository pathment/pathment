module.exports = (sequelize, DataTypes) => {
  /**
   * DailyLogEntry - a mentee's daily check-in: which assigned tasks they
   * worked on that day + a short note. One entry per mentee per day (upserted);
   * past days can be backfilled. Simplified vs the prototype's slot-based log
   * (slot ticking depends on the deferred schedule-slot engine).
   */
  const DailyLogEntry = sequelize.define('DailyLogEntry', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    menteeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentee_id'
    },
    // The calendar day this entry is for, 'YYYY-MM-DD' (may be backfilled).
    dateKey: {
      type: DataTypes.STRING(10),
      allowNull: false,
      field: 'date_key'
    },
    // Assigned-task ids the mentee marked done that day.
    tasksDone: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      allowNull: false,
      defaultValue: [],
      field: 'tasks_done'
    },
    // Schedule slot ids (rituals) the mentee ticked off that day.
    slotsDone: {
      type: DataTypes.ARRAY(DataTypes.STRING(64)),
      allowNull: false,
      defaultValue: [],
      field: 'slots_done'
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    loggedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'logged_at'
    },
    clanId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'clan_id'
    }
  }, {
    tableName: 'daily_log_entries',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['mentee_id', 'date_key', 'clan_id'] },
      { fields: ['mentee_id'] }
    ]
  });

  DailyLogEntry.associate = (models) => {
    DailyLogEntry.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
    if (models.Clan) DailyLogEntry.belongsTo(models.Clan, { foreignKey: 'clan_id', as: 'clan' });
    models.User.hasMany(DailyLogEntry, { foreignKey: 'mentee_id', as: 'dailyLogs' });
  };

  return DailyLogEntry;
};
