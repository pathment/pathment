module.exports = (sequelize, DataTypes) => {
  /**
   * A cohort's assessment pool. A cohort can attach several assessments, each
   * optionally tagged to a `level`. At apply time one assessment is picked at
   * random from the pool matching the applicant's level (or the level-less pool
   * when the cohort has no levels). This is what enables "different assessment per
   * level" and "multiple variants, randomly assigned" without touching the
   * reusable Assessment records themselves.
   */
  const CohortAssessment = sequelize.define('CohortAssessment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    cohortId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'cohort_id'
    },
    assessmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'assessment_id'
    },
    // null = the level-less pool (no levels configured, or "everyone").
    level: {
      type: DataTypes.STRING(40)
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }
  }, {
    tableName: 'cohort_assessments',
    underscored: true,
    indexes: [
      { fields: ['cohort_id'] },
      { fields: ['cohort_id', 'level'] }
    ]
  });

  CohortAssessment.associate = (models) => {
    CohortAssessment.belongsTo(models.Cohort, { foreignKey: 'cohort_id', as: 'cohort' });
    CohortAssessment.belongsTo(models.Assessment, { foreignKey: 'assessment_id', as: 'assessment' });
  };

  return CohortAssessment;
};
