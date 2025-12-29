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
      { fields: ['type'] },
      { fields: ['created_at'] }
    ]
  });

  Notification.associate = (models) => {
    Notification.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return Notification;
};
