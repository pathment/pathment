module.exports = (sequelize, DataTypes) => {
  /**
   * CohortReviewSession - one dated pass over a CLAN's cohort.
   * The session belongs to a clan (`clanId`); everyone who mentors that clan
   * (lead + co-mentors) shares the same daily session and can co-edit it.
   * `mentorId` is the "started by" creator (display/audit only) - access is
   * decided by clan membership, not ownership.
   * `sessionDate` is the creator's LOCAL calendar date (date-only), so "today's
   * review" matches their timezone. While `in_progress` it's the live session;
   * `finished` marks it done. A session can be reopened to edit it, and browsed
   * as history by date. Per-mentee state lives in the entries.
   */
  const CohortReviewSession = sequelize.define('CohortReviewSession', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    mentorId: { type: DataTypes.UUID, allowNull: false, field: 'mentor_id' },
    clanId: { type: DataTypes.UUID, allowNull: true, field: 'clan_id' },
    sessionDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'session_date' },
    title: { type: DataTypes.STRING(150), allowNull: true },
    status: {
      type: DataTypes.STRING(20), allowNull: false, defaultValue: 'in_progress',
      validate: { isIn: [['in_progress', 'finished']] },
    },
    finishedAt: { type: DataTypes.DATE, allowNull: true, field: 'finished_at' },
    note: { type: DataTypes.TEXT, allowNull: true },
    // ── Live video (Jitsi) ──
    meetingProvider: { type: DataTypes.STRING(20), allowNull: true, field: 'meeting_provider' },
    meetingRoom: { type: DataTypes.STRING(120), allowNull: true, field: 'meeting_room' },
    meetingUrl: { type: DataTypes.STRING(500), allowNull: true, field: 'meeting_url' },
    externalMeetingUrl: { type: DataTypes.STRING(500), allowNull: true, field: 'external_meeting_url' },
    meetingStartedAt: { type: DataTypes.DATE, allowNull: true, field: 'meeting_started_at' },
    meetingEndedAt: { type: DataTypes.DATE, allowNull: true, field: 'meeting_ended_at' },
    // ON by default: these ARE cohort reviews, so a mentee who joins the call is
    // auto-marked present. A mentor can still flip it off to run a general call
    // (no attendance) for a given session.
    attendanceTracking: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'attendance_tracking' },
    // Jitsi in-call polls. OFF by default; the mentor toggles it on. Propagated to
    // mentees so they can vote/see results while it's on. (Jitsi can't enforce
    // mentor-only creation or hide voters per-role — that needs a native poll.)
    pollsEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'polls_enabled' },
    // ── Scheduling (recurring reviews) ──
    scheduledAt: { type: DataTypes.DATE, allowNull: true, field: 'scheduled_at' },
    reviewScheduleId: { type: DataTypes.UUID, allowNull: true, field: 'review_schedule_id' },
    invitesSentAt: { type: DataTypes.DATE, allowNull: true, field: 'invites_sent_at' },
    reminded24hAt: { type: DataTypes.DATE, allowNull: true, field: 'reminded_24h_at' },
    reminded1hAt: { type: DataTypes.DATE, allowNull: true, field: 'reminded_1h_at' },
  }, {
    tableName: 'cohort_review_sessions',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['mentor_id', 'session_date'] },
      { fields: ['clan_id', 'session_date'] },
    ],
  });

  CohortReviewSession.associate = (models) => {
    CohortReviewSession.hasMany(models.CohortReviewEntry, { foreignKey: 'session_id', as: 'entries' });
    CohortReviewSession.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
    if (models.Clan) CohortReviewSession.belongsTo(models.Clan, { foreignKey: 'clan_id', as: 'clan' });
  };

  return CohortReviewSession;
};
