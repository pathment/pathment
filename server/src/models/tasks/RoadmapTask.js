module.exports = (sequelize, DataTypes) => {
  const RoadmapTask = sequelize.define('RoadmapTask', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    // Direct link to the roadmap this task is a step of (linear model), ordered
    // by task_order. Null for one-off custom tasks created via the assign drawer.
    roadmapId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'roadmap_id'
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        // 'assignment' added to match the new-design TaskType
        // (assignment/project/quiz/reading/video/discussion). 'interview' =
        // structured voice/code/text interview backed by an InterviewKit.
        isIn: [['reading', 'video', 'exercise', 'project', 'quiz', 'discussion', 'practical', 'assessment', 'custom', 'assignment', 'interview', 'open_source']]
      }
    },
    difficulty: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [['easy', 'medium', 'hard', 'expert']]
      }
    },
    taskOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'task_order'
    },
    deliverable: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    acceptanceCriteria: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      field: 'acceptance_criteria'
    },
    estimatedHours: {
      type: DataTypes.INTEGER,
      field: 'estimated_hours'
    },
    // Linear-roadmap step fields (new design): relative effort + how many days
    // after assignment the step is due.
    effort: {
      type: DataTypes.STRING(2),
      allowNull: true,
      validate: { isIn: [['xs', 's', 'm', 'l', 'xl']] }
    },
    dueOffsetDays: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'due_offset_days'
    },
    isMandatory: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_mandatory'
    },
    isCustomTask: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_custom_task'
    },
    pointsBase: {
      type: DataTypes.INTEGER,
      defaultValue: 10,
      field: 'points_base'
    },
    openSourceOrgIds: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      defaultValue: [],
      field: 'open_source_org_ids'
    }
  }, {
    tableName: 'roadmap_tasks',
    underscored: true,
    indexes: [
      { fields: ['roadmap_id'] },
      { fields: ['type'] },
      { fields: ['difficulty'] }
    ]
  });

  RoadmapTask.associate = (models) => {
    RoadmapTask.belongsTo(models.Roadmap, { foreignKey: 'roadmap_id', as: 'roadmap' });
    RoadmapTask.hasMany(models.TaskResource, { foreignKey: 'roadmap_task_id', as: 'resources' });
    RoadmapTask.hasMany(models.TaskSkill, { foreignKey: 'roadmap_task_id', as: 'taskSkills' });
    RoadmapTask.hasMany(models.AssignedTask, { foreignKey: 'roadmap_task_id', as: 'assignments' });
    RoadmapTask.hasMany(models.TaskAnalytics, { foreignKey: 'roadmap_task_id', as: 'analytics' });
  };

  return RoadmapTask;
};
