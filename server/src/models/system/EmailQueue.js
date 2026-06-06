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
    maxAttempts: {
      type: DataTypes.INTEGER,
      defaultValue: 5,
      field: 'max_attempts'
    },
    // When this row is next eligible to send (drives retry backoff).
    nextAttemptAt: {
      type: DataTypes.DATE,
      field: 'next_attempt_at'
    },
    lastAttemptAt: {
      type: DataTypes.DATE,
      field: 'last_attempt_at'
    },
    // Stable dedupe key - prevents double-enqueue and double-send on retry.
    idempotencyKey: {
      type: DataTypes.STRING(255),
      field: 'idempotency_key'
    },
    // Resend message id, for correlating delivery/bounce webhooks.
    providerMessageId: {
      type: DataTypes.STRING(255),
      field: 'provider_message_id'
    },
    // Why the last attempt failed: 'transient' (retry) | 'permanent' (DLQ now).
    errorCategory: {
      type: DataTypes.STRING(20),
      field: 'error_category'
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
      { fields: ['priority'] },
      { fields: ['status', 'next_attempt_at'] },
      { unique: true, fields: ['idempotency_key'] }
    ]
  });

  EmailQueue.associate = (models) => {
    EmailQueue.belongsTo(models.User, { foreignKey: 'recipient_id', as: 'recipient', onDelete: 'SET NULL' });
  };

  return EmailQueue;
};
