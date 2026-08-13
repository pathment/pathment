/**
 * Migration: 090_refresh_token_rotation
 *
 * `refresh_tokens` recorded only (user_id, token, expires_at, revoked_at), which
 * is enough to revoke a token but not enough to ROTATE one safely:
 *
 *   - `replaced_by_token`  the successor issued when this token was spent. Lets a
 *                          benign retry (the app fired /auth/refresh twice on a
 *                          flaky network) be answered with the same successor
 *                          instead of being mistaken for a stolen-token replay.
 *   - `revoked_reason`     'rotated' | 'logout' | 'logout_all' | 'reuse_detected'
 *                          | 'password_change'. Without it every revocation looks
 *                          identical in support and in the audit trail.
 *   - `last_used_at`       when this token was last exchanged — the only signal
 *                          we have for "is this device still alive".
 *   - `client`             'web' | 'ios' | 'android', so the sessions screen can
 *                          say WHICH device, and so a mobile session can be
 *                          revoked without killing the browser.
 *
 * Also adds (user_id, revoked_at): reuse detection revokes a whole family in one
 * statement, and logout-all filters exactly this way.
 *
 * Additive and idempotent. Existing rows keep working: a NULL replaced_by_token
 * simply means "issued before rotation existed", which the service treats as a
 * normal active token.
 *
 * Run:      node server/scripts/migrations/090_refresh_token_rotation.js
 * Rollback: node server/scripts/migrations/090_refresh_token_rotation.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function columnExists(table, column, t) {
  const [r] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='${table}' AND column_name='${column}'`,
    { transaction: t }
  );
  return r.length > 0;
}
async function indexExists(name, t) {
  const [r] = await sequelize.query(`SELECT 1 FROM pg_indexes WHERE indexname='${name}'`, { transaction: t });
  return r.length > 0;
}

const COLUMNS = [
  ['replaced_by_token', { type: Sequelize.TEXT, allowNull: true }],
  ['revoked_reason', { type: Sequelize.STRING(32), allowNull: true }],
  ['last_used_at', { type: Sequelize.DATE, allowNull: true }],
  ['client', { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'web' }],
];

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 090: refresh token rotation');
  await sequelize.transaction(async (t) => {
    for (const [name, spec] of COLUMNS) {
      if (await columnExists('refresh_tokens', name, t)) {
        console.log(`  ℹ refresh_tokens.${name} exists, skipping`);
      } else {
        await qi.addColumn('refresh_tokens', name, spec, { transaction: t });
        console.log(`  ✓ Added refresh_tokens.${name}`);
      }
    }

    // Anything already revoked was revoked by the old logout path.
    await sequelize.query(
      `UPDATE refresh_tokens SET revoked_reason = 'logout'
         WHERE revoked_at IS NOT NULL AND revoked_reason IS NULL`,
      { transaction: t }
    );
    console.log('  ✓ Backfilled revoked_reason for already-revoked tokens');

    const idx = 'refresh_tokens_user_id_revoked_at';
    if (await indexExists(idx, t)) {
      console.log(`  ℹ ${idx} exists, skipping`);
    } else {
      await qi.addIndex('refresh_tokens', ['user_id', 'revoked_at'], { name: idx, transaction: t });
      console.log(`  ✓ Added index ${idx}`);
    }
  });
  console.log('✅ Migration 090 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 090');
  await sequelize.transaction(async (t) => {
    const idx = 'refresh_tokens_user_id_revoked_at';
    if (await indexExists(idx, t)) {
      await qi.removeIndex('refresh_tokens', idx, { transaction: t });
      console.log(`  ✓ Dropped ${idx}`);
    }
    for (const [name] of [...COLUMNS].reverse()) {
      if (await columnExists('refresh_tokens', name, t)) {
        await qi.removeColumn('refresh_tokens', name, { transaction: t });
        console.log(`  ✓ Dropped refresh_tokens.${name}`);
      }
    }
  });
  console.log('✅ Rollback 090 complete');
}

// Guarded, because the runner requires this file to reach up(). Unguarded, the
// require itself ran the migration and then exited the process, so every later
// migration in the run was silently skipped.
if (require.main === module) {
  (async () => {
    try {
      await (process.argv.includes('--rollback') ? down() : up());
      process.exit(0);
    } catch (err) {
      console.error('❌ Migration 090 failed:', err);
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
