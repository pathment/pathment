module.exports = (sequelize, DataTypes) => {
  const LeaderboardEntry = sequelize.define('LeaderboardEntry', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    programId: {
      type: DataTypes.UUID,
      field: 'program_id'
    },
    rank: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    points: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    periodType: {
      type: DataTypes.STRING(20),
      allowNull: false,
      field: 'period_type'
    },
    periodStart: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'period_start'
    },
    periodEnd: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'period_end'
    },
    isVisible: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_visible'
    }
  }, {
    tableName: 'leaderboard_entries',
    underscored: true,
    indexes: [
      { unique: true, fields: ['user_id', 'program_id', 'period_type', 'period_start'] },
      { fields: ['program_id', 'period_type', 'rank'] },
      { fields: ['user_id'] },
      { fields: ['period_type', 'period_start', 'period_end'] }
    ]
  });

  LeaderboardEntry.associate = (models) => {
    LeaderboardEntry.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    LeaderboardEntry.belongsTo(models.Program, { foreignKey: 'program_id', as: 'program' });
  };

  return LeaderboardEntry;
};
