module.exports = (sequelize, DataTypes) => {
  const RoadmapWeek = sequelize.define('RoadmapWeek', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    roadmapId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'roadmap_id'
    },
    weekNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'week_number'
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT
    },
    objectives: {
      type: DataTypes.ARRAY(DataTypes.TEXT)
    },
    keyConcepts: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      field: 'key_concepts'
    },
    milestone: {
      type: DataTypes.TEXT
    },
    estimatedHours: {
      type: DataTypes.INTEGER,
      field: 'estimated_hours'
    }
  }, {
    tableName: 'roadmap_weeks',
    underscored: true,
    indexes: [
      { unique: true, fields: ['roadmap_id', 'week_number'] },
      { fields: ['roadmap_id'] }
    ]
  });

  RoadmapWeek.associate = (models) => {
    RoadmapWeek.belongsTo(models.Roadmap, { foreignKey: 'roadmap_id', as: 'roadmap' });
    RoadmapWeek.hasMany(models.RoadmapTask, { foreignKey: 'roadmap_week_id', as: 'tasks' });
  };

  return RoadmapWeek;
};
