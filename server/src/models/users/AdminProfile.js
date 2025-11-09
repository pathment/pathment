module.exports = (sequelize, DataTypes) => {
  const AdminProfile = sequelize.define('AdminProfile', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      field: 'user_id'
    },
    department: {
      type: DataTypes.STRING(100)
    },
    permissions: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    canCreatePrograms: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'can_create_programs'
    },
    canManageUsers: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'can_manage_users'
    },
    canViewAnalytics: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'can_view_analytics'
    },
    programsCreated: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'programs_created'
    },
    lastActiveAt: {
      type: DataTypes.DATE,
      field: 'last_active_at'
    }
  }, {
    tableName: 'admin_profiles',
    underscored: true
  });

  AdminProfile.associate = (models) => {
    AdminProfile.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return AdminProfile;
};
