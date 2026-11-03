module.exports = (sequelize, DataTypes) => {
  const AssignedTask = sequelize.define('AssignedTask', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
    roadmapTaskId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'roadmap_task_id'
    },
    menteeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentee_id'
    },
    mentorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentor_id'
    },
    enrollmentId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'enrollment_id'
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'assigned',
      validate: {
        isIn: [['not_started', 'assigned', 'in_progress', 'submitted', 'revision_needed', 'completed', 'cancelled']]
      }
    },
    assignedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'assigned_at'
    },
    dueDate: {
      type: DataTypes.DATE,
      field: 'due_date'
    },
    startedAt: {
      type: DataTypes.DATE,
      field: 'started_at'
    },
    submittedAt: {
      type: DataTypes.DATE,
      field: 'submitted_at'
    },
    completedAt: {
      type: DataTypes.DATE,
      field: 'completed_at'
    },
    currentSubmissionVersion: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'current_submission_version'
    },
    revisionCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'revision_count'
    },
    timeSpentHours: {
      type: DataTypes.DECIMAL(6, 2),
      field: 'time_spent_hours'
    },
    finalRating: {
      type: DataTypes.DECIMAL(3, 2),
      field: 'final_rating'
    },
    pointsAwarded: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'points_awarded'
    },
    // Target points for THIS assignment (from the roadmap step on assign, or set
    // for a custom task; editable per mentee). Null → fall back to the step / default.
    pointsBase: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'points_base'
    },
    isLate: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_late'
    },
    /**
     * The mentee put this on their own plan.
     *
     * Still a real task — it keeps the progress log, the clan scoping and the
     * lifecycle — but it is not the mentor's to approve, so it never enters
     * their approvals queue and earns no points. See migration 128.
     */
    /**
     * How this item repeats, or null when it does not.
     *
     * The rule rides on the task and the next occurrence is written when one
     * is finished — no scheduler has to be alive for a repeat to work. See
     * src/utils/repeatRule.js and migration 130.
     */
    repeatRule: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'repeat_rule'
    },
    selfAssigned: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'self_assigned'
    },
    isCustomTask: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_custom_task'
    },
    cancelledBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'cancelled_by'
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'cancelled_at'
    },
    cancellationReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'cancellation_reason'
    },
    trackId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'track_id'
    },
    scheduleSlotId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'schedule_slot_id'
    },
    occurrenceDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'occurrence_date'
    },
    clanId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'clan_id'
    },
    // Provenance for an assignment intentionally continued from historical
    // work into a standing clan. It is also the idempotency key: retries reuse
    // the same new assignment instead of creating duplicates.
    continuedFromTaskId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'continued_from_task_id'
    },
    // Pool work (migration 140): qualifying work given to a candidate in the
    // System Pool, before they are in any clan. NULL — every task that existed
    // before the pool — means ordinary work.
    poolMemberId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'pool_member_id'
    },
    // ── Per-mentee overrides (null = use the RoadmapTask default) ────────────
    typeOverride: { type: DataTypes.STRING(20), allowNull: true, field: 'type_override' },
    titleOverride: { type: DataTypes.STRING(255), allowNull: true, field: 'title_override' },
    descriptionOverride: { type: DataTypes.TEXT, allowNull: true, field: 'description_override' },
    deliverableOverride: { type: DataTypes.TEXT, allowNull: true, field: 'deliverable_override' },
    acceptanceCriteriaOverride: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: true, field: 'acceptance_criteria_override' },
    resourcesOverride: { type: DataTypes.JSONB, allowNull: true, field: 'resources_override' },
    mentorNote: { type: DataTypes.TEXT, allowNull: true, field: 'mentor_note' },
    openSourceOrgIds: { type: DataTypes.ARRAY(DataTypes.UUID), allowNull: true, field: 'open_source_org_ids' },
    talkIds: { type: DataTypes.ARRAY(DataTypes.UUID), allowNull: true, field: 'talk_ids' },
    // The group a Group Discussion task sends the mentee to.
    discussionGroupId: { type: DataTypes.UUID, allowNull: true, field: 'discussion_group_id' }
  }, {
    tableName: 'assigned_tasks',
    underscored: true,
    /**
     * The fence around System Pool work.
     *
     * Every ordinary query sees ordinary work only. Pool work belongs to people
     * who are not in a clan yet, and it must never surface in a clan list, a
     * mentor's approvals, a progress figure or a leaderboard — including after
     * the candidate is placed into a clan, when every clan-scoped query would
     * otherwise start matching their earlier qualifying work.
     *
     * A filter at each of the ~60 call sites would be one forgotten filter away
     * from a leak; a default scope fails safe instead. Code that genuinely
     * deals in pool work opts in with `AssignedTask.scope('withPoolWork')` and
     * then authorises on its own — an ownership check, or `canActOnTask`, which
     * demands `pool.review` for pool work. The workspace boundary is a hook, not
     * a scope, so opting in never crosses a workspace.
     */
    defaultScope: { where: { poolMemberId: null } },
    scopes: { withPoolWork: {} },
    indexes: [
      { fields: ['mentee_id'] },
      { fields: ['mentor_id'] },
      { fields: ['enrollment_id'] },
      { fields: ['status'] },
      { fields: ['due_date'] },
      { fields: ['roadmap_task_id'] },
      { fields: ['track_id'] },
      { fields: ['schedule_slot_id'] },
      { fields: ['mentee_id', 'clan_id'] },
      { fields: ['continued_from_task_id'] }
    ]
  });

  AssignedTask.associate = (models) => {
    AssignedTask.belongsTo(models.RoadmapTask, { foreignKey: 'roadmap_task_id', as: 'roadmapTask' });
    AssignedTask.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
    AssignedTask.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
    AssignedTask.belongsTo(models.Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
    AssignedTask.belongsTo(models.Track, { foreignKey: 'track_id', as: 'track' });
    if (models.Clan) AssignedTask.belongsTo(models.Clan, { foreignKey: 'clan_id', as: 'clan' });
    AssignedTask.belongsTo(models.AssignedTask, { foreignKey: 'continued_from_task_id', as: 'continuedFromTask' });
    if (models.PoolMember) AssignedTask.belongsTo(models.PoolMember, { foreignKey: 'pool_member_id', as: 'poolMember' });
    AssignedTask.hasMany(models.TaskSubmission, { foreignKey: 'assigned_task_id', as: 'submissions' });
    AssignedTask.hasMany(models.TaskFeedback, { foreignKey: 'assigned_task_id', as: 'feedback' });
    AssignedTask.hasMany(models.Message, { foreignKey: 'related_task_id', as: 'messages' });
    AssignedTask.hasMany(models.SkillAssessment, { foreignKey: 'based_on_task_id', as: 'skillAssessments' });
  };

  return AssignedTask;
};
