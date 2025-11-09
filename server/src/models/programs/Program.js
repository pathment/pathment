module.exports = (sequelize, DataTypes) => {
  const Program = sequelize.define('Program', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by'
    },
    name: {
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
        isIn: [['internship', 'mentorship', 'training', 'onboarding']]
      }
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'draft',
      validate: {
        isIn: [['draft', 'published', 'archived', 'completed']]
      }
    },
    totalDurationWeeks: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'total_duration_weeks'
    },
    estimatedHoursPerWeek: {
      type: DataTypes.INTEGER,
      field: 'estimated_hours_per_week'
    },
    startDate: {
      type: DataTypes.DATEONLY,
      field: 'start_date'
    },
    endDate: {
      type: DataTypes.DATEONLY,
      field: 'end_date'
    },
    maxEnrollments: {
      type: DataTypes.INTEGER,
      field: 'max_enrollments'
    },
    currentEnrollments: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'current_enrollments'
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.TEXT)
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
    },
    isTemplate: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_template'
    },
    clonedFrom: {
      type: DataTypes.UUID,
      field: 'cloned_from'
    },
    rating: {
      type: DataTypes.DECIMAL(3, 2),
      defaultValue: 0.00
    },
    totalReviews: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_reviews'
    },
    publishedAt: {
      type: DataTypes.DATE,
      field: 'published_at'
    },
    archivedAt: {
      type: DataTypes.DATE,
      field: 'archived_at'
    },
    deletedAt: {
      type: DataTypes.DATE,
      field: 'deleted_at'
    }
  }, {
    tableName: 'programs',
    underscored: true,
    paranoid: true,
    indexes: [
      { fields: ['status'] },
      { fields: ['type'] },
      { fields: ['created_by'] },
      { fields: ['created_at'] },
      { fields: ['tags'], using: 'gin' }
    ]
  });

  Program.associate = (models) => {
    Program.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
    Program.belongsTo(models.Program, { foreignKey: 'cloned_from', as: 'parent' });
    // Program.hasMany(models.ProgramLevel, { foreignKey: 'program_id', as: 'levels' });
    // Program.hasMany(models.Roadmap, { foreignKey: 'program_id', as: 'roadmaps' });
    Program.hasMany(models.Enrollment, { foreignKey: 'program_id', as: 'enrollments' });
  };

  return Program;
};
