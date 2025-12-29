module.exports = (sequelize, DataTypes) => {
  const UserSettings = sequelize.define('UserSettings', {
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
    emailNotifications: {
      type: DataTypes.JSONB,
      defaultValue: {
        task_assigned: true,
        feedback_received: true,
        deadline_approaching: true
      },
      field: 'email_notifications'
    },
    pushNotifications: {
      type: DataTypes.JSONB,
      defaultValue: { enabled: true },
      field: 'push_notifications'
    },
    notificationFrequency: {
      type: DataTypes.STRING(20),
      defaultValue: 'realtime',
      field: 'notification_frequency'
    },
    quietHours: {
      type: DataTypes.JSONB,
      field: 'quiet_hours'
    },
    profileVisibility: {
      type: DataTypes.STRING(20),
      defaultValue: 'mentors_only',
      field: 'profile_visibility'
    },
    showOnLeaderboard: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'show_on_leaderboard'
    },
    leaderboardDisplayName: {
      type: DataTypes.STRING(20),
      defaultValue: 'real_name',
      field: 'leaderboard_display_name'
    },
    showOnlineStatus: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'show_online_status'
    },
    theme: {
      type: DataTypes.STRING(20),
      defaultValue: 'light'
    },
    language: {
      type: DataTypes.STRING(10),
      defaultValue: 'en'
    },
    timezone: {
      type: DataTypes.STRING(50),
      defaultValue: 'UTC'
    }
  }, {
    tableName: 'user_settings',
    underscored: true,
    indexes: [
      { fields: ['user_id'] }
    ]
  });

  UserSettings.associate = (models) => {
    UserSettings.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return UserSettings;
};
