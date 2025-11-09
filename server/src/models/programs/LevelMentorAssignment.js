module.exports = (sequelize, DataTypes) => {
  const LevelMentorAssignment = sequelize.define('LevelMentorAssignment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    levelId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'level_id'
    },
    mentorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentor_id'
    },
    assignedBy: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'assigned_by'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active'
    },
    assignedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'assigned_at'
    },
    unassignedAt: {
      type: DataTypes.DATE,
      field: 'unassigned_at'
    }
  }, {
    tableName: 'level_mentor_assignments',
    underscored: true,
    timestamps: false,
    indexes: [
      { unique: true, fields: ['level_id', 'mentor_id'] },
      { fields: ['level_id'] },
      { fields: ['mentor_id'] }
    ]
  });

  LevelMentorAssignment.associate = (models) => {
    LevelMentorAssignment.belongsTo(models.ProgramLevel, { foreignKey: 'level_id', as: 'level' });
    LevelMentorAssignment.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
    LevelMentorAssignment.belongsTo(models.User, { foreignKey: 'assigned_by', as: 'assigner' });
  };

  return LevelMentorAssignment;
};
