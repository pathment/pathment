module.exports = (sequelize, DataTypes) => {
  const EmailQueue = sequelize.define('EmailQueue', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    recipientId: {
      type: DataTypes.UUID,
      field: 'recipient_id'
    },
    recipientEmail: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'recipient_email'
    },
    recipientName: {
      type: DataTypes.STRING(255),
      field: 'recipient_name'
    },
    subject: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    bodyHtml: {
      type: DataTypes.TEXT,
      field: 'body_html'
    },
    bodyText: {
      type: DataTypes.TEXT,
      field: 'body_text'
    },
    emailType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'email_type'
    },
    status: {
      type: DataTypes.STRING(50),
      defaultValue: 'pending'
    },
    priority: {
      type: DataTypes.INTEGER,
      defaultValue: 5
    },
    scheduledAt: {
      type: DataTypes.DATE,
      field: 'scheduled_at'
    },
    sentAt: {
      type: DataTypes.DATE,
      field: 'sent_at'
    },
    failedAt: {
      type: DataTypes.DATE,
      field: 'failed_at'
    },
    attemptCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'attempt_count'
    },
    lastError: {
      type: DataTypes.TEXT,
      field: 'last_error'
    },
    metadata: {
      type: DataTypes.JSONB
    }
  }, {
    tableName: 'email_queue',
    underscored: true,
    indexes: [
      { fields: ['status'] },
      { fields: ['recipient_id'] },
      { fields: ['email_type'] },
      { fields: ['scheduled_at'] },
      { fields: ['priority'] }
    ]
  });

  EmailQueue.associate = (models) => {
    EmailQueue.belongsTo(models.User, { foreignKey: 'recipient_id', as: 'recipient', onDelete: 'SET NULL' });
  };

  return EmailQueue;
};
