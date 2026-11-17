module.exports = (sequelize, DataTypes) => {
  /**
   * InterviewQuestion - one item in a kit. `kind` drives how it's answered:
   *   - voice  spoken answer; audio kept + free browser transcript stored
   *   - code   in-browser code editor (starterCode/codeLanguage), autosaved
   *   - text   typed free-text answer
   * `referenceAnswer` is the model answer / rubric shown ONLY to the mentor (and
   * optional AI grader) — never sent to the candidate.
   */
  const InterviewQuestion = sequelize.define('InterviewQuestion', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    kitId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'kit_id'
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    kind: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'voice',
      validate: { isIn: [['voice', 'code', 'text', 'video']] }
    },
    prompt: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    // Per-question clock (seconds). Null under 'total' timing.
    timeLimitSeconds: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'time_limit_seconds'
    },
    points: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10
    },
    required: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    // Code questions only.
    codeLanguage: {
      type: DataTypes.STRING(30),
      allowNull: true,
      field: 'code_language'
    },
    starterCode: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'starter_code'
    },
    // Mentor / AI only — never returned to the candidate.
    referenceAnswer: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'reference_answer'
    },
    config: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    }
  }, {
    tableName: 'interview_questions',
    underscored: true,
    indexes: [
      { fields: ['kit_id'] }
    ]
  });

  InterviewQuestion.associate = (models) => {
    InterviewQuestion.belongsTo(models.InterviewKit, { foreignKey: 'kit_id', as: 'kit' });
  };

  return InterviewQuestion;
};
