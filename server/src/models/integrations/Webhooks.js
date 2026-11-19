/**
 * Outgoing webhooks (migration 155).
 *
 *  WebhookEndpoint   where a workspace wants events sent, which ones, and the
 *                    secret its payloads are signed with (encrypted at rest)
 *  WebhookDelivery   one event for one endpoint, with its retry state
 *
 * Both are workspace-owned (config/tenantOwnership.js).
 */
module.exports = (sequelize, DataTypes) => {
  const WebhookEndpoint = sequelize.define('WebhookEndpoint', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    url: { type: DataTypes.STRING(500), allowNull: false },
    description: { type: DataTypes.STRING(200), allowNull: true },
    events: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false, defaultValue: [] },
    secretEncrypted: { type: DataTypes.TEXT, allowNull: false, field: 'secret_encrypted' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'enabled', validate: { isIn: [['enabled', 'disabled']] } },
    disabledReason: { type: DataTypes.STRING(300), allowNull: true, field: 'disabled_reason' },
    consecutiveFailures: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'consecutive_failures' },
    lastSuccessAt: { type: DataTypes.DATE, allowNull: true, field: 'last_success_at' },
    lastFailureAt: { type: DataTypes.DATE, allowNull: true, field: 'last_failure_at' },
    createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' },
  }, { tableName: 'webhook_endpoints', underscored: true, timestamps: true, indexes: [] });

  const WebhookDelivery = sequelize.define('WebhookDelivery', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    endpointId: { type: DataTypes.UUID, allowNull: false, field: 'endpoint_id' },
    eventId: { type: DataTypes.STRING(64), allowNull: false, field: 'event_id' },
    eventType: { type: DataTypes.STRING(60), allowNull: false, field: 'event_type' },
    payload: { type: DataTypes.JSONB, allowNull: false },
    status: {
      type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending',
      validate: { isIn: [['pending', 'retrying', 'succeeded', 'failed']] },
    },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    nextAttemptAt: { type: DataTypes.DATE, allowNull: false, field: 'next_attempt_at', defaultValue: DataTypes.NOW },
    lastStatusCode: { type: DataTypes.INTEGER, allowNull: true, field: 'last_status_code' },
    lastError: { type: DataTypes.STRING(500), allowNull: true, field: 'last_error' },
    lastResponseBody: { type: DataTypes.TEXT, allowNull: true, field: 'last_response_body' },
    lastDurationMs: { type: DataTypes.INTEGER, allowNull: true, field: 'last_duration_ms' },
    deliveredAt: { type: DataTypes.DATE, allowNull: true, field: 'delivered_at' },
  }, { tableName: 'webhook_deliveries', underscored: true, timestamps: true, indexes: [] });

  WebhookDelivery.associate = (models) => {
    WebhookDelivery.belongsTo(models.WebhookEndpoint, { foreignKey: 'endpoint_id', as: 'endpoint' });
  };

  return [WebhookEndpoint, WebhookDelivery];
};
