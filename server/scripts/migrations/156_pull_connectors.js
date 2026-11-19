/**
 * Migration: 156_pull_connectors
 *
 * Pull connectors (public API phase 4): a connection can also fetch its
 * records from a URL — JSON or CSV — now, or on a schedule. Adds columns to
 * sync_connections only; nothing existing changes.
 *
 *  - pull_config            { url, format, recordsPath, nextPath, auth, headerName } or NULL
 *  - pull_secret_encrypted  the token / header value / password, encrypted at rest
 *  - pull_schedule          manual | hourly | every_6_hours | daily
 *  - pull_next_at           when the scheduler should pull next (NULL when manual)
 *  - pull_last_at, pull_last_status, pull_last_error, pull_last_hash
 *                           how the last pull went; the hash lets a scheduled
 *                           pull skip data that hasn't changed
 *
 * Run:      node server/scripts/migrations/156_pull_connectors.js
 * Rollback: node server/scripts/migrations/156_pull_connectors.js --rollback
 */
const sequelize = require('./_db');

const UP = [
  `ALTER TABLE sync_connections ADD COLUMN IF NOT EXISTS pull_config jsonb NULL`,
  `ALTER TABLE sync_connections ADD COLUMN IF NOT EXISTS pull_secret_encrypted text NULL`,
  `ALTER TABLE sync_connections ADD COLUMN IF NOT EXISTS pull_schedule varchar(20) NOT NULL DEFAULT 'manual'`,
  `ALTER TABLE sync_connections ADD COLUMN IF NOT EXISTS pull_next_at timestamptz NULL`,
  `ALTER TABLE sync_connections ADD COLUMN IF NOT EXISTS pull_last_at timestamptz NULL`,
  `ALTER TABLE sync_connections ADD COLUMN IF NOT EXISTS pull_last_status varchar(20) NULL`,
  `ALTER TABLE sync_connections ADD COLUMN IF NOT EXISTS pull_last_error varchar(500) NULL`,
  `ALTER TABLE sync_connections ADD COLUMN IF NOT EXISTS pull_last_hash varchar(64) NULL`,
  `CREATE INDEX IF NOT EXISTS sync_connections_pull_due_idx ON sync_connections (pull_next_at)
     WHERE pull_next_at IS NOT NULL AND archived_at IS NULL`,
];

const DOWN = [
  `DROP INDEX IF EXISTS sync_connections_pull_due_idx`,
  ...['pull_last_hash', 'pull_last_error', 'pull_last_status', 'pull_last_at', 'pull_next_at', 'pull_schedule', 'pull_secret_encrypted', 'pull_config']
    .map((c) => `ALTER TABLE sync_connections DROP COLUMN IF EXISTS ${c}`),
];

(async () => {
  const rollback = process.argv.includes('--rollback');
  try {
    await sequelize.transaction(async (transaction) => {
      for (const sql of rollback ? DOWN : UP) {
        // eslint-disable-next-line no-await-in-loop
        await sequelize.query(sql, { transaction });
        console.log(`  ✓ ${sql.replace(/\s+/g, ' ').slice(0, 90)}`);
      }
    });
    console.log(rollback ? '✅ Migration 156 rolled back' : '✅ Migration 156 complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration 156 failed:', error.message);
    process.exit(1);
  }
})();
