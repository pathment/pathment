module.exports = (sequelize, DataTypes) => {
  /**
   * Assessment — an admin-built test attached (optionally) to a cohort's intake.
   * It holds a set of mixed-type questions (MCQ auto-graded, text, file upload,
   * external link). Reusable across cohorts of the same program.
   */
  const Assessment = sequelize.define('Assessment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT
    },
    instructions: {
      type: DataTypes.TEXT
    },
    // Optional scoping to a program (reusable across that program's cohorts).
    programId: {
      type: DataTypes.UUID,
      field: 'program_id'
    },
    // Auto-pass threshold against the sum of auto-graded points (null = no gate).
    passingScore: {
      type: DataTypes.DECIMAL(6, 2),
      field: 'passing_score'
    },
    timeLimitMins: {
      type: DataTypes.INTEGER,
      field: 'time_limit_mins'
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'draft',
      validate: {
        isIn: [['draft', 'published', 'archived']]
      }
    },
    createdBy: {
      type: DataTypes.UUID,
      field: 'created_by'
    }
  }, {
    tableName: 'assessments',
    underscored: true,
    indexes: [
      { fields: ['program_id'] },
      { fields: ['status'] }
    ]
  });

  Assessment.associate = (models) => {
    Assessment.belongsTo(models.Program, { foreignKey: 'program_id', as: 'program' });
    Assessment.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
    Assessment.hasMany(models.AssessmentQuestion, { foreignKey: 'assessment_id', as: 'questions' });
    Assessment.hasMany(models.AssessmentSubmission, { foreignKey: 'assessment_id', as: 'submissions' });
  };

  return Assessment;
};
