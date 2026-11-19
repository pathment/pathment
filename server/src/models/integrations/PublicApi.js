/**
 * The public API and syncing people in from other systems (migration 154).
 *
 *  ApiKey            a workspace's key; only its hash is stored
 *  SyncConnection    a source system: field mapping, default intake, after-sync action
 *  SyncRun           one batch of records: queued → running → outcome (and the
 *                    idempotency record for a retried request)
 *  ExternalIdentity  their ID → our applicant, per source, with the values the
 *                    source set last
 *
 * All four are workspace-owned (config/tenantOwnership.js adds organization_id
 * and scopes every query); an API key is looked up across workspaces once, by
 * its prefix, and from then on its workspace is the request's.
 */
module.exports = (sequelize, DataTypes) => {
  const ApiKey = sequelize.define('ApiKey', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    prefix: { type: DataTypes.STRING(16), allowNull: false },
    keyHash: { type: DataTypes.STRING(64), allowNull: false, field: 'key_hash' },
    scopes: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false, defaultValue: [] },
    createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' },
    lastUsedAt: { type: DataTypes.DATE, allowNull: true, field: 'last_used_at' },
    expiresAt: { type: DataTypes.DATE, allowNull: true, field: 'expires_at' },
    revokedAt: { type: DataTypes.DATE, allowNull: true, field: 'revoked_at' },
    revokedBy: { type: DataTypes.UUID, allowNull: true, field: 'revoked_by' },
  }, { tableName: 'api_keys', underscored: true, timestamps: true, indexes: [] });

  const SyncConnection = sequelize.define('SyncConnection', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    cohortId: { type: DataTypes.UUID, allowNull: true, field: 'cohort_id' },
    mapping: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    afterSync: {
      type: DataTypes.STRING(20), allowNull: false, defaultValue: 'none', field: 'after_sync',
      validate: { isIn: [['none', 'send_assessment']] },
    },
    createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' },
    archivedAt: { type: DataTypes.DATE, allowNull: true, field: 'archived_at' },
  }, { tableName: 'sync_connections', underscored: true, timestamps: true, indexes: [] });

  const SyncRun = sequelize.define('SyncRun', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    connectionId: { type: DataTypes.UUID, allowNull: true, field: 'connection_id' },
    cohortId: { type: DataTypes.UUID, allowNull: false, field: 'cohort_id' },
    apiKeyId: { type: DataTypes.UUID, allowNull: true, field: 'api_key_id' },
    triggeredBy: { type: DataTypes.UUID, allowNull: true, field: 'triggered_by' },
    source: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'api' },
    status: {
      type: DataTypes.STRING(20), allowNull: false, defaultValue: 'queued',
      validate: { isIn: [['queued', 'running', 'succeeded', 'partial', 'failed']] },
    },
    dryRun: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'dry_run' },
    sendAssessment: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'send_assessment' },
    idempotencyKey: { type: DataTypes.STRING(255), allowNull: true, field: 'idempotency_key' },
    requestHash: { type: DataTypes.STRING(64), allowNull: true, field: 'request_hash' },
    records: { type: DataTypes.JSONB, allowNull: true },
    total: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    counts: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    assessmentsSent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'assessments_sent' },
    errors: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    errorMessage: { type: DataTypes.TEXT, allowNull: true, field: 'error_message' },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    startedAt: { type: DataTypes.DATE, allowNull: true, field: 'started_at' },
    finishedAt: { type: DataTypes.DATE, allowNull: true, field: 'finished_at' },
  }, { tableName: 'sync_runs', underscored: true, timestamps: true, indexes: [] });

  const ExternalIdentity = sequelize.define('ExternalIdentity', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    sourceKey: { type: DataTypes.STRING(100), allowNull: false, field: 'source_key' },
    externalId: { type: DataTypes.STRING(255), allowNull: false, field: 'external_id' },
    applicationId: { type: DataTypes.UUID, allowNull: false, field: 'application_id' },
    lastValues: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'last_values' },
  }, { tableName: 'external_identities', underscored: true, timestamps: true, indexes: [] });

  SyncConnection.associate = (models) => {
    SyncConnection.belongsTo(models.Cohort, { foreignKey: 'cohort_id', as: 'cohort' });
  };
  SyncRun.associate = (models) => {
    SyncRun.belongsTo(models.SyncConnection, { foreignKey: 'connection_id', as: 'connection' });
    SyncRun.belongsTo(models.Cohort, { foreignKey: 'cohort_id', as: 'cohort' });
    SyncRun.belongsTo(models.ApiKey, { foreignKey: 'api_key_id', as: 'apiKey' });
  };
  ExternalIdentity.associate = (models) => {
    ExternalIdentity.belongsTo(models.Application, { foreignKey: 'application_id', as: 'application' });
  };

  return [ApiKey, SyncConnection, SyncRun, ExternalIdentity];
};
