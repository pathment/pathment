module.exports = (sequelize, DataTypes) => {
  const ConversationParticipant = sequelize.define('ConversationParticipant', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    conversationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'conversation_id'
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    role: {
      type: DataTypes.STRING(20),
      defaultValue: 'participant',
      validate: {
        isIn: [['participant', 'owner', 'system']]
      }
    },
    lastReadMessageId: {
      type: DataTypes.UUID,
      field: 'last_read_message_id'
    },
    lastReadAt: {
      type: DataTypes.DATE,
      field: 'last_read_at'
    },
    joinedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'joined_at'
    },
    leftAt: {
      type: DataTypes.DATE,
      field: 'left_at'
    },
    mutedUntil: {
      type: DataTypes.DATE,
      field: 'muted_until'
    },
    isArchived: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_archived'
    }
  }, {
    tableName: 'conversation_participants',
    underscored: true,
    indexes: [
      { unique: true, fields: ['conversation_id', 'user_id'] },
      { fields: ['user_id'] },
      { fields: ['conversation_id'] },
      { fields: ['last_read_at'] }
    ]
  });

  ConversationParticipant.associate = (models) => {
    ConversationParticipant.belongsTo(models.Conversation, { foreignKey: 'conversation_id', as: 'conversation' });
    ConversationParticipant.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    ConversationParticipant.belongsTo(models.Message, { foreignKey: 'last_read_message_id', as: 'lastReadMessage' });
  };

  return ConversationParticipant;
};
