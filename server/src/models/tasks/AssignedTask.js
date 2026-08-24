module.exports = (sequelize, DataTypes) => {
  const AssignedTask = sequelize.define('AssignedTask', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
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
      allowNull: false,
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
    // ── Per-mentee overrides (null = use the RoadmapTask default) ────────────
    titleOverride: { type: DataTypes.STRING(255), allowNull: true, field: 'title_override' },
    descriptionOverride: { type: DataTypes.TEXT, allowNull: true, field: 'description_override' },
    deliverableOverride: { type: DataTypes.TEXT, allowNull: true, field: 'deliverable_override' },
    acceptanceCriteriaOverride: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: true, field: 'acceptance_criteria_override' },
    resourcesOverride: { type: DataTypes.JSONB, allowNull: true, field: 'resources_override' },
    mentorNote: { type: DataTypes.TEXT, allowNull: true, field: 'mentor_note' }
  }, {
    tableName: 'assigned_tasks',
    underscored: true,
    indexes: [
      { fields: ['mentee_id'] },
      { fields: ['mentor_id'] },
      { fields: ['enrollment_id'] },
      { fields: ['status'] },
      { fields: ['due_date'] },
      { fields: ['roadmap_task_id'] },
      { fields: ['track_id'] }
    ]
  });

  AssignedTask.associate = (models) => {
    AssignedTask.belongsTo(models.RoadmapTask, { foreignKey: 'roadmap_task_id', as: 'roadmapTask' });
    AssignedTask.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
    AssignedTask.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
    AssignedTask.belongsTo(models.Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
    AssignedTask.belongsTo(models.Track, { foreignKey: 'track_id', as: 'track' });
    AssignedTask.hasMany(models.TaskSubmission, { foreignKey: 'assigned_task_id', as: 'submissions' });
    AssignedTask.hasMany(models.TaskFeedback, { foreignKey: 'assigned_task_id', as: 'feedback' });
    AssignedTask.hasMany(models.Message, { foreignKey: 'related_task_id', as: 'messages' });
    AssignedTask.hasMany(models.SkillAssessment, { foreignKey: 'based_on_task_id', as: 'skillAssessments' });
  };

  return AssignedTask;
};
