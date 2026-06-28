module.exports = (sequelize, DataTypes) => {
  /**
   * AssessmentSubmission - an applicant's answers to an assessment. One row per
   * (assessment, application). Auto-graded items are scored on submit; manual
   * items are scored by an admin (`manualScore`), and `totalScore` is the sum.
   */
  const AssessmentSubmission = sequelize.define('AssessmentSubmission', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    assessmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'assessment_id'
    },
    applicationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'application_id'
    },
    // { [questionId]: { optionIds?, text?, fileUrl?, fileName?, link? } }
    answers: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    },
    autoScore: {
      type: DataTypes.DECIMAL(6, 2),
      field: 'auto_score'
    },
    manualScore: {
      type: DataTypes.DECIMAL(6, 2),
      field: 'manual_score'
    },
    totalScore: {
      type: DataTypes.DECIMAL(6, 2),
      field: 'total_score'
    },
    maxScore: {
      type: DataTypes.DECIMAL(6, 2),
      field: 'max_score'
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'in_progress',
      validate: {
        isIn: [['in_progress', 'submitted', 'graded']]
      }
    },
    submittedAt: {
      type: DataTypes.DATE,
      field: 'submitted_at'
    },
    // How many times the applicant (re)submitted. The stored row is always the
    // LATEST answers — this just tells the reviewer it's the final of N.
    submissionCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: 'submission_count'
    },
    gradedAt: {
      type: DataTypes.DATE,
      field: 'graded_at'
    },
    gradedBy: {
      type: DataTypes.UUID,
      field: 'graded_by'
    }
  }, {
    tableName: 'assessment_submissions',
    underscored: true,
    indexes: [
      { fields: ['assessment_id'] },
      { fields: ['application_id'] },
      { unique: true, fields: ['assessment_id', 'application_id'] }
    ]
  });

  AssessmentSubmission.associate = (models) => {
    AssessmentSubmission.belongsTo(models.Assessment, { foreignKey: 'assessment_id', as: 'assessment' });
    AssessmentSubmission.belongsTo(models.Application, { foreignKey: 'application_id', as: 'application' });
    AssessmentSubmission.belongsTo(models.User, { foreignKey: 'graded_by', as: 'grader' });
  };

  return AssessmentSubmission;
};
