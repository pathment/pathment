module.exports = (sequelize, DataTypes) => {
  /**
   * AdminMeeting — an admin-hosted live meeting (org broadcast). The host picks
   * the audience: 'mentors' (all mentors), 'clan' (a specific clan's members), or
   * 'both' (all mentors + that clan's mentees). Attendees get a calendar invite +
   * reminders and a live banner to join the shared (Jitsi) room.
   */
  const AdminMeeting = sequelize.define('AdminMeeting', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    hostId: { type: DataTypes.UUID, allowNull: false, field: 'host_id' },
    title: { type: DataTypes.STRING(200), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    scheduledAt: { type: DataTypes.DATE, allowNull: false, field: 'scheduled_at' },
    durationMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60, field: 'duration_minutes' },
    audienceType: {
      type: DataTypes.STRING(10), allowNull: false, defaultValue: 'mentors', field: 'audience_type',
      validate: { isIn: [['mentors', 'clan', 'both']] },
    },
    clanId: { type: DataTypes.UUID, allowNull: true, field: 'clan_id' },
    meetingProvider: { type: DataTypes.STRING(20), allowNull: true, field: 'meeting_provider' },
    meetingRoom: { type: DataTypes.STRING(120), allowNull: true, field: 'meeting_room' },
    meetingUrl: { type: DataTypes.STRING(500), allowNull: true, field: 'meeting_url' },
    status: {
      type: DataTypes.STRING(12), allowNull: false, defaultValue: 'scheduled',
      validate: { isIn: [['scheduled', 'live', 'ended', 'cancelled']] },
    },
    startedAt: { type: DataTypes.DATE, allowNull: true, field: 'started_at' },
    endedAt: { type: DataTypes.DATE, allowNull: true, field: 'ended_at' },
    invitesSentAt: { type: DataTypes.DATE, allowNull: true, field: 'invites_sent_at' },
    reminded24hAt: { type: DataTypes.DATE, allowNull: true, field: 'reminded_24h_at' },
    reminded1hAt: { type: DataTypes.DATE, allowNull: true, field: 'reminded_1h_at' },
  }, {
    tableName: 'admin_meetings',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['status', 'scheduled_at'] },
      { fields: ['clan_id'] },
    ],
  });

  AdminMeeting.associate = (models) => {
    AdminMeeting.belongsTo(models.User, { foreignKey: 'host_id', as: 'host' });
    if (models.Clan) AdminMeeting.belongsTo(models.Clan, { foreignKey: 'clan_id', as: 'clan' });
  };

  return AdminMeeting;
};
