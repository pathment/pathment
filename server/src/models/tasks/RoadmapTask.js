module.exports = (sequelize, DataTypes) => {
  const RoadmapTask = sequelize.define('RoadmapTask', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    roadmapWeekId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'roadmap_week_id'
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
        isIn: [['reading', 'practical', 'project', 'assessment', 'custom']]
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
    }
  }, {
    tableName: 'roadmap_tasks',
    underscored: true,
    indexes: [
      { unique: true, fields: ['roadmap_week_id', 'task_order'] },
      { fields: ['roadmap_week_id'] },
      { fields: ['type'] },
      { fields: ['difficulty'] }
    ]
  });

  RoadmapTask.associate = (models) => {
    RoadmapTask.belongsTo(models.RoadmapWeek, { foreignKey: 'roadmap_week_id', as: 'week' });
    RoadmapTask.hasMany(models.TaskResource, { foreignKey: 'roadmap_task_id', as: 'resources' });
    RoadmapTask.hasMany(models.TaskSkill, { foreignKey: 'roadmap_task_id', as: 'taskSkills' });
    RoadmapTask.hasMany(models.AssignedTask, { foreignKey: 'roadmap_task_id', as: 'assignments' });
    RoadmapTask.hasMany(models.TaskAnalytics, { foreignKey: 'roadmap_task_id', as: 'analytics' });
  };

  return RoadmapTask;
};
