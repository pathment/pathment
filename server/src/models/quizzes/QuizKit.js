module.exports = (sequelize, DataTypes) => {
  /**
   * QuizKit - a reusable auto-gradable quiz: an ordered set of questions a mentor
   * authors once and assigns to many mentees as a `quiz` task. Objective answers
   * grade instantly; the assign drawer decides whether the score auto-finalizes or
   * waits for mentor confirmation.
   */
  const QuizKit = sequelize.define('QuizKit', {
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
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by'
    },
    // Optional reuse scoping — a program's mentors share the kit. Null = personal.
    programId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'program_id'
    },
    clanId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'clan_id'
    },
    // Whole-quiz timer (seconds). Null = untimed.
    timeLimitSeconds: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'time_limit_seconds'
    },
    // Pass mark as a percentage 0–100. Null = no pass/fail line.
    passScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'pass_score'
    },
    shuffleQuestions: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'shuffle_questions'
    },
    showAnswers: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'show_answers'
    },
    allowRetakeDefault: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'allow_retake_default'
    },
    // 'auto' → finalize on submit; 'review' → mentor confirms in Approvals.
    evaluationDefault: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'auto',
      field: 'evaluation_default',
      validate: { isIn: [['auto', 'review']] }
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'draft',
      validate: { isIn: [['draft', 'published', 'archived']] }
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    }
  }, {
    tableName: 'quiz_kits',
    underscored: true,
    indexes: [
      { fields: ['created_by'] },
      { fields: ['program_id'] },
      { fields: ['status'] }
    ]
  });

  QuizKit.associate = (models) => {
    QuizKit.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
    QuizKit.belongsTo(models.Program, { foreignKey: 'program_id', as: 'program' });
    QuizKit.hasMany(models.QuizQuestion, { foreignKey: 'kit_id', as: 'questions' });
    QuizKit.hasMany(models.QuizAssignment, { foreignKey: 'kit_id', as: 'assignments' });
  };

  return QuizKit;
};
