module.exports = (sequelize, DataTypes) => {
  const SkillAssessment = sequelize.define('SkillAssessment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    skillId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'skill_id'
    },
    proficiencyLevel: {
      type: DataTypes.INTEGER,
      validate: { min: 0, max: 100 },
      field: 'proficiency_level'
    },
    assessmentMethod: {
      type: DataTypes.STRING(50),
      field: 'assessment_method'
    },
    basedOnTaskId: {
      type: DataTypes.UUID,
      field: 'based_on_task_id'
    },
    basedOnEnrollmentId: {
      type: DataTypes.UUID,
      field: 'based_on_enrollment_id'
    },
    assessedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'assessed_at'
    },
    assessorId: {
      type: DataTypes.UUID,
      field: 'assessor_id'
    }
  }, {
    tableName: 'skill_assessments',
    underscored: true,
    timestamps: false,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['skill_id'] },
      { fields: ['assessed_at'] }
    ]
  });

  SkillAssessment.associate = (models) => {
    SkillAssessment.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    SkillAssessment.belongsTo(models.Skill, { foreignKey: 'skill_id', as: 'skill' });
    SkillAssessment.belongsTo(models.AssignedTask, { foreignKey: 'based_on_task_id', as: 'task' });
    SkillAssessment.belongsTo(models.Enrollment, { foreignKey: 'based_on_enrollment_id', as: 'enrollment' });
    SkillAssessment.belongsTo(models.User, { foreignKey: 'assessor_id', as: 'assessor' });
  };

  return SkillAssessment;
};
