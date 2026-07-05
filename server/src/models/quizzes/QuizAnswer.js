module.exports = (sequelize, DataTypes) => {
  /**
   * QuizAnswer - one candidate answer within a session (one per question). The
   * prompt/kind/points are snapshotted so later kit edits never rewrite a mentee's
   * history. `selectedOptionIds` / `answerText` hold the response; `autoPoints` is
   * the instant grade and `pointsAwarded` is the final value (a mentor may override
   * it in review mode).
   */
  const QuizAnswer = sequelize.define('QuizAnswer', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    sessionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'session_id'
    },
    questionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'question_id'
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
    promptSnapshot: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'prompt_snapshot'
    },
    pointsPossible: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'points_possible'
    },
    selectedOptionIds: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'selected_option_ids'
    },
    answerText: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'answer_text'
    },
    // Auto-grade result + optional mentor override (review mode).
    isCorrect: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      field: 'is_correct'
    },
    autoPoints: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'auto_points'
    },
    pointsAwarded: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'points_awarded'
    },
    scoreNote: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'score_note'
    }
  }, {
    tableName: 'quiz_answers',
    underscored: true,
    indexes: [
      { fields: ['session_id'] },
      { fields: ['session_id', 'question_id'], unique: true }
    ]
  });

  QuizAnswer.associate = (models) => {
    QuizAnswer.belongsTo(models.QuizSession, { foreignKey: 'session_id', as: 'session' });
  };

  return QuizAnswer;
};
