module.exports = (sequelize, DataTypes) => {
  const ProgramLevel = sequelize.define('ProgramLevel', {
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
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    levelOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'level_order'
    },
    durationWeeks: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'duration_weeks'
    },
    description: {
      type: DataTypes.TEXT
    },
    learningOutcomes: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      field: 'learning_outcomes'
    },
    prerequisites: {
      type: DataTypes.TEXT
    },
    targetAudience: {
      type: DataTypes.TEXT,
      field: 'target_audience'
    }
  }, {
    tableName: 'program_levels',
    underscored: true,
    indexes: [
      { unique: true, fields: ['program_id', 'level_order'] },
      { unique: true, fields: ['program_id', 'name'] },
      { fields: ['program_id'] }
    ]
  });

  ProgramLevel.associate = (models) => {
    ProgramLevel.belongsTo(models.Program, { foreignKey: 'program_id', as: 'program' });
    ProgramLevel.hasMany(models.LevelMentorAssignment, { foreignKey: 'level_id', as: 'mentorAssignments' });
    ProgramLevel.hasMany(models.Roadmap, { foreignKey: 'level_id', as: 'roadmaps' });
    ProgramLevel.hasMany(models.Enrollment, { foreignKey: 'current_level_id', as: 'enrollments' });
    ProgramLevel.hasMany(models.MentorMenteeMatch, { foreignKey: 'level_id', as: 'matches' });
  };

  return ProgramLevel;
};
