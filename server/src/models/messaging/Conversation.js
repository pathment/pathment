module.exports = (sequelize, DataTypes) => {
  const Conversation = sequelize.define('Conversation', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'direct',
      validate: {
        isIn: [['direct', 'system']]
      }
    },
    createdBy: {
      type: DataTypes.UUID,
      field: 'created_by'
    },
    lastMessageId: {
      type: DataTypes.UUID,
      field: 'last_message_id'
    },
    lastMessageAt: {
      type: DataTypes.DATE,
      field: 'last_message_at'
    },
    relatedTaskId: {
      type: DataTypes.UUID,
      field: 'related_task_id'
    },
    relatedEnrollmentId: {
      type: DataTypes.UUID,
      field: 'related_enrollment_id'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    isArchived: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_archived'
    }
  }, {
    tableName: 'conversations',
    underscored: true,
    indexes: [
      { fields: ['type'] },
      { fields: ['last_message_at'] },
      { fields: ['related_task_id'] },
      { fields: ['related_enrollment_id'] }
    ]
  });

  Conversation.associate = (models) => {
    Conversation.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
    Conversation.belongsTo(models.Message, { foreignKey: 'last_message_id', as: 'lastMessage' });
    Conversation.belongsTo(models.AssignedTask, { foreignKey: 'related_task_id', as: 'relatedTask' });
    Conversation.belongsTo(models.Enrollment, { foreignKey: 'related_enrollment_id', as: 'relatedEnrollment' });

    Conversation.hasMany(models.ConversationParticipant, { foreignKey: 'conversation_id', as: 'participants' });
    Conversation.hasMany(models.Message, { foreignKey: 'thread_id', as: 'messages' });
  };

  return Conversation;
};
