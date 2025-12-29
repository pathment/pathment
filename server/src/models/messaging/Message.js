module.exports = (sequelize, DataTypes) => {
  const Message = sequelize.define('Message', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    senderId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'sender_id'
    },
    recipientId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'recipient_id'
    },
    threadId: {
      type: DataTypes.UUID,
      field: 'thread_id'
    },
    parentMessageId: {
      type: DataTypes.UUID,
      field: 'parent_message_id'
    },
    subject: {
      type: DataTypes.STRING(255)
    },
    messageText: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'message_text'
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_read'
    },
    readAt: {
      type: DataTypes.DATE,
      field: 'read_at'
    },
    isArchived: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_archived'
    },
    relatedTaskId: {
      type: DataTypes.UUID,
      field: 'related_task_id'
    },
    relatedEnrollmentId: {
      type: DataTypes.UUID,
      field: 'related_enrollment_id'
    }
  }, {
    tableName: 'messages',
    underscored: true,
    indexes: [
      { fields: ['sender_id'] },
      { fields: ['recipient_id'] },
      { fields: ['thread_id'] },
      { fields: ['created_at'] },
      { fields: ['recipient_id', 'is_read'] }
    ]
  });

  Message.associate = (models) => {
    Message.belongsTo(models.User, { foreignKey: 'sender_id', as: 'sender' });
    Message.belongsTo(models.User, { foreignKey: 'recipient_id', as: 'recipient' });
    Message.belongsTo(models.Message, { foreignKey: 'parent_message_id', as: 'parentMessage' });
    Message.belongsTo(models.AssignedTask, { foreignKey: 'related_task_id', as: 'relatedTask' });
    Message.belongsTo(models.Enrollment, { foreignKey: 'related_enrollment_id', as: 'relatedEnrollment' });
    Message.hasMany(models.MessageAttachment, { foreignKey: 'message_id', as: 'attachments' });
  };

  return Message;
};
