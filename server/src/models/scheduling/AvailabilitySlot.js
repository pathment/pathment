module.exports = (sequelize, DataTypes) => {
  /**
   * AvailabilitySlot - a Calendly-style bookable slot a mentor publishes.
   * A mentee books one and it becomes a ScheduledMeeting.
   */
  const AvailabilitySlot = sequelize.define('AvailabilitySlot', {
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
    // Human-friendly day label, e.g. 'Mon' or 'Thu, May 29' (derived from date).
    day: {
      type: DataTypes.STRING(40),
      allowNull: false
    },
    // The concrete calendar date this slot is for ('YYYY-MM-DD').
    date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    time: {
      type: DataTypes.STRING(20),
      allowNull: false // e.g. '2:00 PM'
    },
    durationMins: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30,
      field: 'duration_mins'
    },
    taken: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    takenBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'taken_by'
    },
    // The true UTC instant this slot starts (source of truth for cross-timezone
    // display). Derived from date + time interpreted in `timezone`.
    startsAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'starts_at'
    },
    // IANA zone the slot was authored in, e.g. 'America/New_York'.
    timezone: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    // Set when this slot was generated from a recurring AvailabilityRule (vs a
    // one-off slot the mentor published by hand). Lets us regenerate/clean up
    // recurring slots without disturbing manual ones.
    ruleId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'rule_id'
    }
  }, {
    tableName: 'availability_slots',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['mentor_id'] },
      { fields: ['taken'] },
      { unique: true, fields: ['mentor_id', 'date', 'time'], name: 'uq_slot_mentor_date_time' }
    ]
  });

  AvailabilitySlot.associate = (models) => {
    AvailabilitySlot.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
    AvailabilitySlot.belongsTo(models.User, { foreignKey: 'taken_by', as: 'bookedBy' });
  };

  return AvailabilitySlot;
};
