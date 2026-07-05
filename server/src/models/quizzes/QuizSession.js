module.exports = (sequelize, DataTypes) => {
  /**
   * QuizSession - one attempt at a quiz assignment. A mentee gets one session per
   * attempt; retake (when the mentor allowed it) creates a new session with the
   * next attempt_number. Holds status/progress and the auto-grade tallies.
   */
  const QuizSession = sequelize.define('QuizSession', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    assignedTaskId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'assigned_task_id'
    },
    quizAssignmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'quiz_assignment_id'
    },
    menteeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentee_id'
    },
    attemptNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: 'attempt_number'
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'in_progress',
      validate: { isIn: [['in_progress', 'submitted']] }
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'started_at'
    },
    // The question index the candidate is currently on — resume returns them here.
    currentPosition: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'current_position'
    },
    submittedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'submitted_at'
    },
    autoScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'auto_score'
    },
    maxScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'max_score'
    },
    scorePercent: {
      type: DataTypes.FLOAT,
      allowNull: true,
      field: 'score_percent'
    },
    passed: {
      type: DataTypes.BOOLEAN,
      allowNull: true
    },
    meta: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    }
  }, {
    tableName: 'quiz_sessions',
    underscored: true,
    indexes: [
      { fields: ['assigned_task_id'] },
      { fields: ['mentee_id'] },
      { fields: ['status'] }
    ]
  });

  QuizSession.associate = (models) => {
    QuizSession.belongsTo(models.AssignedTask, { foreignKey: 'assigned_task_id', as: 'assignedTask' });
    QuizSession.belongsTo(models.QuizAssignment, { foreignKey: 'quiz_assignment_id', as: 'assignment' });
    QuizSession.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
    QuizSession.hasMany(models.QuizAnswer, { foreignKey: 'session_id', as: 'answers' });
  };

  return QuizSession;
};
