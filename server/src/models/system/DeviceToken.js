/**
 * A push target: one row per device, not per user.
 *
 * Per device is the whole point. Someone signs in on a phone and a tablet and
 * expects both to buzz; signing out of one must not silence the other. The
 * token is the primary key in practice (it is unique), because the device is
 * what the push service addresses, and a reinstall issues a new one.
 */
module.exports = (sequelize, DataTypes) => {
  const DeviceToken = sequelize.define(
    'DeviceToken',
    {
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
      // An Expo push token (ExponentPushToken[...]). Unique so the same device
      // moving between accounts re-points rather than duplicating.
      token: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: true
      },
      platform: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'android',
        validate: { isIn: [['android', 'ios', 'web']] }
      },
      // Bumped on every registration so a device that has not checked in for
      // months can be pruned without guessing.
      lastSeenAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        field: 'last_seen_at'
      },
      // Set when the push service says the token is dead. Kept rather than
      // deleted so a delivery failure is diagnosable.
      disabledAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'disabled_at'
      }
    },
    {
      tableName: 'device_tokens',
      underscored: true,
      indexes: [{ fields: ['user_id'] }, { unique: true, fields: ['token'] }]
    }
  );

  DeviceToken.associate = (models) => {
    DeviceToken.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return DeviceToken;
};
