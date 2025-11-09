module.exports = (sequelize, DataTypes) => {
  const Roadmap = sequelize.define('Roadmap', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    programId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'program_id'
    },
    levelId: {
      type: DataTypes.UUID,
      field: 'level_id'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT
    },
    isBaseRoadmap: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_base_roadmap'
    },
    adaptedFrom: {
      type: DataTypes.UUID,
      field: 'adapted_from'
    },
    generatedByAi: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'generated_by_ai'
    },
    aiModelVersion: {
      type: DataTypes.STRING(50),
      field: 'ai_model_version'
    },
    generationPrompt: {
      type: DataTypes.TEXT,
      field: 'generation_prompt'
    },
    totalWeeks: {
      type: DataTypes.INTEGER,
      field: 'total_weeks'
    },
    totalTasks: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_tasks'
    },
    estimatedTotalHours: {
      type: DataTypes.INTEGER,
      field: 'estimated_total_hours'
    }
  }, {
    tableName: 'roadmaps',
    underscored: true,
    indexes: [
      { fields: ['program_id'] },
      { fields: ['level_id'] },
      { fields: ['is_base_roadmap'] }
    ]
  });

  Roadmap.associate = (models) => {
    Roadmap.belongsTo(models.Program, { foreignKey: 'program_id', as: 'program' });
    Roadmap.belongsTo(models.ProgramLevel, { foreignKey: 'level_id', as: 'level' });
    Roadmap.belongsTo(models.Roadmap, { foreignKey: 'adapted_from', as: 'parentRoadmap' });
    Roadmap.hasMany(models.RoadmapWeek, { foreignKey: 'roadmap_id', as: 'weeks' });
    Roadmap.hasMany(models.AdaptiveRecommendation, { foreignKey: 'current_roadmap_id', as: 'recommendations' });
  };

  return Roadmap;
};
