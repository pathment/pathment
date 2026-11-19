/**
 * Migration: 154_public_api_and_sync
 *
 * The public API (v1) and syncing people in from other systems. New tables
 * only; nothing existing changes.
 *
 *  - api_keys             a workspace's keys: shown once, stored as a SHA-256
 *                         hash, found by their public prefix; scopes, expiry,
 *                         revocation, last use
 *  - sync_connections     a source system: its field mapping (their names to
 *                         ours), a default intake, what happens after a sync
 *  - sync_runs            one push (or app-started sync): the records waiting,
 *                         then the outcome — counts, per-record errors; also
 *                         the idempotency record for a retried request
 *  - external_identities  "their ID X is our applicant Y" per source, plus the
 *                         values the source set last (so a sync never
 *                         overwrites what an admin changed)
 *
 * Run:      node server/scripts/migrations/154_public_api_and_sync.js
 * Rollback: node server/scripts/migrations/154_public_api_and_sync.js --rollback
 */
const sequelize = require('./_db');

const UP = [
  `CREATE TABLE IF NOT EXISTS api_keys (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name varchar(100) NOT NULL,
    prefix varchar(16) NOT NULL,
    key_hash varchar(64) NOT NULL,
    scopes text[] NOT NULL DEFAULT '{}',
    created_by uuid NULL,
    last_used_at timestamptz NULL,
    expires_at timestamptz NULL,
    revoked_at timestamptz NULL,
    revoked_by uuid NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS api_keys_prefix_uniq ON api_keys (prefix)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_hash_uniq ON api_keys (key_hash)`,
  `CREATE INDEX IF NOT EXISTS api_keys_org_idx ON api_keys (organization_id)`,

  `CREATE TABLE IF NOT EXISTS sync_connections (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name varchar(120) NOT NULL,
    cohort_id uuid NULL REFERENCES cohorts(id) ON DELETE SET NULL,
    mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
    after_sync varchar(20) NOT NULL DEFAULT 'none',
    created_by uuid NULL,
    archived_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS sync_connections_org_idx ON sync_connections (organization_id)`,

  `CREATE TABLE IF NOT EXISTS sync_runs (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    connection_id uuid NULL REFERENCES sync_connections(id) ON DELETE SET NULL,
    cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
    api_key_id uuid NULL REFERENCES api_keys(id) ON DELETE SET NULL,
    triggered_by uuid NULL,
    source varchar(20) NOT NULL DEFAULT 'api',
    status varchar(20) NOT NULL DEFAULT 'queued',
    dry_run boolean NOT NULL DEFAULT false,
    send_assessment boolean NOT NULL DEFAULT false,
    idempotency_key varchar(255) NULL,
    request_hash varchar(64) NULL,
    records jsonb NULL,
    total integer NOT NULL DEFAULT 0,
    counts jsonb NOT NULL DEFAULT '{}'::jsonb,
    assessments_sent integer NOT NULL DEFAULT 0,
    errors jsonb NOT NULL DEFAULT '[]'::jsonb,
    error_message text NULL,
    attempts integer NOT NULL DEFAULT 0,
    started_at timestamptz NULL,
    finished_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS sync_runs_org_created_idx ON sync_runs (organization_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS sync_runs_queue_idx ON sync_runs (status, created_at) WHERE status IN ('queued', 'running')`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sync_runs_idempotency_uniq ON sync_runs (organization_id, api_key_id, idempotency_key) WHERE idempotency_key IS NOT NULL`,

  `CREATE TABLE IF NOT EXISTS external_identities (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    source_key varchar(100) NOT NULL,
    external_id varchar(255) NOT NULL,
    application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    last_values jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS external_identities_source_uniq ON external_identities (organization_id, source_key, external_id)`,
  `CREATE INDEX IF NOT EXISTS external_identities_application_idx ON external_identities (application_id)`,
];

const DOWN = [
  'DROP TABLE IF EXISTS external_identities',
  'DROP TABLE IF EXISTS sync_runs',
  'DROP TABLE IF EXISTS sync_connections',
  'DROP TABLE IF EXISTS api_keys',
];

async function up() {
  console.log('▶ Running migration 154: public API and sync');
  for (const sql of UP) {
    // eslint-disable-next-line no-await-in-loop
    await sequelize.query(sql);
    console.log(`  ✓ ${sql.split('\n')[0].replace(/\s+/g, ' ').slice(0, 90)}`);
  }
  console.log('✅ Migration 154 complete');
}

async function down() {
  console.log('▶ Rolling back migration 154');
  for (const sql of DOWN) {
    // eslint-disable-next-line no-await-in-loop
    await sequelize.query(sql);
    console.log(`  ✓ ${sql}`);
  }
  console.log('✅ Rollback 154 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
