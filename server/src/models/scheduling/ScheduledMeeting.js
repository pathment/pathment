module.exports = (sequelize, DataTypes) => {
  /**
   * ScheduledMeeting - a booked 1:1 (or standup/review/pairing) between a
   * mentor and a mentee, created when a mentee books an availability slot.
   */
  const ScheduledMeeting = sequelize.define('ScheduledMeeting', {
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
    menteeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentee_id'
    },
    availabilitySlotId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'availability_slot_id'
    },
    kind: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: '1:1',
      validate: { isIn: [['1:1', 'standup', 'review', 'pairing']] }
    },
    day: {
      type: DataTypes.STRING(40),
      allowNull: false
    },
    time: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    durationMins: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30,
      field: 'duration_mins'
    },
    agenda: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'scheduled',
      validate: { isIn: [['scheduled', 'done', 'cancelled']] }
    },
    cancellationReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'cancellation_reason'
    },
    cancelledBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'cancelled_by'
    },
    // True UTC instant the meeting starts (source of truth; day/time are display
    // strings derived in `timezone`). Each viewer renders this in their own zone.
    startsAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'starts_at'
    },
    timezone: {
      type: DataTypes.STRING(50),
      allowNull: true
    }
  }, {
    tableName: 'scheduled_meetings',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['mentor_id'] },
      { fields: ['mentee_id'] },
      { fields: ['status'] }
    ]
  });

  ScheduledMeeting.associate = (models) => {
    ScheduledMeeting.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
    ScheduledMeeting.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
    ScheduledMeeting.belongsTo(models.AvailabilitySlot, { foreignKey: 'availability_slot_id', as: 'slot' });
  };

  return ScheduledMeeting;
};
