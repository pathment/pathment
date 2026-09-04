/**
 * Unified Queue Models Definition
 *
 * Defines all 3 background execution queue models in one consolidated file:
 * 1. EmailQueue: Transactional & notification email dispatch queue
 * 2. CertificateQueue: Puppeteer PDF & PNG rendering queue
 * 3. AIEvaluationQueue: OpenAI / Groq LLM micro-batch evaluation queue
 */
module.exports = (sequelize, DataTypes) => {

  // 1. Email Queue Model (System Domain)
  const EmailQueue = sequelize.define('EmailQueue', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    recipientId: { type: DataTypes.UUID, field: 'recipient_id' },
    recipientEmail: { type: DataTypes.STRING(255), allowNull: false, field: 'recipient_email' },
    recipientName: { type: DataTypes.STRING(255), field: 'recipient_name' },
    subject: { type: DataTypes.STRING(500), allowNull: false },
    bodyHtml: { type: DataTypes.TEXT, field: 'body_html' },
    bodyText: { type: DataTypes.TEXT, field: 'body_text' },
    emailType: { type: DataTypes.STRING(50), allowNull: false, field: 'email_type' },
    status: { type: DataTypes.STRING(50), defaultValue: 'pending' },
    priority: { type: DataTypes.INTEGER, defaultValue: 5 },
    scheduledAt: { type: DataTypes.DATE, field: 'scheduled_at' },
    sentAt: { type: DataTypes.DATE, field: 'sent_at' },
    failedAt: { type: DataTypes.DATE, field: 'failed_at' },
    attemptCount: { type: DataTypes.INTEGER, defaultValue: 0, field: 'attempt_count' },
    maxAttempts: { type: DataTypes.INTEGER, defaultValue: 5, field: 'max_attempts' },
    nextAttemptAt: { type: DataTypes.DATE, field: 'next_attempt_at' },
    lastAttemptAt: { type: DataTypes.DATE, field: 'last_attempt_at' },
    idempotencyKey: { type: DataTypes.STRING(255), field: 'idempotency_key' },
    providerMessageId: { type: DataTypes.STRING(255), field: 'provider_message_id' },
    errorCategory: { type: DataTypes.STRING(20), field: 'error_category' },
    lastError: { type: DataTypes.TEXT, field: 'last_error' },
    metadata: { type: DataTypes.JSONB }
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
    if (models.User) {
      EmailQueue.belongsTo(models.User, { foreignKey: 'recipient_id', as: 'recipient', onDelete: 'SET NULL' });
    }
  };

  // 2. Certificate Queue Model (Puppeteer PDF & PNG Rendering)
  const CertificateQueue = sequelize.define('CertificateQueue', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    instanceId: { type: DataTypes.UUID, allowNull: false, field: 'instance_id' },
    status: { type: DataTypes.STRING(20), defaultValue: 'pending' },
    attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    error: { type: DataTypes.TEXT },
    lockedAt: { type: DataTypes.DATE, field: 'locked_at' }
  }, {
    tableName: 'certificate_queue',
    underscored: true,
    indexes: [
      { name: 'certificate_queue_status_attempts', fields: ['status', 'attempts'] },
      { fields: ['instance_id'] }
    ]
  });

  CertificateQueue.associate = (models) => {
    if (models.CertificateInstance) {
      CertificateQueue.belongsTo(models.CertificateInstance, { foreignKey: 'instanceId', as: 'instance' });
    }
  };

  // 3. AI Evaluation Queue Model (LLM Micro-batch Scoring)
  const AIEvaluationQueue = sequelize.define('AIEvaluationQueue', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    runId: { type: DataTypes.UUID, allowNull: false, field: 'run_id' },
    templateId: { type: DataTypes.UUID, allowNull: false, field: 'template_id' },
    menteeId: { type: DataTypes.UUID, allowNull: false, field: 'mentee_id' },
    triggeredBy: { type: DataTypes.UUID, allowNull: false, field: 'triggered_by' },
    status: { type: DataTypes.STRING(20), defaultValue: 'pending' },
    menteePayload: { type: DataTypes.JSONB, allowNull: false, field: 'mentee_payload' },
    preCheck: { type: DataTypes.JSONB, field: 'pre_check' },
    result: { type: DataTypes.JSONB },
    error: { type: DataTypes.TEXT },
    attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    maxAttempts: { type: DataTypes.INTEGER, defaultValue: 3, field: 'max_attempts' },
    lockedAt: { type: DataTypes.DATE, field: 'locked_at' }
  }, {
    tableName: 'ai_evaluation_queue',
    underscored: true,
    indexes: [
      { name: 'idx_ai_eval_queue_status_created', fields: ['status', 'created_at'] },
      { name: 'idx_ai_eval_queue_run_id', fields: ['run_id'] },
      { name: 'idx_ai_eval_queue_template_id', fields: ['template_id'] },
      { name: 'ai_eval_queue_run_mentee_unique', unique: true, fields: ['run_id', 'mentee_id'] }
    ]
  });

  AIEvaluationQueue.associate = (models) => {
    if (models.CertificateTemplate) {
      AIEvaluationQueue.belongsTo(models.CertificateTemplate, { foreignKey: 'templateId', as: 'template' });
    }
    if (models.User) {
      AIEvaluationQueue.belongsTo(models.User, { foreignKey: 'menteeId', as: 'mentee' });
      AIEvaluationQueue.belongsTo(models.User, { foreignKey: 'triggeredBy', as: 'triggerer' });
    }
  };

  return [EmailQueue, CertificateQueue, AIEvaluationQueue];
};
