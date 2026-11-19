/**
 * Migration: 155_webhooks
 *
 * Outgoing webhooks (public API phase 3). New tables only.
 *
 *  - webhook_endpoints   a workspace's endpoint: URL, the events it wants, its
 *                        signing secret (encrypted at rest), and whether it is
 *                        enabled (an endpoint that keeps failing is disabled,
 *                        with the reason)
 *  - webhook_deliveries  one event for one endpoint: the payload, its state
 *                        (pending → succeeded, or retrying → failed), attempts,
 *                        when to try next, and the last response
 *
 * Run:      node server/scripts/migrations/155_webhooks.js
 * Rollback: node server/scripts/migrations/155_webhooks.js --rollback
 */
const sequelize = require('./_db');

const UP = [
  `CREATE TABLE IF NOT EXISTS webhook_endpoints (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    url varchar(500) NOT NULL,
    description varchar(200) NULL,
    events text[] NOT NULL DEFAULT '{}',
    secret_encrypted text NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'enabled',
    disabled_reason varchar(300) NULL,
    consecutive_failures integer NOT NULL DEFAULT 0,
    last_success_at timestamptz NULL,
    last_failure_at timestamptz NULL,
    created_by uuid NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS webhook_endpoints_org_idx ON webhook_endpoints (organization_id)`,

  `CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    endpoint_id uuid NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
    event_id varchar(64) NOT NULL,
    event_type varchar(60) NOT NULL,
    payload jsonb NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'pending',
    attempts integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    last_status_code integer NULL,
    last_error varchar(500) NULL,
    last_response_body text NULL,
    last_duration_ms integer NULL,
    delivered_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS webhook_deliveries_due_idx ON webhook_deliveries (next_attempt_at) WHERE status IN ('pending', 'retrying')`,
  `CREATE INDEX IF NOT EXISTS webhook_deliveries_endpoint_idx ON webhook_deliveries (endpoint_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS webhook_deliveries_org_idx ON webhook_deliveries (organization_id, created_at DESC)`,
];

const DOWN = [
  'DROP TABLE IF EXISTS webhook_deliveries',
  'DROP TABLE IF EXISTS webhook_endpoints',
];

async function up() {
  console.log('▶ Running migration 155: webhooks');
  for (const sql of UP) {
    // eslint-disable-next-line no-await-in-loop
    await sequelize.query(sql);
    console.log(`  ✓ ${sql.split('\n')[0].replace(/\s+/g, ' ').slice(0, 90)}`);
  }
  console.log('✅ Migration 155 complete');
}

async function down() {
  console.log('▶ Rolling back migration 155');
  for (const sql of DOWN) {
    // eslint-disable-next-line no-await-in-loop
    await sequelize.query(sql);
    console.log(`  ✓ ${sql}`);
  }
  console.log('✅ Rollback 155 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
