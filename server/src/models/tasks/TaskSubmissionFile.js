module.exports = (sequelize, DataTypes) => {
  const TaskSubmissionFile = sequelize.define('TaskSubmissionFile', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    submissionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'submission_id'
    },
    fileName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'file_name'
    },
    fileUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'file_url'
    },
    fileType: {
      type: DataTypes.STRING(50),
      field: 'file_type'
    },
    fileSizeBytes: {
      type: DataTypes.BIGINT,
      field: 'file_size_bytes'
    },
    uploadedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'uploaded_at'
    }
  }, {
    tableName: 'task_submission_files',
    underscored: true,
    timestamps: false,
    indexes: [
      { fields: ['submission_id'] }
    ]
  });

  TaskSubmissionFile.associate = (models) => {
    TaskSubmissionFile.belongsTo(models.TaskSubmission, { foreignKey: 'submission_id', as: 'submission' });
  };

  return TaskSubmissionFile;
};
