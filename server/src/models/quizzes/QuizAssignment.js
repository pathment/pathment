module.exports = (sequelize, DataTypes) => {
  /**
   * QuizAssignment - 1:1 with an `assigned_task` of type 'quiz'. Links the
   * assignment to its kit and snapshots the options the mentor chose at assign time
   * (evaluation mode, retake, timer, shuffle, reveal, pass mark) so later kit edits
   * don't silently change the rules of a quiz already out.
   */
  const QuizAssignment = sequelize.define('QuizAssignment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    assignedTaskId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      field: 'assigned_task_id'
    },
    kitId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'kit_id'
    },
    // 'auto' → score posts on submit; 'review' → mentor confirms in Approvals first.
    evaluationMode: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'auto',
      field: 'evaluation_mode',
      validate: { isIn: [['auto', 'review']] }
    },
    allowRetake: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'allow_retake'
    },
    timeLimitSeconds: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'time_limit_seconds'
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
    passScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'pass_score'
    }
  }, {
    tableName: 'quiz_assignments',
    underscored: true,
    indexes: [
      { fields: ['assigned_task_id'], unique: true },
      { fields: ['kit_id'] }
    ]
  });

  QuizAssignment.associate = (models) => {
    QuizAssignment.belongsTo(models.AssignedTask, { foreignKey: 'assigned_task_id', as: 'assignedTask' });
    QuizAssignment.belongsTo(models.QuizKit, { foreignKey: 'kit_id', as: 'kit' });
  };

  return QuizAssignment;
};
