module.exports = (sequelize, DataTypes) => {
  /**
   * InterviewAnswer - one candidate answer within a session (one per question).
   * The payload depends on the question kind: voice → transcript + audioUrl,
   * code → code + codeLanguage, text → answerText. prompt/kind/points are
   * snapshotted so later kit edits never rewrite a candidate's history. Grading
   * fields (pointsAwarded / scoreNote / aiDraft) are filled in Phase 4.
   */
  const InterviewAnswer = sequelize.define('InterviewAnswer', {
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
      defaultValue: 'voice',
      validate: { isIn: [['voice', 'code', 'text', 'video']] }
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
    transcript: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    audioUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'audio_url'
    },
    audioPublicId: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'audio_public_id'
    },
    code: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    codeLanguage: {
      type: DataTypes.STRING(30),
      allowNull: true,
      field: 'code_language'
    },
    answerText: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'answer_text'
    },
    timeSpentSeconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'time_spent_seconds'
    },
    // When the candidate first landed on this question. The wall-clock deadline is
    // started_at + the question's time limit, so refreshing never resets the clock.
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'started_at'
    },
    // ── Grading (Phase 4) — mentor is source of truth; aiDraft is optional. ──
    pointsAwarded: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'points_awarded'
    },
    scoreNote: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'score_note'
    },
    aiDraft: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'ai_draft'
    }
  }, {
    tableName: 'interview_answers',
    underscored: true,
    indexes: [
      { fields: ['session_id'] },
      { fields: ['session_id', 'question_id'], unique: true }
    ]
  });

  InterviewAnswer.associate = (models) => {
    InterviewAnswer.belongsTo(models.InterviewSession, { foreignKey: 'session_id', as: 'session' });
  };

  return InterviewAnswer;
};
