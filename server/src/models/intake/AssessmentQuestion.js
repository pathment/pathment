module.exports = (sequelize, DataTypes) => {
  /**
   * AssessmentQuestion — one item in an assessment. `type` drives how it's
   * answered and whether it can be auto-graded:
   *   - mcq          single-choice; auto-graded vs correctOptionIds[0]
   *   - multi_select multiple-choice; auto-graded vs the correctOptionIds set
   *   - short_text   one-line free text; manual grading
   *   - long_text    paragraph free text; manual grading
   *   - file_upload  applicant uploads a file (url stored in the answer)
   *   - external_link applicant pastes a link (e.g. repo / portfolio)
   */
  const AssessmentQuestion = sequelize.define('AssessmentQuestion', {
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
    type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [['mcq', 'multi_select', 'short_text', 'long_text', 'file_upload', 'external_link']]
      }
    },
    prompt: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    required: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    // Points awarded for a correct auto-graded answer (mcq/multi_select). Manual
    // items keep this as a max the admin can award by hand.
    points: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    // Choice list for mcq/multi_select: [{ id, label }].
    options: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: []
    },
    // Correct option id(s) for auto-grading: [id, ...].
    correctOptionIds: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'correct_option_ids'
    },
    // Extra per-type config, e.g. { maxLength } or { acceptTypes: ['pdf','zip'] }.
    config: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    }
  }, {
    tableName: 'assessment_questions',
    underscored: true,
    indexes: [
      { fields: ['assessment_id'] }
    ]
  });

  AssessmentQuestion.associate = (models) => {
    AssessmentQuestion.belongsTo(models.Assessment, { foreignKey: 'assessment_id', as: 'assessment' });
  };

  return AssessmentQuestion;
};
