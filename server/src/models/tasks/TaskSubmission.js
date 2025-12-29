module.exports = (sequelize, DataTypes) => {
  const TaskSubmission = sequelize.define('TaskSubmission', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    assignedTaskId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'assigned_task_id'
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    submissionText: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'submission_text'
    },
    submissionUrls: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      field: 'submission_urls'
    },
    submittedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'submitted_at'
    },
    reviewedAt: {
      type: DataTypes.DATE,
      field: 'reviewed_at'
    }
  }, {
    tableName: 'task_submissions',
    underscored: true,
    timestamps: false,
    indexes: [
      { unique: true, fields: ['assigned_task_id', 'version'] },
      { fields: ['assigned_task_id'] }
    ]
  });

  TaskSubmission.associate = (models) => {
    TaskSubmission.belongsTo(models.AssignedTask, { foreignKey: 'assigned_task_id', as: 'assignedTask' });
    TaskSubmission.hasMany(models.TaskSubmissionFile, { foreignKey: 'submission_id', as: 'files' });
    TaskSubmission.hasMany(models.TaskFeedback, { foreignKey: 'submission_id', as: 'feedback' });
  };

  return TaskSubmission;
};
