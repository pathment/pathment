module.exports = (sequelize, DataTypes) => {
  const Enrollment = sequelize.define('Enrollment', {
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
    programId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'program_id'
    },
    currentLevelId: {
      type: DataTypes.UUID,
      field: 'current_level_id'
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending_approval',
      validate: {
        isIn: [['pending_approval', 'approved', 'rejected', 'pending_match', 'matched', 'active', 'level_completed', 'program_completed', 'dropped']]
      }
    },
    currentWeek: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      field: 'current_week'
    },
    tasksCompleted: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'tasks_completed'
    },
    tasksTotal: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'tasks_total'
    },
    overallProgressPercentage: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.00,
      field: 'overall_progress_percentage'
    },
    enrolledAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'enrolled_at'
    },
    startedAt: {
      type: DataTypes.DATE,
      field: 'started_at'
    },
    completedAt: {
      type: DataTypes.DATE,
      field: 'completed_at'
    },
    droppedAt: {
      type: DataTypes.DATE,
      field: 'dropped_at'
    },
    expectedCompletionDate: {
      type: DataTypes.DATEONLY,
      field: 'expected_completion_date'
    },
    avgTaskRating: {
      type: DataTypes.DECIMAL(3, 2),
      field: 'avg_task_rating'
    },
    totalPointsEarned: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_points_earned'
    }
  }, {
    tableName: 'enrollments',
    underscored: true,
    indexes: [
      { unique: true, fields: ['mentee_id', 'program_id'] },
      { fields: ['mentee_id'] },
      { fields: ['program_id'] },
      { fields: ['status'] },
      { fields: ['current_level_id'] }
    ],
    hooks: {
      afterCreate: async (enrollment, options) => {
        // Increment program's current_enrollments counter
        const program = await sequelize.models.Program.findByPk(enrollment.programId);
        if (program) {
          await program.increment('currentEnrollments');
        }
        
        // Increment mentee's total_programs_enrolled
        const menteeProfile = await sequelize.models.MenteeProfile.findOne({
          where: { user_id: enrollment.menteeId }
        });
        if (menteeProfile) {
          await menteeProfile.increment('totalProgramsEnrolled');
        }
      }
    }
  });

  Enrollment.associate = (models) => {
    Enrollment.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
    Enrollment.belongsTo(models.Program, { foreignKey: 'program_id', as: 'program' });
    Enrollment.belongsTo(models.ProgramLevel, { foreignKey: 'current_level_id', as: 'currentLevel' });
  };

  return Enrollment;
};
