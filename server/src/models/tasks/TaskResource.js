module.exports = (sequelize, DataTypes) => {
  const TaskResource = sequelize.define('TaskResource', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    roadmapTaskId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'roadmap_task_id'
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    resourceType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'resource_type'
    },
    url: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT
    },
    isRequired: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_required'
    },
    displayOrder: {
      type: DataTypes.INTEGER,
      field: 'display_order'
    }
  }, {
    tableName: 'task_resources',
    underscored: true,
    updatedAt: false,
    indexes: [
      { fields: ['roadmap_task_id'] }
    ]
  });

  TaskResource.associate = (models) => {
    TaskResource.belongsTo(models.RoadmapTask, { foreignKey: 'roadmap_task_id', as: 'task' });
  };

  return TaskResource;
};
