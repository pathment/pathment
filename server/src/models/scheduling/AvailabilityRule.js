module.exports = (sequelize, DataTypes) => {
  /**
   * AvailabilityRule — a mentor's RECURRING weekly 1:1 availability. One row per
   * (weekday, time range), e.g. "Thursday 18:00–21:00, 30-min slots". The booking
   * system materializes these into concrete AvailabilitySlot rows for the coming
   * weeks, so a mentor sets their hours once and mentees keep booking week after
   * week without the mentor re-publishing each date.
   */
  const AvailabilityRule = sequelize.define('AvailabilityRule', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    mentorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentor_id'
    },
    // 0 = Sunday … 6 = Saturday (matches JS Date.getDay()).
    weekday: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    // 24-hour wall-clock strings in the mentor's timezone, e.g. '18:00'.
    startTime: {
      type: DataTypes.STRING(5),
      allowNull: false,
      field: 'start_time'
    },
    endTime: {
      type: DataTypes.STRING(5),
      allowNull: false,
      field: 'end_time'
    },
    // The range is sliced into bookable slots of this length.
    slotMins: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30,
      field: 'slot_mins'
    },
    // IANA zone the hours were authored in, e.g. 'Asia/Karachi'.
    timezone: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }, {
    tableName: 'availability_rules',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['mentor_id'] }
    ]
  });

  AvailabilityRule.associate = (models) => {
    AvailabilityRule.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
  };

  return AvailabilityRule;
};
