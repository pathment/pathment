module.exports = (sequelize, DataTypes) => {
  const MessageAttachment = sequelize.define('MessageAttachment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    messageId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'message_id'
    },
    fileName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'file_name'
    },
    fileUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'file_url'
    },
    fileType: {
      type: DataTypes.STRING(50),
      field: 'file_type'
    },
    fileSizeBytes: {
      type: DataTypes.BIGINT,
      field: 'file_size_bytes'
    },
    uploadedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'uploaded_at'
    }
  }, {
    tableName: 'message_attachments',
    underscored: true,
    timestamps: false,
    indexes: [
      { fields: ['message_id'] }
    ]
  });

  MessageAttachment.associate = (models) => {
    MessageAttachment.belongsTo(models.Message, { foreignKey: 'message_id', as: 'message' });
  };

  return MessageAttachment;
};
