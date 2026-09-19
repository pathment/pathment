module.exports = (sequelize, DataTypes) => {
  const Notification = sequelize.define('Notification', {
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
    type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        isIn: [['task', 'feedback', 'badge', 'milestone', 'message', 'system', 'challenge']]
      }
    },
    // Which role's "hat" this notification concerns, so the bell + list scope to
    // the portal the viewer is currently in. Resolved at dispatch from the action
    // URL / event matrix (see resolveAudience in notificationMatrix). 'any' =
    // always shown regardless of role (system/security/cross-cutting).
    audience: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'any',
      validate: {
        isIn: [['mentor', 'mentee', 'admin', 'any']]
      }
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'unread',
      validate: {
        isIn: [['unread', 'read', 'archived']]
      }
    },
    actionUrl: {
      type: DataTypes.TEXT,
      field: 'action_url'
    },
    actionLabel: {
      type: DataTypes.STRING(100),
      field: 'action_label'
    },
    relatedEntityType: {
      type: DataTypes.STRING(50),
      field: 'related_entity_type'
    },
    relatedEntityId: {
      type: DataTypes.UUID,
      field: 'related_entity_id'
    },
    clanId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'clan_id'
    },
    readAt: {
      type: DataTypes.DATE,
      field: 'read_at'
    },
    sentAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'sent_at'
    },
    emailSent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'email_sent'
    },
    emailSentAt: {
      type: DataTypes.DATE,
      field: 'email_sent_at'
    }
  }, {
    tableName: 'notifications',
    underscored: true,
    updatedAt: false,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['user_id', 'status'] },
      { fields: ['user_id', 'clan_id'] },
      { fields: ['type'] },
      { fields: ['created_at'] }
    ]
  });

  Notification.associate = (models) => {
    Notification.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    if (models.Clan) Notification.belongsTo(models.Clan, { foreignKey: 'clan_id', as: 'clan' });
  };

  return Notification;
};
