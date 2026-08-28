module.exports = (sequelize, DataTypes) => {
  /**
   * DelayEvent - a logged reason a mentee fell behind (the fairness lens). The
   * AI (or a mentor) categorizes it as external / scope / avoidance; accepted
   * external delays count in the mentee's favour when computing relative
   * progress, so someone fighting real constraints isn't punished.
   */
  const DelayEvent = sequelize.define('DelayEvent', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    menteeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentee_id'
    },
    assignedTaskId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'assigned_task_id'
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    // The kind of friction behind the delay.
    kind: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'other',
      validate: {
        isIn: [['job', 'domestic', 'electricity', 'hardware', 'health', 'connectivity', 'other']]
      }
    },
    days: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    // Mentor accepted this as a legitimate (non-penalised) delay.
    accepted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    // pending → awaiting mentor review; accepted/rejected are terminal for that review.
    reviewStatus: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
      field: 'review_status',
      validate: { isIn: [['pending', 'accepted', 'rejected']] }
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'rejection_reason'
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reviewed_at'
    },
    reviewedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'reviewed_by'
    },
    // The fairness category (how the delay is read).
    category: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'external',
      validate: {
        isIn: [['external', 'scope', 'avoidance']]
      }
    },
    // Why it was categorized this way (AI- or mentor-provided).
    aiRationale: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'ai_rationale'
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by'
    },
    occurredAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'occurred_at'
    }
  }, {
    tableName: 'delay_events',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['mentee_id'] },
      { fields: ['assigned_task_id'] },
      { fields: ['accepted'] },
      { fields: ['review_status'] }
    ]
  });

  DelayEvent.associate = (models) => {
    DelayEvent.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
    if (models.AssignedTask) {
      DelayEvent.belongsTo(models.AssignedTask, { foreignKey: 'assigned_task_id', as: 'task' });
      models.AssignedTask.hasMany(DelayEvent, { foreignKey: 'assigned_task_id', as: 'delays' });
    }
    models.User.hasMany(DelayEvent, { foreignKey: 'mentee_id', as: 'delays' });
  };

  return DelayEvent;
};
