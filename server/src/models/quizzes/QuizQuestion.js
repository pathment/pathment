module.exports = (sequelize, DataTypes) => {
  /**
   * QuizQuestion - one auto-gradable item in a kit. `kind` drives how it's answered
   * and graded:
   *   - single   one correct option (radio)         → correctOptionIds = [oneId]
   *   - multi    N correct options (checkboxes)      → correctOptionIds = [ids…], exact set
   *   - boolean  true/false                          → options are True/False, correctOptionIds = [one]
   *   - short    typed answer graded against         → acceptedAnswers + matchMode (exact | keyword)
   * `correctOptionIds` / `acceptedAnswers` are the answer key — stripped from the
   * candidate view, never sent to the mentee before grading.
   */
  const QuizQuestion = sequelize.define('QuizQuestion', {
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
      defaultValue: 'single',
      validate: { isIn: [['single', 'multi', 'boolean', 'short']] }
    },
    prompt: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    points: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5
    },
    required: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    // Choice questions: [{ id, label }].
    options: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: []
    },
    // The answer key for choice questions (ids into `options`).
    correctOptionIds: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'correct_option_ids'
    },
    // Short-answer questions: accepted strings.
    acceptedAnswers: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'accepted_answers'
    },
    // 'exact' → normalized equality to an accepted answer.
    // 'keyword' → every accepted entry must appear in the response.
    matchMode: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'exact',
      field: 'match_mode',
      validate: { isIn: [['exact', 'keyword']] }
    },
    // Shown to the mentee after grading (when the assignment reveals answers).
    explanation: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    config: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    }
  }, {
    tableName: 'quiz_questions',
    underscored: true,
    indexes: [
      { fields: ['kit_id'] }
    ]
  });

  QuizQuestion.associate = (models) => {
    QuizQuestion.belongsTo(models.QuizKit, { foreignKey: 'kit_id', as: 'kit' });
  };

  return QuizQuestion;
};
