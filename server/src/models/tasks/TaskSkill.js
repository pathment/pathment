module.exports = (sequelize, DataTypes) => {
  const TaskSkill = sequelize.define('TaskSkill', {
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
    skillId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'skill_id'
    }
  }, {
    tableName: 'task_skills',
    underscored: true,
    timestamps: true,
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['roadmap_task_id', 'skill_id'] },
      { fields: ['roadmap_task_id'] },
      { fields: ['skill_id'] }
    ]
  });

  TaskSkill.associate = (models) => {
    TaskSkill.belongsTo(models.RoadmapTask, { foreignKey: 'roadmap_task_id', as: 'task' });
    TaskSkill.belongsTo(models.Skill, { foreignKey: 'skill_id', as: 'skill' });
  };

  return TaskSkill;
};
