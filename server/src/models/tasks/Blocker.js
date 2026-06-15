module.exports = (sequelize, DataTypes) => {
  /**
   * Blocker - something concrete standing in a mentee's way, optionally tied to
   * a specific assigned task so it stays relevant (not a floating to-do). Feeds
   * the mentor cockpit's openBlockers count and the risk/relative-progress read.
   */
  const Blocker = sequelize.define('Blocker', {
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
    // The assigned task this blocker is about (optional).
    assignedTaskId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'assigned_task_id'
    },
    // Free-form "What's blocking you?" text — mentees often write a paragraph,
    // so TEXT (no 255 cap) to avoid "value too long" insert failures.
    title: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    category: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'technical',
      validate: {
        isIn: [['technical', 'knowledge', 'access', 'personal']]
      }
    },
    severity: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'medium',
      validate: {
        isIn: [['low', 'medium', 'high']]
      }
    },
    status: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'open',
      validate: {
        isIn: [['open', 'resolved']]
      }
    },
    // Who logged it (mentee themselves, or a mentor on their behalf).
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by'
    },
    openedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'opened_at'
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'resolved_at'
    }
  }, {
    tableName: 'blockers',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['mentee_id'] },
      { fields: ['assigned_task_id'] },
      { fields: ['status'] }
    ]
  });

  Blocker.associate = (models) => {
    Blocker.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
    if (models.AssignedTask) {
      Blocker.belongsTo(models.AssignedTask, { foreignKey: 'assigned_task_id', as: 'task' });
      models.AssignedTask.hasMany(Blocker, { foreignKey: 'assigned_task_id', as: 'blockers' });
    }
    models.User.hasMany(Blocker, { foreignKey: 'mentee_id', as: 'blockers' });
  };

  return Blocker;
};
